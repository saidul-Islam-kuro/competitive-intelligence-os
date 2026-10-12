/**
 * NOT RUNNABLE IN THE SANDBOX THIS WAS WRITTEN IN — needs express and
 * everything scrapeSource.ts needs. See VERIFY.md.
 *
 * Nested under /api/products/:productId to give "product/source mismatch"
 * (04_DEVELOPMENT_RULES' error-category list) something real to check:
 * the service verifies the source actually belongs to the claimed product
 * rather than trusting the sourceId alone. Protected by the existing
 * apiKeyAuth middleware — never publicly callable without a valid key.
 */
import { Router } from "express";
import { apiKeyAuth } from "../middleware/auth";
import { asyncHandler } from "../middleware/errorHandler";
import { scrapeSource } from "../services/scrapeSource";

export const sourcesRouter = Router();

sourcesRouter.post(
  "/:productId/sources/:sourceId/scrape",
  apiKeyAuth,
  asyncHandler(async (req, res) => {
    const { productId, sourceId } = req.params;
    const result = await scrapeSource(sourceId, productId);
    res.status(200).json(result);
  }),
);
