/**
 * NOT RUNNABLE IN THE SANDBOX THIS WAS WRITTEN IN — needs a generated
 * @prisma/client. Written carefully against prisma/schema.prisma and
 * reviewed by hand. See VERIFY.md.
 *
 * Persists extractPricingCandidates() output idempotently within an
 * existing transaction (passed in by scrapeSource.ts — this function does
 * not open its own transaction, so pricing and the snapshot/change
 * records it's derived from commit or roll back together).
 *
 * Plan-disappearance scoping: a product can have more than one pricing
 * source (e.g. regional pages). A plan is only eligible to be marked
 * "disappeared" by THIS scan if its most recent PricingPoint evidence
 * came from THIS SAME source — a plan that lives on a different page
 * isn't judged by this page's scan at all. See planLifecycle.ts for the
 * conservative rule on top of that scoping.
 */
import type { Prisma, PricingPlan } from "@prisma/client";
import { extractPricingCandidates, type PricingCandidate } from "../lib/pricing/extractPricing";
import { normalizePlanName } from "../lib/pricing/planIdentity";
import { findDisappearedPlans } from "../lib/pricing/planLifecycle";

export interface PersistPricingContext {
  productId: string;
  sourceId: string;
  sourceType: string;
  snapshotId: string;
  renderRequired: boolean;
}

export interface PersistPricingResult {
  pricingPointIds: string[];
  plansDeactivated: string[];
}

export async function persistPricingExtraction(
  tx: Prisma.TransactionClient,
  candidates: PricingCandidate[],
  context: PersistPricingContext,
): Promise<PersistPricingResult> {
  const pricingPointIds: string[] = [];
  const observedPlanKeys: string[] = [];

  for (const candidate of candidates) {
    const normalizedName = normalizePlanName(candidate.planName);
    if (!normalizedName) continue; // defensive — extractPricingCandidates shouldn't produce an empty name, but never persist one
    observedPlanKeys.push(normalizedName);

    const plan: PricingPlan = await tx.pricingPlan.upsert({
      where: { productId_normalizedName: { productId: context.productId, normalizedName } },
      create: {
        productId: context.productId,
        name: candidate.planName,
        normalizedName,
        active: true,
      },
      update: { lastSeenAt: new Date(), active: true },
    });

    const point = await tx.pricingPoint.upsert({
      where: {
        pricingPlanId_snapshotId_observationKey: {
          pricingPlanId: plan.id,
          snapshotId: context.snapshotId,
          observationKey: candidate.observationKey,
        },
      },
      create: {
        productId: context.productId,
        pricingPlanId: plan.id,
        price: candidate.price,
        currency: candidate.currency,
        billingPeriod: candidate.billingPeriod,
        unit: candidate.unit,
        isCustomPricing: candidate.isCustomPricing,
        limits: candidate.limits as unknown as Prisma.InputJsonValue,
        features: candidate.includedFeatures as unknown as Prisma.InputJsonValue,
        observationKey: candidate.observationKey,
        sourceId: context.sourceId,
        snapshotId: context.snapshotId,
        evidenceText: candidate.evidenceText,
        extractionMethod: candidate.extractionMethod,
      },
      update: {}, // idempotent — already recorded for this exact snapshot+observation
    });
    pricingPointIds.push(point.id);
  }

  // Plan-disappearance check, scoped to plans this SAME source has
  // evidenced before (see doc comment above).
  const candidatePlans = await tx.pricingPlan.findMany({
    where: { productId: context.productId, active: true },
    select: {
      normalizedName: true,
      pricingPoints: { where: { sourceId: context.sourceId }, select: { id: true }, take: 1 },
    },
  });
  const knownActivePlanKeys = candidatePlans.filter((p) => p.pricingPoints.length > 0).map((p) => p.normalizedName);

  const disappeared = findDisappearedPlans({
    knownActivePlanKeys,
    observedPlanKeys,
    sourceIsPricingAuthoritative: context.sourceType === "PRICING",
    renderRequired: context.renderRequired,
  });

  if (disappeared.length > 0) {
    await tx.pricingPlan.updateMany({
      where: { productId: context.productId, normalizedName: { in: disappeared } },
      data: { active: false },
    });
  }

  return { pricingPointIds, plansDeactivated: disappeared };
}

/** Convenience: extraction + persistence in one call, for scrapeSource.ts. */
export async function extractAndPersistPricing(
  tx: Prisma.TransactionClient,
  input: { headings: Array<{ level: number; text: string }>; normalizedText: string; listItems: string[] },
  context: PersistPricingContext,
): Promise<PersistPricingResult> {
  const candidates = extractPricingCandidates(input);
  return persistPricingExtraction(tx, candidates, context);
}
