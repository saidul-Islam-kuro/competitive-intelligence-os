import { test } from "node:test";
import assert from "node:assert/strict";
import { diffLines, summarizeDiff } from "./textDiff";

test("diffLines: identical text produces no added/removed lines", () => {
  const result = diffLines("a\nb\nc", "a\nb\nc");
  assert.deepEqual(result.added, []);
  assert.deepEqual(result.removed, []);
  assert.equal(result.addedCount, 0);
  assert.equal(result.removedCount, 0);
});

test("diffLines: detects a simple added line", () => {
  const result = diffLines("a\nb", "a\nb\nc");
  assert.deepEqual(result.added, ["c"]);
  assert.deepEqual(result.removed, []);
  assert.equal(result.addedCount, 1);
});

test("diffLines: detects a simple removed line", () => {
  const result = diffLines("a\nb\nc", "a\nb");
  assert.deepEqual(result.removed, ["c"]);
  assert.equal(result.removedCount, 1);
});

test("diffLines: detects both additions and removals in one comparison", () => {
  const result = diffLines("a\nb\nc", "a\nx\nc");
  assert.deepEqual(result.added, ["x"]);
  assert.deepEqual(result.removed, ["b"]);
});

test("diffLines: pure reordering with no count changes reports nothing added/removed", () => {
  const result = diffLines("a\nb\nc", "c\nb\na");
  assert.deepEqual(result.added, []);
  assert.deepEqual(result.removed, []);
});

test("diffLines: duplicate-line count changes are detected correctly (not a plain set diff)", () => {
  const result = diffLines("a\na\nb", "a\nb");
  assert.deepEqual(result.removed, ["a"]);
  assert.equal(result.removedCount, 1);

  const result2 = diffLines("a\nb", "a\na\nb");
  assert.deepEqual(result2.added, ["a"]);
  assert.equal(result2.addedCount, 1);
});

test("diffLines: empty old text (first-ever scrape scenario) reports everything as added", () => {
  const result = diffLines("", "a\nb");
  assert.deepEqual(result.added.sort(), ["a", "b"]);
  assert.equal(result.addedCount, 2);
});

test("diffLines: is deterministic — same input always produces the same output", () => {
  const a = diffLines("a\nb\nc\nd", "a\nx\nc\ny");
  const b = diffLines("a\nb\nc\nd", "a\nx\nc\ny");
  assert.deepEqual(a, b);
});

test("diffLines: truncates very large diffs and flags truncation", () => {
  const oldText = Array.from({ length: 10 }, (_, i) => `old-${i}`).join("\n");
  const newText = Array.from({ length: 500 }, (_, i) => `new-${i}`).join("\n");
  const result = diffLines(oldText, newText);
  assert.equal(result.truncated, true);
  assert.ok(result.added.length <= 200);
});

test("summarizeDiff: produces a plain-language, non-semantic summary", () => {
  assert.equal(
    summarizeDiff({ added: ["x"], removed: [], addedCount: 1, removedCount: 0, truncated: false }),
    "Content changed: 1 line(s) added.",
  );
  assert.equal(
    summarizeDiff({ added: [], removed: ["y"], addedCount: 0, removedCount: 1, truncated: false }),
    "Content changed: 1 line(s) removed.",
  );
  assert.equal(
    summarizeDiff({ added: [], removed: [], addedCount: 0, removedCount: 0, truncated: false }),
    "Content changed (reordered or restructured) with no line-count differences detected.",
  );
});

test("summarizeDiff: never mentions pricing, features, or any semantic classification", () => {
  const summary = summarizeDiff({ added: ["$99/mo"], removed: [], addedCount: 1, removedCount: 0, truncated: false });
  for (const forbidden of ["pricing", "feature", "launch", "AI"]) {
    assert.ok(!summary.toLowerCase().includes(forbidden.toLowerCase()));
  }
});
