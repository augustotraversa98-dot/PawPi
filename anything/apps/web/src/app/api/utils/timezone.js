// IANA time-zone helpers for notifications v2 (docs/notifications-v2-design.md).
//
// `user_profiles.timezone` (0094) is NULLABLE with no default; every consumer resolves
// COALESCE(timezone, 'America/Buenos_Aires'). Nothing wrote it before v2, so every owner was effectively UTC-3.

export const DEFAULT_TIMEZONE = "America/Buenos_Aires";

// Cheap shape check before any validation round-trip: IANA names are letters, digits, `_`, `+`, `-`, `/`.
const SHAPE_RE = /^[A-Za-z][A-Za-z0-9_+\-]*(?:\/[A-Za-z0-9_+\-]+){0,2}$/;

/** True when `tz` looks like an IANA zone and the JS runtime knows it. (The route additionally checks Postgres.) */
export function isValidTimeZone(tz) {
  if (typeof tz !== "string" || tz.length === 0 || tz.length > 64 || !SHAPE_RE.test(tz)) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** A usable zone for server-side clock math: the stored one if valid, else the app-wide default. */
export function resolveTimezone(tz) {
  return isValidTimeZone(tz) ? tz : DEFAULT_TIMEZONE;
}

/** The hour (0-23) and minute at `date` in `tz` (falls back to the default zone for an unusable tz). */
export function localHourMinute(date, tz) {
  const zone = resolveTimezone(tz);
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: zone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return { hour: hour === 24 ? 0 : hour, minute };
}
