import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { withRequestContext } from "@/app/api/utils/requestContext";

// POST /api/dm-threads/[id]/read — mark the messages I RECEIVED (from the other side) as
// read (ticket 2.27). Participant-scoped UPDATE; a non-participant matches zero rows.
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
      UPDATE dm_messages
      SET read_at = now()
      WHERE thread_id = ${threadId}
        AND sender_user_id <> ${userId}
        AND read_at IS NULL
      RETURNING id
    `;

    return Response.json({ updated: updated.length });
  } catch (error) {
    console.error("[POST /api/dm-threads/[id]/read] Error:", error.message);
    return Response.json(
      { error: "Failed to mark messages read" },
      { status: 500 },
    );
  }
}

const wrappedPOST = withRequestContext(POST);
export { wrappedPOST as POST };
