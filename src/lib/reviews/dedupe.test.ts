import { test } from "node:test";
import assert from "node:assert/strict";
import { computeDedupKey, computeFingerprint, type DedupInput } from "./dedupe";

function input(overrides: Partial<DedupInput> = {}): DedupInput {
  return {
    author: "Jane",
    body: "Great product, really helped our team.",
    publishedAt: new Date("2026-01-01T00:00:00Z"),
    externalId: null,
    sourceUrl: null,
    ...overrides,
  };
}

test("prefers externalId when present", () => {
  const key = computeDedupKey(input({ externalId: "ext-123", sourceUrl: "https://example.com/r/1" }));
  assert.deepEqual(key, { method: "externalId", value: "ext-123" });
});

test("falls back to canonical URL when externalId is absent", () => {
  const key = computeDedupKey(input({ externalId: null, sourceUrl: "https://example.com/r/1" }));
  assert.deepEqual(key, { method: "canonicalUrl", value: "https://example.com/r/1" });
});

test("falls back to a content fingerprint when neither externalId nor sourceUrl exists", () => {
  const key = computeDedupKey(input({ externalId: null, sourceUrl: null }));
  assert.equal(key.method, "fingerprint");
  assert.equal(key.value.length, 64);
});

test("an empty-string externalId is treated as absent, not as a valid (and misleading) key", () => {
  const key = computeDedupKey(input({ externalId: "   ", sourceUrl: "https://example.com/r/1" }));
  assert.equal(key.method, "canonicalUrl");
});

test("fingerprint is deterministic for identical input", () => {
  assert.equal(computeFingerprint(input()), computeFingerprint(input()));
});

test("fingerprint differs when body differs", () => {
  assert.notEqual(computeFingerprint(input({ body: "Great product." })), computeFingerprint(input({ body: "Terrible product." })));
});

test("fingerprint is case-insensitive and whitespace-insensitive on body", () => {
  assert.equal(computeFingerprint(input({ body: "Great product." })), computeFingerprint(input({ body: "  GREAT PRODUCT.  " })));
});

test("fingerprint differs when author differs", () => {
  assert.notEqual(computeFingerprint(input({ author: "Jane" })), computeFingerprint(input({ author: "John" })));
});

test("fingerprint differs when publishedAt differs", () => {
  assert.notEqual(
    computeFingerprint(input({ publishedAt: new Date("2026-01-01T00:00:00Z") })),
    computeFingerprint(input({ publishedAt: new Date("2026-06-01T00:00:00Z") })),
  );
});

test("two reviews with no externalId/sourceUrl but different content get different keys", () => {
  assert.notEqual(computeDedupKey(input({ body: "Loved it." })).value, computeDedupKey(input({ body: "Hated it." })).value);
});
