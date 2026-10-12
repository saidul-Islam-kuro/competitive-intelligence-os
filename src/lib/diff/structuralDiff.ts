/**
 * REGRESSION FIX (Phase 2.1): Phase 2's Change records were built from
 * `diffLines(previousSnapshot.normalizedText, normalized.normalizedText)`
 * alone — comparing visible text only. But `contentHash` (contentHash.ts)
 * is computed over title + description + canonicalUrl + headings + text +
 * links + structuredData. A title-only change (visible text identical)
 * would correctly flip `contentChanged` to true, correctly create a
 * Change record — but that Change's `diff` would show zero added/removed
 * lines, and its summary would claim "no line differences", which is
 * simply wrong: something the hash-comparison already knows changed.
 *
 * This module compares every field that participates in the hash, so the
 * diff a Change record carries is always consistent with *why* the hash
 * differed. It's also exactly the {field, operation, before, after}
 * structure Phase 3 asks for, deliberately reused rather than building a
 * second, different shape for the same underlying comparison.
 *
 * Still no semantic classification here — "the title changed" is a fact
 * about the page, not a claim about what it means.
 */
import type { NormalizedContent, ExtractedHeading, ExtractedLink } from "../normalizer/normalizeContent";
import { diffLines, type LineDiff } from "./textDiff";

export type FieldOperation = "added" | "removed" | "changed";
export type DiffField = "title" | "description" | "canonicalUrl" | "heading" | "link" | "listItem" | "structuredData";

export interface FieldChange {
  field: DiffField;
  operation: FieldOperation;
  before: string | null;
  after: string | null;
}

export interface StructuralDiff {
  fields: FieldChange[];
  fieldsTruncated: boolean;
  text: LineDiff;
  hasChanges: boolean;
}

const MAX_FIELD_VALUE_LENGTH = 300;
const MAX_FIELD_CHANGES = 200;

function truncateValue(value: string): string {
  return value.length > MAX_FIELD_VALUE_LENGTH ? `${value.slice(0, MAX_FIELD_VALUE_LENGTH)}…` : value;
}

function scalarFieldChange(
  field: "title" | "description" | "canonicalUrl",
  before: string | null,
  after: string | null,
): FieldChange | null {
  if (before === after) return null;
  const operation: FieldOperation = !before ? "added" : !after ? "removed" : "changed";
  return {
    field,
    operation,
    before: before ? truncateValue(before) : null,
    after: after ? truncateValue(after) : null,
  };
}

function headingsToLines(headings: ExtractedHeading[]): string {
  return headings.map((h) => `H${h.level}: ${h.text}`).join("\n");
}

function linksToLines(links: ExtractedLink[]): string {
  return links.map((l) => `${l.href} | ${l.text}`).join("\n");
}

/** Converts a text-level line diff into field-scoped added/removed entries. */
function listFieldChanges(
  field: "heading" | "link" | "listItem",
  beforeLines: string,
  afterLines: string,
): FieldChange[] {
  const diff = diffLines(beforeLines, afterLines);
  const changes: FieldChange[] = [];
  for (const line of diff.added) {
    changes.push({ field, operation: "added", before: null, after: truncateValue(line) });
  }
  for (const line of diff.removed) {
    changes.push({ field, operation: "removed", before: truncateValue(line), after: null });
  }
  return changes;
}

/**
 * Compares two NormalizedContent snapshots field by field. `before` is
 * null for a first-ever scrape (nothing to compare against) — callers
 * should not call this in that case (there's nothing meaningful to
 * report), but it's handled safely regardless.
 */
