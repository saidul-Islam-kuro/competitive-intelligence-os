import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { fetchUrl, type UrlValidator } from "./httpFetcher";
import {
  FetchTimeoutError,
  ResponseTooLargeError,
  UnsupportedContentTypeError,
  HttpFailureError,
  TooManyRedirectsError,
  ConnectionError,
  SSRFBlockedError,
} from "../errors";

/**
 * These tests exercise real fetch mechanics (timeout, size limits, redirect
 * following, content-type gating, status handling) against a real local
 * HTTP server — no mocked fetch, no third-party site, no network access
 * needed. SSRF policy enforcement itself is covered separately and
 * realistically in ssrf.test.ts; here we inject a permissive validator so
 * the loopback test server (which the real, correct-for-production policy
 * rejects) doesn't get in the way of testing the fetcher's own mechanics.
 * One test below (`enforces the real SSRF policy by default`) confirms the
 * real policy IS wired in when no override is given.
 */
const permissiveValidator: UrlValidator = {
  validateUrl: async (rawUrl) => {
    const url = new URL(rawUrl);
    return { url, hostname: url.hostname, resolvedAddresses: ["127.0.0.1"] };
  },
  validateRedirectTarget: async (location, fromUrl) => {
    const url = new URL(location, fromUrl);
    return { url, hostname: url.hostname, resolvedAddresses: ["127.0.0.1"] };
  },
};

