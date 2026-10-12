/**
 * NOT RUNNABLE IN THE SANDBOX THIS WAS WRITTEN IN — needs express +
 * @prisma/client. See VERIFY.md.
 *
 * GET /api/reviews       — filterable, cursor-paginated review list
 * GET /api/review-topics — per-topic aggregates (review count, total
 *                          mentions, average sentiment)
 * Both authenticated via apiKeyAuth; all query params validated; bounded
 * pagination (reviews max 50/page since each row carries a body of up to
 * 20k chars).
 *
 * Ordering: reviews are ordered by collectedAt (always non-null), NOT
 * publishedAt — publishedAt is nullable, and cursor pagination over a
 * nullable sort key is a correctness trap. `from`/`to` still filter on
 * publishedAt (reviews with no publishedAt simply don't match a date-range
 * filter). The internal dedup `fingerprint` is never returned.
 */
import { Router } from "express";
import { apiKeyAuth } from "../middleware/auth";
import { asyncHandler } from "../middleware/errorHandler";
import { prisma } from "../db/client";
import { ValidationError } from "../lib/errors";
import { REVIEW_TOPICS } from "../lib/reviews/topics";
import { parseLimit, parseDate, parseRating, parseOneOf, dateRange } from "../lib/http/queryParams";

export const reviewsRouter = Router();

const MAX_REVIEW_LIMIT = 50;
const MAX_TOPIC_LIMIT = 50;
const SENTIMENTS = ["POSITIVE", "NEUTRAL", "NEGATIVE", "MIXED"] as const;
const TOPIC_KEYS = REVIEW_TOPICS.map((t) => t.key);

reviewsRouter.get(
  "/reviews",
  apiKeyAuth,
  asyncHandler(async (req, res) => {
    const { product, source, cursor } = req.query;
    const limit = parseLimit(req.query.limit, MAX_REVIEW_LIMIT);
    const sentiment = parseOneOf(req.query.sentiment, SENTIMENTS, "sentiment");
    const topic = parseOneOf(req.query.topic, TOPIC_KEYS, "topic");
    const minRating = parseRating(req.query.minRating, "minRating");
    const maxRating = parseRating(req.query.maxRating, "maxRating");
    if (minRating !== undefined && maxRating !== undefined && minRating > maxRating) {
      throw new ValidationError("'minRating' must not exceed 'maxRating'.");
    }
    const published = dateRange(parseDate(req.query.from, "from"), parseDate(req.query.to, "to"));
    if (cursor !== undefined && typeof cursor !== "string") throw new ValidationError("'cursor' must be a string.");

    const where: Record<string, unknown> = {};
    if (typeof product === "string") where.productId = product;
    if (typeof source === "string") where.reviewSourceId = source;
    if (sentiment) where.sentimentLabel = sentiment;
    if (minRating !== undefined || maxRating !== undefined) {
      where.rating = { ...(minRating !== undefined ? { gte: minRating } : {}), ...(maxRating !== undefined ? { lte: maxRating } : {}) };
    }
    if (published) where.publishedAt = published;
    if (topic) where.topicObservations = { some: { reviewTopic: { key: topic } } };

    const rows = await prisma.review.findMany({
      where,
      orderBy: [{ collectedAt: "desc" }, { id: "desc" }],
      take: limit + 1,
      ...(typeof cursor === "string" ? { skip: 1, cursor: { id: cursor } } : {}),
      include: {
        topicObservations: {
          select: { frequency: true, matchedTerms: true, sentiment: true, reviewTopic: { select: { key: true, label: true } } },
        },
      },
    });

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;

    res.status(200).json({
      data: page.map((r) => ({
        id: r.id,
        productId: r.productId,
        reviewSourceId: r.reviewSourceId,
        externalId: r.externalId,
        author: r.author,
        rating: r.rating,
        title: r.title,
        body: r.body,
        sourceUrl: r.sourceUrl,
        publishedAt: r.publishedAt,
        collectedAt: r.collectedAt,
        sentiment: { label: r.sentimentLabel, score: r.sentimentScore, confidence: r.sentimentConfidence },
        topics: r.topicObservations.map((o) => ({
          key: o.reviewTopic.key,
          label: o.reviewTopic.label,
          frequency: o.frequency,
          matchedTerms: o.matchedTerms,
        })),
      })),
      pagination: { limit, nextCursor: hasMore ? page[page.length - 1]?.id ?? null : null },
    });
  }),
);

reviewsRouter.get(
  "/review-topics",
  apiKeyAuth,
  asyncHandler(async (req, res) => {
    const { product, source } = req.query;
    const limit = parseLimit(req.query.limit, MAX_TOPIC_LIMIT);
    const published = dateRange(parseDate(req.query.from, "from"), parseDate(req.query.to, "to"));

    const reviewFilter: Record<string, unknown> = {};
    if (typeof product === "string") reviewFilter.productId = product;
    if (typeof source === "string") reviewFilter.reviewSourceId = source;
    if (published) reviewFilter.publishedAt = published;

    const groups = await prisma.reviewTopicObservation.groupBy({
      by: ["reviewTopicId"],
      where: Object.keys(reviewFilter).length > 0 ? { review: reviewFilter } : {},
      _count: { _all: true },
      _sum: { frequency: true },
      _avg: { sentiment: true },
      orderBy: { _count: { reviewTopicId: "desc" } },
      take: limit,
    });

    const topics = await prisma.reviewTopic.findMany({
      where: { id: { in: groups.map((g) => g.reviewTopicId) } },
      select: { id: true, key: true, label: true },
    });
    const byId = new Map(topics.map((t) => [t.id, t]));

    res.status(200).json({
      data: groups.map((g) => ({
        topic: { key: byId.get(g.reviewTopicId)?.key ?? null, label: byId.get(g.reviewTopicId)?.label ?? null },
        reviewCount: g._count._all,
        totalMentions: g._sum.frequency ?? 0,
        averageSentiment: g._avg.sentiment,
      })),
      pagination: { limit, nextCursor: null },
    });
  }),
);
