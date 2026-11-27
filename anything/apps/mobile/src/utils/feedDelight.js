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

// A birthday is a month-day: "MM-DD" (feed posts carry no year) or a canonical "YYYY-MM-DD" date. Read as text,
// never through a Date, so no time zone can move it. `y` is null when the year is not known.
function parseBirthday(s) {
  const md = typeof s === "string" ? /^(\d{2})-(\d{2})$/.exec(s) : null;
  return md ? { y: null, m: +md[1], d: +md[2] } : parseYMD(s);
}

const isLeapYear = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

// The day of the month a birthday is celebrated on in `year`: Feb 29 moves to Feb 28 in non-leap years.
const birthdayDayIn = (b, year) => (b.m === 2 && b.d === 29 && !isLeapYear(year) ? 28 : b.d);

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

// ── Milestone moments (E3) ───────────────────────────────────────────────────
// A milestone is a birthday (pets.birthday) or a gotcha/adoption anniversary
// (pets.adoption_date) whose month+day matches the reference day. REAL dates only —
// null in, null out, no fabricated milestones. Birthday wins if both fall the same day.
// A Feb 29 birthday is celebrated on Feb 28 in non-leap years.

/** The birthday a feed post carries: month-day, or the full date an older server sends. */
export function postBirthday(post) {
  return post?.pet_birthday_md ?? post?.pet_birthday ?? null;
}

/**
 * The milestone on `refDay` (YYYY-MM-DD) for a pet, or null. `birthday` may be "MM-DD" or "YYYY-MM-DD".
 * @returns {{type: 'birthday'|'gotcha', years: number}|null} years = anniversary count (0 when the
 * year is not known).
 */
export function getMilestone(pet, refDay) {
  const t = parseYMD(refDay);
  if (!t || !pet) return null;
  const b = parseBirthday(pet.birthday);
  if (b && b.m === t.m && birthdayDayIn(b, t.y) === t.d) {
    return { type: "birthday", years: b.y == null ? 0 : t.y - b.y };
  }
  const a = parseYMD(pet.adoption_date);
  if (a && a.m === t.m && a.d === t.d) return { type: "gotcha", years: t.y - a.y };
  return null;
}

// Days from `today` to the next occurrence of the (month, day) in `d`, on or after today.
// `dayIn(d, year)` is the day of the month it falls on that year.
function daysToAnniversary(d, t, dayIn = (date) => date.d) {
  const todayUTC = Date.UTC(t.y, t.m - 1, t.d);
  let occYear = t.y;
  let occ = Date.UTC(t.y, d.m - 1, dayIn(d, t.y));
  if (occ < todayUTC) {
    occYear = t.y + 1;
    occ = Date.UTC(occYear, d.m - 1, dayIn(d, occYear));
  }
  return { days: Math.round((occ - todayUTC) / 86400000), occYear };
}

/**
 * The nearest UPCOMING milestone within `withinDays` (default 3), STRICTLY in the future
 * (day-of is handled by getMilestone, not the countdown). Null when nothing is close.
 * @returns {{type:'birthday'|'gotcha', years:number, daysUntil:number}|null}
 */
export function getUpcomingMilestone(pet, today, withinDays = 3) {
  const t = parseYMD(today);
  if (!t || !pet) return null;
  let best = null;
  for (const [type, field] of [
    ["birthday", pet.birthday],
    ["gotcha", pet.adoption_date],
  ]) {
    const d = parseYMD(field);
    if (!d) continue;
    const { days, occYear } = daysToAnniversary(d, t, type === "birthday" ? birthdayDayIn : undefined);
    if (days >= 1 && days <= withinDays) {
      if (!best || days < best.daysUntil) {
        best = { type, years: occYear - d.y, daysUntil: days };
      }
    }
  }
  return best;
}
