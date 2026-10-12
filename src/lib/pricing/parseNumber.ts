/**
 * Parses a plain numeric price string like "10", "1,234.56", "49.99".
 *
 * Deliberately narrow: assumes '.' is the decimal separator and ',' is a
 * thousands separator (US/UK convention). European-style "1.234,56" is
 * NOT supported and will parse incorrectly if fed in raw. This is a
 * documented limitation, not a silent wrong answer — avoiding false
 * precision (04_DEVELOPMENT_RULES #8) means saying so rather than
 * pretending to handle full locale-aware number parsing.
 */
export function parsePriceNumber(raw: string): number | null {
  const cleaned = raw.trim().replace(/,/g, "");
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null;
  const value = Number.parseFloat(cleaned);
  return Number.isFinite(value) ? value : null;
}
