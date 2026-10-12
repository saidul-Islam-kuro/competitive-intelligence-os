/**
 * NOT RUNNABLE IN THE SANDBOX THIS WAS WRITTEN IN — needs a generated
 * @prisma/client and cheerio, neither installed here. Written carefully
 * against prisma/schema.prisma and reviewed by hand; genuinely verify with
 * `npm test` once dependencies are installed and a real database is
 * reachable. See VERIFY.md for exactly what was and wasn't run.
 *
 * Pipeline: validate -> fetch -> parse -> normalize -> cap -> hash ->
 * compare -> diff -> classify -> extract pricing -> extract features ->
 * persist -> return. Routes call this; business logic lives here.
 *
 * Phase 4/5 addition: pricing and feature extraction run ONLY when
 * contentChanged is true (Phase 4.7/5.8 — "avoid expensive processing if
 * the content hash has not changed"). This is also why list items now
 * participate in contentHash (see contentHash.ts's doc comment) — without
 * that, a page whose feature list changed but whose other fields didn't
 * would show contentChanged=false and silently skip feature extraction on
 * real new content.
 */
import { prisma } from "../db/client";
import { fetchUrl, type FetchOptions } from "../lib/crawler/httpFetcher";
import { parseHtml, looksLikeRenderRequired } from "../lib/parser/htmlParser";
import { normalizeContent, capNormalizedContent, type NormalizedContent } from "../lib/normalizer/normalizeContent";
import { hashNormalizedContent } from "../lib/utils/contentHash";
import { diffStructuredContent, summarizeStructuralDiff } from "../lib/diff/structuralDiff";
import { classifyChange, summarizeChange, type SourceTypeInput } from "../lib/classification/classifyChange";
import { extractAndPersistPricing } from "./persistPricing";
import { extractAndPersistFeatures } from "./persistFeatures";
import { AppError, HttpFailureError, SourceNotFoundError, ProductSourceMismatchError } from "../lib/errors";

export interface ScrapeResult {
  sourceId: string;
  snapshotId: string;
  finalUrl: string | null;
  httpStatus: number | null;
  contentHash: string | null;
  contentChanged: boolean;
  previousSnapshotId: string | null;
  changeId: string | null;
  category: string | null;
  pricingPointsExtracted: number;
  featuresExtracted: number;
  durationMs: number;
}

/** Best-effort status code to record when the fetch pipeline throws. */
function upstreamStatusFrom(err: unknown): number | null {
  return err instanceof HttpFailureError ? err.upstreamStatus : null;
}

/**
 * Reconstructs a NormalizedContent object from a previously-stored
 * Snapshot row, for diffing against. The Json columns are cast back to
 * their known shapes — safe because nothing else ever writes to them.
 */
function normalizedContentFromSnapshot(snapshot: {
  title: string | null;
  metaDescription: string | null;
  canonicalUrl: string | null;
  normalizedText: string | null;
  headings: unknown;
  links: unknown;
  listItems: unknown;
  structuredData: unknown;
}): NormalizedContent {
  return {
    title: snapshot.title,
    metaDescription: snapshot.metaDescription,
    canonicalUrl: snapshot.canonicalUrl,
    normalizedText: snapshot.normalizedText ?? "",
    headings: (snapshot.headings as NormalizedContent["headings"]) ?? [],
    links: (snapshot.links as NormalizedContent["links"]) ?? [],
    listItems: (snapshot.listItems as string[]) ?? [],
    structuredData: (snapshot.structuredData as unknown[]) ?? [],
  };
}

/**
 * Scrapes one source: fetch, parse, normalize, hash, compare, classify,
 * extract pricing/features (when content changed), and persist. If
 * `productId` is given, verifies the source belongs to that product first.
 *
 * On a fetch/validation failure, still persists a Snapshot row recording
 * the failed attempt before re-throwing the original structured error.
 *
 * `fetchOptions` is a test-only escape hatch — production route code
 * never passes it, so the real, strict SSRF policy always applies.
 */
