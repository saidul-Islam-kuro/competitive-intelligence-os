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
let planId: string;

before(async () => {
  const key = generateApiKey();
  apiKeyPlaintext = key.plaintext;
  await prisma.apiKey.create({ data: { name: "phase4-pricing-route-test", keyPrefix: key.keyPrefix, hashedKey: key.hashedKey } });

  const product = await prisma.product.create({ data: { name: `Phase4 Pricing Route Test ${Date.now()}`, homepageUrl: "https://example.com" } });
  productId = product.id;
  const plan = await prisma.pricingPlan.create({ data: { productId, name: "Pro", normalizedName: "pro" } });
  planId = plan.id;

  await prisma.pricingPoint.create({
    data: { productId, pricingPlanId: planId, price: 29, currency: "USD", billingPeriod: "MONTHLY", observationKey: "MONTHLY|NONE|PAID", capturedAt: new Date("2026-01-01T00:00:00Z") },
  });
  await prisma.pricingPoint.create({
    data: { productId, pricingPlanId: planId, price: 39, currency: "USD", billingPeriod: "MONTHLY", observationKey: "MONTHLY|NONE|PAID", capturedAt: new Date("2026-02-01T00:00:00Z") },
  });
});

after(async () => {
  await prisma.product.delete({ where: { id: productId } }).catch(() => undefined);
  await prisma.apiKey.deleteMany({ where: { name: "phase4-pricing-route-test" } }).catch(() => undefined);
  await prisma.$disconnect();
});

test("GET /api/pricing rejects requests with no API key", async () => {
  const app = createApp();
  const server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const res = await fetch(`http://127.0.0.1:${port}/api/pricing`);
    assert.equal(res.status, 401);
  } finally {
    server.close();
  }
});

test("GET /api/pricing returns history newest first, with plan joined in", async () => {
  const app = createApp();
  const server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const res = await fetch(`http://127.0.0.1:${port}/api/pricing?product=${productId}`, { headers: { "x-api-key": apiKeyPlaintext } });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.data.length, 2);
    assert.equal(body.data[0].price, 39);
    assert.equal(body.data[0].plan.name, "Pro");
  } finally {
    server.close();
  }
});

test("GET /api/pricing filters by plan", async () => {
  const app = createApp();
  const server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const res = await fetch(`http://127.0.0.1:${port}/api/pricing?plan=${planId}`, { headers: { "x-api-key": apiKeyPlaintext } });
    const body = await res.json();
    assert.equal(body.data.length, 2);
    assert.ok(body.data.every((p: { plan: { id: string } }) => p.plan.id === planId));
  } finally {
    server.close();
  }
});

test("GET /api/pricing filters by date range", async () => {
  const app = createApp();
  const server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const res = await fetch(`http://127.0.0.1:${port}/api/pricing?product=${productId}&from=2026-01-15T00:00:00Z`, {
      headers: { "x-api-key": apiKeyPlaintext },
    });
    const body = await res.json();
    assert.equal(body.data.length, 1);
    assert.equal(body.data[0].price, 39);
  } finally {
    server.close();
  }
});

test("GET /api/pricing paginates with a bounded limit and cursor", async () => {
  const app = createApp();
  const server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const res = await fetch(`http://127.0.0.1:${port}/api/pricing?product=${productId}&limit=1`, { headers: { "x-api-key": apiKeyPlaintext } });
    const body = await res.json();
    assert.equal(body.data.length, 1);
    assert.ok(body.pagination.nextCursor);
  } finally {
    server.close();
  }
});
