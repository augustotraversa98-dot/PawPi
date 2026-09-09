// Owner-local "today" (AUDIT_2026-09 A-10 / A-11).
//
// Supabase runs in UTC. `new Date().toISOString().split("T")[0]` is therefore the UTC
// date, which for an Argentina owner (UTC-3) is already TOMORROW from 21:00 local. The
// Care Ring / streak derive "today" in the owner's timezone (pets/[id]/care-ring), so any
// route that stamps or reads a calendar day with the UTC date disagreed with them for three
// hours every night: the daily moment landed on tomorrow, the ring stayed empty, and the
// next morning's post was refused as a duplicate.
//
// The SQL expression below is the one care-ring uses; routes SELECT it alongside the
// identity lookup they already do (no extra round trip) and pass the row here.
//   SELECT id, (now() AT TIME ZONE COALESCE(timezone, 'America/Buenos_Aires'))::date AS local_today
//   FROM user_profiles WHERE …
export const OWNER_TZ_DEFAULT = "America/Buenos_Aires";

/** Normalise a `date` column value (string or Date from porsager) to "YYYY-MM-DD". */
export function toDayStr(value) {
  if (value == null) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString().slice(0, 10);
  }
  const s = String(value);
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null;
}

/** The UTC calendar date — the previous behaviour, kept only as a last-resort fallback. */
export function utcTodayStr() {
  return new Date().toISOString().split("T")[0];
}

/** Owner-local today from a row that selected `local_today`; UTC today when absent. */
export function ownerTodayFrom(row) {
  return toDayStr(row?.local_today) ?? utcTodayStr();
}

export const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
