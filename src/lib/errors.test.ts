import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AppError,
  NotFoundError,
  ValidationError,
  UnauthorizedError,
  ForbiddenError,
  InvalidUrlError,
  SSRFBlockedError,
  FetchTimeoutError,
  ResponseTooLargeError,
  UnsupportedContentTypeError,
  HttpFailureError,
  TooManyRedirectsError,
  ConnectionError,
  SourceNotFoundError,
  ProductSourceMismatchError,
  toApiError,
} from "./errors";

test("toApiError: maps AppError subclasses to their status + code", () => {
  const cases: Array<[Error, number, string]> = [
    [new NotFoundError(), 404, "NOT_FOUND"],
    [new ValidationError(), 400, "INVALID_REQUEST"],
    [new UnauthorizedError(), 401, "UNAUTHORIZED"],
    [new ForbiddenError(), 403, "FORBIDDEN"],
  ];
  for (const [err, status, code] of cases) {
    const result = toApiError(err);
    assert.equal(result.status, status);
    assert.equal(result.body.error.code, code);
    assert.equal(result.body.error.message, err.message);
  }
});

test("toApiError: custom AppError carries its own code/status/message", () => {
  const err = new AppError("RATE_LIMITED", "Too many requests.", 429);
  const result = toApiError(err);
  assert.deepEqual(result, {
    status: 429,
    body: { error: { code: "RATE_LIMITED", message: "Too many requests." } },
  });
});

test("toApiError: unknown errors never leak internal detail", () => {
  const result = toApiError(new Error("secret db connection string leaked here"));
  assert.equal(result.status, 500);
  assert.equal(result.body.error.code, "INTERNAL_ERROR");
  assert.ok(!result.body.error.message.includes("secret"));
});

test("toApiError: non-Error thrown values are handled safely", () => {
  const result = toApiError("a plain string was thrown");
  assert.equal(result.status, 500);
  assert.equal(result.body.error.code, "INTERNAL_ERROR");
});

test("toApiError: Phase 2 acquisition error classes map to their own code + status", () => {
  const cases: Array<[Error, number, string]> = [
    [new InvalidUrlError(), 400, "INVALID_URL"],
    [new SSRFBlockedError(), 400, "SSRF_BLOCKED"],
    [new FetchTimeoutError(), 504, "FETCH_TIMEOUT"],
    [new ResponseTooLargeError(), 502, "RESPONSE_TOO_LARGE"],
    [new UnsupportedContentTypeError("application/pdf"), 502, "UNSUPPORTED_CONTENT_TYPE"],
    [new HttpFailureError(503), 502, "UPSTREAM_HTTP_ERROR"],
    [new TooManyRedirectsError(), 502, "TOO_MANY_REDIRECTS"],
    [new ConnectionError(), 502, "CONNECTION_FAILED"],
    [new SourceNotFoundError(), 404, "SOURCE_NOT_FOUND"],
    [new ProductSourceMismatchError(), 404, "PRODUCT_SOURCE_MISMATCH"],
  ];
  for (const [err, status, code] of cases) {
    const result = toApiError(err);
    assert.equal(result.status, status, `${code} status`);
    assert.equal(result.body.error.code, code);
  }
});

test("HttpFailureError: carries the upstream status separately from our own response status", () => {
  const err = new HttpFailureError(503);
  assert.equal(err.upstreamStatus, 503);
  assert.equal(err.status, 502); // our API's status, not the upstream's
});
