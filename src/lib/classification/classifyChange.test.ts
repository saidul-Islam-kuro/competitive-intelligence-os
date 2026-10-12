import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyChange, summarizeChange, CHANGE_CATEGORIES, type ClassificationInput } from "./classifyChange";
import { diffStructuredContent } from "../diff/structuralDiff";
import type { NormalizedContent } from "../normalizer/normalizeContent";
import type { StructuralDiff } from "../diff/structuralDiff";

const EMPTY_DIFF: StructuralDiff = {
  fields: [],
  fieldsTruncated: false,
  text: { added: [], removed: [], addedCount: 0, removedCount: 0, truncated: false },
  hasChanges: false,
};

function input(overrides: Partial<ClassificationInput> = {}): ClassificationInput {
  return {
    sourceType: "HOMEPAGE",
    sourceUrl: "https://example.com/",
    diff: EMPTY_DIFF,
    ...overrides,
  };
}

test("classifyChange: source type PRICING is strong (confidence 1.0) evidence for PRICING", () => {
  const result = classifyChange(input({ sourceType: "PRICING" }));
  assert.equal(result.category, "PRICING");
  assert.equal(result.confidence, 1.0);
  assert.ok(result.evidence[0].includes("PRICING"));
});

test("classifyChange: source type CHANGELOG/DOCUMENTATION/FEATURE/PRODUCT/BLOG map to their categories", () => {
  assert.equal(classifyChange(input({ sourceType: "CHANGELOG" })).category, "CHANGELOG");
  assert.equal(classifyChange(input({ sourceType: "DOCUMENTATION" })).category, "DOCUMENTATION");
  assert.equal(classifyChange(input({ sourceType: "FEATURE" })).category, "FEATURE");
  assert.equal(classifyChange(input({ sourceType: "PRODUCT" })).category, "PRODUCT");
  assert.equal(classifyChange(input({ sourceType: "BLOG" })).category, "CONTENT");
});

test("classifyChange: ambiguous source types (HOMEPAGE, COMPARISON, REVIEW, CUSTOM) are NOT mapped by type alone", () => {
  for (const sourceType of ["HOMEPAGE", "COMPARISON", "REVIEW", "CUSTOM"] as const) {
    const result = classifyChange(input({ sourceType, sourceUrl: "https://example.com/random-page" }));
    assert.equal(result.category, "UNKNOWN", `expected ${sourceType} alone to be UNKNOWN`);
  }
});

test("classifyChange: URL path is used when source type gives no signal", () => {
  const result = classifyChange(input({ sourceType: "HOMEPAGE", sourceUrl: "https://example.com/pricing" }));
  assert.equal(result.category, "PRICING");
  assert.equal(result.confidence, 0.7);
});

test("classifyChange: URL path rules cover changelog, docs, integrations, legal, blog", () => {
  const cases: Array<[string, string]> = [
    ["https://example.com/changelog", "CHANGELOG"],
    ["https://example.com/docs/getting-started", "DOCUMENTATION"],
    ["https://example.com/integrations", "INTEGRATION"],
    ["https://example.com/legal/privacy", "LEGAL_POLICY"],
    ["https://example.com/blog/post-1", "CONTENT"],
  ];
  for (const [url, expected] of cases) {
    const result = classifyChange(input({ sourceType: "CUSTOM", sourceUrl: url }));
    assert.equal(result.category, expected, `expected ${url} -> ${expected}`);
  }
});

test("classifyChange: source type takes priority over a conflicting URL path", () => {
  // Type says PRODUCT, URL happens to contain "pricing" — type should win
  // since it's the stronger, deliberately-configured signal.
  const result = classifyChange(input({ sourceType: "PRODUCT", sourceUrl: "https://example.com/pricing-comparison" }));
  assert.equal(result.category, "PRODUCT");
  assert.equal(result.confidence, 1.0);
});

