/**
 * Requires `npm install` AND a real, reachable DATABASE_URL. Not runnable
 * in the sandbox this was written in. See VERIFY.md. (The ingestion and
 * dedup LOGIC these endpoints sit on top of is tested for real in
 * src/services/ingestReviews.test.ts; query validation and pagination
 * bounds in src/lib/http/queryParams.test.ts.)
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createApp } from "../src/app";
import { prisma } from "../src/db/client";
import { generateApiKey } from "../src/lib/apiKey";
import { ingestReviewSource } from "../src/services/ingestReviewSource";
import type { UrlValidator } from "../src/lib/crawler/httpFetcher";

const permissive: UrlValidator = {
  validateUrl: async (raw) => ({ url: new URL(raw), hostname: new URL(raw).hostname, resolvedAddresses: ["127.0.0.1"] }),
  validateRedirectTarget: async (loc, from) => {
    const url = new URL(loc, from);
    return { url, hostname: url.hostname, resolvedAddresses: ["127.0.0.1"] };
  },
};

let apiKey: string;
let productId: string;
let feedServer: Server;
let feedUrl: string;
let reviewSourceId: string;

before(async () => {
  const key = generateApiKey();
  apiKey = key.plaintext;
  await prisma.apiKey.create({ data: { name: "phase6-reviews-test", keyPrefix: key.keyPrefix, hashedKey: key.hashedKey } });
  const product = await prisma.product.create({ data: { name: `Phase6 Reviews Test ${Date.now()}`, homepageUrl: "https://example.com" } });
  productId = product.id;

  feedServer = createServer((_req, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify([
        { id: "r1", rating: 5, author: "A", body: "Great product, helpful support.", date: "2026-01-10T00:00:00Z" },
        { id: "r2", rating: 1, author: "B", body: "Terrible, buggy and slow. Awful pricing.", date: "2026-02-10T00:00:00Z" },
        { id: "r3", rating: 3, author: "C", body: "It works.", date: "2026-03-10T00:00:00Z" },
      ]),
    );
  });
  await new Promise<void>((r) => feedServer.listen(0, "127.0.0.1", r));
  feedUrl = `http://127.0.0.1:${(feedServer.address() as AddressInfo).port}/feed.json`;

  const rs = await prisma.reviewSource.create({ data: { productId, platform: "json-feed", url: feedUrl } });
  reviewSourceId = rs.id;
  // Local feed + permissive validator: only the service-level call can inject it (the route never can).
  await ingestReviewSource(reviewSourceId, productId, { urlValidator: permissive });
});

after(async () => {
  await new Promise<void>((r) => feedServer.close(() => r()));
  await prisma.product.delete({ where: { id: productId } }).catch(() => undefined);
  await prisma.apiKey.deleteMany({ where: { name: "phase6-reviews-test" } }).catch(() => undefined);
  await prisma.$disconnect();
});

async function get(path: string, withKey = true): Promise<{ status: number; body: any }> {
  const app = createApp();
  const server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const res = await fetch(`http://127.0.0.1:${port}${path}`, { headers: withKey ? { "x-api-key": apiKey } : {} });
    return { status: res.status, body: await res.json() };
  } finally {
    server.close();
  }
}

test("AUTH: review endpoints reject requests with no API key", async () => {
  assert.equal((await get("/api/reviews", false)).status, 401);
  assert.equal((await get("/api/review-topics", false)).status, 401);
});

test("AUTH: the ingest endpoint rejects requests with no API key", async () => {
  const app = createApp();
  const server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const res = await fetch(`http://127.0.0.1:${port}/api/products/${productId}/review-sources/${reviewSourceId}/ingest`, { method: "POST" });
    assert.equal(res.status, 401);
  } finally {
    server.close();
  }
});

test("service-level ingest: re-ingesting the same feed creates no duplicates", async () => {
  const again = await ingestReviewSource(reviewSourceId, productId, { urlValidator: permissive });
  assert.equal(again.created, 0);
  assert.equal(again.duplicates, 3);
  assert.equal(await prisma.review.count({ where: { productId } }), 3);
});

test("GET /api/reviews lists reviews with sentiment and topics; the internal fingerprint is never exposed", async () => {
  const { status, body } = await get(`/api/reviews?product=${productId}`);
  assert.equal(status, 200);
  assert.equal(body.data.length, 3);
  assert.ok(body.data[0].sentiment.label);
  assert.ok(!("fingerprint" in body.data[0]));
});

test("GET /api/reviews filters by sentiment, topic, rating, source and date", async () => {
  const neg = await get(`/api/reviews?product=${productId}&sentiment=NEGATIVE`);
  assert.equal(neg.body.data.length, 1);
  assert.equal(neg.body.data[0].externalId, "r2");

  const topic = await get(`/api/reviews?product=${productId}&topic=pricing`);
  assert.ok(topic.body.data.every((r: any) => r.topics.some((t: any) => t.key === "pricing")));

  const rating = await get(`/api/reviews?product=${productId}&minRating=4`);
  assert.equal(rating.body.data.length, 1);

  const src = await get(`/api/reviews?source=${reviewSourceId}`);
  assert.equal(src.body.data.length, 3);

  const dated = await get(`/api/reviews?product=${productId}&from=2026-02-01T00:00:00Z&to=2026-02-28T00:00:00Z`);
  assert.equal(dated.body.data.length, 1);
});

test("GET /api/reviews rejects invalid parameters with a consistent 400 shape", async () => {
  for (const q of ["sentiment=HAPPY", "topic=nonsense", "minRating=9", "from=garbage", "limit=-1"]) {
    const { status, body } = await get(`/api/reviews?${q}`);
    assert.equal(status, 400, q);
    assert.ok(body.error?.code, q);
  }
});

test("GET /api/reviews paginates with a bounded limit and a cursor, with no duplicates or gaps", async () => {
  const first = await get(`/api/reviews?product=${productId}&limit=2`);
  assert.equal(first.body.data.length, 2);
  assert.ok(first.body.pagination.nextCursor);
  const second = await get(`/api/reviews?product=${productId}&limit=2&cursor=${first.body.pagination.nextCursor}`);
  assert.equal(second.body.data.length, 1);
  assert.equal(second.body.pagination.nextCursor, null);
  const ids = [...first.body.data, ...second.body.data].map((r: any) => r.id);
  assert.equal(new Set(ids).size, 3);
});

test("GET /api/reviews clamps an oversize limit to the maximum", async () => {
  const { body } = await get(`/api/reviews?limit=99999`);
  assert.equal(body.pagination.limit, 50);
});

test("GET /api/review-topics returns per-topic aggregates", async () => {
  const { status, body } = await get(`/api/review-topics?product=${productId}`);
  assert.equal(status, 200);
  assert.ok(body.data.length > 0);
  const support = body.data.find((d: any) => d.topic.key === "support");
  assert.equal(support?.reviewCount, 1);
});
