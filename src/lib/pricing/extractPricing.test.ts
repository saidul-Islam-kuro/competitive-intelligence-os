import { test } from "node:test";
import assert from "node:assert/strict";
import { extractPricingCandidates, type PricingExtractionInput } from "./extractPricing";

function input(headingTexts: string[], text: string): PricingExtractionInput {
  return {
    headings: headingTexts.map((t) => ({ level: 2, text: t })),
    normalizedText: text,
  };
}

test("$10/month is extracted with currency, price, and billing period", () => {
  const result = extractPricingCandidates(input(["Basic"], "Basic\n$10/month"));
  assert.equal(result.length, 1);
  assert.equal(result[0].planName, "Basic");
  assert.equal(result[0].price, 10);
  assert.equal(result[0].currency, "USD");
  assert.equal(result[0].billingPeriod, "MONTHLY");
});

test("annual pricing: $120/year", () => {
  const result = extractPricingCandidates(input(["Pro"], "Pro\n$120/year"));
  assert.equal(result[0].price, 120);
  assert.equal(result[0].billingPeriod, "YEARLY");
});

test("€29/mo (symbol + abbreviated period)", () => {
  const result = extractPricingCandidates(input(["Starter"], "Starter\n\u20ac29/mo"));
  assert.equal(result[0].price, 29);
  assert.equal(result[0].currency, "EUR");
  assert.equal(result[0].billingPeriod, "MONTHLY");
});

test("currency codes: 'USD 49/month' and '49 USD / month'", () => {
  const a = extractPricingCandidates(input(["Team"], "Team\nUSD 49/month"));
  assert.equal(a[0].price, 49);
  assert.equal(a[0].currency, "USD");

  const b = extractPricingCandidates(input(["Team"], "Team\n49 USD / month"));
  assert.equal(b[0].price, 49);
  assert.equal(b[0].currency, "USD");
});

test("localized thousands separator: $1,200/year", () => {
  const result = extractPricingCandidates(input(["Enterprise"], "Enterprise\n$1,200/year"));
  assert.equal(result[0].price, 1200);
});

test("per-user pricing: £20 per user/month", () => {
  const result = extractPricingCandidates(input(["Team"], "Team\n\u00a320 per user/month"));
  assert.equal(result[0].price, 20);
  assert.equal(result[0].currency, "GBP");
  assert.equal(result[0].unit, "per-user");
  assert.equal(result[0].billingPeriod, "MONTHLY");
});

test("free plans: '$0' and 'Free' are both recognized, not treated as missing data", () => {
  const a = extractPricingCandidates(input(["Free Tier"], "Free Tier\n$0"));
  assert.equal(a[0].isFree, true);
  assert.equal(a[0].price, 0);

  const b = extractPricingCandidates(input(["Community"], "Community\nFree"));
  assert.equal(b[0].isFree, true);
  assert.equal(b[0].price, 0);
});

test("custom/contact-sales pricing has no numeric price and is flagged isCustomPricing", () => {
  const a = extractPricingCandidates(input(["Enterprise"], "Enterprise\nContact sales"));
  assert.equal(a[0].isCustomPricing, true);
  assert.equal(a[0].price, null);

  const b = extractPricingCandidates(input(["Enterprise"], "Enterprise\nCustom pricing"));
  assert.equal(b[0].isCustomPricing, true);
});

test("ambiguous: 'Save $100' is never extracted as a plan price", () => {
  const result = extractPricingCandidates(input(["Pro"], "Pro\nSave $100 today!"));
  assert.equal(result.length, 0);
});

test("ambiguous: a bare price with no heading/plan context is not extracted", () => {
  const result = extractPricingCandidates(input([], "Our servers handle $10M in transactions daily."));
  assert.equal(result.length, 0);
});

test("promotional/approximate: 'Starting at $20' is extracted but flagged isApproximate with reduced confidence", () => {
  const result = extractPricingCandidates(input(["Pro"], "Pro\nStarting at $20/month"));
  assert.equal(result.length, 1);
  assert.equal(result[0].price, 20);
  assert.equal(result[0].isApproximate, true);
  assert.ok(result[0].confidence < 0.7);
});

test("multiple plans on one page are each extracted separately", () => {
  const result = extractPricingCandidates(
    input(["Basic", "Pro", "Enterprise"], "Basic\n$9/month\nPro\n$29/month\nEnterprise\nContact sales"),
  );
  assert.equal(result.length, 3);
  assert.equal(result[0].planName, "Basic");
  assert.equal(result[0].price, 9);
  assert.equal(result[1].planName, "Pro");
  assert.equal(result[1].price, 29);
  assert.equal(result[2].planName, "Enterprise");
  assert.equal(result[2].isCustomPricing, true);
});

test("multiple currencies across different plans are each recognized correctly", () => {
  const result = extractPricingCandidates(input(["US Plan", "EU Plan"], "US Plan\n$10/month\nEU Plan\n\u20ac10/month"));
  assert.equal(result[0].currency, "USD");
  assert.equal(result[1].currency, "EUR");
});

