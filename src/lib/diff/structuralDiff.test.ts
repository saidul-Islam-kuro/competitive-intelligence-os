import { test } from "node:test";
import assert from "node:assert/strict";
import { diffStructuredContent, summarizeStructuralDiff } from "./structuralDiff";
import { hashNormalizedContent } from "../utils/contentHash";
import type { NormalizedContent } from "../normalizer/normalizeContent";

function content(overrides: Partial<NormalizedContent> = {}): NormalizedContent {
  return {
    title: "My Page",
    metaDescription: "A description.",
    canonicalUrl: "https://example.com/",
    headings: [{ level: 1, text: "Welcome" }],
    normalizedText: "Hello World",
    links: [{ href: "https://example.com/a", text: "A" }],
    listItems: ["Feature One"],
    structuredData: [{ "@type": "Organization", name: "Acme" }],
    ...overrides,
  };
}

test("diffStructuredContent: identical content produces no changes", () => {
  const c = content();
  const diff = diffStructuredContent(c, c);
  assert.deepEqual(diff.fields, []);
  assert.equal(diff.hasChanges, false);
});

test("REGRESSION (Phase 2.1 fix): a title-only change is detected even though visible text diff is empty", () => {
  // This is exactly the bug: hash differs (title participates), but the
  // old code only diffed normalizedText, so it would report "no changes".
  const before = content({ title: "Old Title" });
  const after = content({ title: "New Title" });
  assert.notEqual(hashNormalizedContent(before), hashNormalizedContent(after));

  const diff = diffStructuredContent(before, after);
  assert.equal(diff.hasChanges, true);
  assert.equal(diff.text.addedCount, 0);
  assert.equal(diff.text.removedCount, 0); // visible text alone shows nothing
  const titleField = diff.fields.find((f) => f.field === "title");
  assert.ok(titleField, "expected a title field change to be reported");
  assert.equal(titleField?.operation, "changed");
  assert.equal(titleField?.before, "Old Title");
  assert.equal(titleField?.after, "New Title");

  const summary = summarizeStructuralDiff(diff);
  assert.match(summary, /title changed/i);
});

test("diffStructuredContent: detects a description change", () => {
  const diff = diffStructuredContent(content({ metaDescription: "Old" }), content({ metaDescription: "New" }));
  const field = diff.fields.find((f) => f.field === "description");
  assert.equal(field?.operation, "changed");
});

test("diffStructuredContent: detects a canonical URL change", () => {
  const diff = diffStructuredContent(
    content({ canonicalUrl: "https://example.com/a" }),
    content({ canonicalUrl: "https://example.com/b" }),
  );
  const field = diff.fields.find((f) => f.field === "canonicalUrl");
  assert.equal(field?.operation, "changed");
  assert.equal(field?.before, "https://example.com/a");
  assert.equal(field?.after, "https://example.com/b");
});

test("diffStructuredContent: null -> value is 'added', value -> null is 'removed'", () => {
  const added = diffStructuredContent(content({ metaDescription: null }), content({ metaDescription: "New" }));
  assert.equal(added.fields.find((f) => f.field === "description")?.operation, "added");

  const removed = diffStructuredContent(content({ metaDescription: "Old" }), content({ metaDescription: null }));
  assert.equal(removed.fields.find((f) => f.field === "description")?.operation, "removed");
});

test("diffStructuredContent: detects added and removed headings separately", () => {
  const diff = diffStructuredContent(
    content({ headings: [{ level: 1, text: "Old Heading" }] }),
    content({ headings: [{ level: 1, text: "Old Heading" }, { level: 2, text: "New Heading" }] }),
  );
  const headingChanges = diff.fields.filter((f) => f.field === "heading");
  assert.equal(headingChanges.length, 1);
  assert.equal(headingChanges[0].operation, "added");
  assert.match(headingChanges[0].after ?? "", /New Heading/);
});

