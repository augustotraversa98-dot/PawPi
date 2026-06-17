// Feed delight helpers (Ticket 2.37) — pure + timezone-safe (they operate on
// canonical YYYY-MM-DD local-day strings, never on Date math across midnight).

// Parse "YYYY-MM-DD" → {y,m,d} ints. Returns null for anything malformed.
function parseYMD(s) {
  if (typeof s !== "string") return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) return null;
  return { y: +m[1], m: +m[2], d: +m[3] };
}

// Step a YYYY-MM-DD string back by one day (UTC math on a date-only value is
// exact — no DST/offset since there's no time component).
function prevDay(ymd) {
  const p = parseYMD(ymd);
  if (!p) return null;
  const dt = new Date(Date.UTC(p.y, p.m - 1, p.d));
  dt.setUTCDate(dt.getUTCDate() - 1);
  return dt.toISOString().slice(0, 10);
}

/**
 * Posting streak = number of consecutive days, ENDING TODAY, that have at least
 * one daily post. If there is no post today the streak is 0 (a missed day breaks
 * the chain) — callers hide the 🔥 badge when 0, so we never fabricate a streak.
 *
 * @param {string[]} postDates - daily-post day strings (YYYY-MM-DD), any order/dupes.
 * @param {string} today - the viewer's local day (YYYY-MM-DD).
 * @returns {number}
 */
export function computePostingStreak(postDates, today) {
  if (!parseYMD(today)) return 0;
  const days = new Set(
    (Array.isArray(postDates) ? postDates : [])
      .map((d) => (typeof d === "string" ? d.slice(0, 10) : null))
      .filter(Boolean),
  );

  let streak = 0;
  let cursor = today;
  while (cursor && days.has(cursor)) {
    streak += 1;
    cursor = prevDay(cursor);
  }
  return streak;
}

/**
 * True when today (month + day, ignoring year) matches the pet's birthday OR
 * adoption date. Both fields are optional — false when neither is set.
 *
 * @param {{birthday?: string|null, adoption_date?: string|null}} pet
 * @param {string} today - viewer's local day (YYYY-MM-DD).
 */
export function isBirthdayToday(pet, today) {
  const t = parseYMD(today);
  if (!t || !pet) return false;
  for (const field of [pet.birthday, pet.adoption_date]) {
    const d = parseYMD(field);
    if (d && d.m === t.m && d.d === t.d) return true;
  }
  return false;
}
