import type { Request, Response, NextFunction } from "express";
import { prisma } from "../db/client";
import { hashApiKey } from "../lib/apiKey";
import { UnauthorizedError } from "../lib/errors";
import { asyncHandler } from "./errorHandler";

/**
 * Phase 1 foundation only. No `/api/v1/*` public API routes exist yet
 * (that's Phase 9), so nothing mounts this middleware in the running app
 * today — it's here, and covered by the apiKey hashing tests, so the
 * public API phase can wire it in directly instead of designing auth from
 * scratch under time pressure later.
 *
 * Accepts the key as `x-api-key` or `Authorization: Bearer <key>`, per
 * README.md's documented contract.
 */
export const apiKeyAuth = asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
  const header = req.header("x-api-key") ?? req.header("authorization");
  const plaintext = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : header;

  if (!plaintext) {
    throw new UnauthorizedError("An API key is required (x-api-key or Authorization: Bearer).");
  }

  const hashedKey = hashApiKey(plaintext);
  const apiKey = await prisma.apiKey.findUnique({ where: { hashedKey } });

  if (!apiKey || apiKey.revokedAt) {
    throw new UnauthorizedError("Invalid or revoked API key.");
  }

  await prisma.apiKey.update({
    where: { id: apiKey.id },
    data: { lastUsedAt: new Date() },
  });

  next();
});
