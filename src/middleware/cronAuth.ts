import type { Request, Response, NextFunction } from "express";
import { timingSafeEqual } from "node:crypto";
import { loadEnv } from "../config/env";
import { UnauthorizedError } from "../lib/errors";

/**
 * Vercel sends `Authorization: Bearer <CRON_SECRET>` automatically on
 * scheduled invocations when CRON_SECRET is set on the project (see
 * README.md). If CRON_SECRET is unset, the check is skipped — useful for
 * local dev via `npm run scrape:once`, but you should always set it in
 * production so `/api/cron` can't be triggered by anyone who finds the URL.
 */
export function cronAuth(req: Request, _res: Response, next: NextFunction): void {
  const { cronSecret } = loadEnv();

  if (!cronSecret) {
    next();
    return;
  }

  const header = req.header("authorization");
  const provided = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : undefined;

  if (!provided) {
    throw new UnauthorizedError("Missing cron authorization.");
  }

  const a = Buffer.from(provided);
  const b = Buffer.from(cronSecret);
  const valid = a.length === b.length && timingSafeEqual(a, b);

  if (!valid) {
    throw new UnauthorizedError("Invalid cron authorization.");
  }

  next();
}
