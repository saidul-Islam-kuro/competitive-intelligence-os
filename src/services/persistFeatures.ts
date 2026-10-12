/**
 * NOT RUNNABLE IN THE SANDBOX THIS WAS WRITTEN IN — needs a generated
 * @prisma/client. Written carefully against prisma/schema.prisma and
 * reviewed by hand. See VERIFY.md.
 *
 * Persists extractFeatureCandidates() output idempotently within an
 * existing transaction (passed in by scrapeSource.ts).
 *
 * Lifecycle reconsideration scoping (mirrors persistPricing.ts's plan-
 * disappearance scoping, same reasoning): a feature's status is only
 * reconsidered on a scan of the SAME source that most recently evidenced
 * it. Scanning an unrelated page that never mentioned a feature says
 * nothing about that feature — see featureLifecycle.ts for why this
 * matters (04_DEVELOPMENT_RULES: "never infer removal solely from
 * absence on a single ordinary marketing page").
 *
 * `sourceIsAuthoritative`: FEATURE and CHANGELOG source types are treated
 * as authoritative for feature presence/absence — documented here because
 * it's the one place that classification is made, not buried inside the
 * lifecycle module (which stays a pure, source-type-agnostic function).
 */
import type { Prisma, Feature } from "@prisma/client";
import { extractFeatureCandidates, type FeatureCandidate } from "../lib/features/extractFeatures";
import { decideFeatureLifecycle, type FeatureLifecycleStatus } from "../lib/features/featureLifecycle";

const AUTHORITATIVE_SOURCE_TYPES = new Set(["FEATURE", "CHANGELOG"]);

export interface PersistFeaturesContext {
  productId: string;
  sourceId: string;
  sourceType: string;
  snapshotId: string;
}

export interface PersistFeaturesResult {
  featureObservationIds: string[];
  statusChanges: Array<{ canonicalName: string; from: FeatureLifecycleStatus; to: FeatureLifecycleStatus }>;
}

async function upsertFeature(tx: Prisma.TransactionClient, candidate: FeatureCandidate): Promise<Feature> {
  const existing = await tx.feature.findUnique({ where: { canonicalName: candidate.canonicalName } });
  if (!existing) {
    return tx.feature.create({ data: { canonicalName: candidate.canonicalName, aliases: [candidate.name] } });
  }
  if (!existing.aliases.includes(candidate.name)) {
    return tx.feature.update({ where: { id: existing.id }, data: { aliases: { push: candidate.name } } });
  }
  return existing;
}

export async function persistFeatureExtraction(
  tx: Prisma.TransactionClient,
  candidates: FeatureCandidate[],
  context: PersistFeaturesContext,
): Promise<PersistFeaturesResult> {
  const sourceIsAuthoritative = AUTHORITATIVE_SOURCE_TYPES.has(context.sourceType);
  const observedCanonicalNames = new Set(candidates.map((c) => c.canonicalName));
  const featureObservationIds: string[] = [];
  const statusChanges: PersistFeaturesResult["statusChanges"] = [];

  for (const candidate of candidates) {
    const feature = await upsertFeature(tx, candidate);

    const existingObservation = await tx.featureObservation.findUnique({
      where: { featureId_productId: { featureId: feature.id, productId: context.productId } },
    });

    const decision = decideFeatureLifecycle({
      currentStatus: existingObservation?.status ?? "ACTIVE",
      observedThisScan: true,
      sourceIsAuthoritative,
      explicitRemovalEvidence: false,
    });

    const observation = await tx.featureObservation.upsert({
      where: { featureId_productId: { featureId: feature.id, productId: context.productId } },
      create: {
        featureId: feature.id,
        productId: context.productId,
        status: decision.status,
        confidence: candidate.confidence,
        sourceId: context.sourceId,
        snapshotId: context.snapshotId,
        evidenceText: candidate.evidenceText,
      },
      update: {
        status: decision.status,
        confidence: candidate.confidence,
        lastSeenAt: new Date(),
        sourceId: context.sourceId,
        snapshotId: context.snapshotId,
        evidenceText: candidate.evidenceText,
      },
    });
    featureObservationIds.push(observation.id);

    if (existingObservation && existingObservation.status !== decision.status) {
      statusChanges.push({ canonicalName: candidate.canonicalName, from: existingObservation.status, to: decision.status });
    }
  }

  // Features previously evidenced by THIS SAME SOURCE that were NOT
  // observed this scan — reconsider their lifecycle (conservatively; see
  // featureLifecycle.ts). A feature last evidenced by a DIFFERENT source
  // is left alone entirely: this scan says nothing about it.
  const candidatesForReconsideration = await tx.featureObservation.findMany({
    where: {
      productId: context.productId,
      sourceId: context.sourceId,
      status: { in: ["ACTIVE", "UNCERTAIN"] },
    },
    include: { feature: true },
  });

  for (const observation of candidatesForReconsideration) {
    if (observedCanonicalNames.has(observation.feature.canonicalName)) continue; // already handled above

    const decision = decideFeatureLifecycle({
      currentStatus: observation.status,
      observedThisScan: false,
      sourceIsAuthoritative,
      explicitRemovalEvidence: false,
    });

    if (decision.status !== observation.status) {
      await tx.featureObservation.update({ where: { id: observation.id }, data: { status: decision.status } });
      statusChanges.push({ canonicalName: observation.feature.canonicalName, from: observation.status, to: decision.status });
    }
  }

  return { featureObservationIds, statusChanges };
}

/** Convenience: extraction + persistence in one call, for scrapeSource.ts. */
export async function extractAndPersistFeatures(
  tx: Prisma.TransactionClient,
  input: { headings: Array<{ level: number; text: string }>; listItems: string[] },
  context: PersistFeaturesContext,
): Promise<PersistFeaturesResult> {
  const candidates = extractFeatureCandidates(input);
  return persistFeatureExtraction(tx, candidates, context);
}
