import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { withRequestContext } from "@/app/api/utils/requestContext";

// POST /api/threads/[id]/read — mark a thread read (Phase 2 ticket 2.5).
//
// Stamps read_at = now() on every UNREAD message in the thread that was sent by the
// OTHER side (sender_user_id <> me) — those are the ones counted as the caller's
// unread. RLS (0031) scopes the UPDATE to threads the caller participates in, so a
// non-participant's call is a no-op (zero rows updated). Returns { updated }.
//
// DB is porsager's tagged-template `sql` (SCHEMA_NOTES "neon→porsager").
async function POST(request, { params }) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = await resolveUserId(session.user.id);
    if (userId === null) {
      return Response.json({ error: "User profile not found" }, { status: 404 });
    }

    const threadId = params.id;
    const updated = await sql`
      UPDATE messages
      SET read_at = now()
      WHERE thread_id = ${threadId}
        AND sender_user_id <> ${userId}
        AND read_at IS NULL
      RETURNING id
    `;

    return Response.json({ updated: updated.length });
  } catch (error) {
    console.error("[POST /api/threads/[id]/read] Error:", error.message);
    return Response.json({ error: "Failed to mark read" }, { status: 500 });
  }
}

const wrappedPOST = withRequestContext(POST);
export { wrappedPOST as POST };
