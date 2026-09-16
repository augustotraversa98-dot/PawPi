import sql from "@/app/api/utils/sql";

// AUDIT A-05 — server-side JWT revocation.
//
// The session is a JWT (no DB session lookup on the JWT strategy), so a leaked or
// replayed bearer keeps working until it expires. auth_users.token_invalidated_at
// (migration 0130) is a per-user cutoff: any token whose `iat` (issued-at, in
// SECONDS) predates it is dead. Bump it on password reset, sign-out-everywhere
// and account deletion; check it in a guard on every /api/* request.

// Kill every token issued to this user up to now. Call after a password reset,
// an explicit "sign out everywhere", or account deletion. authUserId is the
// auth_users.id (the JWT `sub`).
export async function invalidateUserTokens(authUserId) {
  if (authUserId == null) return;
  await sql`
    UPDATE auth_users
    SET token_invalidated_at = now()
    WHERE id = ${authUserId}
  `;
}

// (INCIDENT, HighLatencyP95, 2026-09-16 — flagged for human review, see
// /tmp/incident.md) Migration 0130 is hand-apply-only and, per the commit that
// shipped this guard, was NOT applied to prod when the /api/* revocation check
// went live. That means every authenticated request was issuing a SELECT of a
// column that doesn't exist yet, paying a doomed-to-fail DB round trip (42703)
// on every single call before falling through to the real route. Once we've
// actually observed that 42703 from Postgres, latch it in-process so later
// calls skip straight to fail-open instead of repeating a query we already
// know will fail — this only short-circuits on the specific
// "column truly doesn't exist" error, never on a transient one, so a blip
// can't silently disable revocation until restart. The cache clears itself on
// deploy/restart, so once a human hand-applies 0130 the next deployed process
// resumes real revocation checks with no code change needed.
let columnConfirmedAbsent = false;

// True when a token issued at `iatSeconds` for `authUserId` has been revoked.
// Fails OPEN (returns false) on any error or missing data — a DB blip or a
// pre-migration DB must never lock every user out; the guard logs and continues.
export async function isTokenRevoked(authUserId, iatSeconds) {
  if (authUserId == null || typeof iatSeconds !== "number") return false;
  if (columnConfirmedAbsent) return false;
  try {
    const rows = await sql`
      SELECT token_invalidated_at
      FROM auth_users
      WHERE id = ${authUserId}
      LIMIT 1
    `;
    const cutoff = rows[0]?.token_invalidated_at;
    if (!cutoff) return false;
    // iat is in seconds; token_invalidated_at is a timestamp.
    return iatSeconds * 1000 < new Date(cutoff).getTime();
  } catch (e) {
    // Column absent (unmigrated, 42703) or a transient error → do not block.
    // Only latch the cache for the confirmed-absent case (see comment above).
    if (e?.code === "42703") columnConfirmedAbsent = true;
    return false;
  }
}
