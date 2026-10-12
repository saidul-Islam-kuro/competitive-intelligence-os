import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeText,
  normalizeContent,
  stableSerialize,
  capNormalizedContent,
  MAX_NORMALIZED_TEXT_LENGTH,
  MAX_NORMALIZED_ARRAY_ITEMS,
  type ExtractedContent,
} from "./normalizeContent";
import { hashNormalizedContent } from "../utils/contentHash";

test("normalizeText: collapses whitespace and trims lines", () => {
  assert.equal(normalizeText("  hello    world  "), "hello world");
  assert.equal(normalizeText("a\t\tb"), "a b");
});

test("normalizeText: normalizes CRLF and CR line endings to LF", () => {
  assert.equal(normalizeText("a\r\nb\rc\nd"), "a\nb\nc\nd");
});

test("normalizeText: drops blank lines", () => {
  assert.equal(normalizeText("a\n\n\n   \nb"), "a\nb");
});

test("normalizeText: is idempotent (normalizing twice gives the same result)", () => {
  const input = "  Hello   World  \r\n\r\n  Second   Line  ";
  const once = normalizeText(input);
  const twice = normalizeText(once);
  assert.equal(once, twice);
});

test("normalizeText: whitespace-only differences within a line collapse to the same result", () => {
  assert.equal(normalizeText("  Hello   World  "), normalizeText("Hello World"));
  assert.equal(normalizeText("a\r\n\r\nb"), normalizeText("a\n\n\nb"));
});

test("stableSerialize: sorts object keys recursively regardless of input order", () => {
  const a = { b: 1, a: { d: 2, c: 3 } };
  const b = { a: { c: 3, d: 2 }, b: 1 };
  assert.equal(JSON.stringify(stableSerialize(a)), JSON.stringify(stableSerialize(b)));
});

test("stableSerialize: preserves array order (order is meaningful in arrays)", () => {
  const value = stableSerialize([{ b: 1, a: 2 }, { z: 1 }]);
  assert.deepEqual(value, [{ a: 2, b: 1 }, { z: 1 }]);
});

function extracted(overrides: Partial<ExtractedContent> = {}): ExtractedContent {
  return {
    title: "  My   Page  ",
    metaDescription: "  A description.  ",
    canonicalUrl: "https://example.com/canonical",
    headings: [{ level: 1, text: "  Welcome  " }],
    visibleText: "  Hello   World  \n\n  Second   Line  ",
    links: [
      { href: "https://example.com/a", text: "A" },
      { href: "https://example.com/a", text: "A" }, // exact duplicate
      { href: "https://example.com/b", text: "B" },
    ],
    listItems: ["  Feature One  ", "Feature One", "Feature Two"], // includes a whitespace-variant duplicate
    jsonLd: [{ "@type": "Organization", name: "Acme" }],
    ...overrides,
  };
}

test("normalizeContent: trims title/description/canonicalUrl", () => {
  const result = normalizeContent(extracted());
  assert.equal(result.title, "My Page");
  assert.equal(result.metaDescription, "A description.");
  assert.equal(result.canonicalUrl, "https://example.com/canonical");
});

test("normalizeContent: normalizes headings and drops empty ones", () => {
  const result = normalizeContent(
    extracted({ headings: [{ level: 1, text: "  Hi  " }, { level: 2, text: "   " }] }),
  );
  assert.deepEqual(result.headings, [{ level: 1, text: "Hi" }]);
});

test("normalizeContent: dedupes exact-duplicate links but keeps distinct ones", () => {
  const result = normalizeContent(extracted());
  assert.deepEqual(result.links, [
    { href: "https://example.com/a", text: "A" },
    { href: "https://example.com/b", text: "B" },
  ]);
});

test("normalizeContent: drops links with an empty href", () => {
  const result = normalizeContent(extracted({ links: [{ href: "  ", text: "x" }] }));
  assert.deepEqual(result.links, []);
});

