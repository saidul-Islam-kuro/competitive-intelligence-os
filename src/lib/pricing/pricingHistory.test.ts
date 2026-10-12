import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPricingHistory, type HistoryPoint } from "./pricingHistory";
import type { PricingObservation } from "./comparePricing";

function point(id: string, day: number, price: number | null, key = "MONTHLY|NONE|PAID", extra: Partial<PricingObservation> = {}): HistoryPoint {
  return {
    id,
    capturedAt: new Date(Date.UTC(2026, 0, day)),
    observationKey: key,
    observation: { price, currency: "USD", billingPeriod: key.startsWith("YEARLY") ? "YEARLY" : "MONTHLY", unit: null, isCustomPricing: false, ...extra },
  };
}

test("reconstructs first, previous, and current price from unordered input", () => {
  const [series] = buildPricingHistory([point("c", 30, 30), point("a", 1, 10), point("b", 15, 20)]);
  assert.equal(series.first.observation.price, 10);
  assert.equal(series.previous?.observation.price, 20);
  assert.equal(series.current.observation.price, 30);
});

test("each entry carries a comparison to the previous point; the first has none", () => {
  const [series] = buildPricingHistory([point("a", 1, 10), point("b", 2, 15)]);
  assert.equal(series.entries[0].comparisonToPrevious, null);
  const cmp = series.entries[1].comparisonToPrevious;
  assert.ok(cmp?.changes.includes("PRICE_INCREASE"));
  assert.equal(cmp?.absoluteDelta, 5);
  assert.equal(cmp?.percentageDelta, 50);
});

test("a single observation has no previous and a null comparison", () => {
  const [series] = buildPricingHistory([point("a", 1, 10)]);
  assert.equal(series.previous, null);
  assert.equal(series.first.id, series.current.id);
});

test("monthly and yearly prices are separate series and are never compared to each other", () => {
  const series = buildPricingHistory([
    point("m1", 1, 10, "MONTHLY|NONE|PAID"),
    point("y1", 2, 100, "YEARLY|NONE|PAID"),
    point("m2", 3, 12, "MONTHLY|NONE|PAID"),
  ]);
  assert.equal(series.length, 2);
  const monthly = series.find((s) => s.observationKey.startsWith("MONTHLY"));
  const yearly = series.find((s) => s.observationKey.startsWith("YEARLY"));
  assert.equal(monthly?.entries.length, 2);
  assert.equal(yearly?.entries.length, 1);
  assert.ok(!monthly?.entries[1].comparisonToPrevious?.changes.includes("BILLING_INTERVAL_CHANGED"));
});

test("identical timestamps are ordered deterministically by id", () => {
  const a = buildPricingHistory([point("b", 1, 10), point("a", 1, 20)]);
  const b = buildPricingHistory([point("a", 1, 20), point("b", 1, 10)]);
  assert.deepEqual(a[0].entries.map((e) => e.point.id), b[0].entries.map((e) => e.point.id));
});

test("history is never mutated: input array order and objects are untouched", () => {
  const input = [point("b", 2, 20), point("a", 1, 10)];
  const snapshot = input.map((p) => p.id);
  buildPricingHistory(input);
  assert.deepEqual(input.map((p) => p.id), snapshot);
});
