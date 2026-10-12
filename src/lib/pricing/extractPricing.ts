/**
 * Deterministic pricing extraction. No AI, no network — operates purely
 * on already-normalized content (headings, list items, normalized text),
 * so it's fully unit-testable without cheerio or a database.
 *
 * DESIGN / WHY THIS IS CONSERVATIVE (documented per Dev Rule #8 — avoid
 * false precision):
 *
 * - A price is only extracted when it has BOTH a recognized currency
 *   marker (symbol or 3-letter code) AND plan-name context (a preceding
 *   plan-like heading, or — for single-line "Name: $X" rows — an inline
 *   name on the same line). A bare number with a billing-period word but
 *   no currency marker, and any price with no plan-name context at all,
 *   is never extracted. This keeps "24/7 support" from being misread as a
 *   price and keeps a stray price mention from becoming a fabricated plan.
 * - A denylist of prefix words ("save", "off", "up to", "worth", "was")
 *   rejects promotional mentions on the same line — this is exactly what
 *   keeps "Save $100" from becoming a plan price.
 * - Only "short", non-question headings are eligible as plan-name context
 *   — a price under "## FAQ" or "## Contact Us" is not attributed to a
 *   plan named "FAQ".
 * - "Starting at $X" / "from $X" is extracted but flagged
 *   `isApproximate: true` with confidence strictly below 0.7.
 *
 * STRUCTURE: normalized text is split into *sections* at heading lines.
 * Everything between one heading and the next belongs to that heading's
 * section — this is what lets list items ("Up to 5 users", "Priority
 * support") that appear AFTER the price line attach to the right plan as
 * limits / included features. Relies on the parser's line-break fix
 * (../parser/htmlParser.ts) so headings and prices land on their own
 * lines.
 *
 * Each candidate carries an `observationKey` (billing period | unit |
 * pricing kind) — the deterministic identity of "which price of this plan"
 * (a plan can legitimately show both a monthly and a yearly price). It is
 * the basis for idempotent persistence (see services/persistPricing.ts)
 * and for de-duplicating repeated mentions within one section.
 */
import { currencyFromSymbol, normalizeCurrencyCode, CURRENCY_SYMBOLS, type CurrencyCode } from "./currency";
import { parsePriceNumber } from "./parseNumber";
import { parseLimit, type PlanLimit } from "./limits";

export type BillingPeriod = "MONTHLY" | "YEARLY";

export interface PricingCandidate {
  planName: string;
  price: number | null;
  currency: CurrencyCode | null;
  billingPeriod: BillingPeriod | null;
  unit: string | null;
  isCustomPricing: boolean;
  isFree: boolean;
  isApproximate: boolean;
  confidence: number;
  evidenceText: string;
  /** Always "regex-line-match" in this implementation — recorded so evidence says HOW a price was found. */
  extractionMethod: "regex-line-match" | "inline-name-price-row";
  observationKey: string;
  limits: PlanLimit[];
  includedFeatures: string[];
}

export interface PricingExtractionInput {
  headings: Array<{ level: number; text: string }>;
  normalizedText: string;
  /** Normalized <li> texts; used to attach limits / included features to a plan. Optional for callers without list data. */
  listItems?: string[];
}

const NON_PLAN_PREFIX_RE = /^(save|off|discount|up to|worth|value|was)\b/i;
const CUSTOM_PRICING_RE =
  /\b(contact (us|sales)|custom pricing|talk to (our )?sales|get a quote|request (a )?quote|book a demo)\b/i;
const FREE_LINE_RE = /^(free|no cost|\$?0(\.00)?\s*(\/|per\s+)?(mo|month|yr|year)?)$/i;
const NON_PLAN_HEADING_RE =
  /\?$|\b(faq|frequently asked questions|contact|about|support|help|testimonials|reviews|blog|careers|meet the team|our team)\b/i;

const symbolClass = CURRENCY_SYMBOLS.map((s) => `\\${s}`).join("");
const PRICE_RE = new RegExp(
  `(starting at|from|as low as)?\\s*` +
    `([${symbolClass}])?\\s*` +
    `(USD|EUR|GBP|JPY|INR|CAD|AUD)?\\s*` +
    `(\\d[\\d,]*(?:\\.\\d+)?)` +
    `\\s*(USD|EUR|GBP|JPY|INR|CAD|AUD)?` +
    // Unit ("per user"/"per seat"/"per member") is checked BEFORE the
    // separator+period section, and the separator's "per" alternative
    // explicitly excludes those words via a negative lookahead — without
    // this ordering, "per user/month" would have its "per " greedily
    // consumed as a plain separator, leaving "user/month" unmatched.
    `\\s*(per[- ]?(?:user|seat|member))?` +
    `\\s*(?:\\/|per(?!\\s+(?:user|seat|member))\\s+)?\\s*` +
    `(month(?:ly)?|mo\\b|year(?:ly)?|annual(?:ly)?|yr\\b)?`,
  "i",
);

