/**
 * Deterministic, lexicon-based sentiment — explainable, not a claim of
 * human-level understanding (02_INTELLIGENCE_ENGINE.md §11, Phase 6.5).
 *
 * Algorithm (every step is a plain, inspectable rule — no model, no AI):
 * 1. Tokenize on word boundaries, lowercase.
 * 2. Walk tokens; when a token matches the positive or negative lexicon,
 *    look at up to 3 preceding tokens for a NEGATION word — if found, the
 *    match's polarity flips ("not good" -> negative, not positive).
 * 3. Look at the single immediately-preceding token for an INTENSIFIER
 *    ("very", "extremely", ...) which multiplies the match's weight, or a
 *    DIMINISHER ("slightly", "somewhat", ...) which reduces it.
 * 4. Sum positive and negative weighted hits separately; score =
 *    (positive - negative) / (positive + negative + K), in [-1, 1]. K is a
 *    damping constant — see the regression note below.
 * 5. Label: POSITIVE/NEGATIVE when one side clearly dominates; MIXED when
 *    both sides are substantial and comparable; NEUTRAL when too little
 *    sentiment-bearing language was found.
 * 6. Star rating is SUPPORTING evidence only: it only nudges the result
 *    when the text signal itself is weak/ambiguous — it never overrides
 *    text sentiment that is already clear. Confidence reflects both how
 *    much sentiment language was found and whether the rating agrees with
 *    the text.
 */

const POSITIVE_WORDS = new Set([
  "good", "great", "excellent", "amazing", "awesome", "love", "loved", "best", "fantastic",
  "wonderful", "helpful", "easy", "intuitive", "reliable", "fast", "responsive", "solid",
  "recommend", "impressed", "happy", "pleased", "perfect", "smooth", "simple", "efficient",
  "outstanding", "superb", "brilliant",
]);

const NEGATIVE_WORDS = new Set([
  "bad", "terrible", "awful", "horrible", "worst", "hate", "hated", "poor", "buggy", "broken",
  "slow", "crash", "crashes", "crashed", "confusing", "difficult", "frustrating",
  "disappointing", "disappointed", "unreliable", "expensive", "useless", "annoying", "clunky",
  "laggy", "unresponsive", "overpriced", "mediocre",
]);

const NEGATION_WORDS = new Set(["not", "no", "never", "without", "hardly", "isnt", "wasnt", "dont", "doesnt", "cant"]);
const INTENSIFIERS = new Set(["very", "extremely", "incredibly", "really", "absolutely", "super", "totally"]);
const DIMINISHERS = new Set(["slightly", "somewhat", "kinda", "fairly", "bit"]);

const INTENSIFIER_MULTIPLIER = 1.6;
const DIMINISHER_MULTIPLIER = 0.5;
const NEGATION_WINDOW = 3;

export type SentimentLabel = "POSITIVE" | "NEUTRAL" | "NEGATIVE" | "MIXED";

export interface SentimentResult {
  score: number;
  label: SentimentLabel;
  confidence: number;
  positiveMatches: number;
  negativeMatches: number;
}

function tokenize(text: string): string[] {
  return text.toLowerCase().replace(/'/g, "").split(/[^a-z]+/).filter(Boolean);
}

function hasNegationBefore(tokens: string[], index: number): boolean {
  const start = Math.max(0, index - NEGATION_WINDOW);
  for (let i = start; i < index; i++) {
    if (NEGATION_WORDS.has(tokens[i])) return true;
  }
  return false;
}

function weightMultiplierBefore(tokens: string[], index: number): number {
  if (index === 0) return 1;
  const prev = tokens[index - 1];
  if (INTENSIFIERS.has(prev)) return INTENSIFIER_MULTIPLIER;
  if (DIMINISHERS.has(prev)) return DIMINISHER_MULTIPLIER;
  return 1;
}

/** Analyzes review text; `rating` (1-5 scale) is optional supporting evidence. */
export function analyzeSentiment(text: string, rating?: number | null): SentimentResult {
  const tokens = tokenize(text);
  let positive = 0;
  let negative = 0;
  let positiveMatches = 0;
  let negativeMatches = 0;

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const isPositiveWord = POSITIVE_WORDS.has(token);
    const isNegativeWord = NEGATIVE_WORDS.has(token);
    if (!isPositiveWord && !isNegativeWord) continue;

    const negated = hasNegationBefore(tokens, i);
    const weight = weightMultiplierBefore(tokens, i);
    const effectivelyPositive = negated ? !isPositiveWord : isPositiveWord;

    if (effectivelyPositive) {
      positive += weight;
      positiveMatches++;
    } else {
      negative += weight;
      negativeMatches++;
    }
  }

  // REGRESSION FIX: dividing by (positive + negative) alone makes the
  // score invariant to an intensifier/diminisher's weight whenever there
  // is only one sentiment-bearing word — a single negative match of
  // weight 1 or 1.6 both give (0-w)/(0+w) = -1, so "extremely
  // disappointing" and "disappointing" would score IDENTICALLY. Caught by
  // sentiment.test.ts's intensifier/diminisher tests failing. A fixed
  // damping constant (K=1) in the denominator lets a single word's own
  // weight still affect magnitude, while reviews with more matched words
  // still approach full saturation as positive+negative grows.
  const DAMPING_CONSTANT = 1;
  const totalWeight = positive + negative;
  let score = totalWeight === 0 ? 0 : (positive - negative) / (totalWeight + DAMPING_CONSTANT);
  const totalMatches = positiveMatches + negativeMatches;

  let ratingAgrees = true;
  if (typeof rating === "number" && Number.isFinite(rating)) {
    const ratingScore = (rating - 3) / 2;
    const textSignalIsWeak = totalMatches <= 1 || Math.abs(score) < 0.25;
    if (textSignalIsWeak) {
      score = totalMatches === 0 ? ratingScore * 0.6 : score * 0.5 + ratingScore * 0.5;
    }
    ratingAgrees = Math.sign(ratingScore) === 0 || Math.sign(score) === 0 || Math.sign(ratingScore) === Math.sign(score);
  }

  let label: SentimentLabel;
  const isMixed = positiveMatches > 0 && negativeMatches > 0 && Math.abs(score) < 0.35;
  if (totalMatches === 0 && (rating === undefined || rating === null)) {
    label = "NEUTRAL";
  } else if (isMixed) {
    label = "MIXED";
  } else if (score > 0.15) {
    label = "POSITIVE";
  } else if (score < -0.15) {
    label = "NEGATIVE";
  } else {
    label = "NEUTRAL";
  }

  const matchDensity = Math.min(1, totalMatches / 4);
  const confidence = Math.max(0.15, Math.min(1, matchDensity * (ratingAgrees ? 1 : 0.7)));

  return { score: Math.max(-1, Math.min(1, score)), label, confidence, positiveMatches, negativeMatches };
}
