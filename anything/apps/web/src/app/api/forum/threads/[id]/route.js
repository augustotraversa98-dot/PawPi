import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { withRequestContext } from "@/app/api/utils/requestContext";

// A single forum thread + its comments (ticket 2.44). GET = detail; PATCH = author edit;
// DELETE = author soft-delete (sets deleted_at). RLS enforces author-only writes; the route
// also returns the caller's own votes so the UI can highlight them.

async function GET(request, { params }) {
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

    const threads = await sql`
      SELECT
        t.id, t.category, t.title, t.body, t.image_urls, t.score, t.created_at,
        t.author_user_id,
        up.username AS author_username,
        up.avatar_url AS author_avatar,
        (
          SELECT v.value FROM forum_votes v
          WHERE v.target_type = 'thread' AND v.target_id = t.id AND v.user_id = ${userId}
        ) AS my_vote
      FROM forum_threads t
      JOIN user_profiles up ON up.id = t.author_user_id
      WHERE t.id = ${threadId} AND t.deleted_at IS NULL
        -- Moderation (T3): a hidden thread, or one from a blocked user, 404s.
        AND t.hidden_at IS NULL
        AND NOT app_user_is_blocked(${userId}, t.author_user_id)
    `;

    if (threads.length === 0) {
      return Response.json({ error: "Thread not found" }, { status: 404 });
    }

    const comments = await sql`
      SELECT
        c.id, c.thread_id, c.parent_comment_id, c.body, c.score, c.created_at,
        c.author_user_id,
        up.username AS author_username,
        up.avatar_url AS author_avatar,
        (
          SELECT v.value FROM forum_votes v
          WHERE v.target_type = 'comment' AND v.target_id = c.id AND v.user_id = ${userId}
        ) AS my_vote
      FROM forum_comments c
      JOIN user_profiles up ON up.id = c.author_user_id
      WHERE c.thread_id = ${threadId} AND c.deleted_at IS NULL
        -- Moderation (T3): hide comments removed by us + comments from a blocked user.
        AND c.hidden_at IS NULL
        AND NOT app_user_is_blocked(${userId}, c.author_user_id)
      ORDER BY c.created_at ASC
    `;

    return Response.json({ thread: threads[0], comments });
  } catch (error) {
    console.error("[GET /api/forum/threads/[id]] Error:", error.message);
    return Response.json({ error: "Failed to load thread" }, { status: 500 });
  }
}

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
    const threadId = parseInt(params.id);
    const body = (await request.json().catch(() => ({}))) ?? {};
    const title = body.title !== undefined ? (body.title || "").trim() : undefined;
    const text = body.body !== undefined ? (body.body || "").trim() || null : undefined;
    const category =
      body.category !== undefined ? (body.category || "General").trim() : undefined;

    if (title !== undefined && !title) {
      return Response.json({ error: "Title cannot be empty" }, { status: 400 });
    }

    // RLS (author-only UPDATE) is the real guard; COALESCE keeps unset fields unchanged.
    const result = await sql`
      UPDATE forum_threads
      SET title = COALESCE(${title ?? null}, title),
          body = ${text === undefined ? sql`body` : text},
          category = COALESCE(${category ?? null}, category),
          updated_at = now()
      WHERE id = ${threadId} AND author_user_id = ${userId} AND deleted_at IS NULL
      RETURNING *
    `;

    if (result.length === 0) {
      return Response.json({ error: "Not found or not yours" }, { status: 404 });
    }
    return Response.json({ thread: result[0] });
  } catch (error) {
    console.error("[PATCH /api/forum/threads/[id]] Error:", error.message);
    return Response.json({ error: "Failed to update thread" }, { status: 500 });
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
    const threadId = parseInt(params.id);

    const result = await sql`
      UPDATE forum_threads
      SET deleted_at = now(), updated_at = now()
      WHERE id = ${threadId} AND author_user_id = ${userId} AND deleted_at IS NULL
      RETURNING id
    `;

    if (result.length === 0) {
      return Response.json({ error: "Not found or not yours" }, { status: 404 });
    }
    return Response.json({ ok: true, id: result[0].id });
  } catch (error) {
    console.error("[DELETE /api/forum/threads/[id]] Error:", error.message);
    return Response.json({ error: "Failed to delete thread" }, { status: 500 });
  }
}

const wrappedGET = withRequestContext(GET);
const wrappedPATCH = withRequestContext(PATCH);
const wrappedDELETE = withRequestContext(DELETE);
export { wrappedGET as GET, wrappedPATCH as PATCH, wrappedDELETE as DELETE };
