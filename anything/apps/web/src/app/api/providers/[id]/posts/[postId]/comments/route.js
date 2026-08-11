import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { withRequestContext } from "@/app/api/utils/requestContext";

// Comments on one provider STOREFRONT post (Phase C, migration 0082).
//   GET  — PUBLIC (no auth): the "guest can open" fix. Lists VISIBLE comments oldest→newest with
//          the author's display name + avatar. RLS (provider_post_comments_read) returns only
//          non-deleted, non-hidden rows; user_profiles is RLS-exempt so the author join works for
//          guests too. Scoped by both provider :id and :postId.
//   POST — auth required; author = the current user; empty body rejected. RLS insert policy also
//          enforces author = current user AND that the post is real + visible.
//
// DB is porsager's tagged-template `sql`. These live under posts/[postId]/ as a static "comments"
// segment (no [param] sibling), so no static-vs-param routing collision — but the URL-level tests
// (services/comments-*.integration) prove routing through the real Hono router regardless.

const isIntId = (v) => /^\d+$/.test(String(v));

async function GET(request, { params }) {
  try {
    const providerId = params.id;
    const postId = params.postId;
    // Malformed ids → empty list (public; never bind a non-integer as SQL int, never leak).
    if (!isIntId(providerId) || !isIntId(postId)) {
      return Response.json({ comments: [] });
    }

    // PUBLIC read: the visible-comment window is enforced HERE (deleted_at/hidden_at IS NULL) so
    // that even a signed-in author or provider admin — who CAN see their own removed rows via RLS
    // (needed for the soft-delete UPDATE) — never gets a removed comment back in this list. No
    // auth required.
    const comments = await sql`
      SELECT c.id, c.post_id, c.provider_id, c.author_user_id, c.body, c.created_at,
             up.full_name AS author_name,
             up.username AS author_username,
             up.avatar_url AS author_avatar_url
      FROM provider_post_comments c
      JOIN user_profiles up ON up.id = c.author_user_id
      WHERE c.post_id = ${postId} AND c.provider_id = ${providerId}
        AND c.deleted_at IS NULL AND c.hidden_at IS NULL
      ORDER BY c.created_at ASC, c.id ASC
    `;

    return Response.json({ comments });
  } catch (error) {
    console.error(
      "[GET /api/providers/[id]/posts/[postId]/comments] Error:",
      error.message,
    );
    return Response.json({ error: "Failed to fetch comments" }, { status: 500 });
  }
}

async function POST(request, { params }) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const providerId = params.id;
    const postId = params.postId;
    if (!isIntId(providerId) || !isIntId(postId)) {
      return Response.json({ error: "Post not found" }, { status: 404 });
    }

    const userId = await resolveUserId(session.user.id);
    if (userId === null) {
      return Response.json({ error: "User profile not found" }, { status: 404 });
    }

    const bodyJson = (await request.json()) ?? {};
    const text = typeof bodyJson.body === "string" ? bodyJson.body.trim() : "";
    if (text.length === 0) {
      return Response.json({ error: "Comment can't be empty" }, { status: 400 });
    }

    // The post must be real + visible (published provider, non-deleted, non-hidden) — the same
    // window the comment will live in, and what the RLS insert policy re-checks. A clean 404 here
    // avoids relying on an RLS-violation error path for the common "post gone" case.
    const post = await sql`
      SELECT 1
      FROM provider_posts pp
      JOIN providers p ON p.id = pp.provider_id
      WHERE pp.id = ${postId}
        AND pp.provider_id = ${providerId}
        AND pp.deleted_at IS NULL
        AND pp.hidden_at IS NULL
        AND p.status = 'published'
      LIMIT 1
    `;
    if (post.length === 0) {
      return Response.json({ error: "Post not found" }, { status: 404 });
    }

    // author_user_id = current user; RLS insert policy + the table CHECK (non-empty body) are the
    // backstop. provider_id is denormalized from the (verified) post.
    const created = await sql`
      INSERT INTO provider_post_comments (post_id, provider_id, author_user_id, body)
      VALUES (${postId}, ${providerId}, ${userId}, ${text})
      RETURNING id, post_id, provider_id, author_user_id, body, created_at
    `;

    const author = await sql`
      SELECT full_name AS author_name, username AS author_username, avatar_url AS author_avatar_url
      FROM user_profiles WHERE id = ${userId}
    `;

    return Response.json(
      { comment: { ...created[0], ...(author[0] ?? {}) } },
      { status: 201 },
    );
  } catch (error) {
    console.error(
      "[POST /api/providers/[id]/posts/[postId]/comments] Error:",
      error.message,
    );
    return Response.json({ error: "Failed to add comment" }, { status: 500 });
  }
}

const wrappedGET = withRequestContext(GET);
const wrappedPOST = withRequestContext(POST);
export { wrappedGET as GET, wrappedPOST as POST };
