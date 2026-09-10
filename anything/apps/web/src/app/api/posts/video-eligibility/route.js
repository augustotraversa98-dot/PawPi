import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { withRequestContext } from "@/app/api/utils/requestContext";
import { isVideoEligible } from "@/app/api/utils/videoEligibility";
import sql from "@/app/api/utils/sql";
import { ownerTodayFrom, utcTodayStr } from "@/app/api/utils/ownerLocalDay";

/**
 * GET /api/posts/video-eligibility
 *
 * Tells the client whether the current user may post a video TODAY (the daily
 * "lucky user" video moment). Server-authoritative and deterministic — the same
 * answer the POST /api/posts enforcement uses, so the UI and the gate never
 * disagree. This is a hint for the UI only; the real gate is the POST re-check.
 *
 * Returns:
 * - eligible: Boolean — true if this user is eligible to post a video today
 * - date: The server "today" (UTC) the answer is computed for (YYYY-MM-DD)
 */
async function GET(request) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Resolve the owner key (user_profiles.id) from the auth user id — the same
    // identity isVideoEligible is keyed on everywhere.
    const userId = await resolveUserId(session.user.id);

    if (userId == null) {
      return Response.json({ error: "User profile not found" }, { status: 404 });
    }

    // Owner-local today (AUDIT_2026-09 A-10) so eligibility is answered for the same day
    // POST /api/posts will stamp. Falls back to UTC today if the lookup is unavailable.
    let date = utcTodayStr();
    try {
      const rows = await sql`
        SELECT (now() AT TIME ZONE COALESCE(timezone, 'America/Buenos_Aires'))::date AS local_today
        FROM user_profiles WHERE id = ${userId}
      `;
      date = ownerTodayFrom(rows?.[0]);
    } catch {
      // keep the UTC fallback
    }

    return Response.json({ eligible: isVideoEligible(userId, date), date });
  } catch (error) {
    console.error(
      "[GET /api/posts/video-eligibility] ERROR:",
      error.message,
    );
    return Response.json(
      { error: "Failed to check video eligibility" },
      { status: 500 },
    );
  }
}

// RLS R1-rollout: identity-scoped wrapper (docs/rls-hardening.md). Handler body
// is unchanged — only its DB connection is now request-scoped.
const wrappedGET = withRequestContext(GET);
export { wrappedGET as GET };
