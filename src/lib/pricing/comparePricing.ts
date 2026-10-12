/**
 * Deterministic comparison between two pricing observations (e.g. two
 * consecutive PricingPoint rows for the same plan + observation key).
 * Pure — no DB access.
 *
 * Never computes a percentage delta when it would be mathematically
 * invalid or misleading:
 * - old price is 0 (division by zero)
 * - either price is missing (custom pricing, or not yet observed)
 * - currencies differ (comparing $10 to €10 as a percentage is nonsense)
 *
 * Limits and included features are compared as sets (keyed by unit /
 * lowercase text respectively), so reordering alone is never reported as
 * a change.
 */
import type { CurrencyCode } from "./currency";
import type { BillingPeriod } from "./extractPricing";
import type { PlanLimit } from "./limits";

export interface PricingObservation {
  price: number | null;
  currency: CurrencyCode | null;
  billingPeriod: BillingPeriod | null;
  unit: string | null;
  isCustomPricing: boolean;
  /** Optional — treated as [] when absent (e.g. rows stored before limits were tracked). */
  limits?: PlanLimit[];
  includedFeatures?: string[];
}

export type PricingChangeType =
  | "PRICE_INCREASE"
  | "PRICE_DECREASE"
  | "BILLING_INTERVAL_CHANGED"
  | "CURRENCY_CHANGED"
  | "UNIT_CHANGED"
  | "CUSTOM_PRICING_STATE_CHANGED"
  | "LIMIT_CHANGED"
  | "INCLUDED_FEATURES_CHANGED"
  | "NO_CHANGE";

export interface LimitsDiff {
  added: string[];
  removed: string[];
  changed: Array<{ unit: string; before: number | "unlimited"; after: number | "unlimited" }>;
}

export interface FeaturesDiff {
  added: string[];
  removed: string[];
}

export interface PricingComparison {
  changes: PricingChangeType[];
  absoluteDelta: number | null;
  percentageDelta: number | null;
  /** Why a delta wasn't computed, when applicable — never silently null with no explanation. */
  deltaSkippedReason: "ZERO_BASE" | "MISSING_PRICE" | "CURRENCY_MISMATCH" | null;
  limitsDiff: LimitsDiff;
  includedFeaturesDiff: FeaturesDiff;
}

function diffLimits(before: PlanLimit[], after: PlanLimit[]): LimitsDiff {
  const beforeByUnit = new Map(before.map((l) => [l.unit, l.quantity]));
  const afterByUnit = new Map(after.map((l) => [l.unit, l.quantity]));
  const added: string[] = [];
  const removed: string[] = [];
  const changed: LimitsDiff["changed"] = [];

  for (const [unit, quantity] of afterByUnit) {
    if (!beforeByUnit.has(unit)) added.push(unit);
    else if (beforeByUnit.get(unit) !== quantity) {
      changed.push({ unit, before: beforeByUnit.get(unit) as number | "unlimited", after: quantity });
    }
  }
  for (const unit of beforeByUnit.keys()) {
    if (!afterByUnit.has(unit)) removed.push(unit);
  }
  return { added: added.sort(), removed: removed.sort(), changed: changed.sort((a, b) => a.unit.localeCompare(b.unit)) };
}

function diffFeatureLists(before: string[], after: string[]): FeaturesDiff {
  const norm = (s: string) => s.trim().toLowerCase();
  const beforeSet = new Set(before.map(norm));
  const afterSet = new Set(after.map(norm));
  return {
    added: [...afterSet].filter((f) => !beforeSet.has(f)).sort(),
    removed: [...beforeSet].filter((f) => !afterSet.has(f)).sort(),
  };
}

export function comparePricing(previous: PricingObservation, current: PricingObservation): PricingComparison {
  const changes: PricingChangeType[] = [];

  if (previous.isCustomPricing !== current.isCustomPricing) changes.push("CUSTOM_PRICING_STATE_CHANGED");
  if (previous.billingPeriod !== current.billingPeriod) changes.push("BILLING_INTERVAL_CHANGED");
  if (previous.currency !== current.currency) changes.push("CURRENCY_CHANGED");
  if (previous.unit !== current.unit) changes.push("UNIT_CHANGED");

  let absoluteDelta: number | null = null;
  let percentageDelta: number | null = null;
  let deltaSkippedReason: PricingComparison["deltaSkippedReason"] = null;

  if (previous.price === null || current.price === null) {
    deltaSkippedReason = "MISSING_PRICE";
  } else if (previous.currency !== current.currency) {
    deltaSkippedReason = "CURRENCY_MISMATCH"; // never silently compare across currencies
  } else {
    absoluteDelta = current.price - previous.price;
    if (previous.price === 0) {
      deltaSkippedReason = "ZERO_BASE"; // percentage change from zero is undefined, not "infinite" or 0
    } else {
      percentageDelta = (absoluteDelta / previous.price) * 100;
    }
    if (absoluteDelta > 0) changes.push("PRICE_INCREASE");
    if (absoluteDelta < 0) changes.push("PRICE_DECREASE");
  }

  const limitsDiff = diffLimits(previous.limits ?? [], current.limits ?? []);
  if (limitsDiff.added.length + limitsDiff.removed.length + limitsDiff.changed.length > 0) {
    changes.push("LIMIT_CHANGED");
  }
  const includedFeaturesDiff = diffFeatureLists(previous.includedFeatures ?? [], current.includedFeatures ?? []);
  if (includedFeaturesDiff.added.length + includedFeaturesDiff.removed.length > 0) {
    changes.push("INCLUDED_FEATURES_CHANGED");
  }

  if (changes.length === 0) changes.push("NO_CHANGE");

  return { changes, absoluteDelta, percentageDelta, deltaSkippedReason, limitsDiff, includedFeaturesDiff };
}
