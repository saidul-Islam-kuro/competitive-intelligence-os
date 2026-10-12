/**
 * Requires a real `npm install` (express, @prisma/client generated) to run.
 * Uses the app's own listener on an ephemeral port and Node's built-in
 * fetch — no supertest dependency needed.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { createApp } from "../src/app";

test("GET /api/health responds with a status field and 200 or 503", async () => {
  const app = createApp();
  const server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const res = await fetch(`http://127.0.0.1:${port}/api/health`);
    const body = (await res.json()) as { status: string; db: string };
    assert.ok(res.status === 200 || res.status === 503);
    assert.ok(["ok", "degraded"].includes(body.status));
    assert.ok(["ok", "unreachable"].includes(body.db));
  } finally {
    server.close();
  }
});

test("unknown routes return the structured 404 error shape", async () => {
  const app = createApp();
  const server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const res = await fetch(`http://127.0.0.1:${port}/api/does-not-exist`);
    const body = (await res.json()) as { error: { code: string; message: string } };
    assert.equal(res.status, 404);
    assert.equal(body.error.code, "NOT_FOUND");
  } finally {
    server.close();
  }
});
