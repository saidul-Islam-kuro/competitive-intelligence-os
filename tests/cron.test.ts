/**
 * Requires a real `npm install` to run (express). See tests/health.test.ts
 * for why no supertest dependency is needed.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { createApp } from "../src/app";
import { _resetEnvCacheForTests } from "../src/config/env";

const ORIGINAL_SECRET = process.env.CRON_SECRET;
const ORIGINAL_DB_URL = process.env.DATABASE_URL;

before(() => {
  process.env.DATABASE_URL ??= "postgresql://localhost:5432/test";
  process.env.CRON_SECRET = "test-secret";
  _resetEnvCacheForTests();
});

after(() => {
  process.env.CRON_SECRET = ORIGINAL_SECRET;
  process.env.DATABASE_URL = ORIGINAL_DB_URL;
  _resetEnvCacheForTests();
});

test("/api/cron rejects requests without the bearer secret", async () => {
  const app = createApp();
  const server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const res = await fetch(`http://127.0.0.1:${port}/api/cron`);
    assert.equal(res.status, 401);
  } finally {
    server.close();
  }
});

test("/api/cron accepts the correct bearer secret and reports no_op", async () => {
  const app = createApp();
  const server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const res = await fetch(`http://127.0.0.1:${port}/api/cron`, {
      headers: { Authorization: "Bearer test-secret" },
    });
    const body = (await res.json()) as { status: string };
    assert.equal(res.status, 200);
    assert.equal(body.status, "no_op");
  } finally {
    server.close();
  }
});