const INLINE_NAME_RE = /^([A-Z][\w\s&+]{0,29}?)\s*[:\u2013\u2014-]\s*(.+)$/;

function normalizePeriod(raw: string): BillingPeriod | null {
  if (/^(month(ly)?|mo)$/i.test(raw)) return "MONTHLY";
  if (/^(year(ly)?|annual(ly)?|yr)$/i.test(raw)) return "YEARLY";
  return null;
}

function looksLikePlanNameHeading(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed || trimmed.split(/\s+/).length > 5) return false;
  return !NON_PLAN_HEADING_RE.test(trimmed);
}

interface LineMatch {
  price: number;
  currency: CurrencyCode | null;
  billingPeriod: BillingPeriod | null;
  unit: string | null;
  isApproximate: boolean;
}

/** Matches a price pattern within `text`; null if no currency-anchored price is present. */
function matchPrice(text: string): LineMatch | null {
  const match = PRICE_RE.exec(text);
  if (!match) return null;
  const [, approx, symbol, code1, number, code2, unit, period] = match;
  if (!symbol && !code1 && !code2) return null; // currency evidence is mandatory
  const price = parsePriceNumber(number);
  if (price === null) return null;
  const currency = symbol ? currencyFromSymbol(symbol) : normalizeCurrencyCode(code1 ?? code2 ?? "");
  return {
    price,
    currency,
    billingPeriod: period ? normalizePeriod(period) : null,
    unit: unit ? "per-user" : null,
    isApproximate: Boolean(approx),
  };
}

function confidenceFor(match: LineMatch): number {
  let confidence = 0.6;
  if (match.currency) confidence += 0.2;
  if (match.billingPeriod) confidence += 0.2;
  if (match.isApproximate) confidence -= 0.35; // keep approximate matches strictly below the "confident" 0.7 tier
  return Math.max(0.3, Math.min(1, confidence));
}

/** Deterministic identity of "which price of this plan": period | unit | kind. */
export function pricingObservationKey(parts: {
  billingPeriod: BillingPeriod | null;
  unit: string | null;
  isCustomPricing: boolean;
  isFree: boolean;
}): string {
  const kind = parts.isCustomPricing ? "CUSTOM" : parts.isFree ? "FREE" : "PAID";
  return `${parts.billingPeriod ?? "NONE"}|${parts.unit ?? "NONE"}|${kind}`;
}

interface Section {
  heading: string | null;
  eligible: boolean;
  lines: string[];
}

function splitIntoSections(normalizedText: string, headingTexts: Set<string>): Section[] {
  const sections: Section[] = [{ heading: null, eligible: false, lines: [] }];
  for (const rawLine of normalizedText.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;
    if (headingTexts.has(line)) {
      sections.push({ heading: line, eligible: looksLikePlanNameHeading(line), lines: [] });
    } else {
      sections[sections.length - 1].lines.push(line);
    }
  }
  return sections;
}

const MAX_INCLUDED_FEATURE_WORDS = 8;

function collectLimitsAndFeatures(
  lines: string[],
  listItemSet: Set<string>,
  consumed: Set<string>,
): { limits: PlanLimit[]; includedFeatures: string[] } {
  const limits: PlanLimit[] = [];
  const includedFeatures: string[] = [];
  for (const line of lines) {
    if (!listItemSet.has(line) || consumed.has(line)) continue;
    const limit = parseLimit(line);
    if (limit) {
      limits.push(limit);
      continue;
    }
    const words = line.split(/\s+/).length;
    if (words <= MAX_INCLUDED_FEATURE_WORDS && !/[.?!]$/.test(line) && !matchPrice(line)) {
      includedFeatures.push(line.slice(0, 120));
    }
  }
  return { limits, includedFeatures };
}

/**
 * Extracts pricing candidates from normalized page content. Pure,
 * deterministic, no AI. Returns [] when nothing meets the evidence bar
 * above — never guesses.
 */
