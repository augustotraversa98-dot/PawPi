// availability — pure slot-generation + double-book helpers for generalized booking
// (ticket 2.4). No DB, no I/O: the routes load the provider_availability windows and the
// already-taken slots, then call these to compute open slots / validate a requested slot.
// Pure functions keep the logic unit-testable in the fast vitest gate.
//
// Convention: weekday 0=Mon..6=Sun (app-wide DayChips, matching routines.days). A "slot"
// is { start, end } as ISO timestamptz strings. start_time/end_time on a window are
// 'HH:MM' (or 'HH:MM:SS') local-to-the-provider; we compose them onto a date as UTC ISO
// for a deterministic, timezone-stub-free representation (real per-provider TZ is a
// follow-up — documented in the PR).

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

/** 'YYYY-MM-DD' + minutes-since-midnight → ISO timestamptz string (UTC). */
function composeIso(dateStr, minutes) {
  const h = String(Math.floor(minutes / 60)).padStart(2, "0");
  const m = String(minutes % 60).padStart(2, "0");
  return new Date(`${dateStr}T${h}:${m}:00.000Z`).toISOString();
}

/**
 * Generate the candidate slots for ONE date from the provider_availability windows that
 * apply to it (caller pre-filters windows to active + matching staff/capability).
 *
 * @param {string} dateStr           'YYYY-MM-DD'
 * @param {Array<{weekday:number,start_time:string,end_time:string,slot_minutes:number}>} windows
 * @returns {Array<{start:string,end:string}>} ISO slots, sorted, for that weekday's windows
 */
export function generateSlotsForDate(dateStr, windows) {
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
      slots.push({ start: composeIso(dateStr, m), end: composeIso(dateStr, m + step) });
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
export function isSlotBookable(requested, windows, taken) {
  if (!requested?.start || !requested?.end) return false;
  if (requested.start >= requested.end) return false;
  const dateStr = requested.start.slice(0, 10);
  const open = subtractTaken(generateSlotsForDate(dateStr, windows), taken);
  // The requested slot must coincide with (or sit within) an open generated slot.
  return open.some(
    (o) => requested.start >= o.start && requested.end <= o.end,
  );
}
