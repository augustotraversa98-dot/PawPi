// Shared local wall-clock helpers for gates that must compare against the CALLER's own
// clock rather than the DB session's now() (which runs in UTC — see SCHEMA_NOTES
// "neon→porsager" + GET /api/me/bookings). vet_appointments.appointment_date/
// appointment_time have no timezone stored anywhere in the schema, so they are naive
// local wall-clock values — never compare them via new Date(naiveString), which JS
// treats as UTC and shifts the day/time for negative-offset callers (e.g. Buenos Aires,
// UTC-3). Everything here works on decomposed {year, month, day, hour, minute} integers
// and uses Date.UTC(...) only as pure calendar arithmetic (leap years, month length) —
// never to reinterpret an ambiguous string.

// Parse a canonical "YYYY-MM-DD" request param into {year, month, day}, rejecting
// impossible calendar dates (e.g. "2026-13-40", "2026-02-30"). Mirrors
// GET /api/me/bookings' parseCanonicalDateParam.
export function parseCanonicalDateParam(value) {
  const m = typeof value === "string" && value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const [, yearStr, monthStr, dayStr] = m;
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);
  const d = new Date(Date.UTC(year, month - 1, day));
  const roundTrips =
    d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day;
  return roundTrips ? { year, month, day } : null;
}

// Parse a canonical "HH:MM" request param into {hour, minute}.
export function parseCanonicalTimeParam(value) {
  const m = typeof value === "string" && value.match(/^(\d{2}):(\d{2})$/);
  if (!m) return null;
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  if (hour > 23 || minute > 59) return null;
  return { hour, minute };
}

// Decompose a `date` column value into {year, month, day}. postgres.js (porsager)
// parses the `date` OID via `new Date(text)` (a naive "YYYY-MM-DD" string), which JS
// interprets as UTC midnight — so a Date instance here must always be read with the
// UTC getters, never the local ones. Also accepts a plain "YYYY-MM-DD"-prefixed string
// directly (defensive — e.g. if a caller already stringified the row).
export function dbDateToParts(value) {
  if (value == null) return null;
  const iso = value instanceof Date ? value.toISOString() : String(value);
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
}

// Decompose a `time without time zone` column value ("HH:MM:SS" or "HH:MM") into
// {hour, minute}. postgres.js returns this OID as the raw text — no Date involved.
export function dbTimeToParts(value) {
  if (typeof value !== "string") return null;
  const m = value.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  return { hour: Number(m[1]), minute: Number(m[2]) };
}

function wallClockToUtcMs({ year, month, day, hour = 0, minute = 0 }) {
  return Date.UTC(year, month - 1, day, hour, minute);
}

// Minutes from `from` to `to` (positive when `to` is later). Both args are
// {year, month, day, hour, minute} wall-clock parts — never real UTC timestamps.
export function minutesBetweenWallClock(from, to) {
  return (wallClockToUtcMs(to) - wallClockToUtcMs(from)) / 60000;
}

// Shift a wall-clock moment by `minutes` (may be negative), returning new decomposed parts.
export function addMinutesToWallClock(wallClock, minutes) {
  const d = new Date(wallClockToUtcMs(wallClock) + minutes * 60000);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
  };
}

export function formatWallClockDate({ year, month, day }) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function formatWallClockTime({ hour, minute }) {
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}
