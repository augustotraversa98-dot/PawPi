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

export async function resolveUserId(authUserId) {
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
// setCurrentUserId is imported lazily to avoid a static import cycle: requestContext
// imports resolveUserId from this module.
export async function ensureUserProfile(authUserId, { fullName, email } = {}) {
  const existing = await sql`
    SELECT id FROM user_profiles WHERE auth_user_id = ${authUserId} LIMIT 1
  `;
  if (existing.length > 0) return existing[0].id;

  // Username base from email local-part, then name, then a timestamp — same
  // precedence as pets/route.js.
  const baseUsername =
    email?.split('@')[0] ||
    fullName?.toLowerCase().replace(/\s+/g, '') ||
    `user_${Date.now()}`;
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
