import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { withRequestContext } from "@/app/api/utils/requestContext";

// One provider-post comment — SOFT take-down (Phase C, migration 0082).
//   DELETE — auth required. The AUTHOR removes their own comment (sets deleted_at); a PROVIDER
//            ADMIN hides any comment on their provider (sets hidden_at). Both are soft UPDATEs
//            (consistent with provider_posts); neither is a row delete. Scoped by provider :id +
//            :postId + :commentId. The RLS update policy (author-or-admin) is the backstop.
//
// Defense-in-depth (the reorder routing lesson): a non-integer :commentId 404s before any SQL, so
// a stray non-numeric path segment is never bound as an integer.

const isIntId = (v) => /^\d+$/.test(String(v));

async function DELETE(request, { params }) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const providerId = params.id;
    const postId = params.postId;
    const commentId = params.commentId;
    if (!isIntId(providerId) || !isIntId(postId) || !isIntId(commentId)) {
      return Response.json({ error: "Comment not found" }, { status: 404 });
    }

    const userId = await resolveUserId(session.user.id);
    if (userId === null) {
      return Response.json({ error: "User profile not found" }, { status: 404 });
    }

    // The comment must be currently visible (RLS read) and belong to this post + provider.
    const rows = await sql`
      SELECT id, author_user_id
      FROM provider_post_comments
      WHERE id = ${commentId} AND post_id = ${postId} AND provider_id = ${providerId}
      LIMIT 1
    `;
    if (rows.length === 0) {
      return Response.json({ error: "Comment not found" }, { status: 404 });
    }

    const isAuthor = rows[0].author_user_id === userId;
    let isAdmin = false;
    if (!isAuthor) {
      const [{ ok }] = await sql`SELECT app_is_provider_admin(${providerId}) AS ok`;
      isAdmin = ok === true;
    }
    if (!isAuthor && !isAdmin) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    // Author → deleted_at ("I removed my comment"); provider admin → hidden_at ("removed by the
    // business"). Both UPDATEs are also gated by the RLS update policy (author-or-admin). NO
    // RETURNING: the take-down makes the row fail the SELECT policy (deleted_at/hidden_at set), and
    // a RETURNING clause re-checks the new row against that policy → an RLS error; we use the
    // affected-row count instead.
    const updated = isAuthor
      ? await sql`
          UPDATE provider_post_comments
          SET deleted_at = NOW(), updated_at = NOW()
          WHERE id = ${commentId} AND provider_id = ${providerId} AND deleted_at IS NULL
        `
      : await sql`
          UPDATE provider_post_comments
          SET hidden_at = NOW(), updated_at = NOW()
          WHERE id = ${commentId} AND provider_id = ${providerId} AND hidden_at IS NULL
        `;

    if (updated.count === 0) {
      return Response.json({ error: "Comment not found" }, { status: 404 });
    }

    return Response.json({ ok: true });
  } catch (error) {
    console.error(
      "[DELETE /api/providers/[id]/posts/[postId]/comments/[commentId]] Error:",
      error.message,
    );
    return Response.json({ error: "Failed to remove comment" }, { status: 500 });
  }
}

const wrappedDELETE = withRequestContext(DELETE);
export { wrappedDELETE as DELETE };