test("normalizeContent: trims list items and dedupes exact duplicates (including whitespace-only variants)", () => {
  const result = normalizeContent(extracted());
  assert.deepEqual(result.listItems, ["Feature One", "Feature Two"]);
});

test("normalizeContent: drops empty list items", () => {
  const result = normalizeContent(extracted({ listItems: ["  ", "", "Real Item"] }));
  assert.deepEqual(result.listItems, ["Real Item"]);
});

test("normalizeContent: null title/description/canonicalUrl pass through as null", () => {
  const result = normalizeContent(extracted({ title: null, metaDescription: null, canonicalUrl: null }));
  assert.equal(result.title, null);
  assert.equal(result.metaDescription, null);
  assert.equal(result.canonicalUrl, null);
});

test("normalizeContent: is a pure function (same input -> deep-equal output every time)", () => {
  const input = extracted();
  const first = normalizeContent(input);
  const second = normalizeContent(input);
  assert.deepEqual(first, second);
});

test("capNormalizedContent: leaves small content completely untouched", () => {
  const content = normalizeContent(extracted());
  const capped = capNormalizedContent(content);
  assert.deepEqual(capped, content);
});

test("capNormalizedContent: truncates text beyond the limit with a visible marker", () => {
  const content = normalizeContent(extracted({ visibleText: "x".repeat(MAX_NORMALIZED_TEXT_LENGTH + 1000) }));
  const capped = capNormalizedContent(content);
  assert.ok(capped.normalizedText.length < content.normalizedText.length);
  assert.match(capped.normalizedText, /truncated at \d+ characters/);
});

test("capNormalizedContent: caps headings/links/listItems array length by count", () => {
  const manyHeadings = Array.from({ length: 1000 }, (_, i) => ({ level: 2, text: `Heading ${i}` }));
  const manyLinks = Array.from({ length: 1000 }, (_, i) => ({ href: `https://example.com/${i}`, text: `Link ${i}` }));
  const manyListItems = Array.from({ length: 1000 }, (_, i) => `Item ${i}`);
  const content = normalizeContent(extracted({ headings: manyHeadings, links: manyLinks, listItems: manyListItems }));
  const capped = capNormalizedContent(content);
  assert.equal(capped.headings.length, MAX_NORMALIZED_ARRAY_ITEMS);
  assert.equal(capped.links.length, MAX_NORMALIZED_ARRAY_ITEMS);
  assert.equal(capped.listItems.length, MAX_NORMALIZED_ARRAY_ITEMS);
});

test("REGRESSION (Phase 2.1 fix): capping is idempotent — capping an already-capped object changes nothing further", () => {
  // This is the property the hash/storage consistency fix actually
  // depends on: scrapeSource must cap ONCE and reuse that single object
  // for both hashing and storage. If capping weren't idempotent, hashing
  // the capped object twice (e.g. once now, once on a future re-read of
  // stored data) could still diverge.
  const content = normalizeContent(extracted({ visibleText: "y".repeat(MAX_NORMALIZED_TEXT_LENGTH + 500) }));
  const cappedOnce = capNormalizedContent(content);
  const cappedTwice = capNormalizedContent(cappedOnce);
  assert.deepEqual(cappedOnce, cappedTwice);
});

test("REGRESSION (Phase 2.1 fix): hashing the capped object is what must be stored — hashing pre-cap content and storing post-cap content would diverge", () => {
  const oversized = normalizeContent(extracted({ visibleText: "z".repeat(MAX_NORMALIZED_TEXT_LENGTH + 500) }));
  const capped = capNormalizedContent(oversized);
  // The bug was: hash(oversized) stored alongside capped.normalizedText.
  // Demonstrate those two are DIFFERENT content (proving the bug would be
  // real if that mismatch were still present)...
  assert.notEqual(oversized.normalizedText, capped.normalizedText);
  // ...and that hashing the SAME capped object twice (the fixed approach)
  // is what actually guarantees consistency for a later identical scrape.
  assert.equal(hashNormalizedContent(capped), hashNormalizedContent(capNormalizedContent(oversized)));
});
