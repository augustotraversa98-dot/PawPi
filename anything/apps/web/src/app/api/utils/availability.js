// availability — pure slot-generation + double-book helpers for generalized booking
// (ticket 2.4). No DB, no I/O: the routes load the provider_availability windows and the
// already-taken slots, then call these to compute open slots / validate a requested slot.
// Pure functions keep the logic unit-testable in the fast vitest gate.
//
// Convention: weekday 0=Mon..6=Sun (app-wide DayChips, matching routines.days). A "slot"
// is { start, end } as ISO timestamptz strings (absolute UTC instants). start_time/end_time
// on a window are 'HH:MM' (or 'HH:MM:SS') WALL-CLOCK time in the provider's time zone; we
// compose them onto a date in that zone (0076: providers.time_zone) and emit the resulting
// absolute UTC instant, so "09:00" means 09:00 where the provider is (default Buenos Aires).

/** Default provider time zone — the launch market (matches 0076's providers.time_zone default). */
export const DEFAULT_TIME_ZONE = "America/Argentina/Buenos_Aires";

/** 0=Mon..6=Sun for a JS Date (getUTCDay: 0=Sun..6=Sat → shift). */
export function weekdayMon0(date) {
  const js = date.getUTCDay(); // 0=Sun
  return (js + 6) % 7; // 0=Mon
}

/** 'HH:MM[:SS]' → minutes since midnight. */
export function timeToMinutes(hhmm) {
  const [h, m] = String(hhmm).split(":").map((n) => parseInt(n, 10));
  return h * 60 + (m || 0);
}

/**
 * Milliseconds that `timeZone` is ahead of UTC at the given absolute `instant`. Uses the
 * platform Intl time-zone database (no external dependency, DST-correct). Buenos Aires
 * (UTC-3, no DST) → -10_800_000.
 */
function tzOffsetMs(timeZone, instant) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const p = {};
  for (const part of dtf.formatToParts(instant)) p[part.type] = part.value;
  // The wall-clock the zone shows at `instant`, re-read AS IF it were UTC.
  const asUtc = Date.UTC(
    Number(p.year),
    Number(p.month) - 1,
    Number(p.day),
    Number(p.hour),
    Number(p.minute),
    Number(p.second),
  );
  return asUtc - instant.getTime();
}

/**
 * 'YYYY-MM-DD' + minutes-since-midnight, interpreted as WALL-CLOCK time in `timeZone`,
 * → the absolute UTC ISO instant. E.g. 09:00 in Buenos Aires → '…T12:00:00.000Z'.
 * First treats the wall time as if it were UTC, then corrects by the zone's offset; a
 * second pass re-evaluates the offset at the corrected instant so it stays exact across a
 * DST transition (the default zone has no DST, but a provider elsewhere might).
 * Exported so the book WRITE path composes a requested instant identically to the slots
 * generated here — the read and write paths must agree on what "09:00" means.
 */
export function composeIso(dateStr, minutes, timeZone) {
  const h = String(Math.floor(minutes / 60)).padStart(2, "0");
  const m = String(minutes % 60).padStart(2, "0");
  const guess = new Date(`${dateStr}T${h}:${m}:00.000Z`);
  const pass1 = new Date(guess.getTime() - tzOffsetMs(timeZone, guess));
  return new Date(guess.getTime() - tzOffsetMs(timeZone, pass1)).toISOString();
}

/** The provider-local calendar date ('YYYY-MM-DD') of an absolute UTC instant, in `timeZone`. */
function zonedDateStr(instant, timeZone) {
  const dtf = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const p = {};
  for (const part of dtf.formatToParts(instant)) p[part.type] = part.value;
  return `${p.year}-${p.month}-${p.day}`;
}

/**
 * Generate the candidate slots for ONE date from the provider_availability windows that
 * apply to it (caller pre-filters windows to active + matching staff/capability).
 *
 * @param {string} dateStr           'YYYY-MM-DD' (the provider-local calendar date)
 * @param {Array<{weekday:number,start_time:string,end_time:string,slot_minutes:number}>} windows
 * @param {string} timeZone          IANA zone the window times are local to (default BA)
 * @returns {Array<{start:string,end:string}>} ISO slots (absolute UTC), sorted, for that weekday's windows
 */
export function generateSlotsForDate(dateStr, windows, timeZone = DEFAULT_TIME_ZONE) {
  const date = new Date(`${dateStr}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return [];
  const wd = weekdayMon0(date);

  const slots = [];
  for (const w of windows) {
    if (w.weekday !== wd) continue;
    const startM = timeToMinutes(w.start_time);
    const endM = timeToMinutes(w.end_time);
    const step = w.slot_minutes > 0 ? w.slot_minutes : 30;
    for (let m = startM; m + step <= endM; m += step) {
      slots.push({
        start: composeIso(dateStr, m, timeZone),
        end: composeIso(dateStr, m + step, timeZone),
      });
    }
  }
  // Sort + de-dupe (overlapping windows could repeat a slot start).
  const seen = new Set();
  return slots
    .filter((s) => (seen.has(s.start) ? false : (seen.add(s.start), true)))
    .sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
}

/** Do two [start,end) ranges overlap? (ISO strings compare lexicographically as UTC.) */
export function slotsOverlap(a, b) {
  return a.start < b.end && b.start < a.end;
}

/**
 * Remove any candidate slot that overlaps a taken (booked or externally-busy) range.
 *
 * @param {Array<{start:string,end:string}>} candidates
 * @param {Array<{start:string,end:string}>} taken  booked slots + external busy windows
 * @returns {Array<{start:string,end:string}>}
 */
export function subtractTaken(candidates, taken) {
  if (!taken || taken.length === 0) return candidates;
  return candidates.filter((c) => !taken.some((t) => slotsOverlap(c, t)));
}

/**
 * Is a requested [start,end) slot bookable — i.e. it falls inside a generated open slot
 * for its date and overlaps nothing taken? Used by the book route to validate the slot
 * BEFORE insert so a clash returns a clean 409 (the DB partial-unique index is the
 * last-line race guard).
 *
 * @returns {boolean}
 */
export function isSlotBookable(requested, windows, taken, timeZone = DEFAULT_TIME_ZONE) {
  if (!requested?.start || !requested?.end) return false;
  if (requested.start >= requested.end) return false;
  // Generate against the slot's PROVIDER-LOCAL date (windows are keyed by local weekday +
  // wall-clock time), not the UTC date — they can differ for an early/late slot.
  const dateStr = zonedDateStr(new Date(requested.start), timeZone);
  const open = subtractTaken(generateSlotsForDate(dateStr, windows, timeZone), taken);
  // The requested slot must coincide with (or sit within) an open generated slot.
  return open.some(
    (o) => requested.start >= o.start && requested.end <= o.end,
  );
}
