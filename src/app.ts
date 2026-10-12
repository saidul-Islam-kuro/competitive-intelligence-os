import express, { type Express } from "express";
import cors from "cors";
import { requestLogger } from "./middleware/requestLogger";
import { errorHandler } from "./middleware/errorHandler";
import { healthRouter } from "./routes/health";
import { cronRouter } from "./routes/cron";
import { sourcesRouter } from "./routes/sources";
import { changesRouter } from "./routes/changes";
import { pricingRouter } from "./routes/pricing";
import { featuresRouter } from "./routes/features";
import { reviewsRouter } from "./routes/reviews";
import { reviewSourcesRouter } from "./routes/reviewSources";
import { NotFoundError } from "./lib/errors";

/**
 * Phase 1: health + cron (auth-only stub). Phase 2: authenticated
 * scrape-triggering under /api/products. Phase 3: authenticated,
 * filterable, paginated GET /api/changes. Phase 4/5: GET /api/pricing and
 * GET /api/features, same auth/pagination conventions. Phase 6: GET
 * /api/reviews, GET /api/review-topics, and an authenticated review-ingest
 * trigger. Every dashboard
 * endpoint index.html calls (/api/products GET/list, /api/dashboard/*,
 * /api/intelligence/*) and the versioned public API (/api/v1/*) still
 * land in later phases — see README.md's status section. Mounting routes
 * that return fake data would violate the project's "no fake
 * functionality" rule, so they simply don't exist yet rather than
 * existing as stubs pretending to be complete.
 */
export function createApp(): Express {
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: "1mb" }));
  app.use(requestLogger);

  app.use("/api/health", healthRouter);
  app.use("/api/cron", cronRouter);
  app.use("/api/products", sourcesRouter);
  app.use("/api/changes", changesRouter);
  app.use("/api/pricing", pricingRouter);
  app.use("/api/features", featuresRouter);
  app.use("/api", reviewsRouter);
  app.use("/api/products", reviewSourcesRouter);

  app.use((req, _res, next) => {
    next(new NotFoundError(`No route for ${req.method} ${req.path}`));
  });

  app.use(errorHandler);

  return app;
}
