import { test } from "node:test";
import assert from "node:assert/strict";
import { parseLimit, parseDate, parseRating, parseOneOf, dateRange } from "./queryParams";
import { ValidationError } from "../errors";

test("parseLimit: defaults when absent, parses valid values", () => {
  assert.equal(parseLimit(undefined, 50), 25);
  assert.equal(parseLimit("10", 50), 10);
});

test("BOUNDED PAGINATION: an oversize limit is clamped to the max, never honored", () => {
  assert.equal(parseLimit("99999", 50), 50);
  assert.equal(parseLimit("51", 50), 50);
});

test("parseLimit: the default itself never exceeds a smaller max", () => {
  assert.equal(parseLimit(undefined, 10), 10);
});

test("parseLimit: rejects zero, negative, non-numeric, and non-string input", () => {
  for (const bad of ["0", "-5", "abc", "", ["1", "2"], {}]) {
    assert.throws(() => parseLimit(bad, 50), ValidationError, `expected ${JSON.stringify(bad)} to be rejected`);
  }
});

test("parseLimit: fractional limits are floored", () => {
  assert.equal(parseLimit("7.9", 50), 7);
});

test("parseDate: valid ISO date parses; invalid and non-string reject", () => {
  assert.equal(parseDate("2026-01-02T00:00:00Z", "from")?.toISOString(), "2026-01-02T00:00:00.000Z");
  assert.equal(parseDate(undefined, "from"), undefined);
  assert.throws(() => parseDate("not-a-date", "from"), ValidationError);
  assert.throws(() => parseDate(["2026-01-01"], "from"), ValidationError);
});

test("parseRating: accepts 0..5, rejects out-of-range, empty, and non-numeric", () => {
  assert.equal(parseRating("4.5", "minRating"), 4.5);
  assert.equal(parseRating("0", "minRating"), 0);
  assert.equal(parseRating(undefined, "minRating"), undefined);
  for (const bad of ["6", "-1", "abc", ""]) assert.throws(() => parseRating(bad, "minRating"), ValidationError);
});

test("parseOneOf: accepts allowed values, rejects others with the allowed list in the message", () => {
  const allowed = ["POSITIVE", "NEGATIVE"] as const;
  assert.equal(parseOneOf("POSITIVE", allowed, "sentiment"), "POSITIVE");
  assert.equal(parseOneOf(undefined, allowed, "sentiment"), undefined);
  assert.throws(() => parseOneOf("positive", allowed, "sentiment"), /POSITIVE, NEGATIVE/);
  assert.throws(() => parseOneOf(["POSITIVE"], allowed, "sentiment"), ValidationError);
});

test("dateRange: builds gte/lte, rejects from > to, returns undefined when neither given", () => {
  assert.deepEqual(dateRange(new Date("2026-01-01"), new Date("2026-02-01")), {
    gte: new Date("2026-01-01"),
    lte: new Date("2026-02-01"),
  });
  assert.deepEqual(dateRange(new Date("2026-01-01"), undefined), { gte: new Date("2026-01-01") });
  assert.equal(dateRange(undefined, undefined), undefined);
  assert.throws(() => dateRange(new Date("2026-03-01"), new Date("2026-01-01")), ValidationError);
});

test("DATE BOUNDARIES: from/to are inclusive of the exact boundary instants", () => {
  const range = dateRange(new Date("2026-01-01T00:00:00Z"), new Date("2026-01-31T23:59:59Z"));
  assert.ok(range?.gte && range?.lte);
  assert.equal(range?.gte?.toISOString(), "2026-01-01T00:00:00.000Z");
  assert.equal(range?.lte?.toISOString(), "2026-01-31T23:59:59.000Z");
});
