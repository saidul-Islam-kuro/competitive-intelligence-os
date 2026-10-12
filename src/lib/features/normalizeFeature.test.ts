import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeFeatureName, isSameFeature } from "./normalizeFeature";

test("normalizeFeatureName: case and pluralization variants merge ('Slack integration' / 'Slack Integrations')", () => {
  assert.equal(normalizeFeatureName("Slack integration"), normalizeFeatureName("Slack Integrations"));
  assert.equal(normalizeFeatureName("SLACK INTEGRATION"), normalizeFeatureName("slack integration"));
});

test("normalizeFeatureName: strips punctuation and collapses whitespace", () => {
  assert.equal(normalizeFeatureName("AI Writing Assistant!"), "ai writing assistant");
  assert.equal(normalizeFeatureName("  Team   Collaboration  "), "team collaboration");
});

test("normalizeFeatureName: does not over-singularize short words (SSO, CMS)", () => {
  assert.equal(normalizeFeatureName("SSO"), "sso");
  assert.equal(normalizeFeatureName("CMS"), "cms");
});

test("normalizeFeatureName: does not merge genuinely different features", () => {
  assert.notEqual(normalizeFeatureName("Advanced Analytics"), normalizeFeatureName("Analytics"));
  assert.notEqual(normalizeFeatureName("Slack Integration"), normalizeFeatureName("Teams Integration"));
});

test("isSameFeature: convenience wrapper", () => {
  assert.equal(isSameFeature("Slack Integration", "Slack integrations"), true);
  assert.equal(isSameFeature("Slack Integration", "Zoom Integration"), false);
});