export function diffStructuredContent(before: NormalizedContent | null, after: NormalizedContent): StructuralDiff {
  const fields: FieldChange[] = [];

  const titleChange = scalarFieldChange("title", before?.title ?? null, after.title);
  if (titleChange) fields.push(titleChange);

  const descriptionChange = scalarFieldChange(
    "description",
    before?.metaDescription ?? null,
    after.metaDescription,
  );
  if (descriptionChange) fields.push(descriptionChange);

  const canonicalChange = scalarFieldChange("canonicalUrl", before?.canonicalUrl ?? null, after.canonicalUrl);
  if (canonicalChange) fields.push(canonicalChange);

  fields.push(
    ...listFieldChanges("heading", headingsToLines(before?.headings ?? []), headingsToLines(after.headings)),
  );
  fields.push(...listFieldChanges("link", linksToLines(before?.links ?? []), linksToLines(after.links)));
  fields.push(
    ...listFieldChanges("listItem", (before?.listItems ?? []).join("\n"), after.listItems.join("\n")),
  );

  const beforeStructuredData = JSON.stringify(before?.structuredData ?? []);
  const afterStructuredData = JSON.stringify(after.structuredData);
  if (beforeStructuredData !== afterStructuredData) {
    fields.push({ field: "structuredData", operation: "changed", before: null, after: null });
  }

  const text = diffLines(before?.normalizedText ?? "", after.normalizedText);

  const fieldsTruncated = fields.length > MAX_FIELD_CHANGES;

  return {
    fields: fields.slice(0, MAX_FIELD_CHANGES),
    fieldsTruncated,
    text,
    hasChanges: fields.length > 0 || text.addedCount > 0 || text.removedCount > 0,
  };
}

function pluralize(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

/**
 * Deterministic, non-semantic human-readable summary — describes WHAT
 * changed structurally, never WHAT IT MEANS. Category-aware phrasing (e.g.
 * "Pricing page content changed.") is Phase 3's job (see
 * ../classification/classifyChange.ts), layered on top of this, not
 * replacing it.
 */
export function summarizeStructuralDiff(diff: StructuralDiff): string {
  const clauses: string[] = [];

  if (diff.fields.some((f) => f.field === "title")) clauses.push("Page title changed.");
  if (diff.fields.some((f) => f.field === "description")) clauses.push("Meta description changed.");
  if (diff.fields.some((f) => f.field === "canonicalUrl")) clauses.push("Canonical URL changed.");

  const headingsAdded = diff.fields.filter((f) => f.field === "heading" && f.operation === "added").length;
  const headingsRemoved = diff.fields.filter((f) => f.field === "heading" && f.operation === "removed").length;
  if (headingsAdded > 0) clauses.push(`${pluralize(headingsAdded, "heading")} added.`);
  if (headingsRemoved > 0) clauses.push(`${pluralize(headingsRemoved, "heading")} removed.`);

  if (diff.text.addedCount > 0 || diff.text.removedCount > 0) {
    const parts: string[] = [];
    if (diff.text.addedCount > 0) parts.push(`${pluralize(diff.text.addedCount, "line")} added`);
    if (diff.text.removedCount > 0) parts.push(`${pluralize(diff.text.removedCount, "line")} removed`);
    clauses.push(`Visible text: ${parts.join(", ")}.`);
  }

  const linksAdded = diff.fields.filter((f) => f.field === "link" && f.operation === "added").length;
  const linksRemoved = diff.fields.filter((f) => f.field === "link" && f.operation === "removed").length;
  if (linksAdded > 0) clauses.push(`${pluralize(linksAdded, "link")} added.`);
  if (linksRemoved > 0) clauses.push(`${pluralize(linksRemoved, "link")} removed.`);

  const itemsAdded = diff.fields.filter((f) => f.field === "listItem" && f.operation === "added").length;
  const itemsRemoved = diff.fields.filter((f) => f.field === "listItem" && f.operation === "removed").length;
  if (itemsAdded > 0) clauses.push(`${pluralize(itemsAdded, "list item")} added.`);
  if (itemsRemoved > 0) clauses.push(`${pluralize(itemsRemoved, "list item")} removed.`);

  if (diff.fields.some((f) => f.field === "structuredData")) clauses.push("Structured data changed.");

  if (clauses.length === 0) {
    return diff.hasChanges
      ? "Content changed (reordered or restructured) with no detected field differences."
      : "No meaningful content change detected.";
  }

  return clauses.join(" ");
}
