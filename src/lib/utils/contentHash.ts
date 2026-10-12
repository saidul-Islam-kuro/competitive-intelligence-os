/**
 * Builds the canonical, hashable string from a NormalizedContent object and
 * hashes it with SHA-256.
 *
 * The canonical string concatenates every field that should count toward
 * "did this source meaningfully change" — title, meta description,
 * canonical URL, headings, visible text, links, list items, and structured
 * data — each in a clearly delimited section, in a fixed field order.
 * Fixed order and explicit delimiters matter: two different (field, value)
 * combinations must never be able to concatenate into the same string.
 *
 * List items (Phase 5 addition) matter here for a concrete correctness
 * reason, not just symmetry with the other fields: extraction pipelines
 * (pricing, features) are gated on `contentChanged` to avoid redundant
 * work (see scrapeSource.ts). If list items — which is exactly where
 * feature extraction looks — could change without the hash changing,
 * feature extraction would be silently skipped on a real content change.
 *
 * No timestamps, request IDs, durations, or any other volatile value ever
 * enters this string — only content that normalizeContent() has already
 * deterministically normalized.
 */
import { createHash } from "node:crypto";
import type { NormalizedContent } from "../normalizer/normalizeContent";

const FIELD_SEP = "\u0000\u0000";

export function buildCanonicalRepresentation(content: NormalizedContent): string {
  return [
    `title:${content.title ?? ""}`,
    `description:${content.metaDescription ?? ""}`,
    `canonical:${content.canonicalUrl ?? ""}`,
    `headings:${content.headings.map((h) => `${h.level}|${h.text}`).join("\n")}`,
    `text:${content.normalizedText}`,
    `links:${content.links.map((l) => `${l.href}|${l.text}`).join("\n")}`,
    `listItems:${content.listItems.join("\n")}`,
    `structuredData:${JSON.stringify(content.structuredData)}`,
  ].join(FIELD_SEP);
}

export function hashCanonicalString(canonical: string): string {
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

/** Convenience: normalizeContent() output straight to a content hash. */
export function hashNormalizedContent(content: NormalizedContent): string {
  return hashCanonicalString(buildCanonicalRepresentation(content));
}
