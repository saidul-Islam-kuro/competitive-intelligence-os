/**
 * Persists a batch of RawReview records idempotently within an existing
 * transaction: normalize -> dedupe -> sentiment -> topics -> persist.
 * Uses only `import type` from @prisma/client, so (like persistPricing /
 * persistFeatures) it has no runtime Prisma dependency and is tested for
 * real against the in-memory fake tx.
 *
 * Dedup (Phase 6.3) — priority: externalId, then per-review permalink,
 * then content fingerprint — with two safeguards on the permalink step,
 * because a "sourceUrl" is only a valid identity when it is genuinely
 * per-review:
 *   1. a URL appearing on more than one review in the same batch is a
 *      listing/landing page, not a permalink — ignored for dedup;
 *   2. a URL equal to the ReviewSource's own listing URL is likewise
 *      ignored.
 * Both fall through to the fingerprint instead of wrongly collapsing many
 * distinct reviews into one. The URL is still STORED either way.
 *
 * Known limitation: lookups are check-then-insert inside one transaction
 * (not serializable). Two truly concurrent ingests of the same
 * permalink-only reviews could both insert — externalId and fingerprint
 * duplicates are caught by DB unique constraints, permalink-only ones are
 * not (no unique index on sourceUrl, deliberately: see safeguard above).
 */
import type { Prisma } from "@prisma/client";
import type { RawReview } from "../lib/reviews/adapters";
import { normalizeReviewText } from "../lib/reviews/normalizeReview";
import { computeDedupKey, type DedupKey } from "../lib/reviews/dedupe";
import { analyzeSentiment } from "../lib/reviews/sentiment";
import { extractReviewTopics } from "../lib/reviews/topics";

export interface IngestContext {
  reviewSourceId: string;
  productId: string;
  /** The ReviewSource's own listing URL, to avoid mistaking it for a per-review permalink. */
  reviewSourceUrl: string | null;
}

export interface IngestResult {
  created: number;
  duplicates: number;
  skipped: number;
  reviewIds: string[];
}

function cleanShort(value: string | null, max: number): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

function sanitizeRating(rating: number | null): number | null {
  return rating !== null && Number.isFinite(rating) && rating >= 0 && rating <= 5 ? rating : null;
}

async function findExisting(tx: Prisma.TransactionClient, reviewSourceId: string, key: DedupKey) {
  switch (key.method) {
    case "externalId":
      return tx.review.findFirst({ where: { reviewSourceId, externalId: key.value } });
    case "canonicalUrl":
      return tx.review.findFirst({ where: { reviewSourceId, sourceUrl: key.value } });
    case "fingerprint":
      return tx.review.findFirst({ where: { reviewSourceId, fingerprint: key.value } });
  }
}

export async function ingestReviewBatch(
  tx: Prisma.TransactionClient,
  rawReviews: RawReview[],
  context: IngestContext,
): Promise<IngestResult> {
  const urlCounts = new Map<string, number>();
  for (const raw of rawReviews) {
    const url = raw.sourceUrl?.trim();
    if (url) urlCounts.set(url, (urlCounts.get(url) ?? 0) + 1);
  }
  const listingUrl = context.reviewSourceUrl?.trim() ?? null;

  const result: IngestResult = { created: 0, duplicates: 0, skipped: 0, reviewIds: [] };

  for (const raw of rawReviews) {
    const normalized = normalizeReviewText(raw.body ?? "");
    if (normalized.isEmpty) {
      result.skipped++;
      continue;
    }

    const rawUrl = raw.sourceUrl?.trim() || null;
    const permalink = rawUrl && urlCounts.get(rawUrl) === 1 && rawUrl !== listingUrl ? rawUrl : null;
    const externalId = cleanShort(raw.externalId, 200);
    const author = cleanShort(raw.author, 200);
    const title = cleanShort(raw.title, 300);
    const rating = sanitizeRating(raw.rating);

    const key = computeDedupKey({
      author,
      body: normalized.body,
      publishedAt: raw.publishedAt,
      externalId,
      sourceUrl: permalink,
    });

    if (await findExisting(tx, context.reviewSourceId, key)) {
      result.duplicates++;
      continue;
    }

    const analysisText = title ? `${title}. ${normalized.body}` : normalized.body;
    const sentiment = analyzeSentiment(analysisText, rating);
    const topics = extractReviewTopics(analysisText);

    const review = await tx.review.create({
      data: {
        reviewSourceId: context.reviewSourceId,
        productId: context.productId,
        externalId,
        author,
        rating,
        title,
        body: normalized.body,
        sourceUrl: rawUrl,
        publishedAt: raw.publishedAt,
        sentimentScore: sentiment.score,
        sentimentLabel: sentiment.label,
        sentimentConfidence: sentiment.confidence,
        fingerprint: key.method === "fingerprint" ? key.value : null,
      },
    });
    result.created++;
    result.reviewIds.push(review.id);

    for (const topic of topics) {
      const reviewTopic = await tx.reviewTopic.upsert({
        where: { key: topic.key },
        create: { key: topic.key, label: topic.label },
        update: {},
      });
      await tx.reviewTopicObservation.upsert({
        where: { reviewId_reviewTopicId: { reviewId: review.id, reviewTopicId: reviewTopic.id } },
        create: {
          reviewId: review.id,
          reviewTopicId: reviewTopic.id,
          sentiment: sentiment.score,
          frequency: topic.frequency,
          matchedTerms: topic.matchedTerms,
        },
        update: { sentiment: sentiment.score, frequency: topic.frequency, matchedTerms: topic.matchedTerms },
      });
    }
  }

  return result;
}
