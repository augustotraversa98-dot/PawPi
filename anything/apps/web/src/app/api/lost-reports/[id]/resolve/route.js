import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { withRequestContext } from "@/app/api/utils/requestContext";

// Owner resolves a lost report (found) → clears lost mode (ticket 2.48). RLS (owner FOR ALL)
// is the real guard; the WHERE owner filter keeps it to the owner's report.

async function POST(request, { params }) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = await resolveUserId(session.user.id);
    if (!userId) {
      return Response.json({ error: "User profile not found" }, { status: 404 });
    }
    const reportId = parseInt(params.id);

    const resolved = await sql`
      UPDATE lost_reports
      SET status = 'resolved', resolved_at = now(), updated_at = now()
      WHERE id = ${reportId} AND owner_user_id = ${userId} AND status = 'active'
      RETURNING id
    `;
    if (resolved.length === 0) {
      return Response.json({ error: "Not found, not yours, or already resolved" }, { status: 404 });
    }
    return Response.json({ ok: true, id: resolved[0].id });
  } catch (error) {
    console.error("[POST /api/lost-reports/[id]/resolve] Error:", error.message);
    return Response.json({ error: "Failed to resolve" }, { status: 500 });
  }
}

const wrappedPOST = withRequestContext(POST);
export { wrappedPOST as POST };
