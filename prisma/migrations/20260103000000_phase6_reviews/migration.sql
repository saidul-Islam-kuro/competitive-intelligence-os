-- HAND-AUTHORED, NOT MACHINE-VALIDATED — same caveat as the two earlier
-- migrations (no network/Prisma CLI/database available to generate or
-- verify it). See 20260101000000_init/migration.sql's header for the full
-- explanation and the recommended safer alternative (regenerate via
-- `prisma migrate dev` against a real database).
--
-- Separate migration rather than an edit to an earlier one (never edit a
-- migration that may already have been applied). All changes are
-- additive; the two unique indexes are safe on a database with no
-- review data.

-- Review.fingerprint: dedup key of last resort (see
-- src/lib/reviews/dedupe.ts). NULL for reviews deduped by externalId or
-- permalink; the unique index therefore only constrains non-null values.
ALTER TABLE "Review" ADD COLUMN "fingerprint" TEXT;
CREATE UNIQUE INDEX "Review_reviewSourceId_fingerprint_key" ON "Review"("reviewSourceId", "fingerprint");
CREATE INDEX "Review_productId_sentimentLabel_idx" ON "Review"("productId", "sentimentLabel");

-- ReviewTopicObservation: matched dictionary terms as evidence, and one
-- observation per (review, topic).
ALTER TABLE "ReviewTopicObservation" ADD COLUMN "matchedTerms" TEXT[];
CREATE UNIQUE INDEX "ReviewTopicObservation_reviewId_reviewTopicId_key" ON "ReviewTopicObservation"("reviewId", "reviewTopicId");
