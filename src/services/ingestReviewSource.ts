/**
 * NOT RUNNABLE IN THE SANDBOX THIS WAS WRITTEN IN — needs a generated
 * @prisma/client (real value import via ../db/client). The batch logic it
 * calls (ingestReviews.ts) IS tested for real; this wrapper only loads
 * the ReviewSource, resolves the adapter, fetches, and opens the
 * transaction. See VERIFY.md.
 *
 * Bounded on purpose: at most MAX_BATCH reviews per ingest call, inside a
 * transaction with an explicit timeout — a serverless invocation must stay
 * short-lived (03_ARCHITECTURE §11). A feed with more reviews than that is
 * picked up over repeated calls; already-seen reviews dedupe.
 */
import { prisma } from "../db/client";
import { resolveAdapter } from "../lib/reviews/adapters";
import type { FetchOptions } from "../lib/crawler/httpFetcher";
import { ingestReviewBatch, type IngestResult } from "./ingestReviews";
import { NotFoundError, ProductSourceMismatchError, ValidationError } from "../lib/errors";

export const MAX_INGEST_BATCH = 200;

export interface IngestSourceResult extends IngestResult {
  reviewSourceId: string;
  fetched: number;
  truncatedToBatchLimit: boolean;
}

export async function ingestReviewSource(
  reviewSourceId: string,
  productId?: string,
  fetchOptions?: FetchOptions,
): Promise<IngestSourceResult> {
  const source = await prisma.reviewSource.findUnique({ where: { id: reviewSourceId } });
  if (!source) throw new NotFoundError(`No review source with id "${reviewSourceId}".`);
  if (productId && source.productId !== productId) throw new ProductSourceMismatchError();
  if (!source.enabled) throw new ValidationError("This review source is disabled.");

  const adapter = resolveAdapter(source.platform, fetchOptions);
  const fetched = await adapter.fetchReviews({ url: source.url });
  const batch = fetched.slice(0, MAX_INGEST_BATCH);

  const result = await prisma.$transaction(
    (tx) =>
      ingestReviewBatch(tx, batch, {
        reviewSourceId: source.id,
        productId: source.productId,
        reviewSourceUrl: source.url,
      }),
    { maxWait: 5_000, timeout: 30_000 },
  );

  return {
    ...result,
    reviewSourceId: source.id,
    fetched: fetched.length,
    truncatedToBatchLimit: fetched.length > MAX_INGEST_BATCH,
  };
}
