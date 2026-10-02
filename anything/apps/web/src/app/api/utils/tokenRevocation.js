import sql from "@/app/api/utils/sql";
import { isValidAuthUserId } from "@/app/api/utils/authUserId";

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
    // Column absent (unmigrated) or a transient error → do not block.
    return false;
  }
}
