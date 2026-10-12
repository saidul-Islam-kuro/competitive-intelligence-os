import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeReviewText, MAX_REVIEW_BODY_LENGTH } from "./normalizeReview";

test("collapses horizontal whitespace but preserves paragraph breaks", () => {
  const result = normalizeReviewText("Great   tool.\n\nReally   helped my team.");
  assert.equal(result.body, "Great tool.\n\nReally helped my team.");
});

test("normalizes CRLF/CR line endings", () => {
  const result = normalizeReviewText("Line one\r\nLine two\rLine three");
  assert.equal(result.body, "Line one\nLine two\nLine three");
});

test("caps excessive blank lines at one, without destroying paragraph structure", () => {
  const result = normalizeReviewText("First.\n\n\n\n\nSecond.");
  assert.equal(result.body, "First.\n\nSecond.");
});

test("caps repeated punctuation without altering wording", () => {
  assert.equal(normalizeReviewText("This is amazing!!!!!!").body, "This is amazing!!!");
  assert.equal(normalizeReviewText("Why......?").body, "Why...?");
});

test("Unicode NFC normalization: differently-encoded equivalent characters normalize identically", () => {
  const precomposed = "caf\u00e9";
  const decomposed = "cafe\u0301";
  assert.equal(normalizeReviewText(precomposed).body, normalizeReviewText(decomposed).body);
});

test("empty or whitespace-only content is flagged isEmpty", () => {
  assert.equal(normalizeReviewText("").isEmpty, true);
  assert.equal(normalizeReviewText("   \n\n   ").isEmpty, true);
  assert.equal(normalizeReviewText("Good.").isEmpty, false);
});

test("excessively large content is truncated with a visible marker", () => {
  const result = normalizeReviewText("x".repeat(MAX_REVIEW_BODY_LENGTH + 500));
  assert.equal(result.truncated, true);
  assert.ok(result.body.length < MAX_REVIEW_BODY_LENGTH + 500);
  assert.match(result.body, /truncated at \d+ characters/);
});

test("ordinary short reviews are left untouched beyond trimming", () => {
  const result = normalizeReviewText("  Solid product, great support team.  ");
  assert.equal(result.body, "Solid product, great support team.");
  assert.equal(result.truncated, false);
});

test("is deterministic", () => {
  const input = "Pretty good!!!!  \n\n\n\nWould recommend.";
  assert.equal(normalizeReviewText(input).body, normalizeReviewText(input).body);
});
