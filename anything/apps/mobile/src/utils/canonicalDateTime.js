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
 *   times: 24-hour "HH:MM" (never AM/PM)
 *
 * Parsing is tolerant of legacy stored values: "MM/DD/YYYY" (old typed
 * inputs), ISO datetime strings (date columns serialized through JSON),
 * and "HH:MM:SS" (Postgres `time` columns).
 */

// The raw i18next singleton (configured by src/i18n) — imported directly, not via
// "@/i18n", so this low-level util never triggers that module's init side-effect
// (which crashes tests that mock react-i18next). Reads i18n.language at call time.
import i18n from "i18next";

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

/** True for a real, finite Date instance (never an Invalid Date). */
export function isValidDate(value) {
  return value instanceof Date && Number.isFinite(value.getTime());
}

/**
 * "Epoch artifact": 1 Jan 1970 / 31 Dec 1969 (local calendar date). A timestamp of 0
 * (what null / "" / 0 / an Invalid Date turn into via new Date(x) or a native picker
 * default) lands on one of these two days depending on the time zone (UTC-3 shows
 * 31 Dec 1969). No pet-care date is ever legitimately on those two days, so they are
 * treated as "no date" everywhere: never displayed, never picked, never stored.
 */
export function isEpochArtifact(date) {
  if (!isValidDate(date)) return false;
  const y = date.getFullYear();
  const m = date.getMonth();
  const d = date.getDate();
  return (y === 1969 && m === 11 && d === 31) || (y === 1970 && m === 0 && d === 1);
}

/**
 * Parse any supported date value into a local Date (at midnight), or null.
 * Accepts: Date, "YYYY-MM-DD", "MM/DD/YYYY", ISO datetime "YYYY-MM-DDT...".
 * Date-only strings are parsed as LOCAL dates (never via new Date(string),
 * which would treat them as UTC and shift the day in negative-offset zones).
 * null / undefined / "" / 0 / numbers / Invalid Date / epoch artifacts → null.
 */
export function parseDateValue(value) {
  let date = null;
  if (value instanceof Date) {
    date = isValidDate(value)
      ? new Date(value.getFullYear(), value.getMonth(), value.getDate())
      : null;
  } else if (typeof value === "string" && value.trim()) {
    const str = value.trim();
    // YYYY-MM-DD, optionally followed by a time part (ISO datetime from JSON)
    let m = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/);
    if (m) {
      date = buildLocalDate(Number(m[1]), Number(m[2]), Number(m[3]));
    } else {
      // Legacy MM/DD/YYYY
      m = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      if (m) date = buildLocalDate(Number(m[3]), Number(m[1]), Number(m[2]));
    }
  }
  return date && !isEpochArtifact(date) ? date : null;
}

/**
 * Any date-ish value (Date, date-only string, ISO datetime, epoch-ms number) → a VALID
 * Date, or null. Unlike `new Date(x)` this never yields an Invalid Date and never turns
 * null / "" / 0 into 1970. Date-only strings stay on their local calendar day.
 * Use before any toLocale*String / toISOString call on a value that may be empty.
 */
export function toValidDate(value) {
  let date = null;
  if (value instanceof Date) {
    date = value;
  } else if (typeof value === "number") {
    date = value !== 0 ? new Date(value) : null;
  } else if (typeof value === "string" && value.trim()) {
    const str = value.trim();
    date = /^\d{4}-\d{1,2}-\d{1,2}$|^\d{1,2}\/\d{1,2}\/\d{4}$/.test(str)
      ? parseDateValue(str)
      : new Date(str);
  }
  return isValidDate(date) && !isEpochArtifact(date) ? date : null;
}

/** Format a Date as canonical "YYYY-MM-DD" (local calendar date). "" if not a valid Date. */
export function toCanonicalDate(date) {
  if (!isValidDate(date)) return "";
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

/**
 * Normalise a picker min/max bound: a valid Date, or undefined. `edge` snaps it to the
 * start ("start") or end ("end") of its local day so a bound built from `new Date()`
 * is stable across renders (no native prop churn) and "today" stays selectable.
 */
export function normalizePickerBound(value, edge) {
  const date = toValidDate(value);
  if (!date) return undefined;
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  if (edge === "end") d.setHours(23, 59, 59, 0);
  return d;
}

/**
 * Date the picker should open on: the field's value if set, else today. ALWAYS a valid
 * Date (the native picker invariant-crashes / shows 1969 otherwise), clamped into
 * [minimumDate, maximumDate] when those are valid.
 */
export function initialPickerDate(value, now = new Date(), bounds = {}) {
  const fallback = isValidDate(now) ? now : new Date();
  let date = parseDateValue(value) || fallback;
  const min = normalizePickerBound(bounds.minimumDate, "start");
  const max = normalizePickerBound(bounds.maximumDate, "end");
  if (min && date < min) date = min;
  if (max && date > max) date = max;
  return date;
}

/**
 * Turn a native picker callback (event, selected) into a canonical "YYYY-MM-DD", or
 * null when nothing should be committed: Android/iOS dismiss, no date, an Invalid Date,
 * or an epoch artifact (the picker reporting timestamp 0). The caller keeps the
 * previous value on null.
 */
export function pickedDateToCanonical(event, selected) {
  if (event?.type === "dismissed") return null;
  if (!isValidDate(selected) || isEpochArtifact(selected)) return null;
  return toCanonicalDate(selected) || null;
}

/**
 * Canonical "YYYY-MM-DD" + "HH:MM" → ISO instant string (local time), or null if either
 * part is missing / invalid. Never throws (new Date(bad).toISOString() does).
 */
export function combineDateTimeToISO(dateStr, timeStr) {
  const date = parseDateValue(dateStr);
  const time = parseTimeValue(timeStr);
  if (!date || !time) return null;
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate(), time.hours, time.minutes);
  return isValidDate(d) ? d.toISOString() : null;
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
  if (value instanceof Date && !isValidDate(value)) return "";
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
 * Display format for a canonical/legacy time string: always 24-hour "HH:MM", no
 * AM/PM, regardless of the device clock (the app is 24h under es-AR / en-GB).
 * "" for empty/unparseable values. The optional 2nd arg is accepted for backwards
 * compatibility and ignored — a stray `true` cannot reintroduce AM/PM.
 */
// eslint-disable-next-line no-unused-vars
export function formatDisplayTime(value, _legacyHour12) {
  const time = parseTimeValue(value);
  if (!time) return "";
  return `${String(time.hours).padStart(2, "0")}:${String(time.minutes).padStart(2, "0")}`;
}

/** Date the time picker should open on: the field's value if set, else now. */
export function initialPickerTime(value, now = new Date()) {
  if (!isValidDate(now)) now = new Date();
  const time = parseTimeValue(value);
  if (!time) return now;
  const date = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  date.setHours(time.hours, time.minutes, 0, 0);
  return date;
}
