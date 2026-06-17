import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { withRequestContext } from "@/app/api/utils/requestContext";

// POST /api/notifications/read — mark the caller's notifications as read (ticket 2.26).
// Body: { all: true } to mark everything read, or { ids: [..] } to mark specific ones.
// RECIPIENT-SCOPED: the UPDATE is bound to the caller's user_profiles.id (and the owner
// RLS UPDATE policy enforces the same), so a user can only mark THEIR OWN as read.
async function POST(request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = await resolveUserId(session.user.id);
    if (userId === null) {
      return Response.json({ error: "User profile not found" }, { status: 404 });
    }

    const body = (await request.json().catch(() => ({}))) ?? {};
    const all = body.all === true;
    const ids = Array.isArray(body.ids)
      ? body.ids.filter((n) => Number.isInteger(n))
      : [];

    if (!all && ids.length === 0) {
      return Response.json(
        { error: "Provide ids[] or all:true" },
        { status: 400 },
      );
    }

    const updated = all
      ? await sql`
          UPDATE notifications
          SET read_at = now()
          WHERE recipient_user_id = ${userId} AND read_at IS NULL
          RETURNING id
        `
      : await sql`
          UPDATE notifications
          SET read_at = now()
          WHERE recipient_user_id = ${userId}
            AND id = ANY(${ids})
            AND read_at IS NULL
          RETURNING id
        `;

    return Response.json({ ok: true, updated: updated.length });
  } catch (error) {
    console.error("[POST /api/notifications/read] Error:", error.message);
    return Response.json(
      { error: "Failed to mark notifications read" },
      { status: 500 },
    );
  }
}

const wrappedPOST = withRequestContext(POST);
export { wrappedPOST as POST };