test("inline 'Name: $X' style rows are extracted without a preceding heading", () => {
  const result = extractPricingCandidates(input([], "Starter: $5/month\nGrowth: $15/month"));
  assert.equal(result.length, 2);
  assert.equal(result[0].planName, "Starter");
  assert.equal(result[0].price, 5);
  assert.equal(result[1].planName, "Growth");
  assert.equal(result[1].price, 15);
});

test("a price under a non-plan-name heading (FAQ, Contact) is not attributed to that heading", () => {
  const result = extractPricingCandidates(input(["FAQ"], "FAQ\nDoes it cost $10 more for extra seats?"));
  assert.equal(result.length, 0);
});

test("a heading longer than 5 words is not treated as plan-name context", () => {
  const result = extractPricingCandidates(
    input(["Frequently Asked Questions About Our Product Pricing"], "Frequently Asked Questions About Our Product Pricing\n$10/month"),
  );
  assert.equal(result.length, 0);
});

test("extraction is deterministic — same input produces identical output", () => {
  const data = input(["Pro"], "Pro\n$29/month");
  assert.deepEqual(extractPricingCandidates(data), extractPricingCandidates(data));
});

test("empty content produces no candidates, not an error", () => {
  assert.deepEqual(extractPricingCandidates(input([], "")), []);
});

// --- Phase 4.2/4.5 additions: limits, included features, evidence, identity keys ---

function withItems(headingTexts: string[], text: string, listItems: string[]): PricingExtractionInput {
  return { ...input(headingTexts, text), listItems };
}

test("limits and included features listed AFTER the price attach to that plan (section-based)", () => {
  const result = extractPricingCandidates(
    withItems(
      ["Pro"],
      "Pro\n$29/month\nUp to 10 users\n100GB storage\nPriority support\nAdvanced analytics",
      ["Up to 10 users", "100GB storage", "Priority support", "Advanced analytics"],
    ),
  );
  assert.equal(result.length, 1);
  assert.deepEqual(
    result[0].limits.map((l) => [l.quantity, l.unit]),
    [
      [10, "users"],
      [100, "gb storage"],
    ],
  );
  assert.deepEqual(result[0].includedFeatures, ["Priority support", "Advanced analytics"]);
});

test("limits/features from one plan's section never leak into the next plan", () => {
  const result = extractPricingCandidates(
    withItems(
      ["Basic", "Pro"],
      "Basic\n$9/month\nUp to 3 users\nPro\n$29/month\nUp to 30 users\nSSO",
      ["Up to 3 users", "Up to 30 users", "SSO"],
    ),
  );
  assert.equal(result[0].planName, "Basic");
  assert.deepEqual(result[0].limits.map((l) => l.quantity), [3]);
  assert.deepEqual(result[0].includedFeatures, []);
  assert.equal(result[1].planName, "Pro");
  assert.deepEqual(result[1].limits.map((l) => l.quantity), [30]);
  assert.deepEqual(result[1].includedFeatures, ["SSO"]);
});

test("list items without list data are simply not attached (no crash, no guessing)", () => {
  const result = extractPricingCandidates(input(["Pro"], "Pro\n$29/month\nPriority support"));
  assert.equal(result.length, 1);
  assert.deepEqual(result[0].includedFeatures, []);
});

test("a plan showing BOTH monthly and yearly prices yields two candidates with distinct observation keys", () => {
  const result = extractPricingCandidates(input(["Pro"], "Pro\n$29/month\n$290/year"));
  assert.equal(result.length, 2);
  assert.notEqual(result[0].observationKey, result[1].observationKey);
  assert.equal(result[0].observationKey, "MONTHLY|NONE|PAID");
  assert.equal(result[1].observationKey, "YEARLY|NONE|PAID");
});

test("the same price mentioned twice within one plan section is de-duplicated", () => {
  const result = extractPricingCandidates(input(["Pro"], "Pro\n$29/month\nJust $29/month, billed monthly"));
  assert.equal(result.length, 1);
});

test("EVIDENCE: every candidate preserves the original evidence line and the extraction method", () => {
  const result = extractPricingCandidates(input(["Pro"], "Pro\n\u00a320 per user/month"));
  assert.equal(result[0].evidenceText, "\u00a320 per user/month");
  assert.equal(result[0].extractionMethod, "regex-line-match");

  const inline = extractPricingCandidates(input([], "Starter: $5/month"));
  assert.equal(inline[0].evidenceText, "Starter: $5/month");
  assert.equal(inline[0].extractionMethod, "inline-name-price-row");
});

test("a promotional line inside a plan section does not create or alter a price", () => {
  const result = extractPricingCandidates(input(["Pro"], "Pro\n$29/month\nSave $100 with annual billing"));
  assert.equal(result.length, 1);
  assert.equal(result[0].price, 29);
});
