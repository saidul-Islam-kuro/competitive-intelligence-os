import { test } from "node:test";
import assert from "node:assert/strict";
import { currencyFromSymbol, isKnownCurrencyCode, normalizeCurrencyCode, CURRENCY_SYMBOLS } from "./currency";

test("currencyFromSymbol: maps known symbols", () => {
  assert.equal(currencyFromSymbol("$"), "USD");
  assert.equal(currencyFromSymbol("€"), "EUR");
  assert.equal(currencyFromSymbol("£"), "GBP");
  assert.equal(currencyFromSymbol("¥"), "JPY");
  assert.equal(currencyFromSymbol("₹"), "INR");
});

test("currencyFromSymbol: returns null for unknown symbols", () => {
  assert.equal(currencyFromSymbol("฿"), null);
  assert.equal(currencyFromSymbol("x"), null);
});

test("isKnownCurrencyCode / normalizeCurrencyCode: case-insensitive recognition", () => {
  assert.equal(isKnownCurrencyCode("usd"), true);
  assert.equal(isKnownCurrencyCode("USD"), true);
  assert.equal(isKnownCurrencyCode("xyz"), false);
  assert.equal(normalizeCurrencyCode("usd"), "USD");
  assert.equal(normalizeCurrencyCode("xyz"), null);
});

test("CURRENCY_SYMBOLS: exposes every recognized symbol for regex building elsewhere", () => {
  assert.ok(CURRENCY_SYMBOLS.includes("$"));
  assert.ok(CURRENCY_SYMBOLS.length >= 5);
});
