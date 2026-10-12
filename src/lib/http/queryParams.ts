/**
 * Pure query-parameter validators (throw ValidationError → consistent
 * 400 {error:{code,message}} via the existing error handler). Extracted
 * from routes/reviews.ts so validation and pagination bounds are tested
 * for real without Express. Older routes (changes/pricing/features) still
 * carry their own near-identical copies — consolidating them onto this
 * module is a deliberate, noted follow-up, not done here to avoid
 * touching working Phase 3–5 routes.
 */
import { ValidationError } from "../errors";

export const DEFAULT_LIMIT = 25;

export function parseLimit(raw: unknown, max: number, fallback = DEFAULT_LIMIT): number {
  if (raw === undefined) return Math.min(fallback, max);
  const value = typeof raw === "string" ? Number(raw) : NaN;
  if (!Number.isFinite(value) || value <= 0) throw new ValidationError("'limit' must be a positive number.");
  return Math.min(Math.floor(value), max); // bounded: oversize requests are clamped, never honored
}

export function parseDate(raw: unknown, name: string): Date | undefined {
  if (raw === undefined) return undefined;
  if (typeof raw !== "string") throw new ValidationError(`'${name}' must be a string date.`);
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) throw new ValidationError(`'${name}' is not a valid date.`);
  return d;
}

export function parseRating(raw: unknown, name: string): number | undefined {
  if (raw === undefined) return undefined;
  const value = typeof raw === "string" ? Number(raw) : NaN;
  if (raw === "" || !Number.isFinite(value) || value < 0 || value > 5) {
    throw new ValidationError(`'${name}' must be a number between 0 and 5.`);
  }
  return value;
}

export function parseOneOf<T extends string>(raw: unknown, allowed: readonly T[], name: string): T | undefined {
  if (raw === undefined) return undefined;
  if (typeof raw !== "string" || !allowed.includes(raw as T)) {
    throw new ValidationError(`'${name}' must be one of: ${allowed.join(", ")}.`);
  }
  return raw as T;
}

export function dateRange(from: Date | undefined, to: Date | undefined): { gte?: Date; lte?: Date } | undefined {
  if (from && to && from > to) throw new ValidationError("'from' must not be after 'to'.");
  return from || to ? { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } : undefined;
}
