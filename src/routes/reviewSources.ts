/**
 * NOT RUNNABLE IN THE SANDBOX THIS WAS WRITTEN IN — needs express +
 * @prisma/client. See VERIFY.md.
 *
 * Authenticated trigger for review ingestion, mirroring the scrape
 * endpoint's shape (nested under the product so a mismatched product/
 * review-source pair is rejected). Not in the Phase 6 read-endpoint list
 * but required for ingestion to be reachable at all — otherwise the
 * pipeline would be dead code.
 */
import { Router } from "express";
import { apiKeyAuth } from "../middleware/auth";
import { asyncHandler } from "../middleware/errorHandler";
import { ingestReviewSource } from "../services/ingestReviewSource";

export const reviewSourcesRouter = Router();

reviewSourcesRouter.post(
  "/:productId/review-sources/:reviewSourceId/ingest",
  apiKeyAuth,
  asyncHandler(async (req, res) => {
    const { productId, reviewSourceId } = req.params;
    const result = await ingestReviewSource(reviewSourceId, productId);
    res.status(200).json(result);
  }),
);
