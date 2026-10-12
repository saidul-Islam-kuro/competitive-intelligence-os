/**
 * Deterministic normalization of already-extracted page content (see
 * ../parser/htmlParser.ts for the cheerio-based extraction step that
 * produces the ExtractedContent this module takes as input).
 *
 * WHAT IS NORMALIZED, AND WHY (per 04_DEVELOPMENT_RULES — document exactly
 * what's normalized):
 *
 * 1. Line endings: \r\n and \r are converted to \n. Different servers/OSes
 *    emit different line endings for otherwise-identical content; without
 *    this, the same page could hash differently purely due to server
 *    configuration, not content.
 * 2. Whitespace: runs of horizontal whitespace (spaces/tabs) are collapsed
 *    to a single space, and each line is trimmed. HTML rendering doesn't
 *    care about internal whitespace runs, so neither should the hash —
 *    otherwise cosmetic template/whitespace changes would look like
 *    content changes.
 * 3. Blank lines: fully-empty lines (after trimming) are dropped. Visible
 *    text extraction naturally leaves many blank lines between block
 *    elements (paragraphs, divs, list items); keeping them would make the
 *    hash sensitive to markup structure changes that don't affect what a
 *    reader actually sees.
 * 4. Heading/link text: individually trimmed and whitespace-collapsed the
 *    same way as body text.
 * 5. Links: exact duplicate (href, text) pairs are removed, keeping the
 *    first occurrence's position. The same link repeated in a header and a
 *    footer is noise for change detection, not signal.
 * 6. Structured data (JSON-LD): re-serialized with object keys sorted
 *    recursively, so a change in the source HTML's key ORDER alone (which
 *    carries no meaning) doesn't change the hash, while a change in any
 *    key's VALUE still does.
 * 7. List items (Phase 5 addition): trimmed, whitespace-collapsed, and
 *    exact-duplicate text removed the same way as links — a repeated
 *    "Free trial" bullet in a nav dropdown and a features list shouldn't
 *    count twice.
 *
 * WHAT IS DELIBERATELY NOT NORMALIZED (documented, not silently skipped):
 * - Case is preserved. Lowercasing would risk masking real content
 *   differences (e.g. a product name's capitalization change).
 * - No attempt is made to detect and strip "obvious boilerplate" like
 *   copyright years or auto-generated timestamps embedded in visible text.
 *   Distinguishing meaningful numbers from incidental ones from plain text
 *   alone is exactly the kind of guess that produces false precision
 *   (04_DEVELOPMENT_RULES #8) — a copyright year bump will currently
 *   register as a content change. This is a known, accepted limitation for
 *   Phase 2, not an oversight.
 * - Script/style/non-content tag removal happens in the parser (cheerio),
 *   not here — by the time content reaches this module, it's already
 *   plain extracted text/arrays, not HTML.
 */

export interface ExtractedHeading {
  level: number;
  text: string;
}

export interface ExtractedLink {
  href: string;
  text: string;
}

export interface ExtractedContent {
  title: string | null;
  metaDescription: string | null;
  canonicalUrl: string | null;
  headings: ExtractedHeading[];
  visibleText: string;
  links: ExtractedLink[];
  /** Phase 5 addition: raw <li> text, in document order. */
  listItems: string[];
  /** Already-JSON.parse'd JSON-LD blocks (parser's job to parse, not this module's). */
  jsonLd: unknown[];
}

export interface NormalizedContent {
  title: string | null;
  metaDescription: string | null;
  canonicalUrl: string | null;
  headings: ExtractedHeading[];
  normalizedText: string;
  links: ExtractedLink[];
  listItems: string[];
  structuredData: unknown[];
}

function collapseWhitespace(value: string): string {
  return value.replace(/[ \t]+/g, " ").trim();
}

