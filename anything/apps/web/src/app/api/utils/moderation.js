// Shared moderation read-path helpers (Guideline 1.2, ticket T3).
//
// Two enforcement primitives, both backed by migration 0065:
//   - hidden_at IS NULL — every list/detail read filters out content "removed by us".
//   - block exclusion — feed/discovery/thread reads exclude content authored by a user in
//     an either-direction user_blocks relation with the caller, via the app_user_is_blocked
//     SECURITY DEFINER helper. Read routes are wrapped in withRequestContext, so
//     current_app_user_id() is the caller's user_profiles.id — no need to thread the id in.
//
// isBlockedBetween() is the imperative gate for WRITE routes (DM send / bark / reply): a
// blocked pair cannot interact, surfaced as 403.

import sql from "./sql";

/**
 * Either-direction LIVE block between two user_profiles ids (0065 app_user_is_blocked).
 * Returns false for null/equal ids (no self-block; nothing to gate).
 */
export async function isBlockedBetween(a, b) {
  if (a == null || b == null || a === b) return false;
  const rows = await sql`SELECT app_user_is_blocked(${a}, ${b}) AS blocked`;
  return rows[0]?.blocked === true;
}
