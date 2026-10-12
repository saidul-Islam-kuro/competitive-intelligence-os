import { test } from "node:test";
import assert from "node:assert/strict";
import { comparePricing, type PricingObservation } from "./comparePricing";

function obs(overrides: Partial<PricingObservation> = {}): PricingObservation {
  return { price: 10, currency: "USD", billingPeriod: "MONTHLY", unit: null, isCustomPricing: false, ...overrides };
}

test("price increase: computes correct absolute and percentage delta", () => {
  const result = comparePricing(obs({ price: 10 }), obs({ price: 15 }));
  assert.ok(result.changes.includes("PRICE_INCREASE"));
  assert.equal(result.absoluteDelta, 5);
  assert.equal(result.percentageDelta, 50);
});

test("price decrease: computes correct negative delta", () => {
  const result = comparePricing(obs({ price: 20 }), obs({ price: 15 }));
  assert.ok(result.changes.includes("PRICE_DECREASE"));
  assert.equal(result.absoluteDelta, -5);
  assert.equal(result.percentageDelta, -25);
});

test("no change: identical observations report NO_CHANGE and a zero delta", () => {
  const result = comparePricing(obs(), obs());
  assert.deepEqual(result.changes, ["NO_CHANGE"]);
  assert.equal(result.absoluteDelta, 0);
  assert.equal(result.percentageDelta, 0);
});

test("zero-price comparison: never computes a percentage delta from a zero base", () => {
  const result = comparePricing(obs({ price: 0 }), obs({ price: 10 }));
  assert.equal(result.absoluteDelta, 10);
  assert.equal(result.percentageDelta, null);
  assert.equal(result.deltaSkippedReason, "ZERO_BASE");
});

test("missing price (custom pricing) on either side skips the delta entirely", () => {
  const a = comparePricing(obs({ price: null, isCustomPricing: true }), obs({ price: 10 }));
  assert.equal(a.absoluteDelta, null);
  assert.equal(a.percentageDelta, null);
  assert.equal(a.deltaSkippedReason, "MISSING_PRICE");

  const b = comparePricing(obs({ price: 10 }), obs({ price: null, isCustomPricing: true }));
  assert.equal(b.deltaSkippedReason, "MISSING_PRICE");
});

test("currency mismatch: never silently compares different currencies", () => {
  const result = comparePricing(obs({ price: 10, currency: "USD" }), obs({ price: 10, currency: "EUR" }));
  assert.equal(result.absoluteDelta, null);
  assert.equal(result.percentageDelta, null);
  assert.equal(result.deltaSkippedReason, "CURRENCY_MISMATCH");
  assert.ok(result.changes.includes("CURRENCY_CHANGED"));
});

test("billing interval change is detected independently of price change", () => {
  const result = comparePricing(obs({ billingPeriod: "MONTHLY" }), obs({ billingPeriod: "YEARLY" }));
  assert.ok(result.changes.includes("BILLING_INTERVAL_CHANGED"));
});

test("unit change is detected (e.g. flat price -> per-user)", () => {
  const result = comparePricing(obs({ unit: null }), obs({ unit: "per-user" }));
  assert.ok(result.changes.includes("UNIT_CHANGED"));
});

test("custom-pricing state change is detected both directions", () => {
  const toCustom = comparePricing(obs({ isCustomPricing: false }), obs({ isCustomPricing: true, price: null }));
  assert.ok(toCustom.changes.includes("CUSTOM_PRICING_STATE_CHANGED"));

  const fromCustom = comparePricing(obs({ isCustomPricing: true, price: null }), obs({ isCustomPricing: false, price: 10 }));
  assert.ok(fromCustom.changes.includes("CUSTOM_PRICING_STATE_CHANGED"));
});

test("multiple simultaneous changes are all reported together", () => {
  const result = comparePricing(
    obs({ price: 10, billingPeriod: "MONTHLY", unit: null }),
    obs({ price: 100, billingPeriod: "YEARLY", unit: "per-user" }),
  );
  assert.ok(result.changes.includes("PRICE_INCREASE"));
  assert.ok(result.changes.includes("BILLING_INTERVAL_CHANGED"));
  assert.ok(result.changes.includes("UNIT_CHANGED"));
});

test("comparison is deterministic", () => {
  const a = comparePricing(obs({ price: 10 }), obs({ price: 20 }));
  const b = comparePricing(obs({ price: 10 }), obs({ price: 20 }));
  assert.deepEqual(a, b);
});

// --- Phase 4.4 additions: limits and included features ---

test("limit changed: same unit, different quantity is reported with before/after", () => {
  const result = comparePricing(
    obs({ limits: [{ text: "Up to 5 users", quantity: 5, unit: "users" }] }),
    obs({ limits: [{ text: "Up to 10 users", quantity: 10, unit: "users" }] }),
  );
  assert.ok(result.changes.includes("LIMIT_CHANGED"));
  assert.deepEqual(result.limitsDiff.changed, [{ unit: "users", before: 5, after: 10 }]);
});

test("limit changed: limit added, removed, and finite -> unlimited are all detected", () => {
  const added = comparePricing(obs({ limits: [] }), obs({ limits: [{ text: "x", quantity: 3, unit: "projects" }] }));
  assert.deepEqual(added.limitsDiff.added, ["projects"]);

  const removed = comparePricing(obs({ limits: [{ text: "x", quantity: 3, unit: "projects" }] }), obs({ limits: [] }));
  assert.deepEqual(removed.limitsDiff.removed, ["projects"]);

  const unlimited = comparePricing(
    obs({ limits: [{ text: "x", quantity: 3, unit: "projects" }] }),
    obs({ limits: [{ text: "y", quantity: "unlimited", unit: "projects" }] }),
  );
  assert.deepEqual(unlimited.limitsDiff.changed, [{ unit: "projects", before: 3, after: "unlimited" }]);
});

test("identical limits in a different order are NOT reported as a change", () => {
  const a = [
    { text: "a", quantity: 5, unit: "users" },
    { text: "b", quantity: 3, unit: "projects" },
  ];
  const result = comparePricing(obs({ limits: a }), obs({ limits: [...a].reverse() }));
  assert.ok(!result.changes.includes("LIMIT_CHANGED"));
});

test("included features changed: additions and removals are listed, case-insensitively", () => {
  const result = comparePricing(
    obs({ includedFeatures: ["SSO", "Priority support"] }),
    obs({ includedFeatures: ["sso", "Audit logs"] }),
  );
  assert.ok(result.changes.includes("INCLUDED_FEATURES_CHANGED"));
  assert.deepEqual(result.includedFeaturesDiff.added, ["audit logs"]);
  assert.deepEqual(result.includedFeaturesDiff.removed, ["priority support"]);
});

test("observations without limits/features fields (older rows) compare as empty, not as an error", () => {
  const result = comparePricing(obs(), obs());
  assert.deepEqual(result.changes, ["NO_CHANGE"]);
  assert.deepEqual(result.limitsDiff, { added: [], removed: [], changed: [] });
});
