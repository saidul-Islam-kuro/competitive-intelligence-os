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
let sourceId: string;

before(async () => {
  const key = generateApiKey();
  apiKeyPlaintext = key.plaintext;
  await prisma.apiKey.create({
    data: { name: "phase2-route-test", keyPrefix: key.keyPrefix, hashedKey: key.hashedKey },
  });

  const product = await prisma.product.create({
    data: { name: `Phase2 Route Test ${Date.now()}`, homepageUrl: "http://127.0.0.1:1/" },
  });
  productId = product.id;
  const source = await prisma.source.create({
    data: { productId, type: "HOMEPAGE", url: "http://127.0.0.1:1/" },
  });
  sourceId = source.id;
});

after(async () => {
  await prisma.product.delete({ where: { id: productId } }).catch(() => undefined);
  await prisma.apiKey.deleteMany({ where: { name: "phase2-route-test" } }).catch(() => undefined);
  await prisma.$disconnect();
});

test("POST /api/products/:productId/sources/:sourceId/scrape rejects requests with no API key", async () => {
  const app = createApp();
  const server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const res = await fetch(`http://127.0.0.1:${port}/api/products/${productId}/sources/${sourceId}/scrape`, {
      method: "POST",
    });
    assert.equal(res.status, 401);
  } finally {
    server.close();
  }
});

test("POST .../scrape rejects an invalid API key", async () => {
  const app = createApp();
  const server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const res = await fetch(`http://127.0.0.1:${port}/api/products/${productId}/sources/${sourceId}/scrape`, {
      method: "POST",
      headers: { "x-api-key": "cios_not_a_real_key" },
    });
    assert.equal(res.status, 401);
  } finally {
    server.close();
  }
});

test("POST .../scrape with a valid API key reaches the service and returns a structured result (or error)", async () => {
  const app = createApp();
  const server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const res = await fetch(`http://127.0.0.1:${port}/api/products/${productId}/sources/${sourceId}/scrape`, {
      method: "POST",
      headers: { "x-api-key": apiKeyPlaintext },
    });
    // The source URL (127.0.0.1:1) refuses connections by design in this
    // test, AND production always uses the real SSRF policy (no override
    // reaches the route), so this specific source is expected to be
    // SSRF-blocked here — the point of this test is that auth passes and
    // the request reaches the service/error-handling pipeline at all,
    // returning the structured JSON error shape rather than crashing.
    const body = await res.json();
    assert.ok(res.status === 400 || res.status === 502 || res.status === 200);
    if (res.status !== 200) {
      assert.ok(body.error?.code);
    }
  } finally {
    server.close();
  }
});
