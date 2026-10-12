import { test } from "node:test";
import assert from "node:assert/strict";
import { extractFeatureCandidates, type FeatureExtractionInput } from "./extractFeatures";

function input(overrides: Partial<FeatureExtractionInput> = {}): FeatureExtractionInput {
  return { headings: [], listItems: [], ...overrides };
}

test("extracts feature candidates from headings (h2+), each a likely feature per the spec's examples", () => {
  const result = extractFeatureCandidates(
    input({
      headings: [
        { level: 1, text: "Acme — The Best Tool" }, // h1, excluded (page title)
        { level: 3, text: "AI Writing Assistant" },
        { level: 3, text: "Team Collaboration" },
        { level: 3, text: "Advanced Analytics" },
        { level: 3, text: "Slack Integration" },
      ],
    }),
  );
  const names = result.map((f) => f.name);
  assert.deepEqual(names, ["AI Writing Assistant", "Team Collaboration", "Advanced Analytics", "Slack Integration"]);
  assert.ok(result.every((f) => f.source === "heading" && f.confidence === 0.8));
});

test("extracts short, structural list items as feature candidates", () => {
  const result = extractFeatureCandidates(input({ listItems: ["Two-factor authentication", "Audit logs", "SSO"] }));
  assert.equal(result.length, 3);
  assert.ok(result.every((f) => f.source === "listItem" && f.confidence === 0.6));
});

test("does NOT treat an entire paragraph of marketing copy as a feature", () => {
  const result = extractFeatureCandidates(
    input({
      listItems: [
        "Our platform empowers teams of all sizes to collaborate more effectively than ever before, with a suite of tools designed for the modern workplace.",
      ],
    }),
  );
  assert.equal(result.length, 0);
});

test("does not extract a bare 'Features' section heading as a feature itself", () => {
  const result = extractFeatureCandidates(input({ headings: [{ level: 2, text: "Features" }, { level: 2, text: "Our Features" }] }));
  assert.equal(result.length, 0);
});

test("excludes non-feature section headings (FAQ, Pricing, Contact, Legal)", () => {
  const result = extractFeatureCandidates(
    input({
      headings: [
        { level: 2, text: "FAQ" },
        { level: 2, text: "Pricing" },
        { level: 2, text: "Contact Us" },
        { level: 2, text: "Privacy Policy" },
      ],
    }),
  );
  assert.equal(result.length, 0);
});

test("duplicate feature names (case/pluralization variants) are de-duplicated within one extraction", () => {
  const result = extractFeatureCandidates(
    input({ headings: [{ level: 3, text: "Slack Integration" }, { level: 3, text: "SLACK INTEGRATIONS" }] }),
  );
  assert.equal(result.length, 1);
  assert.equal(result[0].canonicalName, "slack integration");
});

test("case normalization: canonicalName is consistent regardless of source casing", () => {
  const result = extractFeatureCandidates(input({ listItems: ["sso", "SSO"] }));
  assert.equal(result.length, 1);
});

test("punctuation normalization: canonicalName strips punctuation", () => {
  const result = extractFeatureCandidates(input({ headings: [{ level: 3, text: "AI Writing Assistant!" }] }));
  assert.equal(result[0].canonicalName, "ai writing assistant");
});

test("conservative aliasing: distinct features are never merged", () => {
  const result = extractFeatureCandidates(
    input({ headings: [{ level: 3, text: "Slack Integration" }, { level: 3, text: "Zoom Integration" }] }),
  );
  assert.equal(result.length, 2);
});

test("a price-looking list item is not misread as a feature", () => {
  const result = extractFeatureCandidates(input({ listItems: ["$29/month", "Priority support"] }));
  assert.equal(result.length, 1);
  assert.equal(result[0].name, "Priority support");
});

test("a limit-looking list item ('Up to 5 users') is not misread as a feature", () => {
  const result = extractFeatureCandidates(input({ listItems: ["Up to 5 users", "SSO"] }));
  assert.equal(result.length, 1);
  assert.equal(result[0].name, "SSO");
});

test("preserves the original text as evidence, separate from the canonical name", () => {
  const result = extractFeatureCandidates(input({ headings: [{ level: 3, text: "  AI Writing Assistant  " }] }));
  assert.equal(result[0].evidenceText, "AI Writing Assistant");
  assert.equal(result[0].canonicalName, "ai writing assistant");
});

test("empty input produces no candidates, not an error", () => {
  assert.deepEqual(extractFeatureCandidates(input()), []);
});

test("extraction is deterministic", () => {
  const data = input({ headings: [{ level: 3, text: "SSO" }], listItems: ["Audit logs"] });
  assert.deepEqual(extractFeatureCandidates(data), extractFeatureCandidates(data));
});
