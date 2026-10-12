/**
 * NOT RUNNABLE IN THE SANDBOX THIS WAS WRITTEN IN — needs express and
 * @prisma/client. See VERIFY.md.
 *
 * Read-only, authenticated (apiKeyAuth, same as the scrape endpoint).
 * Filters: product, source, category, from/to (detectedAt range).
 * Cursor-paginated (not offset-based) so pages stay stable as new Change
 * rows are inserted — "keep pagination bounded" per the Phase 3
 * instructions.
 */
import { Router } from "express";
import { apiKeyAuth } from "../middleware/auth";
import { asyncHandler } from "../middleware/errorHandler";
import { prisma } from "../db/client";
import { ValidationError } from "../lib/errors";
import { CHANGE_CATEGORIES } from "../lib/classification/classifyChange";

export const changesRouter = Router();

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

function parseLimit(raw: unknown): number {
  if (raw === undefined) return DEFAULT_LIMIT;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new ValidationError("'limit' must be a positive number.");
  }
  return Math.min(Math.floor(value), MAX_LIMIT);
}

function parseDate(raw: unknown, paramName: string): Date | undefined {
  if (raw === undefined) return undefined;
  if (typeof raw !== "string") {
    throw new ValidationError(`'${paramName}' must be a string date.`);
  }
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    throw new ValidationError(`'${paramName}' is not a valid date.`);
  }
  return date;
}

changesRouter.get(
  "/",
  apiKeyAuth,
  asyncHandler(async (req, res) => {
    const { product, source, category, from, to, cursor } = req.query;

    const limit = parseLimit(req.query.limit);

    if (category !== undefined) {
      if (typeof category !== "string" || !CHANGE_CATEGORIES.includes(category as (typeof CHANGE_CATEGORIES)[number])) {
        throw new ValidationError(`'category' must be one of: ${CHANGE_CATEGORIES.join(", ")}.`);
      }
    }

    const fromDate = parseDate(from, "from");
    const toDate = parseDate(to, "to");
    if (fromDate && toDate && fromDate > toDate) {
      throw new ValidationError("'from' must not be after 'to'.");
    }

    const where: Record<string, unknown> = {};
    if (typeof product === "string") where.productId = product;
    if (typeof source === "string") where.sourceId = source;
    if (typeof category === "string") where.category = category;
    if (fromDate || toDate) {
      where.detectedAt = {
        ...(fromDate ? { gte: fromDate } : {}),
        ...(toDate ? { lte: toDate } : {}),
      };
    }

    if (cursor !== undefined && typeof cursor !== "string") {
      throw new ValidationError("'cursor' must be a string.");
    }

    const rows = await prisma.change.findMany({
      where,
      orderBy: [{ detectedAt: "desc" }, { id: "desc" }],
      take: limit + 1,
      ...(typeof cursor === "string" ? { skip: 1, cursor: { id: cursor } } : {}),
      select: {
        id: true,
        productId: true,
        sourceId: true,
        fromSnapshotId: true,
        toSnapshotId: true,
        category: true,
        severity: true,
        confidence: true,
        summary: true,
        detail: true,
        diff: true,
        evidenceText: true,
        detectedAt: true,
      },
    });

    const hasMore = rows.length > limit;
    const data = hasMore ? rows.slice(0, limit) : rows;

    res.status(200).json({
      data,
      pagination: {
        limit,
        nextCursor: hasMore ? data[data.length - 1]?.id ?? null : null,
      },
    });
  }),
);
