/**
 * Normalizes a raw feature name into a stable canonical matching key, so
 * "Slack integration" and "Slack Integrations" resolve to the same
 * Feature (Phase 5.2's example), while staying conservative — no fuzzy
 * matching, no synonym tables, nothing that could merge unrelated
 * features (04_DEVELOPMENT_RULES — "do not use aggressive fuzzy
 * matching").
 *
 * Transformation: lowercase, strip punctuation, singularize a bare
 * trailing "s" (so "Integration"/"Integrations" merge), collapse
 * whitespace. That's it — deliberately the same class of small,
 * bounded transform as planIdentity.ts's normalizePlanName, not a
 * general NLP pipeline.
 */
export function normalizeFeatureName(raw: string): string {
  const cleaned = raw
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  // Singularize a bare trailing "s" only when the word before it isn't
  // itself ending in "ss" (avoid "access" -> "acces") and is longer than
  // 3 chars (avoid "sso" -> "ss", "cms" -> "cm").
  return cleaned.replace(/\b(\w{4,})s\b/g, (word, stem: string) => (stem.endsWith("s") ? word : stem));
}

/** True when two raw feature names normalize to the same canonical feature. */
export function isSameFeature(a: string, b: string): boolean {
  return normalizeFeatureName(a) === normalizeFeatureName(b);
}
