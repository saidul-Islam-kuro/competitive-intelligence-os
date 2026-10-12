import { test } from "node:test";
import assert from "node:assert/strict";
import { extractReviewTopics } from "./topics";

test("extracts a single clear topic with its matched term as evidence", () => {
  const result = extractReviewTopics("The pricing is way too expensive for what you get.");
  const pricing = result.find((t) => t.key === "pricing");
  assert.ok(pricing);
  assert.ok(pricing?.matchedTerms.includes("pricing") || pricing?.matchedTerms.includes("expensive"));
});

test("extracts multiple distinct topics from one review", () => {
  const keys = extractReviewTopics("Great support team, but the mobile app crashes constantly.").map((t) => t.key);
  assert.ok(keys.includes("support"));
  assert.ok(keys.includes("mobile"));
  assert.ok(keys.includes("reliability") || keys.includes("bugs"));
});

test("frequency counts repeated mentions of the same topic", () => {
  const bugs = extractReviewTopics("Buggy, buggy, buggy software — constant bugs everywhere.").find((t) => t.key === "bugs");
  assert.ok((bugs?.frequency ?? 0) >= 3);
});

test("does not match a topic with no corresponding terms present", () => {
  const result = extractReviewTopics("Our team loves how fast and reliable this tool is.");
  assert.ok(!result.some((t) => t.key === "pricing"));
  assert.ok(!result.some((t) => t.key === "security"));
});

test("whole-word matching avoids false positives from substrings ('api' inside 'rapid'/'apiary')", () => {
  assert.ok(!extractReviewTopics("The rapid growth of our apiary business needed better tools.").some((t) => t.key === "api"));
});

test("case-insensitive matching", () => {
  const result = extractReviewTopics("PRICING is fair and SUPPORT is excellent.");
  assert.ok(result.some((t) => t.key === "pricing"));
  assert.ok(result.some((t) => t.key === "support"));
});

test("multi-word terms match correctly ('getting started')", () => {
  assert.ok(extractReviewTopics("Getting started was a breeze, no learning curve at all.").some((t) => t.key === "onboarding"));
});

test("no topics match on topic-free text, returns an empty array", () => {
  assert.deepEqual(extractReviewTopics("We use this daily for our workflow."), []);
});

test("is deterministic", () => {
  const text = "Great support, but pricing is a bit high and the mobile app has bugs.";
  assert.deepEqual(extractReviewTopics(text), extractReviewTopics(text));
});
