// Money helpers for the services screen. The backend stores money in integer
// CENTS (price_cents / deposit_cents); the UI shows and edits dollars. Kept in a
// leaf module (no React) so both the screen and its tests can pin the conversion.
// `lang` picks the wording and separators; it defaults to English for screens not yet translated.
import shared from "../i18n/shared";
import { formatNumber } from "../i18n/lib/format";

// Format integer cents as "$12.50" (en) or "$ 12,50" (es). null/undefined → em-dash.
export function centsToCurrency(cents, lang = "en") {
  if (cents == null) return "—";
  if (lang !== "es") return `$${(cents / 100).toFixed(2)}`;
  const options = { minimumFractionDigits: 2, maximumFractionDigits: 2 };
  return `$ ${formatNumber(cents / 100, lang, options)}`;
}

// Seed a currency text input from stored cents. null/undefined → "" (so an
// untouched field diffs cleanly and the placeholder shows).
export function centsToInput(cents) {
  if (cents == null) return "";
  return (cents / 100).toFixed(2);
}

// Parse a dollars text input into integer cents. Returns:
//   { cents: undefined }            for a blank input (field omitted)
//   { cents: <non-negative int> }   for a valid amount
//   { error: <message> }            for anything else
// Mirrors invalidServiceFields server-side (non-negative integer cents).
export function dollarsToCents(raw, lang = "en") {
  const str = String(raw ?? "").trim().replace(/^\$/, "");
  if (str === "") return { cents: undefined };
  const value = Number(str);
  if (!Number.isFinite(value) || value < 0) {
    return { error: shared[lang].inputs.invalidAmount };
  }
  return { cents: Math.round(value * 100) };
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
