import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { parseJsonReviewFeed, createJsonFeedAdapter, createFixtureAdapter, resolveAdapter } from "./adapters";
import { SSRFBlockedError, ValidationError } from "../errors";
import type { UrlValidator } from "../crawler/httpFetcher";

const permissive: UrlValidator = {
  validateUrl: async (raw) => ({ url: new URL(raw), hostname: new URL(raw).hostname, resolvedAddresses: ["127.0.0.1"] }),
  validateRedirectTarget: async (loc, from) => {
    const url = new URL(loc, from);
    return { url, hostname: url.hostname, resolvedAddresses: ["127.0.0.1"] };
  },
};

test("parseJsonReviewFeed: accepts a top-level array and maps common field names", () => {
  const { reviews, skipped } = parseJsonReviewFeed([
    { id: 7, author: "Jane", rating: 5, title: "Great", body: "Loved it", date: "2026-01-02T00:00:00Z", url: "https://x.test/r/7" },
  ]);
  assert.equal(skipped, 0);
  assert.equal(reviews[0].externalId, "7");
  assert.equal(reviews[0].rating, 5);
  assert.equal(reviews[0].publishedAt?.toISOString(), "2026-01-02T00:00:00.000Z");
  assert.equal(reviews[0].sourceUrl, "https://x.test/r/7");
});

test("parseJsonReviewFeed: accepts { reviews: [...] } and alternate field names (text/stars/created_at)", () => {
  const { reviews } = parseJsonReviewFeed({ reviews: [{ text: "Solid", stars: "4", created_at: "2026-02-01" }] });
  assert.equal(reviews[0].body, "Solid");
  assert.equal(reviews[0].rating, 4);
});

test("MALFORMED DATA: items with no body, non-objects, and nulls are skipped and counted, good items kept", () => {
  const { reviews, skipped } = parseJsonReviewFeed([{ body: "ok" }, { body: "" }, null, 42, "str", { rating: 5 }]);
  assert.equal(reviews.length, 1);
  assert.equal(skipped, 5);
});

test("MALFORMED DATA: unusable ratings/dates become null instead of throwing", () => {
  const { reviews } = parseJsonReviewFeed([{ body: "ok", rating: "not-a-number", date: "garbage" }]);
  assert.equal(reviews[0].rating, null);
  assert.equal(reviews[0].publishedAt, null);
});

test("MALFORMED DATA: a non-feed JSON shape yields an empty result, not an error", () => {
  assert.deepEqual(parseJsonReviewFeed({ nope: true }), { reviews: [], skipped: 0 });
  assert.deepEqual(parseJsonReviewFeed("hello"), { reviews: [], skipped: 0 });
});

test("fixture adapter returns exactly what it was given", async () => {
  const data = [{ externalId: "1", author: null, rating: null, title: null, body: "x", publishedAt: null, sourceUrl: null }];
  assert.deepEqual(await createFixtureAdapter(data).fetchReviews({ url: null }), data);
});

test("json-feed adapter fetches from a real local server and parses the feed", async () => {
  const server = createServer((_req, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify([{ id: "a", body: "Great tool" }, { id: "b", body: "Bad tool" }]));
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  try {
    const { port } = server.address() as AddressInfo;
    const adapter = createJsonFeedAdapter({ urlValidator: permissive });
    const reviews = await adapter.fetchReviews({ url: `http://127.0.0.1:${port}/feed.json` });
    assert.equal(reviews.length, 2);
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
  }
});

test("json-feed adapter rejects invalid JSON with a structured error", async () => {
  const server = createServer((_req, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end("{not json");
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  try {
    const { port } = server.address() as AddressInfo;
    await assert.rejects(
      () => createJsonFeedAdapter({ urlValidator: permissive }).fetchReviews({ url: `http://127.0.0.1:${port}/` }),
      ValidationError,
    );
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
  }
});

test("SECURITY: json-feed adapter uses the real SSRF policy by default (loopback is blocked)", async () => {
  await assert.rejects(() => createJsonFeedAdapter().fetchReviews({ url: "http://127.0.0.1:1/feed.json" }), SSRFBlockedError);
});

test("json-feed adapter errors clearly when the source has no URL", async () => {
  await assert.rejects(() => createJsonFeedAdapter().fetchReviews({ url: null }), ValidationError);
});

test("resolveAdapter: json-feed resolves; unknown platforms are an explicit error, not a silent no-op", () => {
  assert.equal(resolveAdapter("json-feed").platform, "json-feed");
  assert.throws(() => resolveAdapter("g2"), ValidationError);
});