function normalizeLineEndings(value: string): string {
  return value.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

export function normalizeText(rawText: string): string {
  return normalizeLineEndings(rawText)
    .split("\n")
    .map(collapseWhitespace)
    .filter((line) => line.length > 0)
    .join("\n");
}

function dedupeLinks(links: ExtractedLink[]): ExtractedLink[] {
  const seen = new Set<string>();
  const result: ExtractedLink[] = [];
  for (const link of links) {
    const href = collapseWhitespace(link.href);
    const text = collapseWhitespace(link.text);
    if (!href) continue;
    const key = `${href}\u0000${text}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ href, text });
  }
  return result;
}

function normalizeHeadings(headings: ExtractedHeading[]): ExtractedHeading[] {
  return headings
    .map((h) => ({ level: h.level, text: collapseWhitespace(h.text) }))
    .filter((h) => h.text.length > 0);
}

function dedupeListItems(items: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of items) {
    const text = collapseWhitespace(raw);
    if (!text || seen.has(text)) continue;
    seen.add(text);
    result.push(text);
  }
  return result;
}

/** Recursively sorts object keys so JSON.stringify output is order-stable. */
export function stableSerialize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stableSerialize);
  }
  if (value !== null && typeof value === "object") {
    const sortedEntries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
      a.localeCompare(b),
    );
    const result: Record<string, unknown> = {};
    for (const [key, val] of sortedEntries) {
      result[key] = stableSerialize(val);
    }
    return result;
  }
  return value;
}

export function normalizeContent(extracted: ExtractedContent): NormalizedContent {
  return {
    title: extracted.title ? collapseWhitespace(extracted.title) : null,
    metaDescription: extracted.metaDescription ? collapseWhitespace(extracted.metaDescription) : null,
    canonicalUrl: extracted.canonicalUrl ? extracted.canonicalUrl.trim() : null,
    headings: normalizeHeadings(extracted.headings),
    normalizedText: normalizeText(extracted.visibleText),
    links: dedupeLinks(extracted.links),
    listItems: dedupeListItems(extracted.listItems),
    structuredData: extracted.jsonLd.map(stableSerialize),
  };
}

/**
 * REGRESSION FIX (Phase 2.1): Phase 2's scrapeSource.ts hashed the full,
 * uncapped NormalizedContent but then stored a *separately* truncated
 * version (different text-length cap, different array-length cap) in the
 * Snapshot row. The next scrape would hash its own full content and diff
 * it against the previous snapshot's already-truncated stored text —
 * producing a spurious "change" at the truncation boundary on every large
 * page, even when nothing actually changed.
 *
 * The fix: cap ONCE, immediately after normalization, and have every
 * downstream consumer (hashing AND storage) use this exact same capped
 * object. There is then no possible divergence between what was hashed
 * and what a later diff reads back out of the database, at any content
 * size.
 *
 * Limits, and why:
 * - MAX_TEXT_LENGTH is a defensive backstop, not the primary bound. The
 *   primary bound on extracted text is already the fetcher's own maxBytes
 *   cap on the raw HTTP response (see httpFetcher.ts, default 5,000,000
 *   bytes) — normalization only ever removes characters (collapsing
 *   whitespace, dropping blank lines), so normalizedText.length can never
 *   exceed the raw HTML length, which the fetcher already bounds. This
 *   constant exists so the limit is explicit and independently testable
 *   rather than merely implied by another module's setting, and is set
 *   well above what a 5MB HTML page would realistically extract to.
 * - MAX_ARRAY_ITEMS bounds headings/links by *count*, not byte size — a
 *   pathological page with tens of thousands of tiny <a> tags could stay
 *   well under the byte cap while still being disproportionately
 *   expensive to store as a JSON array of small objects.
 */
export const MAX_NORMALIZED_TEXT_LENGTH = 2_000_000;
export const MAX_NORMALIZED_ARRAY_ITEMS = 500;

export function capNormalizedContent(content: NormalizedContent): NormalizedContent {
  const text =
    content.normalizedText.length > MAX_NORMALIZED_TEXT_LENGTH
      ? `${content.normalizedText.slice(0, MAX_NORMALIZED_TEXT_LENGTH)}\n…[truncated at ${MAX_NORMALIZED_TEXT_LENGTH} characters]`
      : content.normalizedText;

  return {
    ...content,
    normalizedText: text,
    headings: content.headings.slice(0, MAX_NORMALIZED_ARRAY_ITEMS),
    links: content.links.slice(0, MAX_NORMALIZED_ARRAY_ITEMS),
    listItems: content.listItems.slice(0, MAX_NORMALIZED_ARRAY_ITEMS),
  };
}
