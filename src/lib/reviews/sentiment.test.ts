import { test } from "node:test";
import assert from "node:assert/strict";
import { analyzeSentiment } from "./sentiment";

test("clearly positive text", () => {
  const result = analyzeSentiment("This is a great, reliable tool. Really helpful support team.");
  assert.equal(result.label, "POSITIVE");
  assert.ok(result.score > 0);
});

test("clearly negative text", () => {
  const result = analyzeSentiment("Terrible experience. Buggy, slow, and the support was awful.");
  assert.equal(result.label, "NEGATIVE");
  assert.ok(result.score < 0);
});

test("neutral text with no sentiment-bearing words", () => {
  const result = analyzeSentiment("We use this for our weekly reporting workflow.");
  assert.equal(result.label, "NEUTRAL");
  assert.equal(result.positiveMatches, 0);
  assert.equal(result.negativeMatches, 0);
});

test("NEGATION: 'not good' is negative, not positive", () => {
  const result = analyzeSentiment("This is not good at all.");
  assert.equal(result.label, "NEGATIVE");
  assert.ok(result.score < 0);
});

test("NEGATION: 'not bad' flips a negative word positive", () => {
  assert.ok(analyzeSentiment("Honestly, not bad for the price.").score > 0);
});

test("INTENSIFIER: 'very good' scores more strongly positive than bare 'good'", () => {
  assert.ok(analyzeSentiment("The product is very good.").score > analyzeSentiment("The product is good.").score);
});

test("INTENSIFIER: 'extremely disappointing' scores more strongly negative than bare 'disappointing'", () => {
  assert.ok(
    analyzeSentiment("The onboarding was extremely disappointing.").score <
      analyzeSentiment("The onboarding was disappointing.").score,
  );
});

test("DIMINISHER: 'somewhat slow' is less negative than bare 'slow'", () => {
  assert.ok(analyzeSentiment("The app is somewhat slow.").score > analyzeSentiment("The app is slow.").score);
});

test("MIXED: roughly equal positive and negative signal is MIXED, not forced to one side", () => {
  assert.equal(analyzeSentiment("Great features and an intuitive UI, but buggy and often crashes.").label, "MIXED");
});

test("RATING AS SUPPORTING EVIDENCE: nudges a weak/neutral text signal", () => {
  const none = analyzeSentiment("It does what it says.");
  assert.ok(analyzeSentiment("It does what it says.", 5).score > none.score);
  assert.ok(analyzeSentiment("It does what it says.", 1).score < none.score);
});

test("RATING NEVER OVERRIDES clear opposite text sentiment", () => {
  assert.equal(analyzeSentiment("Absolutely terrible, buggy, and completely unreliable.", 5).label, "NEGATIVE");
});

test("rating agreement increases confidence; disagreement decreases it", () => {
  assert.ok(analyzeSentiment("Pretty good overall.", 5).confidence >= analyzeSentiment("Pretty good overall.", 1).confidence);
});

test("confidence scales with how much sentiment-bearing language was found", () => {
  assert.ok(
    analyzeSentiment("Great, excellent, fantastic, wonderful, and amazing in every way.").confidence >
      analyzeSentiment("good").confidence,
  );
});

test("confidence never exceeds 1", () => {
  assert.ok(analyzeSentiment("Absolutely the best, most amazing, fantastic tool ever made.").confidence <= 1);
});

test("empty text is NEUTRAL with low confidence, not an error", () => {
  const result = analyzeSentiment("");
  assert.equal(result.label, "NEUTRAL");
  assert.ok(result.confidence < 0.5);
});

test("is deterministic", () => {
  assert.deepEqual(
    analyzeSentiment("Very good support, somewhat slow interface.", 4),
    analyzeSentiment("Very good support, somewhat slow interface.", 4),
  );
});
