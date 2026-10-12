/**
 * Deterministic feature extraction. No AI. Two structural signals only,
 * deliberately not "any short-looking sentence anywhere on the page"
 * (04_DEVELOPMENT_RULES — "avoid treating arbitrary marketing prose as
 * hundreds of separate features", "prefer strong structural signals"):
 *
 * - Headings (h2–h6; h1 is treated as the page title, not a feature) that
 *   aren't a known non-feature section title (FAQ, Contact, Pricing,
 *   Legal, or a bare "Features"/"Our Features" section header itself).
 *   Confidence 0.8 — a heading is a strong, deliberate structural choice.
 * - List items (<li> text, already extracted by the parser) that are
 *   short (≤8 words), don't end in terminal sentence punctuation (a
 *   paragraph accidentally wrapped in <li> is still a paragraph, not a
 *   feature name), and aren't actually a price or a plan limit (reuses
 *   the pricing module's own pattern checks so "$29/month" and "Up to 5
 *   users" list items are never miscounted as features here).
 *   Confidence 0.6 — weaker than a heading, still structural (not
 *   arbitrary body text).
 *
 * This intentionally does NOT scan paragraph/body prose at all — that is
 * exactly the "hundreds of separate features from marketing copy" failure
 * mode the instructions warn against.
 */
import { normalizeFeatureName } from "./normalizeFeature";
import { extractPricingCandidates } from "../pricing/extractPricing";
import { parseLimit } from "../pricing/limits";

export interface FeatureCandidate {
  name: string;
  canonicalName: string;
  confidence: number;
  evidenceText: string;
  source: "heading" | "listItem";
}

export interface FeatureExtractionInput {
  headings: Array<{ level: number; text: string }>;
  listItems: string[];
  /** Needed only to exclude price/limit list items from being misread as features. */
  normalizedText?: string;
}

const NON_FEATURE_SECTION_RE =
  /\?$|\b(faq|frequently asked questions|contact|about|support|help|testimonials|reviews|blog|careers|pricing|plans?|legal|privacy|terms of service|meet the team|our team)\b/i;
const BARE_FEATURES_HEADING_RE = /^(our |key |main |core |top )?features?$/i;
const MAX_FEATURE_WORDS = 8;

function isFeatureLikeHeading(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed || trimmed.split(/\s+/).length > 6) return false;
  if (BARE_FEATURES_HEADING_RE.test(trimmed)) return false;
  return !NON_FEATURE_SECTION_RE.test(trimmed);
}

function isFeatureLikeListItem(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (trimmed.split(/\s+/).length > MAX_FEATURE_WORDS) return false;
  if (/[.?!]$/.test(trimmed)) return false; // a full sentence, not a short label
  if (parseLimit(trimmed)) return false; // "Up to 5 users" is a limit, not a feature
  // Reuse the pricing line-matcher via a 1-line "page" — a price-looking
  // list item ("$29/month") is not a feature name.
  const looksLikePrice = extractPricingCandidates({ headings: [{ level: 2, text: "_" }], normalizedText: `_\n${trimmed}` });
  if (looksLikePrice.length > 0) return false;
  return true;
}

export function extractFeatureCandidates(input: FeatureExtractionInput): FeatureCandidate[] {
  const candidates: FeatureCandidate[] = [];
  const seen = new Set<string>();

  for (const heading of input.headings) {
    if (heading.level < 2) continue; // h1 is the page title, not a feature
    const text = heading.text.trim();
    if (!isFeatureLikeHeading(text)) continue;
    const canonicalName = normalizeFeatureName(text);
    if (!canonicalName || seen.has(canonicalName)) continue;
    seen.add(canonicalName);
    candidates.push({ name: text, canonicalName, confidence: 0.8, evidenceText: text.slice(0, 300), source: "heading" });
  }

  for (const item of input.listItems) {
    const text = item.trim();
    if (!isFeatureLikeListItem(text)) continue;
    const canonicalName = normalizeFeatureName(text);
    if (!canonicalName || seen.has(canonicalName)) continue;
    seen.add(canonicalName);
    candidates.push({ name: text, canonicalName, confidence: 0.6, evidenceText: text.slice(0, 300), source: "listItem" });
  }

  return candidates;
}
