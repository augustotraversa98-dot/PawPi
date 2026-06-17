import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { withRequestContext } from "@/app/api/utils/requestContext";

// GET /api/dm-threads/unread-count — total unread DM messages for the caller (ticket
// 2.27): messages from the OTHER side, in my threads, still unread. Drives the bell badge.
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

    const rows = await sql`
      SELECT COUNT(*)::int AS unread_count
      FROM dm_messages m
      JOIN dm_threads t ON t.id = m.thread_id
      WHERE (t.user_a_id = ${userId} OR t.user_b_id = ${userId})
        AND m.sender_user_id <> ${userId}
        AND m.read_at IS NULL
    `;

    return Response.json({ unread_count: rows[0]?.unread_count ?? 0 });
  } catch (error) {
    console.error("[GET /api/dm-threads/unread-count] Error:", error.message);
    return Response.json({ error: "Failed to count unread" }, { status: 500 });
  }
}

const wrappedGET = withRequestContext(GET);
export { wrappedGET as GET };
