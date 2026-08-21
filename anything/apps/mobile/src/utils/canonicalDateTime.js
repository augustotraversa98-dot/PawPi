/**
 * Canonical date/time parsing + formatting for DateField/TimeField.
 *
 * Canonical wire formats (what we store / send to the API — Postgres `date`
 * columns and `routines.times text[]` must only ever receive these):
 *   dates: "YYYY-MM-DD"
 *   times: "HH:MM" (24h)
 *
 * Display formats (what the user sees — never shown raw):
 *   dates: "21 April 2025"
 *   times: device 12/24h preference, e.g. "8:00 PM" or "20:00"
 *
 * Parsing is tolerant of legacy stored values: "MM/DD/YYYY" (old typed
 * inputs), ISO datetime strings (date columns serialized through JSON),
 * and "HH:MM:SS" (Postgres `time` columns).
 */

import i18n from "@/i18n";

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

// Spanish month names for the localized display date. Kept local (not in the
// i18n catalog) so this low-level util has no catalog/init dependency in tests.
const MONTH_NAMES_ES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

function buildLocalDate(year, month, day) {
  const date = new Date(year, month - 1, day);
  // Round-trip check rejects overflow like 02/30
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date;
}

/**
 * Parse any supported date value into a local Date (at midnight), or null.
 * Accepts: Date, "YYYY-MM-DD", "MM/DD/YYYY", ISO datetime "YYYY-MM-DDT...".
 * Date-only strings are parsed as LOCAL dates (never via new Date(string),
 * which would treat them as UTC and shift the day in negative-offset zones).
 */
export function parseDateValue(value) {
  if (value instanceof Date) {
    return isNaN(value.getTime())
      ? null
      : new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }
  if (typeof value !== "string" || !value.trim()) return null;
  const str = value.trim();

  // YYYY-MM-DD, optionally followed by a time part (ISO datetime from JSON)
  let m = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/);
  if (m) return buildLocalDate(Number(m[1]), Number(m[2]), Number(m[3]));

  // Legacy MM/DD/YYYY
  m = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return buildLocalDate(Number(m[3]), Number(m[1]), Number(m[2]));

  return null;
}

/** Format a Date as canonical "YYYY-MM-DD" (local calendar date). */
export function toCanonicalDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Normalize any supported date value to canonical "YYYY-MM-DD",
 * or "" if empty/unparseable. Use when seeding form state from the API.
 */
export function canonicalizeDateValue(value) {
  const date = parseDateValue(value);
  return date ? toCanonicalDate(date) : "";
}

/**
 * Display format, localized by the active language:
 *   en → "21 April 2025"    es → "21 de abril de 2025"
 * Returns "" for empty/unparseable values.
 */
export function formatDisplayDate(value) {
  const date = parseDateValue(value);
  if (!date) return "";
  const day = date.getDate();
  const year = date.getFullYear();
  const lang = (i18n && i18n.language) || "en";
  if (lang.startsWith("es")) {
    return `${day} de ${MONTH_NAMES_ES[date.getMonth()]} de ${year}`;
  }
  return `${day} ${MONTH_NAMES[date.getMonth()]} ${year}`;
}

/** Date the picker should open on: the field's value if set, else today. */
export function initialPickerDate(value, now = new Date()) {
  return parseDateValue(value) || now;
}

/**
 * Parse a time string into { hours, minutes }, or null.
 * Accepts "HH:MM", "H:MM", and "HH:MM:SS" (Postgres `time` columns).
 */
export function parseTimeValue(value) {
  if (typeof value !== "string") return null;
  const m = value.trim().match(/^(\d{1,2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/);
  if (!m) return null;
  const hours = Number(m[1]);
  const minutes = Number(m[2]);
  if (hours > 23 || minutes > 59) return null;
  return { hours, minutes };
}

/** Format a Date (or {hours, minutes}) as canonical "HH:MM" (24h). */
export function toCanonicalTime(value) {
  const hours = value instanceof Date ? value.getHours() : value.hours;
  const minutes = value instanceof Date ? value.getMinutes() : value.minutes;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

/** Whether the device prefers a 12-hour clock. Defaults to 12h if unknown. */
export function uses12HourClock() {
  try {
    const opts = new Intl.DateTimeFormat(undefined, {
      hour: "numeric",
    }).resolvedOptions();
    if (typeof opts.hour12 === "boolean") return opts.hour12;
    if (opts.hourCycle)
      return opts.hourCycle === "h11" || opts.hourCycle === "h12";
  } catch (e) {
    // Intl unavailable — fall through to default
  }
  return true;
}

/**
 * Display format for a canonical/legacy time string, honoring the device
 * 12/24h preference: "8:00 PM" or "20:00". "" for empty/unparseable values.
 */
export function formatDisplayTime(value, hour12 = uses12HourClock()) {
  const time = parseTimeValue(value);
  if (!time) return "";
  const mm = String(time.minutes).padStart(2, "0");
  if (!hour12) return `${String(time.hours).padStart(2, "0")}:${mm}`;
  const suffix = time.hours < 12 ? "AM" : "PM";
  const h = time.hours % 12 === 0 ? 12 : time.hours % 12;
  return `${h}:${mm} ${suffix}`;
}

/** Date the time picker should open on: the field's value if set, else now. */
export function initialPickerTime(value, now = new Date()) {
  const time = parseTimeValue(value);
  if (!time) return now;
  const date = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  date.setHours(time.hours, time.minutes, 0, 0);
  return date;
}