export async function scrapeSource(
  sourceId: string,
  productId?: string,
  fetchOptions?: FetchOptions,
): Promise<ScrapeResult> {
  const start = Date.now();

  const source = await prisma.source.findUnique({ where: { id: sourceId } });
  if (!source) {
    throw new SourceNotFoundError(`No source with id "${sourceId}".`);
  }
  if (productId && source.productId !== productId) {
    throw new ProductSourceMismatchError();
  }

  try {
    const fetchResult = await fetchUrl(source.url, fetchOptions);
    const extracted = parseHtml(fetchResult.body, fetchResult.finalUrl);
    const normalized = normalizeContent(extracted);
    // Cap ONCE. Everything downstream — hashing AND storage — uses this
    // exact object, so hash and stored content can never diverge.
    const capped = capNormalizedContent(normalized);
    const contentHash = hashNormalizedContent(capped);
    const renderRequired = looksLikeRenderRequired(fetchResult.body, extracted);

    const previousSnapshot = await prisma.snapshot.findFirst({
      where: { sourceId: source.id, contentHash: { not: null } },
      orderBy: { fetchedAt: "desc" },
    });

    const contentChanged = !previousSnapshot || previousSnapshot.contentHash !== contentHash;

    const result = await prisma.$transaction(async (tx) => {
      const snapshot = await tx.snapshot.create({
        data: {
          sourceId: source.id,
          requestedUrl: fetchResult.requestedUrl,
          finalUrl: fetchResult.finalUrl,
          statusCode: fetchResult.statusCode,
          contentHash,
          contentType: fetchResult.contentType,
          title: capped.title,
          metaDescription: capped.metaDescription,
          canonicalUrl: capped.canonicalUrl,
          normalizedText: capped.normalizedText,
          headings: capped.headings,
          links: capped.links,
          listItems: capped.listItems,
          structuredData: capped.structuredData,
          renderRequired,
          durationMs: fetchResult.durationMs,
        },
      });

      let changeId: string | null = null;
      let category: string | null = null;

      if (previousSnapshot && contentChanged) {
        const before = normalizedContentFromSnapshot(previousSnapshot);
        const diff = diffStructuredContent(before, capped);
        const classification = classifyChange({
          sourceType: source.type as SourceTypeInput,
          sourceUrl: source.url,
          diff,
        });
        const summary = summarizeChange(summarizeStructuralDiff(diff), classification);

        // Idempotent: unique on (fromSnapshotId, toSnapshotId).
        const change = await tx.change.upsert({
          where: {
            fromSnapshotId_toSnapshotId: { fromSnapshotId: previousSnapshot.id, toSnapshotId: snapshot.id },
          },
          create: {
            productId: source.productId,
            sourceId: source.id,
            fromSnapshotId: previousSnapshot.id,
            toSnapshotId: snapshot.id,
            category: classification.category,
            severity: "INFO",
            confidence: classification.confidence,
            summary,
            diff: { fields: diff.fields, fieldsTruncated: diff.fieldsTruncated, text: diff.text },
            evidenceText: classification.evidence.join(" "),
          },
          update: {},
        });
        changeId = change.id;
        category = change.category;
      }

      // Pricing/feature extraction only runs when content changed (Phase
      // 4.7/5.8) — on the very first scrape, contentChanged is always
      // true, so extraction still runs then.
      let pricingPointsExtracted = 0;
      let featuresExtracted = 0;
      if (contentChanged) {
        const pricingResult = await extractAndPersistPricing(
          tx,
          { headings: capped.headings, normalizedText: capped.normalizedText, listItems: capped.listItems },
          {
            productId: source.productId,
            sourceId: source.id,
            sourceType: source.type,
            snapshotId: snapshot.id,
            renderRequired,
          },
        );
        pricingPointsExtracted = pricingResult.pricingPointIds.length;

        const featuresResult = await extractAndPersistFeatures(
          tx,
          { headings: capped.headings, listItems: capped.listItems },
          { productId: source.productId, sourceId: source.id, sourceType: source.type, snapshotId: snapshot.id },
        );
        featuresExtracted = featuresResult.featureObservationIds.length;
      }

      await tx.source.update({ where: { id: source.id }, data: { lastScrapedAt: new Date() } });

      return {
        snapshot,
        changeId,
        category,
        previousSnapshotId: previousSnapshot?.id ?? null,
        pricingPointsExtracted,
        featuresExtracted,
      };
    });

    return {
      sourceId: source.id,
      snapshotId: result.snapshot.id,
      finalUrl: fetchResult.finalUrl,
      httpStatus: fetchResult.statusCode,
      contentHash,
      contentChanged,
      previousSnapshotId: result.previousSnapshotId,
      changeId: result.changeId,
      category: result.category,
      pricingPointsExtracted: result.pricingPointsExtracted,
      featuresExtracted: result.featuresExtracted,
      durationMs: Date.now() - start,
    };
  } catch (err) {
    if (!(err instanceof AppError)) {
      throw err; // unexpected error — let the global error handler treat it as 500
    }

    await prisma.$transaction([
      prisma.snapshot.create({
        data: {
          sourceId: source.id,
          requestedUrl: source.url,
          statusCode: upstreamStatusFrom(err),
          contentHash: null,
          error: err.message,
          durationMs: Date.now() - start,
        },
      }),
      prisma.source.update({ where: { id: source.id }, data: { lastScrapedAt: new Date() } }),
    ]);

    throw err;
  }
}