export function extractPricingCandidates(input: PricingExtractionInput): PricingCandidate[] {
  const headingTexts = new Set(input.headings.map((h) => h.text.trim()).filter(Boolean));
  const listItemSet = new Set((input.listItems ?? []).map((t) => t.trim()).filter(Boolean));
  const results: PricingCandidate[] = [];

  for (const section of splitIntoSections(input.normalizedText, headingTexts)) {
    const sectionCandidates: PricingCandidate[] = [];
    const consumed = new Set<string>(); // lines that were price/custom/free evidence, not limits/features

    for (const line of section.lines) {
      if (NON_PLAN_PREFIX_RE.test(line)) {
        // "up to" is in the promo denylist ("Up to 50% off") but is also
        // how plan limits legitimately start ("Up to 10 users") — a line
        // that parses as a real limit must stay available to
        // collectLimitsAndFeatures instead of being swallowed here.
        if (!parseLimit(line)) consumed.add(line);
        continue;
      }

      if (section.eligible && section.heading) {
        const base = { planName: section.heading, limits: [], includedFeatures: [] as string[] };

        if (CUSTOM_PRICING_RE.test(line)) {
          consumed.add(line);
          sectionCandidates.push({
            ...base,
            price: null,
            currency: null,
            billingPeriod: null,
            unit: null,
            isCustomPricing: true,
            isFree: false,
            isApproximate: false,
            confidence: 0.9,
            evidenceText: line.slice(0, 300),
            extractionMethod: "regex-line-match",
            observationKey: pricingObservationKey({ billingPeriod: null, unit: null, isCustomPricing: true, isFree: false }),
          });
          continue;
        }

        if (FREE_LINE_RE.test(line)) {
          consumed.add(line);
          sectionCandidates.push({
            ...base,
            price: 0,
            currency: null,
            billingPeriod: null,
            unit: null,
            isCustomPricing: false,
            isFree: true,
            isApproximate: false,
            confidence: 0.9,
            evidenceText: line.slice(0, 300),
            extractionMethod: "regex-line-match",
            observationKey: pricingObservationKey({ billingPeriod: null, unit: null, isCustomPricing: false, isFree: true }),
          });
          continue;
        }

        const match = matchPrice(line);
        if (match) {
          consumed.add(line);
          const isFree = match.price === 0;
          sectionCandidates.push({
            ...base,
            price: match.price,
            currency: match.currency,
            billingPeriod: match.billingPeriod,
            unit: match.unit,
            isCustomPricing: false,
            isFree,
            isApproximate: match.isApproximate,
            confidence: confidenceFor(match),
            evidenceText: line.slice(0, 300),
            extractionMethod: "regex-line-match",
            observationKey: pricingObservationKey({
              billingPeriod: match.billingPeriod,
              unit: match.unit,
              isCustomPricing: false,
              isFree,
            }),
          });
          continue;
        }
      }

      // Self-describing single line: "Name: $X". Works with or without a
      // heading context, but never for denylisted/non-plan-like names.
      const inline = INLINE_NAME_RE.exec(line);
      if (inline) {
        const [, name, rest] = inline;
        if (!NON_PLAN_PREFIX_RE.test(name) && looksLikePlanNameHeading(name)) {
          const match = matchPrice(rest);
          if (match) {
            consumed.add(line);
            const isFree = match.price === 0;
            results.push({
              planName: name.trim(),
              price: match.price,
              currency: match.currency,
              billingPeriod: match.billingPeriod,
              unit: match.unit,
              isCustomPricing: false,
              isFree,
              isApproximate: match.isApproximate,
              confidence: Math.max(0.3, confidenceFor(match) - 0.1), // inline attribution is slightly weaker evidence than a heading
              evidenceText: line.slice(0, 300),
              extractionMethod: "inline-name-price-row",
              observationKey: pricingObservationKey({
                billingPeriod: match.billingPeriod,
                unit: match.unit,
                isCustomPricing: false,
                isFree,
              }),
              limits: [],
              includedFeatures: [],
            });
          }
        }
      }
    }

    if (sectionCandidates.length > 0 && section.heading) {
      const { limits, includedFeatures } = collectLimitsAndFeatures(section.lines, listItemSet, consumed);
      const seenKeys = new Set<string>();
      for (const candidate of sectionCandidates) {
        if (seenKeys.has(candidate.observationKey)) continue; // repeated mention of the same price within one plan section
        seenKeys.add(candidate.observationKey);
        results.push({ ...candidate, limits, includedFeatures });
      }
    }
  }

  return results;
}
