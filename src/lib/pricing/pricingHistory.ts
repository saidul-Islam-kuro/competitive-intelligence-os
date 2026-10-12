/**
 * Reconstructs price history from stored PricingPoint-shaped rows
 * (Phase 4.3): first observed, previous, current, and a per-step
 * comparison — without ever overwriting or mutating stored observations.
 *
 * Points are grouped by observationKey (billing period | unit | kind)
 * BEFORE comparing consecutive entries: a plan's monthly price and yearly
 * price are separate series. Comparing a monthly point against a yearly
 * point would just manufacture a meaningless "billing interval changed"
 * and price delta. Each series is ordered by capturedAt (ties broken by
 * id so output is deterministic).
 */
import { comparePricing, type PricingComparison, type PricingObservation } from "./comparePricing";

export interface HistoryPoint {
  id: string;
  capturedAt: Date;
  observationKey: string;
  observation: PricingObservation;
}

export interface HistoryEntry {
  point: HistoryPoint;
  /** Comparison against the immediately preceding point in the same series; null for the first point. */
  comparisonToPrevious: PricingComparison | null;
}

export interface PricingSeries {
  observationKey: string;
  first: HistoryPoint;
  previous: HistoryPoint | null;
  current: HistoryPoint;
  entries: HistoryEntry[];
}

export function buildPricingHistory(points: HistoryPoint[]): PricingSeries[] {
  const byKey = new Map<string, HistoryPoint[]>();
  for (const point of points) {
    const list = byKey.get(point.observationKey) ?? [];
    list.push(point);
    byKey.set(point.observationKey, list);
  }

  const series: PricingSeries[] = [];
  for (const [observationKey, list] of byKey) {
    const ordered = [...list].sort(
      (a, b) => a.capturedAt.getTime() - b.capturedAt.getTime() || a.id.localeCompare(b.id),
    );
    const entries: HistoryEntry[] = ordered.map((point, index) => ({
      point,
      comparisonToPrevious: index === 0 ? null : comparePricing(ordered[index - 1].observation, point.observation),
    }));
    series.push({
      observationKey,
      first: ordered[0],
      previous: ordered.length > 1 ? ordered[ordered.length - 2] : null,
      current: ordered[ordered.length - 1],
      entries,
    });
  }
  return series.sort((a, b) => a.observationKey.localeCompare(b.observationKey));
}
