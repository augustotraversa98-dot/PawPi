import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { withRequestContext } from "@/app/api/utils/requestContext";

// Author edit / soft-delete of a forum comment (ticket 2.44). RLS enforces author-only.

async function PATCH(request, { params }) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = await resolveUserId(session.user.id);
    if (!userId) {
      return Response.json({ error: "User profile not found" }, { status: 404 });
    }
    const commentId = parseInt(params.id);
    const body = await request.json();
    const text = (body.body || "").trim();
    if (!text) {
      return Response.json({ error: "Comment cannot be empty" }, { status: 400 });
    }

    const result = await sql`
      UPDATE forum_comments
      SET body = ${text}, updated_at = now()
      WHERE id = ${commentId} AND author_user_id = ${userId} AND deleted_at IS NULL
      RETURNING *
    `;
    if (result.length === 0) {
      return Response.json({ error: "Not found or not yours" }, { status: 404 });
    }
    return Response.json({ comment: result[0] });
  } catch (error) {
    console.error("[PATCH /api/forum/comments/[id]] Error:", error.message);
    return Response.json({ error: "Failed to update comment" }, { status: 500 });
  }
}

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
    const commentId = parseInt(params.id);

    const result = await sql`
      UPDATE forum_comments
      SET deleted_at = now(), updated_at = now()
      WHERE id = ${commentId} AND author_user_id = ${userId} AND deleted_at IS NULL
      RETURNING id
    `;
    if (result.length === 0) {
      return Response.json({ error: "Not found or not yours" }, { status: 404 });
    }
    return Response.json({ ok: true, id: result[0].id });
  } catch (error) {
    console.error("[DELETE /api/forum/comments/[id]] Error:", error.message);
    return Response.json({ error: "Failed to delete comment" }, { status: 500 });
  }
}

const wrappedPATCH = withRequestContext(PATCH);
const wrappedDELETE = withRequestContext(DELETE);
export { wrappedPATCH as PATCH, wrappedDELETE as DELETE };
