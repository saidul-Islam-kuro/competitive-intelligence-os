/**
 * TEST-ONLY. Never imported by production code (nothing outside
 * `*.test.ts` files references this). A deliberately narrow in-memory
 * simulation of exactly the Prisma calls persistPricing.ts and
 * persistFeatures.ts make — NOT a general Prisma reimplementation, and
 * not a substitute for real integration tests against an actual
 * database (tests/*.test.ts still carry those, unverified in this
 * sandbox per VERIFY.md).
 *
 * What this DOES validate for real: the upsert/idempotency logic, the
 * plan-disappearance and feature-lifecycle-reconsideration wiring, and
 * the shape of data written — i.e., the actual business logic in those
 * two service files, exercised end to end without needing a live
 * database. What it does NOT validate: real Postgres constraint
 * enforcement, real transaction atomicity, or Prisma's exact runtime
 * behavior for edge cases this fake doesn't implement.
 */
import { randomUUID } from "node:crypto";

interface PricingPlanRow {
  id: string;
  productId: string;
  name: string;
  normalizedName: string;
  active: boolean;
  firstSeenAt: Date;
  lastSeenAt: Date;
}

interface PricingPointRow {
  id: string;
  productId: string;
  pricingPlanId: string;
  price: number | null;
  currency: string | null;
  billingPeriod: string | null;
  unit: string | null;
  isCustomPricing: boolean;
  limits: unknown;
  features: unknown;
  observationKey: string;
  sourceId: string | null;
  snapshotId: string | null;
  evidenceText: string | null;
  extractionMethod: string | null;
  capturedAt: Date;
}

interface FeatureRow {
  id: string;
  canonicalName: string;
  aliases: string[];
}

interface FeatureObservationRow {
  id: string;
  featureId: string;
  productId: string;
  status: "ACTIVE" | "REMOVED" | "UNCERTAIN";
  confidence: number | null;
  firstSeenAt: Date;
  lastSeenAt: Date;
  sourceId: string | null;
  snapshotId: string | null;
  evidenceText: string | null;
}

interface ReviewRow {
  id: string;
  reviewSourceId: string;
  productId: string;
  externalId: string | null;
  author: string | null;
  rating: number | null;
  title: string | null;
  body: string;
  sourceUrl: string | null;
  publishedAt: Date | null;
  sentimentScore: number | null;
  sentimentLabel: string | null;
  sentimentConfidence: number | null;
  fingerprint: string | null;
}

interface ReviewTopicRow {
  id: string;
  key: string;
  label: string;
}

interface ReviewTopicObservationRow {
  id: string;
  reviewId: string;
  reviewTopicId: string;
  sentiment: number | null;
  frequency: number;
  matchedTerms: string[];
}

