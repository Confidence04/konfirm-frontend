/**
 * Shared money-formatting helpers.
 *
 * All user-facing money values must go through these helpers so that amounts
 * render with locale-correct grouping and decimal conventions via
 * `Intl.NumberFormat`, instead of manual `toFixed(2)` + hardcoded "$".
 */

const USDC_CODE = "USDC";

/**
 * Format a monetary amount for display.
 *
 * - ISO 4217 currency codes (e.g. "USD", "EUR", "GBP") use
 *   `Intl.NumberFormat` with `style: "currency"`.
 * - USDC is not an ISO 4217 currency, so it is formatted as a decimal number
 *   with exactly two fraction digits and a manual " USDC" suffix.
 *
 * @param value    The amount to format (string or number).
 * @param currency The currency code (ISO 4217, or "USDC").
 * @param locale   Optional BCP 47 locale. Defaults to `undefined`, which lets
 *                 `Intl.NumberFormat` use the runtime/browser locale.
 * @returns The formatted amount string.
 */
export function formatAmount(
  value: string | number,
  currency: string,
  locale?: string
): string {
  const numeric = typeof value === "number" ? value : Number(value);
  const safeValue = Number.isFinite(numeric) ? numeric : 0;

  const code = (currency || "").trim().toUpperCase();

  if (code === USDC_CODE) {
    const formatted = new Intl.NumberFormat(locale, {
      style: "decimal",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(safeValue);
    return `${formatted} ${USDC_CODE}`;
  }

  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: code,
    }).format(safeValue);
  } catch {
    // Fall back to a plain decimal rendering if the currency code is invalid
    // for `Intl.NumberFormat` (e.g. malformed or unsupported code).
    const formatted = new Intl.NumberFormat(locale, {
      style: "decimal",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(safeValue);
    return code ? `${formatted} ${code}` : formatted;
  }
}

/**
 * Convenience wrapper for formatting USDC amounts.
 *
 * @param value  The amount to format (string or number).
 * @param locale Optional BCP 47 locale. Defaults to the runtime/browser locale.
 * @returns The formatted amount string with a " USDC" suffix.
 */
export function formatUsdc(
  value: string | number,
  locale?: string
): string {
  return formatAmount(value, USDC_CODE, locale);
}