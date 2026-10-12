/**
 * Structured errors. Every error the API returns follows the shape from
 * 03_ARCHITECTURE.md §7:
 *   { "error": { "code": "INVALID_REQUEST", "message": "..." } }
 *
 * AppError carries an HTTP status alongside the code/message so the error
 * handler middleware can respond correctly without re-deriving it.
 * Unknown/unexpected errors are never passed through with internal detail
 * (stack traces, driver errors) per 04_DEVELOPMENT_RULES #14 — see
 * toApiErrorBody's fallback branch.
 */

export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number = 400,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Resource not found") {
    super("NOT_FOUND", message, 404);
    this.name = "NotFoundError";
  }
}

export class ValidationError extends AppError {
  constructor(message = "A valid request body is required.") {
    super("INVALID_REQUEST", message, 400);
    this.name = "ValidationError";
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Authentication required.") {
    super("UNAUTHORIZED", message, 401);
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Not permitted.") {
    super("FORBIDDEN", message, 403);
    this.name = "ForbiddenError";
  }
}

// --- Phase 2: acquisition/scraping error categories -------------------------
// Same AppError pattern as above. Status codes are what *our* API returns to
// its caller, not necessarily the upstream site's status (see
// HttpFailureError, which carries the upstream status separately).

export class InvalidUrlError extends AppError {
  constructor(message = "The URL is malformed or uses an unsupported scheme.") {
    super("INVALID_URL", message, 400);
    this.name = "InvalidUrlError";
  }
}

export class SSRFBlockedError extends AppError {
  constructor(message = "The URL resolves to a disallowed network destination.") {
    super("SSRF_BLOCKED", message, 400);
    this.name = "SSRFBlockedError";
  }
}

export class FetchTimeoutError extends AppError {
  constructor(message = "The request timed out.") {
    super("FETCH_TIMEOUT", message, 504);
    this.name = "FetchTimeoutError";
  }
}

export class ResponseTooLargeError extends AppError {
  constructor(message = "The response exceeded the maximum allowed size.") {
    super("RESPONSE_TOO_LARGE", message, 502);
    this.name = "ResponseTooLargeError";
  }
}

export class UnsupportedContentTypeError extends AppError {
  constructor(public readonly contentType: string | null) {
    super(
      "UNSUPPORTED_CONTENT_TYPE",
      `Unsupported content type for this pipeline: ${contentType ?? "unknown"}.`,
      502,
    );
    this.name = "UnsupportedContentTypeError";
  }
}

export class HttpFailureError extends AppError {
  constructor(public readonly upstreamStatus: number) {
    super("UPSTREAM_HTTP_ERROR", `Upstream responded with HTTP ${upstreamStatus}.`, 502);
    this.name = "HttpFailureError";
  }
}

export class TooManyRedirectsError extends AppError {
  constructor(message = "Too many redirects.") {
    super("TOO_MANY_REDIRECTS", message, 502);
    this.name = "TooManyRedirectsError";
  }
}

export class ConnectionError extends AppError {
  constructor(message = "Could not connect to the target host.") {
    super("CONNECTION_FAILED", message, 502);
    this.name = "ConnectionError";
  }
}

export class SourceNotFoundError extends AppError {
  constructor(message = "Source not found.") {
    super("SOURCE_NOT_FOUND", message, 404);
    this.name = "SourceNotFoundError";
  }
}

export class ProductSourceMismatchError extends AppError {
  constructor(message = "Source does not belong to the specified product.") {
    super("PRODUCT_SOURCE_MISMATCH", message, 404);
    this.name = "ProductSourceMismatchError";
  }
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
  };
}

/**
 * Converts any thrown value into the public API error shape and the status
 * code to send. Never leaks internal error detail for non-AppError values —
 * callers should log the original error themselves before calling this.
 */
export function toApiError(err: unknown): { status: number; body: ApiErrorBody } {
  if (err instanceof AppError) {
    return { status: err.status, body: { error: { code: err.code, message: err.message } } };
  }
  return {
    status: 500,
    body: { error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred." } },
  };
}
