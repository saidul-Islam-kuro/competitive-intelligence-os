/**
 * Deterministic change classification. No LLM, no marketing-language
 * guessing — every rule here is checked in a fixed priority order (source
 * type/URL first, since that's structural metadata the operator configured
 * deliberately; heading/title text from the actual diff second, since it's
 * moderate-confidence content evidence; nothing else). If nothing matches,
 * the result is UNKNOWN — never a forced guess (Phase 3 instructions:
 * "do not force a category simply because a keyword appears").
 *
 * Confidence is graduated, not binary, to avoid false precision
 * (04_DEVELOPMENT_RULES #8): a source explicitly configured as type
 * PRICING is much stronger evidence than a URL path fragment, which is in
 * turn stronger than a keyword appearing in a heading that changed.
 *
 * Taxonomy: see the "Taxonomy resolution (Phase 3)" note in
 * prisma/schema.prisma for how the three conflicting category lists in
 * the project's own instructions were reconciled.
 */
import type { StructuralDiff } from "../diff/structuralDiff";

export type ChangeCategory =
  | "FEATURE"
  | "PRICING"
  | "PRODUCT"
  | "DOCUMENTATION"
  | "CHANGELOG"
  | "INTEGRATION"
  | "LEGAL_POLICY"
  | "CONTENT"
  | "MARKETING"
  | "UNKNOWN";

/** Runtime-checkable form of the type above, for validating API query params etc. */
export const CHANGE_CATEGORIES: readonly ChangeCategory[] = [
  "FEATURE",
  "PRICING",
  "PRODUCT",
  "DOCUMENTATION",
  "CHANGELOG",
  "INTEGRATION",
  "LEGAL_POLICY",
  "CONTENT",
  "MARKETING",
  "UNKNOWN",
];

export type SourceTypeInput =
  | "HOMEPAGE"
  | "PRICING"
  | "PRODUCT"
  | "FEATURE"
  | "CHANGELOG"
  | "DOCUMENTATION"
  | "BLOG"
  | "COMPARISON"
  | "REVIEW"
  | "CUSTOM";

export interface ClassificationInput {
  sourceType: SourceTypeInput;
  sourceUrl: string;
  diff: StructuralDiff;
}

export interface Classification {
  category: ChangeCategory;
  /** 1.0 = source type is authoritative; 0.7 = URL path evidence; 0.5 = heading/title keyword; null = UNKNOWN. */
  confidence: number | null;
  /** Plain-language reasons the rule fired, in the order they were checked. */
  evidence: string[];
}

/** Strong evidence: the operator explicitly configured this source's type. */
const SOURCE_TYPE_TO_CATEGORY: Partial<Record<SourceTypeInput, ChangeCategory>> = {
  PRICING: "PRICING",
  CHANGELOG: "CHANGELOG",
  DOCUMENTATION: "DOCUMENTATION",
  FEATURE: "FEATURE",
  PRODUCT: "PRODUCT",
  BLOG: "CONTENT",
  // HOMEPAGE, COMPARISON, REVIEW, CUSTOM deliberately unmapped — a page of
  // that type could reasonably contain pricing, feature, or marketing
  // content equally; source type alone isn't strong evidence for any one
  // category, so these fall through to the weaker signals below.
};

/** Moderate evidence: a URL path segment that's conventionally self-describing. */
const URL_PATH_RULES: Array<{ pattern: RegExp; category: ChangeCategory }> = [
  { pattern: /\/pricing\b/i, category: "PRICING" },
  { pattern: /\/(changelog|release-notes|releases)\b/i, category: "CHANGELOG" },
  { pattern: /\/docs?|\/documentation\b/i, category: "DOCUMENTATION" },
  { pattern: /\/integrations?\b/i, category: "INTEGRATION" },
  { pattern: /\/(legal|privacy|terms)\b/i, category: "LEGAL_POLICY" },
  { pattern: /\/blog\b/i, category: "CONTENT" },
];

/** Weaker evidence: keyword match against heading/title text that was PART OF THE DIFF (not arbitrary body text). */
const KEYWORD_RULES: Array<{ pattern: RegExp; category: ChangeCategory; label: string }> = [
  { pattern: /pricing|\$\d|price/i, category: "PRICING", label: "pricing" },
  { pattern: /integrations?/i, category: "INTEGRATION", label: "integration" },
  { pattern: /changelog|release notes|what'?s new/i, category: "CHANGELOG", label: "changelog" },
  { pattern: /privacy|terms of service|legal/i, category: "LEGAL_POLICY", label: "legal/policy" },
  { pattern: /\bfeatures?\b/i, category: "FEATURE", label: "feature" },
];

/** Text of headings/title that actually changed in this diff — the only content evidence used. */
function changedTextEvidence(diff: StructuralDiff): string[] {
  const values: string[] = [];
  for (const field of diff.fields) {
    if (field.field === "title" || field.field === "heading") {
      if (field.after) values.push(field.after);
    }
  }
  return values;
}

export function classifyChange(input: ClassificationInput): Classification {
  const evidence: string[] = [];

  const byType = SOURCE_TYPE_TO_CATEGORY[input.sourceType];
  if (byType) {
    evidence.push(`Source is configured with type ${input.sourceType}.`);
    return { category: byType, confidence: 1.0, evidence };
  }

  for (const rule of URL_PATH_RULES) {
    if (rule.pattern.test(input.sourceUrl)) {
      evidence.push(`Source URL matches ${rule.pattern} (path evidence for ${rule.category}).`);
      return { category: rule.category, confidence: 0.7, evidence };
    }
  }

  const changedText = changedTextEvidence(input.diff);
  for (const text of changedText) {
    for (const rule of KEYWORD_RULES) {
      if (rule.pattern.test(text)) {
        evidence.push(`Changed heading/title "${text}" matches keyword evidence for ${rule.label}.`);
        return { category: rule.category, confidence: 0.5, evidence };
      }
    }
  }

  evidence.push("No deterministic signal (source type, URL path, or changed heading/title) matched a known category.");
  return { category: "UNKNOWN", confidence: null, evidence };
}

const CATEGORY_LABELS: Record<ChangeCategory, string | null> = {
  PRICING: "Pricing page content changed.",
  CHANGELOG: "Changelog content changed.",
  DOCUMENTATION: "Documentation content changed.",
  INTEGRATION: "Integration-related content changed.",
  FEATURE: "Feature-related content changed.",
  PRODUCT: "Product page content changed.",
  LEGAL_POLICY: "Legal/policy content changed.",
  CONTENT: "Content changed.",
  MARKETING: "Marketing content changed.",
  UNKNOWN: null,
};

/** Confidence tier at/above which a category-flavored opening clause is warranted. */
const MIN_CONFIDENCE_FOR_LABEL = 0.7;

/**
 * Combines the structural summary (what changed) with a conservative
 * category-flavored opening clause (per Phase 3 item 5's examples, e.g.
 * "Pricing page content changed.") — but only when classification
 * confidence is at least source-type/URL-path strength. A weak
 * keyword-only match (confidence 0.5) doesn't earn a confident opening
 * sentence, per "do not claim semantic certainty when the evidence does
 * not support it."
 */
export function summarizeChange(structuralSummary: string, classification: Classification): string {
  const label = CATEGORY_LABELS[classification.category];
  if (!label || classification.confidence === null || classification.confidence < MIN_CONFIDENCE_FOR_LABEL) {
    return structuralSummary;
  }
  return `${label} ${structuralSummary}`;
}
