/**
 * A deliberately basic, deterministic diff: counts occurrences of each
 * distinct normalized line in the old and new text, then reports lines
 * whose count increased ("added", that many extra times) or decreased
 * ("removed", that many fewer times).
 *
 * This is a multiset (bag) comparison, not a positional/LCS diff. Two
 * consequences worth being explicit about:
 * - A line that moved to a different position with no other change is NOT
 *   reported as added/removed (its count is unchanged) — the content hash
 *   still changes in that case (order is part of the hashed text), so
 *   "content changed" is still correctly detected; this module just won't
 *   describe *what* changed beyond "reordered, no line-count differences".
 * - Correctly handles a line that appears multiple times: going from two
 *   copies to one copy of the same line is reported as one line removed,
 *   not a false "no change" (a plain set-difference would miss this).
 *
 * This intentionally does not attempt sentence-level, word-level, or
 * semantic diffing — that's out of scope for Phase 2 (02_INTELLIGENCE_
 * ENGINE.md's "basic structural/text level" ask), and no classification
 * ("pricing changed", "feature added") is derived from it here.
 */

export interface LineDiff {
  added: string[];
  removed: string[];
  addedCount: number;
  removedCount: number;
  truncated: boolean;
}

const MAX_STORED_LINES = 200;

function countLines(text: string): Map<string, number> {
  const counts = new Map<string, number>();
  if (text.length === 0) return counts;
  for (const line of text.split("\n")) {
    counts.set(line, (counts.get(line) ?? 0) + 1);
  }
  return counts;
}

export function diffLines(oldText: string, newText: string): LineDiff {
  const oldCounts = countLines(oldText);
  const newCounts = countLines(newText);

  const added: string[] = [];
  const removed: string[] = [];
  let addedCount = 0;
  let removedCount = 0;

  const allLines = new Set([...oldCounts.keys(), ...newCounts.keys()]);
  for (const line of allLines) {
    const oldCount = oldCounts.get(line) ?? 0;
    const newCount = newCounts.get(line) ?? 0;
    if (newCount > oldCount) {
      addedCount += newCount - oldCount;
      added.push(line);
    } else if (oldCount > newCount) {
      removedCount += oldCount - newCount;
      removed.push(line);
    }
  }

  // Deterministic ordering: Set iteration order above already follows
  // first-insertion order (old lines first, in old's order, then any
  // new-only lines in new's order), which is stable given fixed inputs —
  // but sort explicitly so output never depends on Map/Set implementation
  // details, only on content.
  added.sort();
  removed.sort();

  const truncated = added.length > MAX_STORED_LINES || removed.length > MAX_STORED_LINES;

  return {
    added: added.slice(0, MAX_STORED_LINES),
    removed: removed.slice(0, MAX_STORED_LINES),
    addedCount,
    removedCount,
    truncated,
  };
}

/** Plain-language, non-semantic summary — counts only, no interpretation. */
export function summarizeDiff(diff: LineDiff): string {
  if (diff.addedCount === 0 && diff.removedCount === 0) {
    return "Content changed (reordered or restructured) with no line-count differences detected.";
  }
  const parts: string[] = [];
  if (diff.addedCount > 0) parts.push(`${diff.addedCount} line(s) added`);
  if (diff.removedCount > 0) parts.push(`${diff.removedCount} line(s) removed`);
  return `Content changed: ${parts.join(", ")}.`;
}
