// E11 — "Rex's Week" weekly digest, pure server-authoritative decisions.
//
// These functions NEVER fabricate a number — they only classify the REAL counts they are handed.
// A quiet week degrades to an honest gentle state; a truly empty week to a soft forward nudge. The
// client maps `state` → localized copy; the server owns the classification so the "no fake numbers"
// guardrail is unit-testable.

/**
 * Classify the week from its real counts.
 *   • empty — nothing at all happened this week (and no streak carried): a soft forward nudge.
 *   • quiet — something small happened (or a streak is alive) but the week was thin: a gentle,
 *             honest "quieter week — here's one nice moment".
 *   • rich  — a healthy week worth celebrating.
 */
export function decideDigestState({
  walks = 0,
  ringDays = 0,
  careActions = 0,
  moments = 0,
  hasStreak = false,
} = {}) {
  const total = Number(walks) + Number(ringDays) + Number(careActions) + Number(moments);
  if (total === 0 && !hasStreak) return "empty";
  // Barely-there week: no ring closed, at most one walk, no moment posted.
  if (Number(ringDays) === 0 && Number(walks) <= 1 && Number(moments) === 0) return "quiet";
  return "rich";
}

/**
 * The nearest upcoming milestone (birthday / gotcha day) within `windowDays` of `today`.
 * Anniversary math on the month+day only, in UTC to avoid tz drift. Returns
 * { kind: 'birthday'|'gotcha', in_days } for the SOONER event, or null if neither falls in range.
 */
export function upcomingMilestone({ birthday, adoptionDate, today, windowDays = 7 } = {}) {
  const t = parseYmd(today);
  if (!t) return null;

  const candidates = [];
  const bd = nextAnniversaryDays(birthday, t);
  if (bd != null && bd <= windowDays) candidates.push({ kind: "birthday", in_days: bd });
  const ad = nextAnniversaryDays(adoptionDate, t);
  if (ad != null && ad <= windowDays) candidates.push({ kind: "gotcha", in_days: ad });

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => a.in_days - b.in_days);
  return candidates[0];
}

function parseYmd(v) {
  if (!v) return null;
  const s = v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  return { y: +m[1], mo: +m[2], d: +m[3] };
}

// Days from `today` until the next occurrence (this year or next) of the event's month+day.
// 0 = the event is today. Feb 29 folds to Mar 1 in non-leap years.
function nextAnniversaryDays(eventDate, today) {
  const e = parseYmd(eventDate);
  if (!e) return null;
  const todayUtc = Date.UTC(today.y, today.mo - 1, today.d);
  let occ = anniversaryUtc(e.mo, e.d, today.y);
  if (occ < todayUtc) occ = anniversaryUtc(e.mo, e.d, today.y + 1);
  return Math.round((occ - todayUtc) / 86400000);
}

function anniversaryUtc(mo, d, year) {
  // Date.UTC normalizes an out-of-range day (e.g. Feb 29 in a non-leap year → Mar 1).
  return Date.UTC(year, mo - 1, d);
}
