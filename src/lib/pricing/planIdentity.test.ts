import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizePlanName, isSamePlan } from "./planIdentity";

test("normalizePlanName: 'Pro', 'PRO', 'Pro Plan' all normalize the same way", () => {
  assert.equal(normalizePlanName("Pro"), normalizePlanName("PRO"));
  assert.equal(normalizePlanName("Pro"), normalizePlanName("Pro Plan"));
});

test("normalizePlanName: strips generic suffix words but keeps distinguishing words", () => {
  assert.equal(normalizePlanName("Enterprise Plan"), "enterprise");
  assert.equal(normalizePlanName("Basic Tier"), "basic");
  assert.equal(normalizePlanName("Starter Package"), "starter");
});

test("normalizePlanName: does NOT merge genuinely different plans", () => {
  assert.notEqual(normalizePlanName("Pro"), normalizePlanName("Pro Team"));
  assert.notEqual(normalizePlanName("Basic"), normalizePlanName("Business"));
  assert.notEqual(normalizePlanName("Starter"), normalizePlanName("Starter Plus"));
});

test("normalizePlanName: strips punctuation and collapses whitespace", () => {
  assert.equal(normalizePlanName("Pro!"), "pro");
  assert.equal(normalizePlanName("  Pro   Plan  "), "pro");
});

test("isSamePlan: convenience wrapper matches normalizePlanName equality", () => {
  assert.equal(isSamePlan("Pro", "Pro Plan"), true);
  assert.equal(isSamePlan("Pro", "Enterprise"), false);
});
