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
