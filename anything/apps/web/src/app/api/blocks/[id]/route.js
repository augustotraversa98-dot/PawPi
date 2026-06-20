import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { withRequestContext } from "@/app/api/utils/requestContext";

// DELETE /api/blocks/[id] — unblock = soft-delete the caller's own block row (Guideline 1.2, T2).
// RLS user_blocks UPDATE policy keeps it pinned to the blocker; the WHERE adds belt-and-suspenders.
//
// DB is porsager's tagged-template `sql`.

async function DELETE(request, { params }) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = await resolveUserId(session.user.id);
    if (!userId) {
      return Response.json({ error: "User profile not found" }, { status: 404 });
    }
    const blockId = Number(params.id);
    if (!Number.isInteger(blockId) || blockId <= 0) {
      return Response.json({ error: "Invalid block id" }, { status: 400 });
    }

    const updated = await sql`
      UPDATE user_blocks SET deleted_at = now()
      WHERE id = ${blockId} AND blocker_user_id = ${userId} AND deleted_at IS NULL
      RETURNING id
    `;
    if (updated.length === 0) {
      return Response.json({ error: "Block not found" }, { status: 404 });
    }
    return Response.json({ unblocked: true, id: updated[0].id });
  } catch (error) {
    console.error("[DELETE /api/blocks/[id]] Error:", error.message);
    return Response.json({ error: "Failed to unblock user" }, { status: 500 });
  }
}

const wrappedDELETE = withRequestContext(DELETE);
export { wrappedDELETE as DELETE };
