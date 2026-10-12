/**
 * Fetches a URL under an explicit security and resource-usage policy:
 * every redirect is re-validated (never followed blindly), the whole
 * operation is bounded by a single timeout (not reset per hop — an
 * attacker can't out-wait it with a long redirect chain), the response
 * body is streamed and capped, and content type is checked before the
 * body is fully read.
 *
 * Uses Node's built-in `fetch` (no HTTP client dependency). `redirect:
 * "manual"` is used specifically so redirects can be inspected and
 * validated instead of followed automatically.
 */
import {
  FetchTimeoutError,
  ResponseTooLargeError,
  UnsupportedContentTypeError,
  HttpFailureError,
  TooManyRedirectsError,
  ConnectionError,
} from "../errors";
import { validateUrl, validateRedirectTarget, type SsrfPolicyOptions, type ValidatedUrl } from "../security/ssrf";

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

/**
 * The URL-validation functions the fetcher calls, injectable so tests can
 * exercise real fetch mechanics (timeout/size-limit/redirect-following/
 * content-type) against a local test server without that server needing to
 * pass the real, strict SSRF policy (which correctly rejects loopback in
 * production — that's the point of it). Production code should never
 * override this; only `httpFetcher.test.ts` does, and the SSRF policy
 * itself has its own separate, realistic test suite in ssrf.test.ts.
 */
export interface UrlValidator {
  validateUrl: (rawUrl: string, options?: SsrfPolicyOptions) => Promise<ValidatedUrl>;
  validateRedirectTarget: (
    location: string,
    fromUrl: URL,
    options?: SsrfPolicyOptions,
  ) => Promise<ValidatedUrl>;
}

const REAL_URL_VALIDATOR: UrlValidator = { validateUrl, validateRedirectTarget };

export interface FetchOptions extends SsrfPolicyOptions {
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  userAgent?: string;
  /** Content-type prefixes accepted for the body to be read/returned. */
  acceptedContentTypes?: string[];
  /** Test-only escape hatch — see UrlValidator's doc comment. */
  urlValidator?: UrlValidator;
}

export interface FetchResult {
  requestedUrl: string;
  finalUrl: string;
  statusCode: number;
  contentType: string | null;
  body: string;
  truncated: boolean;
  durationMs: number;
  redirectChain: string[];
}

const DEFAULT_OPTIONS: Required<
  Pick<FetchOptions, "timeoutMs" | "maxBytes" | "maxRedirects" | "userAgent" | "acceptedContentTypes">
> = {
  timeoutMs: 15_000,
  maxBytes: 5_000_000,
  maxRedirects: 5,
  userAgent: "CompetitiveIntelligenceOS/0.1 (+monitoring; contact via project owner)",
  acceptedContentTypes: ["text/html", "application/xhtml+xml"],
};

function isAcceptedContentType(contentType: string | null, accepted: string[]): boolean {
  if (!contentType) return false;
  const base = contentType.split(";")[0]?.trim().toLowerCase() ?? "";
  return accepted.some((prefix) => base === prefix.toLowerCase());
}

/** Reads a response body via its stream, aborting once maxBytes is exceeded. */
async function readBodyWithLimit(
  response: Response,
  maxBytes: number,
): Promise<{ text: string; truncated: boolean }> {
  const reader = response.body?.getReader();
  if (!reader) {
    const text = await response.text();
    if (Buffer.byteLength(text, "utf8") > maxBytes) {
      throw new ResponseTooLargeError(`Response exceeded ${maxBytes} bytes.`);
    }
    return { text, truncated: false };
  }

  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        total += value.byteLength;
        if (total > maxBytes) {
          throw new ResponseTooLargeError(`Response exceeded ${maxBytes} bytes.`);
        }
        chunks.push(value);
      }
    }
  } finally {
    // Release/cancel unconditionally on the way out — whether we finished
    // normally, hit the size limit, or the read rejected because the
    // request was aborted (timeout). Avoids leaking the underlying
    // connection in any of those paths.
    await reader.cancel().catch(() => undefined);
  }

  const combined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { text: Buffer.from(combined).toString("utf8"), truncated: false };
}

/**
 * Fetches `rawUrl`, following up to `maxRedirects` redirects — each one
 * re-validated by the SSRF policy before being followed. Throws a
 * structured error (see ../errors.ts) for every failure category; never
 * returns a "successful" result for a non-2xx or non-accepted response.
 */
export async function fetchUrl(rawUrl: string, options: FetchOptions = {}): Promise<FetchResult> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const validator = options.urlValidator ?? REAL_URL_VALIDATOR;
  const start = Date.now();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), opts.timeoutMs);

  try {
    let currentUrl = (await validator.validateUrl(rawUrl, opts)).url;
    const redirectChain: string[] = [];

    for (let hop = 0; ; hop++) {
      let response: Response;
      try {
        response = await fetch(currentUrl, {
          method: "GET",
          redirect: "manual",
          signal: controller.signal,
          headers: { "User-Agent": opts.userAgent, Accept: "text/html,application/xhtml+xml" },
        });
      } catch (err) {
        if (controller.signal.aborted) {
          throw new FetchTimeoutError(`Request timed out after ${opts.timeoutMs}ms.`);
        }
        // Deliberately generic — never surfaces the raw driver error (which
        // can include internal hostnames/ports) to API clients.
        throw new ConnectionError("Could not connect to the target host.");
      }

      if (REDIRECT_STATUSES.has(response.status)) {
        const location = response.headers.get("location");
        if (!location) {
          throw new HttpFailureError(response.status);
        }
        if (hop + 1 >= opts.maxRedirects) {
          throw new TooManyRedirectsError(`Exceeded ${opts.maxRedirects} redirects.`);
        }
        const validated = await validator.validateRedirectTarget(location, currentUrl, opts);
        redirectChain.push(validated.url.href);
        currentUrl = validated.url;
        continue;
      }

      if (response.status < 200 || response.status >= 300) {
        throw new HttpFailureError(response.status);
      }

      const contentType = response.headers.get("content-type");
      if (!isAcceptedContentType(contentType, opts.acceptedContentTypes)) {
        throw new UnsupportedContentTypeError(contentType);
      }

      // REGRESSION FIX (Phase 2.1): the original code only translated an
      // AbortError into FetchTimeoutError around the *header* fetch above.
      // If the timeout fired while the body was still streaming (headers
      // already received, connection then stalls), readBodyWithLimit's
      // reader.read() rejects with a raw AbortError that was not caught
      // here at all — it would propagate out of fetchUrl as an
      // unrecognized error, past every AppError check in scrapeSource,
      // and surface as a generic 500 instead of the correct 504
      // FETCH_TIMEOUT. Wrapping this call the same way closes that gap.
      let text: string;
      let truncated: boolean;
      try {
        ({ text, truncated } = await readBodyWithLimit(response, opts.maxBytes));
      } catch (err) {
        if (controller.signal.aborted) {
          throw new FetchTimeoutError(
            `Request timed out after ${opts.timeoutMs}ms while reading the response body.`,
          );
        }
        throw err; // preserve ResponseTooLargeError and anything else thrown deliberately
      }

      return {
        requestedUrl: rawUrl,
        finalUrl: currentUrl.href,
        statusCode: response.status,
        contentType,
        body: text,
        truncated,
        durationMs: Date.now() - start,
        redirectChain,
      };
    }
  } finally {
    clearTimeout(timeout);
  }
}
