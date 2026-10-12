import { test } from "node:test";
import assert from "node:assert/strict";
import { parsePriceNumber } from "./parseNumber";

test("parsePriceNumber: parses plain integers and decimals", () => {
  assert.equal(parsePriceNumber("10"), 10);
  assert.equal(parsePriceNumber("49.99"), 49.99);
  assert.equal(parsePriceNumber("0"), 0);
});

test("parsePriceNumber: parses US/UK-style thousands separators", () => {
  assert.equal(parsePriceNumber("1,234"), 1234);
  assert.equal(parsePriceNumber("1,234.56"), 1234.56);
});

test("parsePriceNumber: rejects non-numeric or malformed input", () => {
  assert.equal(parsePriceNumber("abc"), null);
  assert.equal(parsePriceNumber(""), null);
  assert.equal(parsePriceNumber("$10"), null); // symbol stripping is the caller's job
  assert.equal(parsePriceNumber("10.99.99"), null);
});
