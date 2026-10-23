import sql from "@/app/api/utils/sql";
import { isValidAuthUserId } from "@/app/api/utils/authUserId";

// AUDIT A-05 — server-side JWT revocation.
//
// The session is a JWT (no DB session lookup on the JWT strategy), so a leaked or
// replayed bearer keeps working until it expires. auth_users.token_invalidated_at
// (migration 0130) is a per-user cutoff: any token whose `iat` (issued-at, in
// SECONDS) predates it is dead. Bump it on password reset, sign-out-everywhere
// and account deletion; check it in a guard on every /api/* request.

// PERF (docs/perf-audit-2026-10-23.md, finding 1): the guard runs on EVERY authenticated /api request, and
// production is Railway us-east4 -> Supabase sa-east-1, so this lookup is a ~170 ms round trip in front of
// every handler. The cutoff only changes on password reset / sign-out-everywhere / account deletion, so the
// per-user cutoff is cached in process for a short TTL.
//
// Bound on staleness: a revocation made by THIS process takes effect immediately (invalidateUserTokens
// clears the entry, and the epoch below stops a lookup that raced the UPDATE from re-caching the old
// value). A revocation made by another process (a second replica, a cron, a manual SQL update) is honoured
// within REVOCATION_CACHE_TTL_MS. Only successful reads are cached; errors stay fail-open and uncached.
export const REVOCATION_CACHE_TTL_MS = 30_000;
const REVOCATION_CACHE_MAX_ENTRIES = 5_000;

// key: String(authUserId) -> { cutoffMs: number | null, at: number }
const cutoffCache = new Map();
// Bumped by every invalidateUserTokens; a lookup that started before a bump must not cache its result.
let invalidationEpoch = 0;

/** Test seam: drop every cached cutoff. */
export function clearRevocationCache() {
  cutoffCache.clear();
}

// Kill every token issued to this user up to now. Call after a password reset,
// an explicit "sign out everywhere", or account deletion. authUserId is the
// auth_users.id (the JWT `sub`).
export async function invalidateUserTokens(authUserId) {
  if (authUserId == null) return;
  invalidationEpoch += 1;
  cutoffCache.delete(String(authUserId));
  await sql`
    UPDATE auth_users
    SET token_invalidated_at = now()
    WHERE id = ${authUserId}
  `;
  // Clear again after the write so a lookup that read the old row just before the UPDATE cannot stay cached.
  invalidationEpoch += 1;
  cutoffCache.delete(String(authUserId));
}

// True when a token issued at `iatSeconds` for `authUserId` has been revoked.
// Fails OPEN (returns false) on any error or missing data — a DB blip or a
// pre-migration DB must never lock every user out; the guard logs and continues.
export async function isTokenRevoked(authUserId, iatSeconds) {
  if (authUserId == null) return false;
  // auth_users.id is an integer. A non-numeric `sub` can only be a ghost session (e.g. the
  // random-UUID sub minted by the pre-fix Google OAuth path, which never created a user row).
  // Querying with it throws 22P02, which ABORTS the request's transaction and 500s every query
  // after it — so treat it as revoked (→ 401 → the app clears the dead session) without ever
  // touching the DB.
  if (!isValidAuthUserId(authUserId)) return true;
  if (typeof iatSeconds !== "number") return false;
  const key = String(authUserId);
  const hit = cutoffCache.get(key);
  if (hit && Date.now() - hit.at < REVOCATION_CACHE_TTL_MS) {
    // iat is in seconds; the cutoff is in ms.
    return hit.cutoffMs !== null && iatSeconds * 1000 < hit.cutoffMs;
  }
  const epochAtStart = invalidationEpoch;
  try {
    const rows = await sql`
      SELECT token_invalidated_at
      FROM auth_users
      WHERE id = ${authUserId}
      LIMIT 1
    `;
    const cutoff = rows[0]?.token_invalidated_at;
    const cutoffMs = cutoff ? new Date(cutoff).getTime() : null;
    if (epochAtStart === invalidationEpoch) {
      if (cutoffCache.size >= REVOCATION_CACHE_MAX_ENTRIES) cutoffCache.clear();
      cutoffCache.set(key, { cutoffMs, at: Date.now() });
    }
    if (cutoffMs === null) return false;
    // iat is in seconds; token_invalidated_at is a timestamp.
    return iatSeconds * 1000 < cutoffMs;
  } catch (e) {
    // Column absent (unmigrated) or a transient error → do not block.
    return false;
  }
}
