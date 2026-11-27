// Money helpers for the provider panel: the ONE place that reads a typed amount and the one that writes it back.
// The backend stores money in integer CENTS (price_cents / deposit_cents …); the UI shows and edits units. Kept in a
// leaf module (no React) so both the screens and their tests can pin the conversion.
// `lang` picks the wording and separators; it defaults to English for screens not yet translated.
//
// Never read a money field with parseFloat() or Number(): "49,90" becomes 49 or NaN. Use dollarsToCents().
//
// How a typed amount is read (es-AR: decimal ",", thousands "."; en-US: decimal ".", thousands ","):
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
import shared from "../i18n/shared";
import { formatNumber } from "../i18n/lib/format";

const THOUSANDS = { es: ".", en: "," };
// provider money columns are Postgres int4.
const MAX_CENTS = 2147483647;

const isGrouped = (text, separator) =>
  new RegExp(`^[1-9]\\d{0,2}(\\${separator}\\d{3})+$`).test(text);

// "1.234,5" → ["1234", "5"]; null when the text has no single reading.
function splitAmount(text, lang) {
  if (!/^[\d.,]+$/.test(text)) return null;
  const hasDot = text.includes(".");
  const hasComma = text.includes(",");
  if (hasDot && hasComma) {
    const decimal = text.lastIndexOf(".") > text.lastIndexOf(",") ? "." : ",";
    const group = decimal === "." ? "," : ".";
    const [whole, fraction, ...rest] = text.split(decimal);
    if (rest.length || !/^\d{1,2}$/.test(fraction) || !isGrouped(whole, group)) return null;
    return [whole.split(group).join(""), fraction];
  }
  if (!hasDot && !hasComma) return [text, ""];

  const separator = hasDot ? "." : ",";
  const pieces = text.split(separator);
  if (pieces.length === 2 && /^\d{1,2}$/.test(pieces[1])) {
    return [pieces[0] || "0", pieces[1]];
  }
  const thousands = pieces.length > 2 || separator === (THOUSANDS[lang] ?? THOUSANDS.en);
  return thousands && isGrouped(text, separator) ? [pieces.join(""), ""] : null;
}

// Format integer cents as "$12.50" (en) or "$ 12,50" (es). null/undefined → em-dash.
export function centsToCurrency(cents, lang = "en") {
  if (cents == null) return "—";
  if (lang !== "es") return `$${(cents / 100).toFixed(2)}`;
  const options = { minimumFractionDigits: 2, maximumFractionDigits: 2 };
  return `$ ${formatNumber(cents / 100, lang, options)}`;
}

// Seed a currency text input from stored cents: "12.50" (en) / "12,50" (es). null/undefined → "" (so an
// untouched field diffs cleanly and the placeholder shows).
export function centsToInput(cents, lang = "en") {
  if (cents == null) return "";
  const text = (cents / 100).toFixed(2);
  return lang === "es" ? text.replace(".", ",") : text;
}

// A price proposed by a file import, written the way the viewer types it. Text is kept as it is in the file. A
// spreadsheet NUMBER cell has no separators of its own, so it gets this language's; one with more than two decimals
// keeps them all, so the field rejects it instead of reading "1.234" as one thousand.
export function importedPriceToInput(value, lang = "en") {
  if (value == null) return "";
  if (typeof value !== "number") return String(value);
  const cents = value * 100;
  if (Math.abs(cents - Math.round(cents)) < 1e-6) return centsToInput(Math.round(cents), lang);
  return lang === "es" ? String(value).replace(".", ",") : String(value);
}

// Parse a typed amount into integer cents (rules at the top of this file). Returns:
//   { cents: undefined }            for a blank input (field omitted)
//   { cents: <non-negative int> }   for a valid amount
//   { error: <message> }            for anything else
// Mirrors invalidServiceFields server-side (non-negative integer cents).
export function dollarsToCents(raw, lang = "en") {
  const trimmed = String(raw ?? "").trim();
  if (trimmed === "") return { cents: undefined };
  const parts = splitAmount(trimmed.replace(/^\$/, "").trim(), lang);
  // Built from the digits, so there is no floating-point rounding.
  const cents = parts ? Number(parts[0]) * 100 + Number(parts[1].padEnd(2, "0")) : NaN;
  if (!(cents <= MAX_CENTS)) {
    return { error: shared[lang].inputs.invalidAmount };
  }
  return { cents };
}

// Parse a minutes text input into a positive integer. Returns the same shape as
// dollarsToCents. Mirrors invalidServiceFields (positive integer minutes).
export function parseDurationMin(raw, lang = "en") {
  const str = String(raw ?? "").trim();
  if (str === "") return { value: undefined };
  if (!/^\d+$/.test(str) || Number(str) <= 0) {
    return { error: shared[lang].inputs.invalidMinutes };
  }
  return { value: Number(str) };
}