test("diffStructuredContent: detects visible text additions/removals via the existing line diff", () => {
  const diff = diffStructuredContent(
    content({ normalizedText: "Line A" }),
    content({ normalizedText: "Line A\nLine B" }),
  );
  assert.equal(diff.text.addedCount, 1);
  assert.deepEqual(diff.text.added, ["Line B"]);
});

test("diffStructuredContent: detects added and removed links", () => {
  const diff = diffStructuredContent(
    content({ links: [{ href: "https://example.com/old", text: "Old" }] }),
    content({ links: [{ href: "https://example.com/new", text: "New" }] }),
  );
  const linkChanges = diff.fields.filter((f) => f.field === "link");
  assert.equal(linkChanges.length, 2); // one removed, one added
  assert.ok(linkChanges.some((c) => c.operation === "added"));
  assert.ok(linkChanges.some((c) => c.operation === "removed"));
});

test("diffStructuredContent: detects added and removed list items", () => {
  const diff = diffStructuredContent(
    content({ listItems: ["Old Feature"] }),
    content({ listItems: ["New Feature"] }),
  );
  const itemChanges = diff.fields.filter((f) => f.field === "listItem");
  assert.equal(itemChanges.length, 2);
  assert.ok(itemChanges.some((c) => c.operation === "added" && c.after === "New Feature"));
  assert.ok(itemChanges.some((c) => c.operation === "removed" && c.before === "Old Feature"));
  assert.match(summarizeStructuralDiff(diff), /1 list item added/);
});

test("diffStructuredContent: detects a structured data (JSON-LD) change without embedding the full payload", () => {
  const diff = diffStructuredContent(
    content({ structuredData: [{ price: 10 }] }),
    content({ structuredData: [{ price: 20 }] }),
  );
  const field = diff.fields.find((f) => f.field === "structuredData");
  assert.ok(field);
  assert.equal(field?.before, null); // deliberately not embedding the raw payload
  assert.equal(field?.after, null);
});

test("diffStructuredContent: before=null (first-ever scrape) does not throw and reports everything as added", () => {
  const diff = diffStructuredContent(null, content());
  assert.equal(diff.hasChanges, true);
  assert.ok(diff.fields.length > 0);
});

test("diffStructuredContent: long field values are truncated for storage", () => {
  const diff = diffStructuredContent(
    content({ title: "short" }),
    content({ title: "x".repeat(1000) }),
  );
  const field = diff.fields.find((f) => f.field === "title");
  assert.ok((field?.after?.length ?? 0) < 1000);
  assert.match(field?.after ?? "", /…$/);
});

test("summarizeStructuralDiff: produces plain, non-semantic, pluralized summaries", () => {
  const diff = diffStructuredContent(
    content({ headings: [] }),
    content({ headings: [{ level: 1, text: "A" }, { level: 2, text: "B" }, { level: 2, text: "C" }] }),
  );
  const summary = summarizeStructuralDiff(diff);
  assert.match(summary, /3 headings added/);
});

test("summarizeStructuralDiff: falls back to a generic message when hash differs but no field-level difference is found", () => {
  // Pure reordering: same headings, different order -> no add/remove per
  // the multiset diff, but this function must never crash or lie.
  const diff = {
    fields: [],
    fieldsTruncated: false,
    text: { added: [], removed: [], addedCount: 0, removedCount: 0, truncated: false },
    hasChanges: true,
  };
  assert.equal(
    summarizeStructuralDiff(diff),
    "Content changed (reordered or restructured) with no detected field differences.",
  );
});

test("summarizeStructuralDiff: never contains a semantic classification claim", () => {
  const diff = diffStructuredContent(content({ title: "Basic" }), content({ title: "Pro Plan $99/mo" }));
  const summary = summarizeStructuralDiff(diff);
  for (const forbidden of ["pricing changed", "feature added", "launched", "AI feature"]) {
    assert.ok(!summary.toLowerCase().includes(forbidden.toLowerCase()));
  }
});
