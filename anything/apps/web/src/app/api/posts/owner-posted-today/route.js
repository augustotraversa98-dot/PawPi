import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { withRequestContext } from "@/app/api/utils/requestContext";

/**
 * GET /api/posts/owner-posted-today
 *
 * Owner-level daily-update check that powers the BeReal-style feed lock.
 * Returns whether ANY pet owned by the current user has posted a daily update
 * today. Unlike /today-daily-update (per-pet), this is scoped to the whole
 * owner, so the feed stays unlocked regardless of which dog is active.
 *
 * Scoped strictly to the caller's pets via pets.owner_user_id = user_profiles.id
 * — never unlocks based on another user's pets. Not limited to the loaded feed
 * page; it queries the posts table directly.
 *
 * Returns:
 * - hasPostedToday: Boolean — true if any owned pet has today's daily update
 * - todayDate: The date string being checked (YYYY-MM-DD)
 */
async function GET(request) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const authUserId = session.user.id;

    // Resolve the owner key (user_profiles.id) from the auth user id.
    const userProfile = await sql`
      SELECT id FROM user_profiles
      WHERE auth_user_id = ${authUserId}
      LIMIT 1
    `;

    if (userProfile.length === 0) {
      return Response.json(
        { error: "User profile not found" },
        { status: 404 },
      );
    }

    const userId = userProfile[0].id;
    const todayDate = new Date().toISOString().split("T")[0];

    // Any daily update today across ALL pets owned by this user.
    const rows = await sql`
      SELECT 1
      FROM posts p
      INNER JOIN pets pet ON p.pet_id = pet.id
      WHERE pet.owner_user_id = ${userId}
        AND p.is_daily_update = true
        AND p.post_date = ${todayDate}
      LIMIT 1
    `;

    return Response.json({
      hasPostedToday: rows.length > 0,
      todayDate,
    });
  } catch (error) {
    console.error("[GET /api/posts/owner-posted-today] ERROR:", error.message);
    return Response.json(
      { error: "Failed to check owner's daily update" },
      { status: 500 },
    );
  }
}

// RLS R1-rollout: identity-scoped wrappers (docs/rls-hardening.md). Handler
// bodies are unchanged — only their DB connection is now request-scoped.
const wrappedGET = withRequestContext(GET);
export { wrappedGET as GET };
