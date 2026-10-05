import { localHourMinute } from "@/app/api/utils/timezone";

// Quiet hours (notifications v2, PR 3c): a push is NOT sent while the owner's local clock is inside their quiet
// window. Defaults 22:00-08:00 owner-local (migration 0132; no row = these defaults). The in-app bell row is
// unaffected — quiet hours only stop the phone from ringing.

export const DEFAULT_QUIET_HOURS = { enabled: true, start: 22, end: 8 };

const validHour = (h) => Number.isInteger(h) && h >= 0 && h <= 23;

/** Normalise a settings row ({quiet_hours_enabled, quiet_start, quiet_end} or {enabled,start,end}) to the defaults when unusable. */
export function normalizeQuietSettings(row) {
  const enabled = row?.quiet_hours_enabled ?? row?.enabled;
  const start = Number(row?.quiet_start ?? row?.start);
  const end = Number(row?.quiet_end ?? row?.end);
  return {
    enabled: typeof enabled === "boolean" ? enabled : DEFAULT_QUIET_HOURS.enabled,
    start: validHour(start) ? start : DEFAULT_QUIET_HOURS.start,
    end: validHour(end) ? end : DEFAULT_QUIET_HOURS.end,
  };
}

/**
 * Is `hour` (0-23) inside the window [start, end)? The window wraps midnight when start > end
 * (22 → 8 covers 22,23,0..7). start === end is an EMPTY window (nothing is quiet).
 */
export function hourInWindow(hour, start, end) {
  if (start === end) return false;
  return start < end ? hour >= start && hour < end : hour >= start || hour < end;
}

/**
 * @param {{enabled:boolean,start:number,end:number}} settings
 * @param {string|null|undefined} timezone owner's IANA zone (null/unusable → America/Buenos_Aires)
 * @param {Date} [now]
 */
export function isInQuietHours(settings, timezone, now = new Date()) {
  const s = normalizeQuietSettings(settings);
  if (!s.enabled) return false;
  const { hour } = localHourMinute(now, timezone);
  return hourInWindow(hour, s.start, s.end);
}
