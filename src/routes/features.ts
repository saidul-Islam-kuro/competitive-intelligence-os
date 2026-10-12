/**
 * NOT RUNNABLE IN THE SANDBOX THIS WAS WRITTEN IN — needs express and
 * @prisma/client. See VERIFY.md.
 *
 * Read-only, authenticated. Returns FeatureObservation rows (the
 * per-product current-state record — see schema.prisma's note on why
 * this is one evolving row, not a history log) with the canonical
 * Feature joined in. Filters: product, status (lifecycle), feature (a
 * Feature id), date range on lastSeenAt. Cursor-paginated.
 */
import { Router } from "express";
import { apiKeyAuth } from "../middleware/auth";
import { asyncHandler } from "../middleware/errorHandler";
import { prisma } from "../db/client";
import { ValidationError } from "../lib/errors";

export const featuresRouter = Router();

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;
const VALID_STATUSES = ["ACTIVE", "REMOVED", "UNCERTAIN"] as const;

function parseLimit(raw: unknown): number {
  if (raw === undefined) return DEFAULT_LIMIT;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) throw new ValidationError("'limit' must be a positive number.");
  return Math.min(Math.floor(value), MAX_LIMIT);
}

function parseDate(raw: unknown, paramName: string): Date | undefined {
  if (raw === undefined) return undefined;
  if (typeof raw !== "string") throw new ValidationError(`'${paramName}' must be a string date.`);
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) throw new ValidationError(`'${paramName}' is not a valid date.`);
  return date;
}

featuresRouter.get(
  "/",
  apiKeyAuth,
  asyncHandler(async (req, res) => {
    const { product, status, feature, from, to, cursor } = req.query;
    const limit = parseLimit(req.query.limit);

    if (status !== undefined && (typeof status !== "string" || !VALID_STATUSES.includes(status as (typeof VALID_STATUSES)[number]))) {
      throw new ValidationError(`'status' must be one of: ${VALID_STATUSES.join(", ")}.`);
    }
    const fromDate = parseDate(from, "from");
    const toDate = parseDate(to, "to");
    if (fromDate && toDate && fromDate > toDate) {
      throw new ValidationError("'from' must not be after 'to'.");
    }
    if (cursor !== undefined && typeof cursor !== "string") {
      throw new ValidationError("'cursor' must be a string.");
    }

    const where: Record<string, unknown> = {};
    if (typeof product === "string") where.productId = product;
    if (typeof status === "string") where.status = status;
    if (typeof feature === "string") where.featureId = feature;
    if (fromDate || toDate) {
      where.lastSeenAt = { ...(fromDate ? { gte: fromDate } : {}), ...(toDate ? { lte: toDate } : {}) };
    }

    const rows = await prisma.featureObservation.findMany({
      where,
      orderBy: [{ lastSeenAt: "desc" }, { id: "desc" }],
      take: limit + 1,
      ...(typeof cursor === "string" ? { skip: 1, cursor: { id: cursor } } : {}),
      include: { feature: { select: { id: true, canonicalName: true, aliases: true } } },
    });

    const hasMore = rows.length > limit;
    const data = hasMore ? rows.slice(0, limit) : rows;

    res.status(200).json({
      data: data.map((row) => ({
        id: row.id,
        productId: row.productId,
        feature: row.feature,
        status: row.status,
        confidence: row.confidence,
        firstSeenAt: row.firstSeenAt,
        lastSeenAt: row.lastSeenAt,
        sourceId: row.sourceId,
        snapshotId: row.snapshotId,
        evidenceText: row.evidenceText,
      })),
      pagination: { limit, nextCursor: hasMore ? data[data.length - 1]?.id ?? null : null },
    });
  }),
);
