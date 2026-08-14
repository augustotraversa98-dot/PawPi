// E12 — the comeback / re-engagement decisions (pure, server-authoritative).
//
// WARM, never guilt. A win-back only ever fires on a REAL hook; if none exists we fall back to the
// pet's own memory / a soft resume nudge — never a fabricated friend or count. Keeping this pure makes
// the "real hook only, no shame" guarantee unit-testable.

/** A pet is lapsed when it was active once (lastActiveDay set) and that day is older than N days. */
export function isLapsed(lastActiveDay, today, n = 7) {
  if (!lastActiveDay) return false; // never active → a different cohort, not "lapsed"
  const a = String(lastActiveDay).slice(0, 10);
  const t = String(today).slice(0, 10);
  const days = Math.round((Date.parse(t + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000);
  return days > n;
}

/**
 * Pick the win-back hook, in priority order — all REAL:
 *   1. milestone — an upcoming birthday / gotcha day ({ kind, in_days } or null).
 *   2. friend    — a real friend's recent activity (friendName present).
 *   3. memory    — fall back to the pet's own memory / a soft resume nudge (never fabricated).
 */
export function decideWinback({ milestone = null, friendName = null, petName = null } = {}) {
  if (milestone && (milestone.kind === "birthday" || milestone.kind === "gotcha")) {
    return { hook: "milestone", params: { kind: milestone.kind, inDays: milestone.in_days, name: petName } };
  }
  if (friendName) {
    return { hook: "friend", params: { friend: friendName, name: petName } };
  }
  return { hook: "memory", params: { name: petName } };
}
