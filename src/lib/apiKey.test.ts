import { test } from "node:test";
import assert from "node:assert/strict";
import { generateApiKey, hashApiKey, verifyApiKey } from "./apiKey";

test("generateApiKey: produces a plaintext key, a short prefix, and a hash", () => {
  const key = generateApiKey();
  assert.ok(key.plaintext.startsWith("cios_"));
  assert.equal(key.keyPrefix, key.plaintext.slice(0, 12));
  assert.equal(key.hashedKey, hashApiKey(key.plaintext));
  assert.equal(key.hashedKey.length, 64); // sha256 hex digest
});

test("generateApiKey: two calls never produce the same secret", () => {
  const a = generateApiKey();
  const b = generateApiKey();
  assert.notEqual(a.plaintext, b.plaintext);
  assert.notEqual(a.hashedKey, b.hashedKey);
});

test("verifyApiKey: accepts the correct plaintext against its own hash", () => {
  const key = generateApiKey();
  assert.equal(verifyApiKey(key.plaintext, key.hashedKey), true);
});

test("verifyApiKey: rejects an incorrect plaintext", () => {
  const key = generateApiKey();
  assert.equal(verifyApiKey("cios_wrongsecretvalue", key.hashedKey), false);
});

test("verifyApiKey: rejects a hash of different length without throwing", () => {
  assert.equal(verifyApiKey("cios_something", "deadbeef"), false);
});
