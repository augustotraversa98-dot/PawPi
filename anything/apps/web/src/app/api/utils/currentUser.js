// resolveUserId — the single auth_users.id -> user_profiles.id resolver shared by
// the provider routes (docs/provider-design.md §0 identity chain). Every provider
// route turns the caller's session.user.id (= auth_users.id) into their
// user_profiles.id before authorizing via provider_staff; this is that one lookup,
// previously copy-pasted across the provider route files (ticket 4 dedup).
//
// Returns the user_profiles.id or null when no profile row exists for the auth id.
// Callers translate null into their own response (a 404, or an empty list for the
// providers GET) — the behavior is unchanged from the inline copies.
//
// DB is porsager's tagged-template `sql` (see ./sql + SCHEMA_NOTES "neon→porsager"
// gotcha): the query is a tagged template; the param binds via `${}`.

import sql from './sql';
import { usernameBaseFor } from './ownerDisplay';
import { isValidAuthUserId } from './authUserId';
import { recallRequestIdentity } from './requestIdentity';

export async function resolveUserId(authUserId) {
  // withRequestContext already ran this exact lookup for the caller at the top of the request
  // transaction; reuse it instead of paying another cross-region round trip (see requestIdentity.js).
  // Outside a request scope (or for a different auth id) this is null and the lookup below runs.
  const remembered = recallRequestIdentity(authUserId);
  if (remembered !== null) return remembered;
  const userProfile = await sql`
    SELECT id FROM user_profiles WHERE auth_user_id = ${authUserId} LIMIT 1
  `;
  return userProfile.length === 0 ? null : userProfile[0].id;
}

// Collision-safe username generator (mirrors pets/route.js): append a short
// random suffix until `base` is free, with a timestamp fallback that guarantees
// termination. `exists(candidate)` reports whether a candidate is already taken.
// Ensures a duplicate username never surfaces as a raw 23505 → 500.
async function uniqueUsername(base, exists) {
  if (!(await exists(base))) return base;
  for (let i = 0; i < 5; i++) {
    const candidate = `${base}_${Math.floor(Math.random() * 10000)}`;
    if (!(await exists(candidate))) return candidate;
  }
  return `${base}_${Date.now()}`;
}

// ensureUserProfile — get-or-create the caller's user_profiles row, returning its id.
//
// user_profiles rows are created LAZILY (today only in pets/route.js POST/PATCH and
// not at signup — src/auth.js is the managed file). A user who signs up and goes
// straight to provider onboarding never created a pet, so they have NO profile row,
// and resolveUserId returns null — which blocked the business-owner entry path
// (POST /api/providers → 404). This is the #108 profile-creation gap; this helper
// closes it for the provider flow, mirroring the pets-POST lazy create (same columns,
// same default 'pet_owner' role — provider authorization is by provider_staff
// membership, never by role).
//
// RLS (#108): after creating the profile we MUST stamp the request identity
// (setCurrentUserId) BEFORE any dependent insert in the same request. Identity is
// resolved at request START, where this brand-new user had no profile, so
// app.current_user_id is unset; the same-request providers/provider_staff INSERT
// has a FORCE-RLS WITH CHECK (owner_user_profile_id = current_app_user_id()) that
// would otherwise see NULL and be DENIED. setCurrentUserId is no-op-safe outside a
// request context. resolveUserId stays read-only and unchanged.
//
// setCurrentUserId is imported lazily (requestContext is a heavier module that many unit tests
// replace with a partial mock, and it used to import resolveUserId from this file).
export async function ensureUserProfile(authUserId, { fullName } = {}) {
  const existing = await sql`
    SELECT id FROM user_profiles WHERE auth_user_id = ${authUserId} LIMIT 1
  `;
  if (existing.length > 0) return existing[0].id;

  // Username base: from the person's NAME or a random neutral handle — never from the
  // e-mail (privacy, QA 2026-10-16 bug 04). See utils/ownerDisplay.js.
  const baseUsername = usernameBaseFor(fullName);
  const username = await uniqueUsername(baseUsername, async (candidate) => {
    const taken = await sql`
      SELECT id FROM user_profiles WHERE username = ${candidate} LIMIT 1
    `;
    return taken.length > 0;
  });

  const created = await sql`
    INSERT INTO user_profiles (auth_user_id, full_name, username, role)
    VALUES (${authUserId}, ${fullName || null}, ${username}, 'pet_owner')
    RETURNING id
  `;
  const newId = created[0].id;

  const { setCurrentUserId } = await import('./requestContext');
  await setCurrentUserId(newId);

  return newId;
}

