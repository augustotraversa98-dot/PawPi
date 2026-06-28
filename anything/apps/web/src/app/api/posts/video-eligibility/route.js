import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { withRequestContext } from "@/app/api/utils/requestContext";
import { isVideoEligible } from "@/app/api/utils/videoEligibility";

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

    const date = new Date().toISOString().split("T")[0];

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
