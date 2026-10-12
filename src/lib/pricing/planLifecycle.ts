/**
 * Decides which previously-known plans should be marked inactive after a
 * fresh extraction. Deliberately conservative — the same principle the
 * feature lifecycle uses: absence from a page is weak evidence.
 *
 * A plan is only reported as disappeared when ALL of these hold:
 * - the source is authoritative for pricing (a PRICING-type source — a
 *   homepage or blog post omitting a plan says nothing about whether the
 *   plan still exists);
 * - the page wasn't flagged renderRequired (a thin JS shell would "lose"
 *   every plan);
 * - this extraction found at least one plan (zero plans is
 *   indistinguishable from "the page failed to parse", not from "every
 *   plan was removed");
 * - the plan was previously evidenced BY THIS SAME SOURCE (the caller
 *   filters knownActivePlanKeys accordingly) — a plan shown on a
 *   different page isn't judged by this page's absence.
 */
export interface PlanDisappearanceInput {
  knownActivePlanKeys: string[];
  observedPlanKeys: string[];
  sourceIsPricingAuthoritative: boolean;
  renderRequired: boolean;
}

export function findDisappearedPlans(input: PlanDisappearanceInput): string[] {
  if (!input.sourceIsPricingAuthoritative) return [];
  if (input.renderRequired) return [];
  if (input.observedPlanKeys.length === 0) return [];
  const observed = new Set(input.observedPlanKeys);
  return input.knownActivePlanKeys.filter((key) => !observed.has(key)).sort();
}