// resolveOrCreateUserId — get-or-create the caller's user_profiles.id from an AUTHENTICATED
// session, for the owner routes the app calls BEFORE any pet exists (launch + Services tab).
//
// Why: profiles are created lazily (pets POST / providers POST), so a fresh Google/Apple
// account has no row until it finishes onboarding. Those routes used resolveUserId and
// answered 404 "User profile not found" for it — a missing profile read as an error instead
// of "nothing yet". With this helper such an account gets the normal empty answer.
//
// Safety:
//   - NEVER creates for an unauthenticated / ghost session: returns null unless the session
//     carries a valid integer auth id AND that auth_users row exists (callers keep their 401
//     guard first; the null path is only the "auth user vanished" edge → their old 404).
//   - Concurrency: the app fires several of these routes at once on launch, so two requests can
//     race to create the same profile. INSERT … ON CONFLICT DO NOTHING (+ re-select) means the
//     loser never raises 23505 — a unique violation would abort the whole request transaction
//     and 500 it.
//   - RLS (#108): always stamps the request identity with the resolved id, including when a
//     concurrent request created the row after this request's start-of-request lookup found
//     none, so own-row policies (e.g. device_push_tokens) see the caller.
//
// ensureUserProfile (above) is deliberately left as-is for the provider flows.
export async function resolveOrCreateUserId(session) {
  const authUserId = session?.user?.id;
  if (!isValidAuthUserId(authUserId)) return null;

  // applyIdentity already resolved this caller AND stamped app.current_user_id at the top level of
  // the request transaction, so both the lookup and the re-stamp below would be pure repeats
  // (two more cross-region round trips). Only a profile that already existed at request start is
  // ever remembered, so the lazy-create path below is untouched.
  const remembered = recallRequestIdentity(authUserId);
  if (remembered !== null) return remembered;

  const { setCurrentUserId } = await import('./requestContext');
  const stamp = async (id) => {
    await setCurrentUserId(id);
    return id;
  };

  const lookup = async () => {
    const rows = await sql`
      SELECT id FROM user_profiles WHERE auth_user_id = ${authUserId} LIMIT 1
    `;
    return rows.length > 0 ? rows[0].id : null;
  };

  const existing = await lookup();
  if (existing !== null) return stamp(existing);

  // Only ever create for a real auth user (a ghost/deleted id must not hit the FK).
  const authRows = await sql`SELECT 1 FROM auth_users WHERE id = ${authUserId} LIMIT 1`;
  if (authRows.length === 0) return null;

  const fullName = session.user.name;
  const baseUsername = usernameBaseFor(fullName);

  for (let attempt = 0; attempt < 5; attempt++) {
    const username = await uniqueUsername(baseUsername, async (candidate) => {
      const taken = await sql`
        SELECT id FROM user_profiles WHERE username = ${candidate} LIMIT 1
      `;
      return taken.length > 0;
    });
    const created = await sql`
      INSERT INTO user_profiles (auth_user_id, full_name, username, role)
      VALUES (${authUserId}, ${fullName || null}, ${username}, 'pet_owner')
      ON CONFLICT DO NOTHING
      RETURNING id
    `;
    if (created.length > 0) return stamp(created[0].id);
    // Conflict: a concurrent request created this profile (re-select finds it), or the
    // username was taken in the race (loop and pick another).
    const raced = await lookup();
    if (raced !== null) return stamp(raced);
  }
  return null;
}