export function createFakePrismaTx() {
  const reviews: ReviewRow[] = [];
  const reviewTopics: ReviewTopicRow[] = [];
  const reviewTopicObservations: ReviewTopicObservationRow[] = [];
  const pricingPlans: PricingPlanRow[] = [];
  const pricingPoints: PricingPointRow[] = [];
  const features: FeatureRow[] = [];
  const featureObservations: FeatureObservationRow[] = [];

  return {
    // --- test introspection (not part of Prisma's real API) ---
    _tables: { pricingPlans, pricingPoints, features, featureObservations, reviews, reviewTopics, reviewTopicObservations },

    pricingPlan: {
      async upsert({
        where,
        create,
        update,
      }: {
        where: { productId_normalizedName: { productId: string; normalizedName: string } };
        create: Omit<PricingPlanRow, "id" | "firstSeenAt" | "lastSeenAt"> & { firstSeenAt?: Date; lastSeenAt?: Date };
        update: Partial<PricingPlanRow>;
      }): Promise<PricingPlanRow> {
        const { productId, normalizedName } = where.productId_normalizedName;
        const existing = pricingPlans.find((p) => p.productId === productId && p.normalizedName === normalizedName);
        if (existing) {
          Object.assign(existing, update);
          return existing;
        }
        const row: PricingPlanRow = {
          id: randomUUID(),
          firstSeenAt: new Date(),
          lastSeenAt: new Date(),
          ...create,
        };
        pricingPlans.push(row);
        return row;
      },
      async findMany({
        where,
        select,
      }: {
        where: { productId: string; active: boolean };
        select: { pricingPoints: { where: { sourceId: string } } };
      }): Promise<Array<{ normalizedName: string; pricingPoints: Array<{ id: string }> }>> {
        // Mirrors the ONE real call shape persistPricing.ts makes: the
        // nested pricingPoints selection carries its own sourceId filter,
        // which is what scopes plan-disappearance detection to "plans
        // this same source has evidenced before" — read it out here
        // rather than hardcoding, so a test that gets this filter wrong
        // in production code would actually fail against this fake too.
        const scopedSourceId = select.pricingPoints.where.sourceId;
        return pricingPlans
          .filter((p) => p.productId === where.productId && p.active === where.active)
          .map((p) => ({
            normalizedName: p.normalizedName,
            pricingPoints: pricingPoints
              .filter((pt) => pt.pricingPlanId === p.id && pt.sourceId === scopedSourceId)
              .slice(0, 1)
              .map((pt) => ({ id: pt.id })),
          }));
      },
      async updateMany({
        where,
        data,
      }: {
        where: { productId: string; normalizedName: { in: string[] } };
        data: Partial<PricingPlanRow>;
      }): Promise<{ count: number }> {
        let count = 0;
        for (const plan of pricingPlans) {
          if (plan.productId === where.productId && where.normalizedName.in.includes(plan.normalizedName)) {
            Object.assign(plan, data);
            count++;
          }
        }
        return { count };
      },
    },

    pricingPoint: {
      async upsert({
        where,
        create,
        update,
      }: {
        where: {
          pricingPlanId_snapshotId_observationKey: {
            pricingPlanId: string;
            snapshotId: string | null;
            observationKey: string;
          };
        };
        create: Omit<PricingPointRow, "id" | "capturedAt">;
        update: Partial<PricingPointRow>;
      }): Promise<PricingPointRow> {
        const key = where.pricingPlanId_snapshotId_observationKey;
        const existing = pricingPoints.find(
          (p) => p.pricingPlanId === key.pricingPlanId && p.snapshotId === key.snapshotId && p.observationKey === key.observationKey,
        );
        if (existing) {
          Object.assign(existing, update);
          return existing;
        }
        const row: PricingPointRow = { id: randomUUID(), capturedAt: new Date(), ...create };
        pricingPoints.push(row);
        return row;
      },
    },

    feature: {
      async findUnique({ where }: { where: { canonicalName: string } }): Promise<FeatureRow | null> {
        return features.find((f) => f.canonicalName === where.canonicalName) ?? null;
      },
      async create({ data }: { data: { canonicalName: string; aliases: string[] } }): Promise<FeatureRow> {
        const row: FeatureRow = { id: randomUUID(), ...data };
        features.push(row);
        return row;
      },
      async update({
        where,
        data,
      }: {
        where: { id: string };
        data: { aliases: { push: string } };
      }): Promise<FeatureRow> {
        const row = features.find((f) => f.id === where.id);
        if (!row) throw new Error("fakePrismaTx: feature not found");
        if (!row.aliases.includes(data.aliases.push)) row.aliases.push(data.aliases.push);
        return row;
      },
    },

    review: {
      async findFirst({
        where,
      }: {
        where: { reviewSourceId: string; externalId?: string; sourceUrl?: string; fingerprint?: string };
      }): Promise<ReviewRow | null> {
        return (
          reviews.find(
            (r) =>
              r.reviewSourceId === where.reviewSourceId &&
              (where.externalId === undefined || r.externalId === where.externalId) &&
              (where.sourceUrl === undefined || r.sourceUrl === where.sourceUrl) &&
              (where.fingerprint === undefined || r.fingerprint === where.fingerprint),
          ) ?? null
        );
      },
      async create({ data }: { data: Omit<ReviewRow, "id"> }): Promise<ReviewRow> {
        // Mirror the real DB's unique constraints so a logic bug that
        // skipped the app-level dedup check would FAIL here instead of
        // silently passing: (reviewSourceId, externalId) and
        // (reviewSourceId, fingerprint), both only when non-null.
        if (data.externalId !== null && reviews.some((r) => r.reviewSourceId === data.reviewSourceId && r.externalId === data.externalId)) {
          throw new Error("fakePrismaTx: unique constraint violated on (reviewSourceId, externalId)");
        }
        if (data.fingerprint !== null && reviews.some((r) => r.reviewSourceId === data.reviewSourceId && r.fingerprint === data.fingerprint)) {
          throw new Error("fakePrismaTx: unique constraint violated on (reviewSourceId, fingerprint)");
        }
        const row: ReviewRow = { id: randomUUID(), ...data };
        reviews.push(row);
        return row;
      },
    },

    reviewTopic: {
      async upsert({
        where,
        create,
      }: {
        where: { key: string };
        create: { key: string; label: string };
        update: Record<string, never>;
      }): Promise<ReviewTopicRow> {
        const existing = reviewTopics.find((t) => t.key === where.key);
        if (existing) return existing;
        const row: ReviewTopicRow = { id: randomUUID(), ...create };
        reviewTopics.push(row);
        return row;
      },
    },

    reviewTopicObservation: {
      async upsert({
        where,
        create,
        update,
      }: {
        where: { reviewId_reviewTopicId: { reviewId: string; reviewTopicId: string } };
        create: Omit<ReviewTopicObservationRow, "id">;
        update: Partial<ReviewTopicObservationRow>;
      }): Promise<ReviewTopicObservationRow> {
        const { reviewId, reviewTopicId } = where.reviewId_reviewTopicId;
        const existing = reviewTopicObservations.find((o) => o.reviewId === reviewId && o.reviewTopicId === reviewTopicId);
        if (existing) {
          Object.assign(existing, update);
          return existing;
        }
        const row: ReviewTopicObservationRow = { id: randomUUID(), ...create };
        reviewTopicObservations.push(row);
        return row;
      },
    },

    featureObservation: {
      async findUnique({
        where,
      }: {
        where: { featureId_productId: { featureId: string; productId: string } };
      }): Promise<FeatureObservationRow | null> {
        const { featureId, productId } = where.featureId_productId;
        return featureObservations.find((o) => o.featureId === featureId && o.productId === productId) ?? null;
      },
      async upsert({
        where,
        create,
        update,
      }: {
        where: { featureId_productId: { featureId: string; productId: string } };
        create: Omit<FeatureObservationRow, "id" | "firstSeenAt" | "lastSeenAt">;
        update: Partial<FeatureObservationRow>;
      }): Promise<FeatureObservationRow> {
        const { featureId, productId } = where.featureId_productId;
        const existing = featureObservations.find((o) => o.featureId === featureId && o.productId === productId);
        if (existing) {
          Object.assign(existing, update);
          return existing;
        }
        const row: FeatureObservationRow = { id: randomUUID(), firstSeenAt: new Date(), lastSeenAt: new Date(), ...create };
        featureObservations.push(row);
        return row;
      },
      async findMany({
        where,
      }: {
        where: { productId: string; sourceId: string; status: { in: string[] } };
        include?: unknown;
      }): Promise<Array<FeatureObservationRow & { feature: FeatureRow }>> {
        return featureObservations
          .filter(
            (o) =>
              o.productId === where.productId &&
              o.sourceId === where.sourceId &&
              where.status.in.includes(o.status),
          )
          .map((o) => ({ ...o, feature: features.find((f) => f.id === o.featureId) as FeatureRow }));
      },
      async update({ where, data }: { where: { id: string }; data: Partial<FeatureObservationRow> }): Promise<FeatureObservationRow> {
        const row = featureObservations.find((o) => o.id === where.id);
        if (!row) throw new Error("fakePrismaTx: featureObservation not found");
        Object.assign(row, data);
        return row;
      },
    },
  };
}

export type FakePrismaTx = ReturnType<typeof createFakePrismaTx>;
