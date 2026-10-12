/**
 * Deliberately narrow, documented set — not a general i18n currency
 * library. A bare "$" is genuinely ambiguous across USD/CAD/AUD/etc.;
 * defaulting it to USD is a documented simplification (Dev Rule #8 —
 * avoid false precision means documenting this, not pretending to
 * resolve the ambiguity).
 */
export type CurrencyCode = "USD" | "EUR" | "GBP" | "JPY" | "INR" | "CAD" | "AUD";

const SYMBOL_TO_CURRENCY: Readonly<Record<string, CurrencyCode>> = {
  $: "USD",
  "€": "EUR",
  "£": "GBP",
  "¥": "JPY",
  "₹": "INR",
};

const KNOWN_CODES: readonly CurrencyCode[] = ["USD", "EUR", "GBP", "JPY", "INR", "CAD", "AUD"];

export function currencyFromSymbol(symbol: string): CurrencyCode | null {
  return SYMBOL_TO_CURRENCY[symbol] ?? null;
}

export function isKnownCurrencyCode(code: string): code is CurrencyCode {
  return (KNOWN_CODES as readonly string[]).includes(code.toUpperCase());
}

export function normalizeCurrencyCode(code: string): CurrencyCode | null {
  const upper = code.toUpperCase();
  return isKnownCurrencyCode(upper) ? (upper as CurrencyCode) : null;
}

/** Union of every symbol/code this module recognizes, for building regexes elsewhere. */
export const CURRENCY_SYMBOLS = Object.keys(SYMBOL_TO_CURRENCY);
export const CURRENCY_CODES: readonly CurrencyCode[] = KNOWN_CODES;
