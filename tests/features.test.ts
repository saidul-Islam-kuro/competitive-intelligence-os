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

before(async () => {
  const key = generateApiKey();
  apiKeyPlaintext = key.plaintext;
  await prisma.apiKey.create({ data: { name: "phase5-features-route-test", keyPrefix: key.keyPrefix, hashedKey: key.hashedKey } });

  const product = await prisma.product.create({ data: { name: `Phase5 Features Route Test ${Date.now()}`, homepageUrl: "https://example.com" } });
  productId = product.id;

  const sso = await prisma.feature.create({ data: { canonicalName: `sso-${Date.now()}`, aliases: ["SSO"] } });
  const audit = await prisma.feature.create({ data: { canonicalName: `audit-logs-${Date.now()}`, aliases: ["Audit Logs"] } });

  await prisma.featureObservation.create({ data: { featureId: sso.id, productId, status: "ACTIVE", confidence: 0.8 } });
  await prisma.featureObservation.create({ data: { featureId: audit.id, productId, status: "UNCERTAIN", confidence: 0.6 } });
});

after(async () => {
  await prisma.product.delete({ where: { id: productId } }).catch(() => undefined);
  await prisma.apiKey.deleteMany({ where: { name: "phase5-features-route-test" } }).catch(() => undefined);
  await prisma.$disconnect();
});

test("GET /api/features rejects requests with no API key", async () => {
  const app = createApp();
  const server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const res = await fetch(`http://127.0.0.1:${port}/api/features`);
    assert.equal(res.status, 401);
  } finally {
    server.close();
  }
});

test("GET /api/features returns observations with the Feature joined in", async () => {
  const app = createApp();
  const server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const res = await fetch(`http://127.0.0.1:${port}/api/features?product=${productId}`, { headers: { "x-api-key": apiKeyPlaintext } });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.data.length, 2);
    assert.ok(body.data[0].feature.canonicalName);
  } finally {
    server.close();
  }
});

test("GET /api/features filters by status", async () => {
  const app = createApp();
  const server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const res = await fetch(`http://127.0.0.1:${port}/api/features?product=${productId}&status=UNCERTAIN`, {
      headers: { "x-api-key": apiKeyPlaintext },
    });
    const body = await res.json();
    assert.equal(body.data.length, 1);
    assert.equal(body.data[0].status, "UNCERTAIN");
  } finally {
    server.close();
  }
});

test("GET /api/features rejects an invalid status", async () => {
  const app = createApp();
  const server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const res = await fetch(`http://127.0.0.1:${port}/api/features?status=NOT_REAL`, { headers: { "x-api-key": apiKeyPlaintext } });
    assert.equal(res.status, 400);
  } finally {
    server.close();
  }
});