async function withServer(
  handler: (req: IncomingMessage, res: ServerResponse) => void,
  run: (baseUrl: string) => Promise<void>,
): Promise<void> {
  const server: Server = createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const { port } = server.address() as AddressInfo;
    await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

test("fetchUrl: successful HTML response", async () => {
  await withServer(
    (_req, res) => {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end("<html><body><h1>Hello</h1></body></html>");
    },
    async (baseUrl) => {
      const result = await fetchUrl(baseUrl, { urlValidator: permissiveValidator });
      assert.equal(result.statusCode, 200);
      assert.equal(result.contentType, "text/html; charset=utf-8");
      assert.match(result.body, /Hello/);
      assert.equal(result.finalUrl, `${baseUrl}/`);
      assert.deepEqual(result.redirectChain, []);
    },
  );
});

test("fetchUrl: times out cleanly on a hanging response", async () => {
  await withServer(
    (_req, res) => {
      // Never respond — connection stays open past the timeout.
      res.writeHead(200, { "content-type": "text/html" });
      // no res.end() — hangs deliberately
    },
    async (baseUrl) => {
      await assert.rejects(
        () => fetchUrl(baseUrl, { urlValidator: permissiveValidator, timeoutMs: 100 }),
        FetchTimeoutError,
      );
    },
  );
});

test("REGRESSION (Phase 2.1 fix): times out cleanly when headers arrive but the body stalls mid-stream", async () => {
  // This is the specific bug: the original code only converted an
  // AbortError to FetchTimeoutError around the header fetch, not around
  // body reading. A server that sends headers + partial content, then
  // hangs, used to escape as an unrecognized raw AbortError instead of a
  // FetchTimeoutError.
  await withServer(
    (_req, res) => {
      res.writeHead(200, { "content-type": "text/html", "transfer-encoding": "chunked" });
      res.write("<html><body>partial content, then silence...");
      // Deliberately never call res.end() or write again — body stream
      // stalls after headers + partial content are already flushed.
    },
    async (baseUrl) => {
      await assert.rejects(
        () => fetchUrl(baseUrl, { urlValidator: permissiveValidator, timeoutMs: 150 }),
        (err: unknown) => {
          assert.ok(
            err instanceof FetchTimeoutError,
            `expected FetchTimeoutError, got ${err instanceof Error ? err.constructor.name : typeof err}`,
          );
          return true;
        },
      );
    },
  );
});

test("fetchUrl: rejects a response exceeding the byte limit", async () => {
  await withServer(
    (_req, res) => {
      res.writeHead(200, { "content-type": "text/html" });
      res.write("a".repeat(1000));
      res.end("b".repeat(1000));
    },
    async (baseUrl) => {
      await assert.rejects(
        () => fetchUrl(baseUrl, { urlValidator: permissiveValidator, maxBytes: 500 }),
        ResponseTooLargeError,
      );
    },
  );
});

test("fetchUrl: rejects unsupported (non-HTML) content types", async () => {
  await withServer(
    (_req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end('{"ok":true}');
    },
    async (baseUrl) => {
      await assert.rejects(
        () => fetchUrl(baseUrl, { urlValidator: permissiveValidator }),
        UnsupportedContentTypeError,
      );
    },
  );
});

test("fetchUrl: treats non-2xx responses as a structured HttpFailureError", async () => {
  await withServer(
    (_req, res) => {
      res.writeHead(500, { "content-type": "text/html" });
      res.end("<html>server error</html>");
    },
    async (baseUrl) => {
      await assert.rejects(
        () => fetchUrl(baseUrl, { urlValidator: permissiveValidator }),
        (err: unknown) => {
          assert.ok(err instanceof HttpFailureError);
          assert.equal(err.upstreamStatus, 500);
          return true;
        },
      );
    },
  );
});

test("fetchUrl: treats 404 as a structured HttpFailureError", async () => {
  await withServer(
    (_req, res) => {
      res.writeHead(404, { "content-type": "text/html" });
      res.end("<html>not found</html>");
    },
    async (baseUrl) => {
      await assert.rejects(
        () => fetchUrl(baseUrl, { urlValidator: permissiveValidator }),
        (err: unknown) => {
          assert.ok(err instanceof HttpFailureError);
          assert.equal(err.upstreamStatus, 404);
          return true;
        },
      );
    },
  );
});

test("fetchUrl: follows a redirect chain and reports the final URL", async () => {
  await withServer(
    (req, res) => {
      if (req.url === "/start") {
        res.writeHead(302, { location: "/middle" });
        res.end();
      } else if (req.url === "/middle") {
        res.writeHead(302, { location: "/final" });
        res.end();
      } else {
        res.writeHead(200, { "content-type": "text/html" });
        res.end("<html>done</html>");
      }
    },
    async (baseUrl) => {
      const result = await fetchUrl(`${baseUrl}/start`, { urlValidator: permissiveValidator });
      assert.equal(result.finalUrl, `${baseUrl}/final`);
      assert.deepEqual(result.redirectChain, [`${baseUrl}/middle`, `${baseUrl}/final`]);
      assert.match(result.body, /done/);
    },
  );
});

test("fetchUrl: rejects a redirect loop exceeding maxRedirects", async () => {
  await withServer(
    (req, res) => {
      const n = Number(req.url?.replace("/", "") || "0");
      res.writeHead(302, { location: `/${n + 1}` });
      res.end();
    },
    async (baseUrl) => {
      await assert.rejects(
        () => fetchUrl(`${baseUrl}/0`, { urlValidator: permissiveValidator, maxRedirects: 3 }),
        TooManyRedirectsError,
      );
    },
  );
});

test("fetchUrl: a redirect missing a Location header is a structured failure, not a crash", async () => {
  await withServer(
    (_req, res) => {
      res.writeHead(302, {});
      res.end();
    },
    async (baseUrl) => {
      await assert.rejects(() => fetchUrl(baseUrl, { urlValidator: permissiveValidator }), HttpFailureError);
    },
  );
});

test("fetchUrl: connection failure (nothing listening) is a structured ConnectionError", async () => {
  // Port 1 is a reserved/unlikely-to-be-listening port; connection should
  // be refused quickly rather than hang until the timeout.
  await assert.rejects(
    () => fetchUrl("http://127.0.0.1:1/", { urlValidator: permissiveValidator, timeoutMs: 2000 }),
    (err: unknown) => err instanceof ConnectionError || err instanceof FetchTimeoutError,
  );
});

test("fetchUrl: enforces the real SSRF policy by default (no override given)", async () => {
  await assert.rejects(() => fetchUrl("http://127.0.0.1:1/"), SSRFBlockedError);
});
