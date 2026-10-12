/**
 * Runs for real in this sandbox (type-only Prisma import; in-memory fake
 * tx — see testUtils/fakePrismaTx.ts for what it does and doesn't
 * validate). The fake enforces the real DB's unique constraints, so a
 * dedup logic bug surfaces as a thrown error here, not a silent pass.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { ingestReviewBatch, type IngestContext } from "./ingestReviews";
import { createFakePrismaTx } from "./testUtils/fakePrismaTx";
import type { RawReview } from "../lib/reviews/adapters";

const ctx: IngestContext = { reviewSourceId: "rs-1", productId: "p-1", reviewSourceUrl: "https://reviews.example/acme" };

function raw(overrides: Partial<RawReview> = {}): RawReview {
  return {
    externalId: null,
    author: "Jane",
    rating: null,
    title: null,
    body: "Great product, really helpful support.",
    publishedAt: new Date("2026-01-01T00:00:00Z"),
    sourceUrl: null,
    ...overrides,
  };
}

test("persists a new review with sentiment, normalized body, and topics", async () => {
  const tx = createFakePrismaTx();
  const result = await ingestReviewBatch(tx as never, [raw({ rating: 5 })], ctx);
  assert.equal(result.created, 1);
  const row = tx._tables.reviews[0];
  assert.equal(row.sentimentLabel, "POSITIVE");
  assert.ok(row.sentimentConfidence !== null);
  assert.ok(tx._tables.reviewTopics.some((t) => t.key === "support"));
});

test("EXTERNAL ID DEDUP: the same externalId ingested twice creates one review", async () => {
  const tx = createFakePrismaTx();
  await ingestReviewBatch(tx as never, [raw({ externalId: "ext-1" })], ctx);
  const second = await ingestReviewBatch(tx as never, [raw({ externalId: "ext-1", body: "Edited wording but same review id." })], ctx);
  assert.equal(second.duplicates, 1);
  assert.equal(second.created, 0);
  assert.equal(tx._tables.reviews.length, 1);
});

test("FINGERPRINT DEDUP: with NO externalId and NO url, re-ingesting identical content does not duplicate (nullable-unique trap)", async () => {
  const tx = createFakePrismaTx();
  await ingestReviewBatch(tx as never, [raw()], ctx);
  const second = await ingestReviewBatch(tx as never, [raw({ body: "  GREAT product, really helpful support.  " })], ctx);
  assert.equal(second.duplicates, 1);
  assert.equal(tx._tables.reviews.length, 1);
  assert.ok(tx._tables.reviews[0].fingerprint, "fingerprint must be stored when it was the dedup method");
});

test("fingerprint dedup does not collapse genuinely different reviews that both lack ids", async () => {
  const tx = createFakePrismaTx();
  await ingestReviewBatch(tx as never, [raw({ body: "Loved it." }), raw({ body: "Hated it." })], ctx);
  assert.equal(tx._tables.reviews.length, 2);
});

test("duplicates WITHIN a single batch are collapsed too", async () => {
  const tx = createFakePrismaTx();
  const result = await ingestReviewBatch(tx as never, [raw({ externalId: "same" }), raw({ externalId: "same" })], ctx);
  assert.equal(result.created, 1);
  assert.equal(result.duplicates, 1);
});

test("PERMALINK DEDUP: a unique per-review URL is used as the identity when there is no externalId", async () => {
  const tx = createFakePrismaTx();
  await ingestReviewBatch(tx as never, [raw({ sourceUrl: "https://reviews.example/r/42" })], ctx);
  const second = await ingestReviewBatch(tx as never, [raw({ sourceUrl: "https://reviews.example/r/42", body: "Updated text" })], ctx);
  assert.equal(second.duplicates, 1);
  assert.equal(tx._tables.reviews.length, 1);
});

test("SAFEGUARD: a URL shared by several reviews in a batch (a listing page) is NOT treated as a permalink", async () => {
  const tx = createFakePrismaTx();
  const shared = "https://reviews.example/all-reviews";
  const result = await ingestReviewBatch(
    tx as never,
    [raw({ sourceUrl: shared, body: "First distinct review." }), raw({ sourceUrl: shared, body: "Second distinct review." })],
    ctx,
  );
  assert.equal(result.created, 2); // would be 1 if the shared URL were wrongly used as a dedup key
  assert.equal(tx._tables.reviews[0].sourceUrl, shared); // still stored as evidence
});

test("SAFEGUARD: a URL equal to the ReviewSource's own listing URL is NOT treated as a permalink", async () => {
  const tx = createFakePrismaTx();
  await ingestReviewBatch(tx as never, [raw({ sourceUrl: ctx.reviewSourceUrl, body: "Review A" })], ctx);
  const second = await ingestReviewBatch(tx as never, [raw({ sourceUrl: ctx.reviewSourceUrl, body: "Review B, different" })], ctx);
  assert.equal(second.created, 1);
  assert.equal(tx._tables.reviews.length, 2);
});

test("empty and whitespace-only bodies are skipped and counted, never stored", async () => {
  const tx = createFakePrismaTx();
  const result = await ingestReviewBatch(tx as never, [raw({ body: "" }), raw({ body: "   \n  " }), raw({ body: "Fine." })], ctx);
  assert.equal(result.skipped, 2);
  assert.equal(result.created, 1);
});

test("an out-of-range rating is dropped to null instead of corrupting sentiment or being stored", async () => {
  const tx = createFakePrismaTx();
  await ingestReviewBatch(tx as never, [raw({ rating: 99 })], ctx);
  assert.equal(tx._tables.reviews[0].rating, null);
});

test("TOPIC IDEMPOTENCY: topics are shared global rows; re-ingesting does not duplicate them or their observations", async () => {
  const tx = createFakePrismaTx();
  await ingestReviewBatch(tx as never, [raw({ externalId: "a", body: "Support was great." }), raw({ externalId: "b", body: "Support was awful." })], ctx);
  await ingestReviewBatch(tx as never, [raw({ externalId: "a", body: "Support was great." })], ctx);
  assert.equal(tx._tables.reviewTopics.filter((t) => t.key === "support").length, 1);
  assert.equal(tx._tables.reviewTopicObservations.length, 2);
});

test("EVIDENCE: topic observations preserve the matched terms and the review's sentiment", async () => {
  const tx = createFakePrismaTx();
  await ingestReviewBatch(tx as never, [raw({ body: "The pricing is expensive and terrible." })], ctx);
  const obs = tx._tables.reviewTopicObservations[0];
  assert.ok(obs.matchedTerms.length > 0);
  assert.ok((obs.sentiment ?? 0) < 0);
});

test("title is included in analysis and stored", async () => {
  const tx = createFakePrismaTx();
  await ingestReviewBatch(tx as never, [raw({ title: "Terrible", body: "Would not recommend to anyone." })], ctx);
  assert.equal(tx._tables.reviews[0].title, "Terrible");
  assert.equal(tx._tables.reviews[0].sentimentLabel, "NEGATIVE");
});

test("an empty batch is a no-op, not an error", async () => {
  const tx = createFakePrismaTx();
  assert.deepEqual(await ingestReviewBatch(tx as never, [], ctx), { created: 0, duplicates: 0, skipped: 0, reviewIds: [] });
});
