import { test } from "node:test";
import assert from "node:assert/strict";
import { parseLimit } from "./limits";

test("parseLimit: 'Up to 5 users'", () => {
  const limit = parseLimit("Up to 5 users");
  assert.deepEqual(limit && { quantity: limit.quantity, unit: limit.unit }, { quantity: 5, unit: "users" });
});

test("parseLimit: 'Unlimited projects'", () => {
  const limit = parseLimit("Unlimited projects");
  assert.equal(limit?.quantity, "unlimited");
  assert.equal(limit?.unit, "projects");
});

test("parseLimit: size suffix + noun ('100GB storage')", () => {
  const limit = parseLimit("100GB storage");
  assert.equal(limit?.quantity, 100);
  assert.equal(limit?.unit, "gb storage");
});

test("parseLimit: thousands separators ('Up to 10,000 contacts')", () => {
  assert.equal(parseLimit("Up to 10,000 contacts")?.quantity, 10000);
});

test("parseLimit: multi-word nouns ending in a whitelisted noun ('5 team members')", () => {
  const limit = parseLimit("5 team members");
  assert.equal(limit?.quantity, 5);
  assert.equal(limit?.unit, "team members");
});

test("parseLimit: non-limit bullets are rejected (whitelist keeps '2 factor authentication' out)", () => {
  assert.equal(parseLimit("2 factor authentication"), null);
  assert.equal(parseLimit("24/7 support"), null);
  assert.equal(parseLimit("Priority support"), null);
  assert.equal(parseLimit("Advanced analytics"), null);
});

test("parseLimit: empty / garbage input returns null rather than throwing", () => {
  assert.equal(parseLimit(""), null);
  assert.equal(parseLimit("   "), null);
});
