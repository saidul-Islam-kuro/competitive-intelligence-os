-- HAND-AUTHORED, NOT MACHINE-VALIDATED — same caveat as
-- 20260101000000_init/migration.sql (no network/Prisma CLI/database
-- available to generate or verify this the normal way). Read that
-- migration's header for the full explanation and the recommended safer
-- alternative (regenerate via `prisma migrate dev` against a real
-- database instead of trusting this by hand).
--
-- This is a SEPARATE migration from 20260101000000_init rather than an
-- edit to it, on the general principle of never editing a migration that
-- may already have been applied somewhere — even though, as far as this
-- project's own history goes, nothing has actually been deployed yet.
--
-- All changes are additive (new nullable/defaulted columns, new indexes)
-- except the two new UNIQUE indexes, which are safe because this project
-- has no real data (confirmed repeatedly throughout this whole project).
-- If you have real PricingPlan/PricingPoint/FeatureObservation rows
-- already, verify they satisfy these uniqueness constraints before
-- applying this — see this migration's purpose below.

-- Snapshot: raw <li> text (Phase 5), feeding feature extraction. Also
-- folded into contentHash (application-level change, no schema impact)
-- so a feature-list-only change isn't invisible to the contentChanged
-- gate that pricing/feature extraction run on.
ALTER TABLE "Snapshot" ADD COLUMN "listItems" JSONB;

-- PricingPlan: a stable, deterministic plan-identity key (Phase 4.2) so
-- "Pro" / "PRO" / "Pro Plan" resolve to one plan instead of three.
ALTER TABLE "PricingPlan" ADD COLUMN "normalizedName" TEXT NOT NULL DEFAULT '';
CREATE UNIQUE INDEX "PricingPlan_productId_normalizedName_key" ON "PricingPlan"("productId", "normalizedName");

-- PricingPoint: observationKey distinguishes a plan's monthly price from
-- its yearly price (both can legitimately exist at once) and is the
-- idempotency key together with (pricingPlanId, snapshotId) — reprocessing
-- the same snapshot must not create a duplicate pricing observation
-- (Phase 4.7). extractionMethod records how a price was found (evidence).
ALTER TABLE "PricingPoint" ADD COLUMN "observationKey" TEXT NOT NULL DEFAULT '';
ALTER TABLE "PricingPoint" ADD COLUMN "extractionMethod" TEXT;
CREATE UNIQUE INDEX "PricingPoint_pricingPlanId_snapshotId_observationKey_key" ON "PricingPoint"("pricingPlanId", "snapshotId", "observationKey");

-- FeatureObservation: one evolving current-state row per (feature,
-- product) — Phase 5.4/5.5 require repeated observations to update
-- lastSeenAt in place rather than accumulate duplicate rows.
CREATE UNIQUE INDEX "FeatureObservation_featureId_productId_key" ON "FeatureObservation"("featureId", "productId");
