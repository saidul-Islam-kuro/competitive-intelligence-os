/**
 * Deterministic review identity, in priority order (Phase 6.3):
 * 1. external ID (when the platform provides a stable one)
 * 2. canonical/source URL (when the review has its own permalink)
 * 3. a content fingerprint (SHA-256 of author + normalized body +
 *    publishedAt) — the fallback when neither of the above exists.
 *
 * IMPORTANT: `Review.@@unique([reviewSourceId, externalId])` in the schema
 * does NOT, by itself, prevent duplicates when externalId is null —
 * Postgres treats every NULL as distinct from every other NULL in a
 * unique index, so two reviews with externalId=null would both be
 * accepted by that constraint alone. This module is what the persistence
 * layer uses to pick the RIGHT lookup for each review BEFORE relying on
 * any DB constraint, rather than assuming the constraint alone is enough
 * (exactly the trap Phase 6.3 warns against).
 */
import { createHash } from "node:crypto";

export type DedupKey =
  | { method: "externalId"; value: string }
  | { method: "canonicalUrl"; value: string }
  | { method: "fingerprint"; value: string };

export interface DedupInput {
  author: string | null;
  body: string;
  publishedAt: Date | null;
  externalId: string | null;
  sourceUrl: string | null;
}

export function computeFingerprint(input: Pick<DedupInput, "author" | "body" | "publishedAt">): string {
  const basis = [input.author ?? "", input.body.trim().toLowerCase(), input.publishedAt?.toISOString() ?? ""].join(
    "\u0000",
  );
  return createHash("sha256").update(basis, "utf8").digest("hex");
}

export function computeDedupKey(input: DedupInput): DedupKey {
  if (input.externalId && input.externalId.trim()) {
    return { method: "externalId", value: input.externalId.trim() };
  }
  if (input.sourceUrl && input.sourceUrl.trim()) {
    return { method: "canonicalUrl", value: input.sourceUrl.trim() };
  }
  return { method: "fingerprint", value: computeFingerprint(input) };
}
