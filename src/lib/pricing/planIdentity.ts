/**
 * Normalizes a raw plan-name string into a stable matching key so "Pro",
 * "PRO", and "Pro Plan" resolve to the same PricingPlan (per Phase 4.2's
 * explicit example), while staying conservative: "Pro" and "Pro Team"
 * must NOT merge (04_DEVELOPMENT_RULES — "do not aggressively merge
 * unrelated plans").
 *
 * Approach: lowercase, strip punctuation, drop a small set of generic
 * suffix/prefix words that don't carry plan identity ("plan", "tier",
 * "package"), collapse whitespace. Nothing fuzzier than that — no edit-
 * distance matching, no synonym tables. This is intentionally the
 * smallest transformation that satisfies the given example without
 * risking merging genuinely different plans.
 */
const GENERIC_WORDS = /\b(plan|tier|package)\b/g;

export function normalizePlanName(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .replace(GENERIC_WORDS, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** True when the two raw names normalize to the same plan identity. */
export function isSamePlan(a: string, b: string): boolean {
  return normalizePlanName(a) === normalizePlanName(b);
}
