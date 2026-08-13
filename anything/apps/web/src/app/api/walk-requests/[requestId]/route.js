import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { withRequestContext } from "@/app/api/utils/requestContext";

// PATCH /api/walk-requests/[requestId] — the OWNER cancels their OWN still-open request (ticket C1).
// The owner UPDATE RLS policy (0092) permits only open→cancelled on an owned row, so this can never
// self-accept. Non-integer id → 404 before SQL. Degrade clean: no table → friendly 503.
async function PATCH(request, { params }) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const requestId = Number(params.requestId);
    if (!Number.isInteger(requestId)) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }

    const userId = await resolveUserId(session.user.id);
    if (userId === null) {
      return Response.json({ error: "User profile not found" }, { status: 404 });
    }

    let rows;
    try {
      rows = await sql`
        UPDATE walk_requests
        SET status = 'cancelled'
        WHERE id = ${requestId} AND owner_user_id = ${userId} AND status = 'open'
        RETURNING *
      `;
    } catch (e) {
      if (e?.code === "42P01") {
        return Response.json(
          { error: "Walk requests are not available yet" },
          { status: 503 },
        );
      }
      throw e;
    }

    if (rows.length === 0) {
      // Not the owner's, already accepted/cancelled/expired, or unknown → nothing to cancel.
      return Response.json(
        { error: "Request not found or no longer open" },
        { status: 404 },
      );
    }

    return Response.json({ request: rows[0] });
  } catch (error) {
    console.error("[PATCH /api/walk-requests/[requestId]] Error:", error?.message);
    return Response.json({ error: "Failed to cancel walk request" }, { status: 500 });
  }
}

const wrappedPATCH = withRequestContext(PATCH);
export { wrappedPATCH as PATCH };
