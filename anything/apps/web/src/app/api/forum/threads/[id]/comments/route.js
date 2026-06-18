import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { withRequestContext } from "@/app/api/utils/requestContext";

// Create a comment (or a one-level reply) on a forum thread (ticket 2.44). RLS pins the
// author = caller; the thread must exist and not be deleted.

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
    const threadId = parseInt(params.id);
    const body = await request.json();
    const text = (body.body || "").trim();
    const parentCommentId = body.parentCommentId
      ? parseInt(body.parentCommentId)
      : null;

    if (!text) {
      return Response.json({ error: "Comment cannot be empty" }, { status: 400 });
    }

    // The thread must exist (any-authed read RLS) and be live.
    const threads = await sql`
      SELECT id FROM forum_threads WHERE id = ${threadId} AND deleted_at IS NULL
    `;
    if (threads.length === 0) {
      return Response.json({ error: "Thread not found" }, { status: 404 });
    }

    const result = await sql`
      INSERT INTO forum_comments (thread_id, author_user_id, parent_comment_id, body)
      VALUES (${threadId}, ${userId}, ${parentCommentId}, ${text})
      RETURNING *
    `;

    return Response.json({ comment: result[0] }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/forum/threads/[id]/comments] Error:", error.message);
    return Response.json({ error: "Failed to add comment" }, { status: 500 });
  }
}

const wrappedPOST = withRequestContext(POST);
export { wrappedPOST as POST };