test("classifyChange: falls back to a changed heading's keyword when type and URL give no signal", () => {
  const diff: StructuralDiff = {
    ...EMPTY_DIFF,
    fields: [{ field: "heading", operation: "added", before: null, after: "New Integrations Available" }],
    hasChanges: true,
  };
  const result = classifyChange(input({ sourceUrl: "https://example.com/updates", diff }));
  assert.equal(result.category, "INTEGRATION");
  assert.equal(result.confidence, 0.5);
});

test("classifyChange: a changed title is also checked for keyword evidence", () => {
  const diff: StructuralDiff = {
    ...EMPTY_DIFF,
    fields: [{ field: "title", operation: "changed", before: "Home", after: "Legal & Terms of Service" }],
    hasChanges: true,
  };
  const result = classifyChange(input({ diff }));
  assert.equal(result.category, "LEGAL_POLICY");
});

test("classifyChange: does NOT scan arbitrary visible text for keywords, only changed headings/title", () => {
  // A heading changed to something unrelated; the visible-text diff
  // (not exposed via `fields`) happens to mention "pricing" deep in body
  // copy — that must NOT be used as evidence, per "do not force a
  // category simply because a keyword appears" / "do not infer... from
  // arbitrary marketing text".
  const diff: StructuralDiff = {
    ...EMPTY_DIFF,
    fields: [{ field: "heading", operation: "added", before: null, after: "Welcome" }],
    text: { added: ["Check out our amazing pricing and features!"], removed: [], addedCount: 1, removedCount: 0, truncated: false },
    hasChanges: true,
  };
  const result = classifyChange(input({ diff }));
  assert.equal(result.category, "UNKNOWN");
});

test("classifyChange: genuinely ambiguous input (no signal anywhere) returns UNKNOWN with confidence null", () => {
  const result = classifyChange(input());
  assert.equal(result.category, "UNKNOWN");
  assert.equal(result.confidence, null);
  assert.ok(result.evidence.length > 0); // still explains *why* it's unknown
});

test("classifyChange: end-to-end through a real diffStructuredContent output", () => {
  const before: NormalizedContent = {
    title: "Acme Pricing",
    metaDescription: null,
    canonicalUrl: null,
    headings: [{ level: 1, text: "Plans" }],
    normalizedText: "Basic plan $9/mo",
    links: [],
    listItems: [],
    structuredData: [],
  };
  const after: NormalizedContent = {
    ...before,
    normalizedText: "Basic plan $19/mo",
  };
  const diff = diffStructuredContent(before, after);
  const result = classifyChange({ sourceType: "PRICING", sourceUrl: "https://example.com/pricing", diff });
  assert.equal(result.category, "PRICING");
  assert.equal(result.confidence, 1.0);
});

test("summarizeChange: prefixes a category label when confidence is strong (source-type/URL-based)", () => {
  const strong = { category: "PRICING" as const, confidence: 1.0, evidence: ["x"] };
  assert.equal(
    summarizeChange("2 lines added.", strong),
    "Pricing page content changed. 2 lines added.",
  );
});

test("summarizeChange: does NOT prefix a category label for a weak keyword-only match", () => {
  const weak = { category: "FEATURE" as const, confidence: 0.5, evidence: ["x"] };
  assert.equal(summarizeChange("1 heading added.", weak), "1 heading added.");
});

test("summarizeChange: UNKNOWN never gets a category label", () => {
  const unknown = { category: "UNKNOWN" as const, confidence: null, evidence: ["x"] };
  assert.equal(summarizeChange("Page title changed.", unknown), "Page title changed.");
});

test("CHANGE_CATEGORIES: contains exactly the 10 resolved taxonomy values, matching the Prisma enum", () => {
  assert.deepEqual(
    [...CHANGE_CATEGORIES].sort(),
    [
      "CHANGELOG",
      "CONTENT",
      "DOCUMENTATION",
      "FEATURE",
      "INTEGRATION",
      "LEGAL_POLICY",
      "MARKETING",
      "PRICING",
      "PRODUCT",
      "UNKNOWN",
    ].sort(),
  );
});
