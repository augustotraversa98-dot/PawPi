// One money module for the whole app: the ONE formatter, so the SAME price never renders two ways, and the ONE
// parser for typed amounts. Never read a money field with parseFloat() or Number(): "49,90" becomes 49 or NaN.
// Use parseMoneyToCents().
//
// PawPi launches in Argentina; the DB default currency is ARS. Argentine users read
// pesos as a bare "$" with es-AR grouping ("." for thousands, "," for decimals),
// e.g. $1.500 — an "ARS" prefix reads as foreign money. So ARS is shown as "$" and
// decimals are hidden when the amount is whole (the common case). A non-ARS currency
// is rare here (a provider could set USD); to stay unambiguous it keeps the ISO-code
// prefix ("USD 49.00"). Prices are integer cents; provider_services rows carry no
// currency column and fall back to the ARS default.
//
// Hermes-safe: no Intl/toLocaleString (grouping is done manually).

import { inputLanguage, splitTypedNumber } from "./decimal";

export function formatMoney(cents, currency = "ARS") {
  if (cents == null || Number.isNaN(cents)) return null;
  const code = (currency || "ARS").toUpperCase();
  const sign = cents < 0 ? "-" : "";
  const absCents = Math.abs(cents);
  const whole = Math.trunc(absCents / 100);
  const frac = absCents % 100;

  if (code === "ARS") {
    const grouped = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    const decimals = frac === 0 ? "" : `,${String(frac).padStart(2, "0")}`;
    return `${sign}$${grouped}${decimals}`;
  }

  // Non-ARS: keep the ISO code so a foreign price is never mistaken for pesos.
  const grouped = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${sign}${code} ${grouped}.${String(frac).padStart(2, "0")}`;
}

// --- typed amounts -----------------------------------------------------------------------------------------------
// How a typed amount is read (the separator rules live in utils/decimal.js, shared with weights and distances; the web
// panel's twin is app/provider/lib/money.js).
// es-AR: decimal ",", thousands "."; en-US: decimal ".", thousands ",".
//   - Surrounding spaces and one leading "$" are ignored. Anything else that is not a digit, "." or "," is invalid
//     (signs, letters, currency codes, spaces between digits).
//   - Both "." and "," typed: the LAST one is the decimal separator, followed by 1 or 2 digits; the other one must
//     group thousands. "1.234,56" and "1,234.56" mean the same in both languages.
//   - One separator, once, followed by 1 or 2 digits: it is the decimal separator in both languages, because it
//     cannot group thousands. "49,90" and "49.90" → 49.90.
//   - One separator, once, followed by 3 digits: thousands only if it is this language's thousands separator
//     ("1.234" in es, "1,234" in en → 1234). Otherwise ambiguous → invalid.
//   - One separator repeated: it can only group thousands ("1.234.567").
//   - Thousands groups are 1-3 digits (not starting with 0) then exactly 3 each.
//   - Anything else ("49,", "49.905", "0.500") is invalid. Nothing is ever rounded or cut off.

// $999.999.999.999,99 (cents columns are bigint). The server's twin is MAX_PRICE_CENTS in apps/web/src/lib/decimal.js.
const MAX_CENTS = 99999999999999;

// A typed amount → integer cents. `lang` defaults to the app's language. Returns:
//   { cents: undefined }          blank
//   { cents: <non-negative int> } a valid amount
//   { invalid: true }             anything else — show t("common.invalidAmount"), never guess
export function parseMoneyToCents(raw, lang) {
  const trimmed = String(raw ?? "").trim();
  if (trimmed === "") return { cents: undefined };
  const thousands = inputLanguage(lang) === "es" ? "." : ",";
  const parts = splitTypedNumber(trimmed.replace(/^\$/, "").trim(), thousands);
  // Built from the digits, so there is no floating-point rounding.
  const cents = parts ? Number(parts[0]) * 100 + Number(parts[1].padEnd(2, "0")) : NaN;
  return cents <= MAX_CENTS ? { cents } : { invalid: true };
}

// A NUMBER (a spreadsheet price proposed by an import) written the way the viewer types it, ready for a text field.
// More than two decimals are all kept, so the field rejects it instead of reading "1.234" as one thousand.
export function numberToMoneyInput(value, lang) {
  const cents = value * 100;
  const exact = Math.abs(cents - Math.round(cents)) < 1e-6;
  const text = exact ? (Math.round(cents) / 100).toFixed(2) : String(value);
  return inputLanguage(lang) === "es" ? text.replace(".", ",") : text;
}
