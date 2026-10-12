/**
 * `npm run scrape:once` — loops every enabled Source and scrapes it once,
 * sequentially. A one-shot script, not a daemon or queue: no persistent
 * process, no in-memory state carried between runs (03_ARCHITECTURE §11/§21
 * — Vercel compatibility). Intended as a manual/local trigger; Vercel's
 * `/api/cron` remains its own separate, still-a-no-op endpoint (wiring cron
 * to actually call this is a scheduling decision left for a later phase,
 * not assumed here).
 *
 * Sequential on purpose: scraping many sources concurrently from one
 * process risks overwhelming both the target sites and the DB connection
 * pool, and Phase 2's scope is "reliable acquisition", not throughput.
 *
 * NOT RUNNABLE IN THE SANDBOX THIS WAS WRITTEN IN — needs @prisma/client
 * and cheerio. See VERIFY.md.
 */
import { prisma } from "../db/client";
import { scrapeSource } from "../services/scrapeSource";
import { AppError } from "../lib/errors";

async function main(): Promise<void> {
  const sources = await prisma.source.findMany({ where: { enabled: true } });

  if (sources.length === 0) {
    console.log("No enabled sources configured — nothing to scrape.");
    return;
  }

  console.log(`Scraping ${sources.length} source(s)...`);

  let succeeded = 0;
  let failed = 0;

  for (const source of sources) {
    try {
      const result = await scrapeSource(source.id, source.productId);
      succeeded++;
      console.log(
        `[ok] source=${source.id} url=${source.url} changed=${result.contentChanged} ` +
          `snapshot=${result.snapshotId} change=${result.changeId ?? "-"} duration=${result.durationMs}ms`,
      );
    } catch (err) {
      failed++;
      const detail = err instanceof AppError ? `${err.code}: ${err.message}` : "unexpected error";
      console.error(`[fail] source=${source.id} url=${source.url} — ${detail}`);
    }
  }

  console.log(`Done. ${succeeded} succeeded, ${failed} failed.`);
}

main()
  .catch((err) => {
    console.error("scrape:once failed to run:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
