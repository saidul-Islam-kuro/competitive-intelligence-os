/**
 * NOT RUNNABLE IN THE SANDBOX THIS WAS WRITTEN IN — cheerio is a declared
 * dependency (package.json, inherited from the original project) but
 * `node_modules` doesn't exist here (no network access to `npm install`).
 * Written carefully and reviewed by hand; genuinely verify with
 * `npm test` once dependencies are installed. See VERIFY.md.
 *
 * Deliberately basic extraction only (per 02_INTELLIGENCE_ENGINE.md §3/§9
 * and the Phase 2 instructions): title, meta description, headings,
 * visible text, links, canonical URL, JSON-LD. No semantic feature
 * extraction, no marketing-language classification — that's a later phase.
 *
 * Structure/content tags (script, style, noscript, template, svg) are
 * removed here, before extraction — this is the one HTML-specific removal
 * step; everything else (whitespace, dedup, key-order) is handled on the
 * already-extracted plain data by ../normalizer/normalizeContent.ts.
 */
import * as cheerio from "cheerio";
import type { ExtractedContent, ExtractedHeading, ExtractedLink } from "../normalizer/normalizeContent";

const NON_CONTENT_SELECTORS = "script, style, noscript, template, svg";
const IGNORED_HREF_PREFIXES = ["javascript:", "mailto:", "tel:", "#"];

function resolveUrl(href: string, baseUrl: string): string | null {
  const trimmed = href.trim();
  if (!trimmed || IGNORED_HREF_PREFIXES.some((prefix) => trimmed.startsWith(prefix))) {
    return null;
  }
  try {
    return new URL(trimmed, baseUrl).href;
  } catch {
    return null;
  }
}

/**
 * Extracts structured, plain-data content from raw HTML. `baseUrl` is the
 * page's final URL (post-redirects), used to resolve relative hrefs and
 * the canonical <link> into absolute URLs.
 */
export function parseHtml(html: string, baseUrl: string): ExtractedContent {
  const $ = cheerio.load(html);

  // JSON-LD must be extracted BEFORE non-content elements are removed —
  // it lives inside <script> tags, which the next step strips. Extracting
  // first and removing second (the original Phase 2 code did this in the
  // wrong order, silently making jsonLd always empty) fixes that.
  const jsonLd: unknown[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).contents().text();
    try {
      jsonLd.push(JSON.parse(raw));
    } catch {
      // Malformed JSON-LD is common in the wild — skip that block rather
      // than fail the entire extraction over it.
    }
  });

  $(NON_CONTENT_SELECTORS).remove();

  const title = $("title").first().text().trim() || null;

  const metaDescription =
    $('meta[name="description"]').attr("content")?.trim() ||
    $('meta[property="og:description"]').attr("content")?.trim() ||
    null;

  const canonicalHref = $('link[rel="canonical"]').attr("href")?.trim();
  const canonicalUrl = canonicalHref ? resolveUrl(canonicalHref, baseUrl) : null;

  const headings: ExtractedHeading[] = [];
  $("h1, h2, h3, h4, h5, h6").each((_, el) => {
    const level = Number(el.tagName.slice(1));
    if (Number.isInteger(level)) {
      headings.push({ level, text: $(el).text() });
    }
  });

  const links: ExtractedLink[] = [];
  $("a[href]").each((_, el) => {
    const hrefAttr = $(el).attr("href") ?? "";
    const resolved = resolveUrl(hrefAttr, baseUrl);
    if (resolved) {
      links.push({ href: resolved, text: $(el).text() });
    }
  });

  // Phase 5 addition: list-item text, extracted the same mechanical way
  // as headings/links (raw text only — deciding which list items "look
  // like a feature" is extractFeatures.ts's job, not the parser's).
  const listItems: string[] = [];
  $("li").each((_, el) => {
    const text = $(el).text().trim();
    if (text) listItems.push(text);
  });

  // Removing script/style/noscript/template/svg above (which happens
  // before this point) is exactly what keeps script contents, CSS rules,
  // and inert markup out of visible text — nothing extra needed here.
  //
  // Phase 4/5 infra fix: cheerio's .text() is a plain textContent-style
  // concatenation (like domutils' getText) — it does NOT insert line
  // breaks between block-level elements the way a browser's rendered
  // "innerText" would. Compact/minified HTML with no whitespace between
  // tags would flatten the entire page into one run-on line. That was
  // harmless for Phase 2/2.1 (hashing/diffing only need the same content
  // to produce the same output, not any particular line structure), but
  // pricing/feature extraction anchor a price or feature name to the
  // *nearest preceding heading line* — which requires headings to
  // actually be on their own line. Inserting a newline after every
  // block-level element makes line structure reflect document structure
  // regardless of source formatting. This mutates the live tree, but only
  // after title/headings/links/listItems above have already read what
  // they needed from it, and nothing reads from `$` again afterward
  // except the final `.text()` call below — so the mutation is safe
  // without needing to clone the tree first. Not a bug fix (nothing
  // upstream depended on line structure before); a new correctness
  // requirement Phase 4/5 introduced.
  const BLOCK_LEVEL_SELECTORS =
    "p, div, h1, h2, h3, h4, h5, h6, li, tr, blockquote, section, article, header, footer, table, br";
  $(BLOCK_LEVEL_SELECTORS).after("\n");
  const visibleText = $("body").text();

  return { title, metaDescription, canonicalUrl, headings, visibleText, links, listItems, jsonLd };
}

const SPA_SHELL_MARKERS = [
  /id=["']root["']/i,
  /id=["']app["']/i,
  /you (?:need to )?enable javascript/i,
  /<noscript>/i,
];

/**
 * Best-effort heuristic, not authoritative (documented as such per
 * 04_DEVELOPMENT_RULES #8 — avoid false precision): flags a page as likely
 * needing JS rendering when it has very little visible text relative to a
 * substantial HTML payload, or contains common SPA-shell markers alongside
 * thin visible text. False positives/negatives are expected on some sites;
 * this only sets Snapshot.renderRequired, it never blocks or fails a scrape.
 */
export function looksLikeRenderRequired(html: string, extracted: ExtractedContent): boolean {
  const textLength = extracted.visibleText.trim().length;
  if (html.length > 2000 && textLength < 200) {
    return true;
  }
  return SPA_SHELL_MARKERS.some((pattern) => pattern.test(html)) && textLength < 500;
}
