// The ONE place the web app and the API read a number a person typed. Never read such a value with parseFloat(),
// Number() or parseInt(): "12,5" becomes 12, NaN or 125, and Postgres rejects it.
//
// The apps share no package; the mobile twin is apps/mobile/src/utils/decimal.js. The separator rules below are also
// the money rules (app/provider/lib/money.js).
//   - Both "." and "," typed: the LAST one is the decimal separator, followed by 1 or 2 digits; the other one must
//     group thousands.
//   - One separator, once, followed by 1 or 2 digits: it is the decimal separator, because it cannot group thousands.
//   - One separator, once, followed by 3 digits: thousands only if it is the writer's thousands separator, otherwise
//     (or when the language is unknown) ambiguous → invalid.
//   - One separator repeated: it can only group thousands.
//   - Thousands groups are 1-3 digits (not starting with 0) then exactly 3 each.
//   - Anything else ("12,", "12.555", "0.500") is invalid. Nothing is ever rounded, cut off or stripped.

// Heaviest plausible dog (the record is about 155 kg). Also well inside the numeric(5,2) weight columns.
export const WEIGHT_MAX = { kg: 160, lbs: 350 };
export const DISTANCE_MAX = 100;
// Postgres int4.
export const INT_MAX = 2147483647;
// The most a price can be, in cents: $999.999.999.999,99. Cents columns are bigint (0162) and JavaScript counts exactly
// well past this. The app's twin is MAX_CENTS in apps/mobile/src/utils/money.js.
export const MAX_PRICE_CENTS = 99999999999999;
// A whole number of cents within that limit.
export const isPriceCents = (value) => Number.isInteger(value) && value >= 0 && value <= MAX_PRICE_CENTS;

const isGrouped = (text, separator) =>
  new RegExp(`^[1-9]\\d{0,2}(\\${separator}\\d{3})+$`).test(text);

// "1.234,5" → ["1234", "5"]; null when the text has no single reading. `thousandsSeparator` is null when the
// writer's language is unknown.
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

// A whole-number form field: digits only. "1,5" and "1.000" are refused rather than read as 1.
// { value: undefined } when blank, { value } within min..max, else { invalid: true }.
export function parseWholeNumber(raw, { min = 0, max = INT_MAX } = {}) {
  const text = String(raw ?? "").trim();
  if (text === "") return { value: undefined };
  const value = /^\d+$/.test(text) ? Number(text) : NaN;
  return value >= min && value <= max ? { value } : { invalid: true };
}

const isBlank = (raw) => raw === undefined || raw === null || (typeof raw === "string" && raw.trim() === "");

// --- values arriving at the API ----------------------------------------------------------------------------------
// App builds already installed send a field either as a JSON number or as the text typed in it, and the server does
// not know their language, so only text with a single reading in both languages is accepted.
// Each returns { value: null } when blank, { value } when valid, else { invalid: true }.

// A decimal measurement within 0..max. `maxDecimals` limits a JSON number too (typed values, which the column would
// otherwise round); leave it out for machine values such as a GPS distance.
export function readClientDecimal(raw, { max, maxDecimals } = {}) {
  if (isBlank(raw)) return { value: null };
  let value = NaN;
  if (typeof raw === "number") {
    const scale = 10 ** (maxDecimals ?? 0);
    const exact = maxDecimals === undefined || Math.abs(raw * scale - Math.round(raw * scale)) < 1e-6;
    if (exact) value = raw;
  } else if (typeof raw === "string") {
    const parts = splitTypedNumber(raw.trim(), null);
    if (parts) value = Number(`${parts[0]}.${parts[1] || "0"}`);
  }
  return value >= 0 && value <= max ? { value } : { invalid: true };
}

// The limit a weight in `unit` is checked against: "kg", else pounds (the unit the routes store by default).
export function weightLimit(unit) {
  const key = String(unit ?? "").trim().toLowerCase() === "kg" ? "kg" : "lbs";
  return { max: WEIGHT_MAX[key], unit: key };
}

// A pet's weight in `unit`: more than 0 and plausible.
export function readClientWeight(raw, unit) {
  const read = readClientDecimal(raw, { max: weightLimit(unit).max, maxDecimals: 2 });
  return read.value === 0 ? { invalid: true } : read;
}

// A whole number for an integer column. `min` may be negative.
export function readClientInteger(raw, { min = 0, max = INT_MAX } = {}) {
  if (isBlank(raw)) return { value: null };
  const value =
    typeof raw === "number" ? raw : typeof raw === "string" && /^-?\d+$/.test(raw.trim()) ? Number(raw) : NaN;
  return Number.isInteger(value) && value >= min && value <= max ? { value } : { invalid: true };
}
