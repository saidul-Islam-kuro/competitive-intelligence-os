/**
 * These tests run for real in this sandbox — persistPricing.ts only uses
 * `import type { Prisma }`, which is erased at compile time, so no actual
 * @prisma/client install is needed. The `tx` argument is the in-memory
 * fake from testUtils/fakePrismaTx.ts (see its own doc comment for what
 * it does and doesn't validate).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { persistPricingExtraction, extractAndPersistPricing } from "./persistPricing";
import { createFakePrismaTx } from "./testUtils/fakePrismaTx";
import type { PricingCandidate } from "../lib/pricing/extractPricing";

const PRODUCT_ID = "product-1";
const SOURCE_ID = "source-pricing-1";

function proCandidate(overrides: Partial<PricingCandidate> = {}): PricingCandidate {
  return {
    planName: "Pro",
    price: 29,
    currency: "USD",
    billingPeriod: "MONTHLY",
    unit: null,
    isCustomPricing: false,
    isFree: false,
    isApproximate: false,
    confidence: 1,
    evidenceText: "$29/month",
    extractionMethod: "regex-line-match",
    observationKey: "MONTHLY|NONE|PAID",
    limits: [],
    includedFeatures: [],
    ...overrides,
  };
}

function context(overrides: Partial<Parameters<typeof persistPricingExtraction>[2]> = {}) {
  return {
    productId: PRODUCT_ID,
    sourceId: SOURCE_ID,
    sourceType: "PRICING",
    snapshotId: "snapshot-1",
    renderRequired: false,
    ...overrides,
  };
}

test("persists a new plan and pricing point on first extraction", async () => {
  const tx = createFakePrismaTx();
  const result = await persistPricingExtraction(tx as never, [proCandidate()], context());

  assert.equal(result.pricingPointIds.length, 1);
  assert.equal(tx._tables.pricingPlans.length, 1);
  assert.equal(tx._tables.pricingPlans[0].normalizedName, "pro");
  assert.equal(tx._tables.pricingPoints.length, 1);
  assert.equal(tx._tables.pricingPoints[0].price, 29);
});

test("'Pro', 'PRO', 'Pro Plan' across separate scans resolve to the SAME PricingPlan row", async () => {
  const tx = createFakePrismaTx();
  await persistPricingExtraction(tx as never, [proCandidate({ planName: "Pro" })], context({ snapshotId: "s1" }));
  await persistPricingExtraction(tx as never, [proCandidate({ planName: "PRO" })], context({ snapshotId: "s2" }));
  await persistPricingExtraction(tx as never, [proCandidate({ planName: "Pro Plan" })], context({ snapshotId: "s3" }));

  assert.equal(tx._tables.pricingPlans.length, 1);
  assert.equal(tx._tables.pricingPoints.length, 3); // one observation per snapshot — history is preserved, not overwritten
});

test("IDEMPOTENCY: reprocessing the same snapshot does not create a duplicate PricingPoint", async () => {
  const tx = createFakePrismaTx();
  const ctx = context({ snapshotId: "same-snapshot" });
  await persistPricingExtraction(tx as never, [proCandidate()], ctx);
  await persistPricingExtraction(tx as never, [proCandidate()], ctx); // "same processing again"

  assert.equal(tx._tables.pricingPoints.length, 1);
});

test("IDEMPOTENCY: a plan with BOTH a monthly and a yearly price gets two PricingPoints, not a collision", async () => {
  const tx = createFakePrismaTx();
  const monthly = proCandidate({ observationKey: "MONTHLY|NONE|PAID" });
  const yearly = proCandidate({ price: 290, billingPeriod: "YEARLY", observationKey: "YEARLY|NONE|PAID" });
  await persistPricingExtraction(tx as never, [monthly, yearly], context());

  assert.equal(tx._tables.pricingPoints.length, 2);
});

test("a genuinely new snapshot with a changed price creates a new PricingPoint (history, not overwrite)", async () => {
  const tx = createFakePrismaTx();
  await persistPricingExtraction(tx as never, [proCandidate({ price: 29 })], context({ snapshotId: "s1" }));
  await persistPricingExtraction(tx as never, [proCandidate({ price: 39 })], context({ snapshotId: "s2" }));

  assert.equal(tx._tables.pricingPoints.length, 2);
  assert.deepEqual(tx._tables.pricingPoints.map((p) => p.price).sort(), [29, 39]);
});

test("DISAPPEARANCE: a plan missing from a PRICING-type source's next scan is marked inactive", async () => {
  const tx = createFakePrismaTx();
  await persistPricingExtraction(
    tx as never,
    [proCandidate({ planName: "Basic" }), proCandidate({ planName: "Pro" })],
    context({ snapshotId: "s1" }),
  );
  await persistPricingExtraction(tx as never, [proCandidate({ planName: "Pro" })], context({ snapshotId: "s2" }));

  const basic = tx._tables.pricingPlans.find((p) => p.normalizedName === "basic");
  assert.equal(basic?.active, false);
});

test("DISAPPEARANCE: a plan is NOT deactivated when the source is not PRICING-authoritative", async () => {
  const tx = createFakePrismaTx();
  await persistPricingExtraction(
    tx as never,
    [proCandidate({ planName: "Basic" }), proCandidate({ planName: "Pro" })],
    context({ snapshotId: "s1", sourceType: "HOMEPAGE" }),
  );
  await persistPricingExtraction(tx as never, [proCandidate({ planName: "Pro" })], context({ snapshotId: "s2", sourceType: "HOMEPAGE" }));

  const basic = tx._tables.pricingPlans.find((p) => p.normalizedName === "basic");
  assert.equal(basic?.active, true);
});

test("DISAPPEARANCE SCOPING: a plan evidenced only by a DIFFERENT source is never deactivated by this source's scan", async () => {
  const tx = createFakePrismaTx();
  // "Basic" was seen via a different pricing source entirely.
  await persistPricingExtraction(
    tx as never,
    [proCandidate({ planName: "Basic" })],
    context({ snapshotId: "s1", sourceId: "other-pricing-source" }),
  );
  // This source has only ever shown "Pro" — its scan must not touch "Basic".
  await persistPricingExtraction(tx as never, [proCandidate({ planName: "Pro" })], context({ snapshotId: "s2", sourceId: SOURCE_ID }));

  const basic = tx._tables.pricingPlans.find((p) => p.normalizedName === "basic");
  assert.equal(basic?.active, true);
});

test("EVIDENCE: evidenceText and extractionMethod are preserved on the persisted row", async () => {
  const tx = createFakePrismaTx();
  await persistPricingExtraction(tx as never, [proCandidate({ evidenceText: "$29/month", extractionMethod: "regex-line-match" })], context());
  assert.equal(tx._tables.pricingPoints[0].evidenceText, "$29/month");
  assert.equal(tx._tables.pricingPoints[0].extractionMethod, "regex-line-match");
});

test("extractAndPersistPricing: end-to-end from raw normalized content through to persisted rows", async () => {
  const tx = createFakePrismaTx();
  const result = await extractAndPersistPricing(
    tx as never,
    { headings: [{ level: 2, text: "Pro" }], normalizedText: "Pro\n$29/month", listItems: [] },
    context(),
  );
  assert.equal(result.pricingPointIds.length, 1);
  assert.equal(tx._tables.pricingPlans[0].name, "Pro");
});
