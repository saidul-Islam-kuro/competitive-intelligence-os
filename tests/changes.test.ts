/**
 * Requires `npm install` AND a real, reachable DATABASE_URL. Not runnable
 * in the sandbox this was written in. See VERIFY.md.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { createApp } from "../src/app";
import { prisma } from "../src/db/client";
import { generateApiKey } from "../src/lib/apiKey";

let apiKeyPlaintext: string;
let productId: string;
let sourceIdA: string;
let sourceIdB: string;
let changeIds: string[] = [];

before(async () => {
  const key = generateApiKey();
  apiKeyPlaintext = key.plaintext;
  await prisma.apiKey.create({
    data: { name: "phase3-changes-route-test", keyPrefix: key.keyPrefix, hashedKey: key.hashedKey },
  });

  const product = await prisma.product.create({
    data: { name: `Phase3 Changes Route Test ${Date.now()}`, homepageUrl: "https://example.com" },
  });
  productId = product.id;

  const sourceA = await prisma.source.create({
    data: { productId, type: "PRICING", url: "https://example.com/pricing" },
  });
  sourceIdA = sourceA.id;
  const sourceB = await prisma.source.create({
    data: { productId, type: "DOCUMENTATION", url: "https://example.com/docs" },
  });
  sourceIdB = sourceB.id;

  // Build a small snapshot/change history directly (not via scrapeSource,
  // to keep this test focused purely on the route's filtering/pagination,
  // independent of the fetch pipeline).
  async function makeChange(sourceId: string, category: string, detectedAt: Date) {
    const s1 = await prisma.snapshot.create({ data: { sourceId, requestedUrl: "https://example.com", contentHash: `h1-${Math.random()}` } });
    const s2 = await prisma.snapshot.create({ data: { sourceId, requestedUrl: "https://example.com", contentHash: `h2-${Math.random()}` } });
    const change = await prisma.change.create({
      data: {
        productId,
        sourceId,
        fromSnapshotId: s1.id,
        toSnapshotId: s2.id,
        category: category as never,
        severity: "INFO",
        summary: "Test change",
        detectedAt,
      },
    });
    changeIds.push(change.id);
  }

  await makeChange(sourceIdA, "PRICING", new Date("2026-01-01T00:00:00Z"));
  await makeChange(sourceIdA, "PRICING", new Date("2026-01-05T00:00:00Z"));
  await makeChange(sourceIdB, "DOCUMENTATION", new Date("2026-01-10T00:00:00Z"));
});

after(async () => {
  await prisma.product.delete({ where: { id: productId } }).catch(() => undefined);
  await prisma.apiKey.deleteMany({ where: { name: "phase3-changes-route-test" } }).catch(() => undefined);
  await prisma.$disconnect();
});

test("GET /api/changes rejects requests with no API key", async () => {
  const app = createApp();
  const server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const res = await fetch(`http://127.0.0.1:${port}/api/changes`);
    assert.equal(res.status, 401);
  } finally {
    server.close();
  }
});

test("GET /api/changes with a valid key returns changes, newest first", async () => {
  const app = createApp();
  const server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const res = await fetch(`http://127.0.0.1:${port}/api/changes?product=${productId}`, {
      headers: { "x-api-key": apiKeyPlaintext },
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.data.length, 3);
    assert.ok(new Date(body.data[0].detectedAt) >= new Date(body.data[1].detectedAt));
  } finally {
    server.close();
  }
});

test("GET /api/changes filters by category", async () => {
  const app = createApp();
  const server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const res = await fetch(`http://127.0.0.1:${port}/api/changes?product=${productId}&category=DOCUMENTATION`, {
      headers: { "x-api-key": apiKeyPlaintext },
    });
    const body = await res.json();
    assert.equal(body.data.length, 1);
    assert.equal(body.data[0].category, "DOCUMENTATION");
  } finally {
    server.close();
  }
});

test("GET /api/changes filters by source", async () => {
  const app = createApp();
  const server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const res = await fetch(`http://127.0.0.1:${port}/api/changes?source=${sourceIdA}`, {
      headers: { "x-api-key": apiKeyPlaintext },
    });
    const body = await res.json();
    assert.equal(body.data.length, 2);
    assert.ok(body.data.every((c: { sourceId: string }) => c.sourceId === sourceIdA));
  } finally {
    server.close();
  }
});

test("GET /api/changes filters by date range", async () => {
  const app = createApp();
  const server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const res = await fetch(
      `http://127.0.0.1:${port}/api/changes?product=${productId}&from=2026-01-03T00:00:00Z`,
      { headers: { "x-api-key": apiKeyPlaintext } },
    );
    const body = await res.json();
    assert.equal(body.data.length, 2); // excludes the Jan 1 change
  } finally {
    server.close();
  }
});

test("GET /api/changes rejects an invalid category", async () => {
  const app = createApp();
  const server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const res = await fetch(`http://127.0.0.1:${port}/api/changes?category=NOT_A_REAL_CATEGORY`, {
      headers: { "x-api-key": apiKeyPlaintext },
    });
    assert.equal(res.status, 400);
  } finally {
    server.close();
  }
});

test("GET /api/changes paginates with a bounded limit and a cursor", async () => {
  const app = createApp();
  const server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const first = await fetch(`http://127.0.0.1:${port}/api/changes?product=${productId}&limit=2`, {
      headers: { "x-api-key": apiKeyPlaintext },
    });
    const firstBody = await first.json();
    assert.equal(firstBody.data.length, 2);
    assert.ok(firstBody.pagination.nextCursor);

    const second = await fetch(
      `http://127.0.0.1:${port}/api/changes?product=${productId}&limit=2&cursor=${firstBody.pagination.nextCursor}`,
      { headers: { "x-api-key": apiKeyPlaintext } },
    );
    const secondBody = await second.json();
    assert.equal(secondBody.data.length, 1);
    assert.equal(secondBody.pagination.nextCursor, null);

    const allIds = [...firstBody.data, ...secondBody.data].map((c: { id: string }) => c.id);
    assert.equal(new Set(allIds).size, 3); // no duplicates or gaps across pages
  } finally {
    server.close();
  }
});

test("GET /api/changes rejects a limit over the maximum by clamping, not erroring", async () => {
  const app = createApp();
  const server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const res = await fetch(`http://127.0.0.1:${port}/api/changes?limit=99999`, {
      headers: { "x-api-key": apiKeyPlaintext },
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.pagination.limit, 100); // MAX_LIMIT
  } finally {
    server.close();
  }
});
