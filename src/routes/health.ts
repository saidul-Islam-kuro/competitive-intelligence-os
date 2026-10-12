import { Router } from "express";
import { prisma } from "../db/client";
import { asyncHandler } from "../middleware/errorHandler";

export const healthRouter = Router();

healthRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    let db: "ok" | "unreachable" = "unreachable";
    try {
      await prisma.$queryRaw`SELECT 1`;
      db = "ok";
    } catch {
      // Deliberately swallowed: health should report degraded status, not
      // crash the request, if the database isn't reachable/migrated yet.
      db = "unreachable";
    }

    const status = db === "ok" ? 200 : 503;
    res.status(status).json({
      status: db === "ok" ? "ok" : "degraded",
      db,
      timestamp: new Date().toISOString(),
    });
  }),
);
