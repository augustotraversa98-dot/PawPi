// The ONE module that reads typed numbers: weights, distances and whole-number fields here, money in utils/money.js
// (which uses the same separator rules). Never read a typed field with parseFloat(), Number(), parseInt() or a
// replace() that drops characters: "12,5" becomes 12, NaN or 125.
//
// The apps share no package; the web twin is apps/web/src/lib/decimal.js.
//
// How a typed decimal is read (es-AR: decimal ",", thousands "."; en-US: decimal ".", thousands ","):
//   - Both "." and "," typed: the LAST one is the decimal separator, followed by 1 or 2 digits; the other one must
//     group thousands.
//   - One separator, once, followed by 1 or 2 digits: it is the decimal separator in both languages, because it
//     cannot group thousands. "12,5" and "12.5" → 12.5.
//   - One separator, once, followed by 3 digits: thousands only if it is this language's thousands separator.
//     Otherwise ambiguous → invalid.
//   - One separator repeated: it can only group thousands.
//   - Thousands groups are 1-3 digits (not starting with 0) then exactly 3 each.
//   - Anything else ("12,", "12.555", "0.500") is invalid. Nothing is ever rounded, cut off or stripped.
// A measurement is then checked against what is plausible, so "12.500" (12 500 in Spanish) is refused, not saved.

import { getI18n } from "react-i18next";
import { normalizeWeightUnit } from "./weightUnitAlias";

// Heaviest plausible dog (the record is about 155 kg). Also well inside the numeric(5,2) weight columns.
export const WEIGHT_MAX = { kg: 160, lbs: 350 };
export const DISTANCE_MAX = 100;
export const WALK_MINUTES_MAX = 1440;
// Postgres int4.
const INT_MAX = 2147483647;

// The language whose separators apply: "en" or, like the rest of the app, Spanish.
export function inputLanguage(lang) {
  let active = lang;
  if (!active) {
    try {
      active = getI18n()?.language;
    } catch {
      active = null; // i18n not initialised (e.g. a unit test that mocks react-i18next)
    }
  }
  return String(active || "es").toLowerCase().startsWith("en") ? "en" : "es";
}

const isGrouped = (text, separator) =>
  new RegExp(`^[1-9]\\d{0,2}(\\${separator}\\d{3})+$`).test(text);

// "1.234,5" → ["1234", "5"]; null when the text has no single reading (rules above).
export function splitTypedNumber(text, thousandsSeparator) {
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
  const thousands = pieces.length > 2 || separator === thousandsSeparator;
  return thousands && isGrouped(text, separator) ? [pieces.join(""), ""] : null;
}

// Typed text → { value: undefined } when blank, { value } when it has one reading within 0..max, else { invalid: true }.
function parseDecimal(raw, max, lang) {
  const text = String(raw ?? "").trim();
  if (text === "") return { value: undefined };
  const parts = splitTypedNumber(text, inputLanguage(lang) === "es" ? "." : ",");
  const value = parts ? Number(`${parts[0]}.${parts[1] || "0"}`) : NaN;
  return value <= max ? { value } : { invalid: true };
}

// A dog's weight in `unit` ("kg", else pounds). A refusal carries `max` and `unit` for the message
// t("common.invalidWeight", { max, unit }).
export function parseWeight(raw, unit, lang) {
  const key = normalizeWeightUnit(unit) === "kg" ? "kg" : "lbs";
  const max = WEIGHT_MAX[key];
  const parsed = parseDecimal(raw, max, lang);
  return parsed.invalid || parsed.value === 0 ? { invalid: true, max, unit: key } : parsed;
}

// A walk distance (0 is a real answer). Message: t("common.invalidDistance", { max: DISTANCE_MAX }).
export function parseDistance(raw, lang) {
  return parseDecimal(raw, DISTANCE_MAX, lang);
}

// A whole-number field: digits only. "1,5" and "1.000" are refused rather than read as 1.
export function parseWholeNumber(raw, { min = 0, max = INT_MAX } = {}) {
  const text = String(raw ?? "").trim();
  if (text === "") return { value: undefined };
  const value = /^\d+$/.test(text) ? Number(text) : NaN;
  return value >= min && value <= max ? { value } : { invalid: true };
}

// A stored number (12.5, or the database's "12.50") written the way the viewer types it, for a text field or a label.
export function decimalToInput(value, lang) {
  if (value === null || value === undefined || value === "") return "";
  const number = Number(value);
  if (!Number.isFinite(number)) return String(value);
  const text = String(number);
  return inputLanguage(lang) === "es" ? text.replace(".", ",") : text;
}
