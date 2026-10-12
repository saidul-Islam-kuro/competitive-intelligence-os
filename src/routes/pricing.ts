/**
 * NOT RUNNABLE IN THE SANDBOX THIS WAS WRITTEN IN — needs express and
 * @prisma/client. See VERIFY.md.
 *
 * Read-only, authenticated (apiKeyAuth, same as every other route).
 * Returns raw PricingPoint history (one row per observation — Phase 4.3's
 * "every meaningful pricing observation should be stored historically",
 * never overwritten) with the owning plan's name joined in. Filters:
 * product, plan (a PricingPlan id), date range on capturedAt.
 * Cursor-paginated, same pattern as routes/changes.ts.
 */
import { Router } from "express";
import { apiKeyAuth } from "../middleware/auth";
import { asyncHandler } from "../middleware/errorHandler";
import { prisma } from "../db/client";
import { ValidationError } from "../lib/errors";

export const pricingRouter = Router();

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

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

pricingRouter.get(
  "/",
  apiKeyAuth,
  asyncHandler(async (req, res) => {
    const { product, plan, from, to, cursor } = req.query;
    const limit = parseLimit(req.query.limit);
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
    if (typeof plan === "string") where.pricingPlanId = plan;
    if (fromDate || toDate) {
      where.capturedAt = { ...(fromDate ? { gte: fromDate } : {}), ...(toDate ? { lte: toDate } : {}) };
    }

    const rows = await prisma.pricingPoint.findMany({
      where,
      orderBy: [{ capturedAt: "desc" }, { id: "desc" }],
      take: limit + 1,
      ...(typeof cursor === "string" ? { skip: 1, cursor: { id: cursor } } : {}),
      include: { pricingPlan: { select: { id: true, name: true, normalizedName: true, active: true } } },
    });

    const hasMore = rows.length > limit;
    const data = hasMore ? rows.slice(0, limit) : rows;

    res.status(200).json({
      data: data.map((row) => ({
        id: row.id,
        productId: row.productId,
        plan: row.pricingPlan,
        price: row.price,
        currency: row.currency,
        billingPeriod: row.billingPeriod,
        unit: row.unit,
        isCustomPricing: row.isCustomPricing,
        limits: row.limits,
        includedFeatures: row.features,
        observationKey: row.observationKey,
        sourceId: row.sourceId,
        snapshotId: row.snapshotId,
        evidenceText: row.evidenceText,
        extractionMethod: row.extractionMethod,
        capturedAt: row.capturedAt,
      })),
      pagination: { limit, nextCursor: hasMore ? data[data.length - 1]?.id ?? null : null },
    });
  }),
);
