/**
 * Deterministic review text normalization. Much lighter-touch than page
 * content normalization (normalizeContent.ts) — a review's wording is the
 * evidence itself, so this never rewrites or rewords, only cleans up
 * incidental formatting noise:
 *
 * - Unicode NFC normalization (canonical composition — meaning-preserving).
 * - Line-ending normalization (\r\n/\r -> \n).
 * - Whitespace: horizontal runs collapsed, but paragraph breaks
 *   (consecutive blank lines) are preserved as a single blank line —
 *   multi-paragraph reviews keep their structure, unlike page text which
 *   collapses blank lines entirely.
 * - Repeated punctuation capped at 3 ("!!!!!" -> "!!!", "......" -> "...")
 *   — keeps emphasis without an unbounded run; never changes words.
 * - Oversized content is truncated with a visible marker (same spirit as
 *   normalizeContent.ts's capping — bounded storage, no silent data loss).
 */

export const MAX_REVIEW_BODY_LENGTH = 20_000;

function normalizeLineEndings(value: string): string {
  return value.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function collapseHorizontalWhitespace(value: string): string {
  return value.replace(/[ \t]+/g, " ");
}

function capRepeatedPunctuation(value: string): string {
  return value.replace(/([!?.,])\1{3,}/g, "$1$1$1");
}

export interface NormalizedReviewText {
  body: string;
  isEmpty: boolean;
  truncated: boolean;
}

export function normalizeReviewText(raw: string): NormalizedReviewText {
  let text = raw.normalize("NFC");
  text = normalizeLineEndings(text);
  text = text
    .split("\n")
    .map((line) => collapseHorizontalWhitespace(line).trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  text = capRepeatedPunctuation(text);

  const truncated = text.length > MAX_REVIEW_BODY_LENGTH;
  if (truncated) {
    text = `${text.slice(0, MAX_REVIEW_BODY_LENGTH)}\n…[truncated at ${MAX_REVIEW_BODY_LENGTH} characters]`;
  }

  return { body: text, isEmpty: text.length === 0, truncated };
}
