/**
 * Pluggable review source adapters (Phase 6.1/6.2).
 *
 * Deliberately ships only two GENERIC adapters:
 * - "json-feed": any public/permitted JSON endpoint or feed that returns
 *   reviews (an official API you have access to, a feed you control, an
 *   export URL). Fetched through the SAME SSRF-protected fetcher as page
 *   scraping (../crawler/httpFetcher) — no second, weaker network path.
 * - fixture adapter: user-provided/in-memory datasets (tests, manual
 *   imports).
 *
 * NO adapters for specific named review platforms (G2, Capterra,
 * Trustpilot, ...) are included. Those either require a partner/API
 * agreement or HTML scraping that commonly violates their terms or runs
 * into anti-bot measures — this project's rules forbid bypassing either
 * (04_DEVELOPMENT_RULES #9). The interface below is what a future
 * platform-specific adapter would implement once that platform's actual
 * permitted access method has been verified.
 */
import { fetchUrl, type FetchOptions } from "../crawler/httpFetcher";
import { ValidationError } from "../errors";

export interface RawReview {
  externalId: string | null;
  author: string | null;
  rating: number | null;
  title: string | null;
  body: string;
  publishedAt: Date | null;
  sourceUrl: string | null;
}

export interface ReviewAdapter {
  readonly platform: string;
  fetchReviews(source: { url: string | null }): Promise<RawReview[]>;
}

function str(value: unknown): string | null {
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function num(value: unknown): number | null {
  const n = typeof value === "string" ? Number(value) : value;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

function date(value: unknown): Date | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export interface ParsedFeed {
  reviews: RawReview[];
  skipped: number;
}

/**
 * Pure, tolerant parser for a generic JSON review feed: accepts either a
 * top-level array or `{ "reviews": [...] }`. Items missing a usable text
 * body, or that aren't objects at all, are SKIPPED and counted — a feed
 * with some malformed entries still yields the good ones instead of
 * failing wholesale.
 */
export function parseJsonReviewFeed(json: unknown): ParsedFeed {
  const items = Array.isArray(json)
    ? json
    : json && typeof json === "object" && Array.isArray((json as { reviews?: unknown }).reviews)
      ? (json as { reviews: unknown[] }).reviews
      : null;
  if (!items) return { reviews: [], skipped: 0 };

  const reviews: RawReview[] = [];
  let skipped = 0;
  for (const item of items) {
    if (!item || typeof item !== "object") {
      skipped++;
      continue;
    }
    const r = item as Record<string, unknown>;
    const body = str(r.body) ?? str(r.text) ?? str(r.content) ?? str(r.review);
    if (!body) {
      skipped++;
      continue;
    }
    reviews.push({
      externalId: str(r.id) ?? str(r.externalId) ?? str(r.external_id),
      author: str(r.author) ?? str(r.authorName) ?? str(r.author_name) ?? str(r.reviewer),
      rating: num(r.rating) ?? num(r.stars) ?? num(r.score),
      title: str(r.title) ?? str(r.headline),
      body,
      publishedAt: date(r.publishedAt) ?? date(r.published_at) ?? date(r.date) ?? date(r.created_at),
      sourceUrl: str(r.url) ?? str(r.link) ?? str(r.permalink),
    });
  }
  return { reviews, skipped };
}

export function createJsonFeedAdapter(fetchOptions: FetchOptions = {}): ReviewAdapter {
  return {
    platform: "json-feed",
    async fetchReviews(source) {
      if (!source.url) throw new ValidationError("This review source has no URL configured.");
      const result = await fetchUrl(source.url, { ...fetchOptions, acceptedContentTypes: ["application/json"] });
      let parsed: unknown;
      try {
        parsed = JSON.parse(result.body);
      } catch {
        throw new ValidationError("The review feed did not return valid JSON.");
      }
      return parseJsonReviewFeed(parsed).reviews;
    },
  };
}

export function createFixtureAdapter(reviews: RawReview[]): ReviewAdapter {
  return { platform: "fixture", fetchReviews: async () => reviews };
}

/** Resolves a ReviewSource.platform to an adapter; unknown platforms are an explicit error, never a silent no-op. */
export function resolveAdapter(platform: string, fetchOptions?: FetchOptions): ReviewAdapter {
  if (platform === "json-feed") return createJsonFeedAdapter(fetchOptions);
  throw new ValidationError(
    `No review adapter is available for platform "${platform}". Supported: json-feed. (Platform-specific adapters are deliberately not included — see adapters.ts.)`,
  );
}
