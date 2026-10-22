import sql from "@/app/api/utils/sql";
import { ownerTodayFrom } from "@/app/api/utils/ownerLocalDay";

// The daily-post unlock ("BeReal" mechanic), server side. A viewer must post their own
// daily moment to see other pets' moments. This is the ONE place that decides whether the
// viewer has posted today, shared by:
//   - GET /api/posts/owner-posted-today   (the Feed's lock — the client reads it)
//   - GET /api/pets/[id]/profile          (hides the Daily moments grid)
//   - GET /api/posts/history              (a pet's daily-post history)
// so the lock the Feed shows and the data the API withholds can never disagree.
//
// Identity: the caller passes the AUTH user id (session.user.id). It is mapped to
// user_profiles.id here, and the check is owner-scoped on pets.owner_user_id = user_profiles.id
// (any of the viewer's pets counts) — never on the auth id.
//
// Returns null when the viewer has no user_profiles row yet (they cannot have posted).
// Otherwise { userId, todayDate, isOwner, hasPostedToday }:
//   - isOwner is true when `targetOwnerId` is the viewer's own user_profiles.id (own pets are
//     never gated); the posted-today query is skipped then and hasPostedToday is null.
export async function getViewerDailyStatus(authUserId, { targetOwnerId } = {}) {
  const profileRows = await sql`
    SELECT id, (now() AT TIME ZONE COALESCE(timezone, 'America/Buenos_Aires'))::date AS local_today
    FROM user_profiles
    WHERE auth_user_id = ${authUserId}
    LIMIT 1
  `;
  if (profileRows.length === 0) return null;

  const userId = profileRows[0].id;
  // Owner-local today (AUDIT_2026-09 A-10) — must agree with the Care Ring and POST /api/posts.
  const todayDate = ownerTodayFrom(profileRows[0]);

  if (targetOwnerId != null && String(targetOwnerId) === String(userId)) {
    return { userId, todayDate, isOwner: true, hasPostedToday: null };
  }

  // Any daily update today across ALL pets owned by this viewer.
  const rows = await sql`
    SELECT 1
    FROM posts p
    INNER JOIN pets pet ON p.pet_id = pet.id
    WHERE pet.owner_user_id = ${userId}
      AND p.is_daily_update = true
      AND p.post_date = ${todayDate}
    LIMIT 1
  `;

  return { userId, todayDate, isOwner: false, hasPostedToday: rows.length > 0 };
}
