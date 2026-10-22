import { auth } from "@/auth";
import { withRequestContext } from "@/app/api/utils/requestContext";
import { getViewerDailyStatus } from "@/app/api/utils/dailyMomentsGate";

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

    // Shared with the pet-profile / history gates (utils/dailyMomentsGate.js) so the
    // Feed's lock and the data the API withholds are decided by the same query.
    const status = await getViewerDailyStatus(session.user.id);

    if (!status) {
      return Response.json(
        { error: "User profile not found" },
        { status: 404 },
      );
    }

    return Response.json({
      hasPostedToday: status.hasPostedToday,
      todayDate: status.todayDate,
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
