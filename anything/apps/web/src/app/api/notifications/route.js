import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { withRequestContext } from "@/app/api/utils/requestContext";

// GET /api/notifications — the caller's own notifications, newest first, paginated
// (ticket 2.26). RECIPIENT-SCOPED: the WHERE filter + the owner RLS policy both bind to
// the caller's user_profiles.id, so a user can never read another user's notifications.
// Joins the actor's public identity (username/avatar) for display; never exposes the
// actor's private data.
async function GET(request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = await resolveUserId(session.user.id);
    if (userId === null) {
      return Response.json({ error: "User profile not found" }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const limit = Math.min(
      Math.max(parseInt(searchParams.get("limit") || "30", 10) || 30, 1),
      100,
    );
    const offset = Math.max(parseInt(searchParams.get("offset") || "0", 10) || 0, 0);

    const notifications = await sql`
      SELECT
        n.id,
        n.type,
        n.subject_ref,
        n.body,
        n.read_at,
        n.created_at,
        a.username AS actor_username,
        a.avatar_url AS actor_avatar
      FROM notifications n
      LEFT JOIN user_profiles a ON a.id = n.actor_user_id
      WHERE n.recipient_user_id = ${userId}
      ORDER BY n.created_at DESC, n.id DESC
      LIMIT ${limit} OFFSET ${offset}
    `;

    return Response.json({ notifications });
  } catch (error) {
    console.error("[GET /api/notifications] Error:", error.message);
    return Response.json(
      { error: "Failed to fetch notifications" },
      { status: 500 },
    );
  }
}

const wrappedGET = withRequestContext(GET);
export { wrappedGET as GET };
