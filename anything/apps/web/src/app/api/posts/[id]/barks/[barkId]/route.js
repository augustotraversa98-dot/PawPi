import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { withRequestContext } from "@/app/api/utils/requestContext";

/**
 * DELETE /api/posts/[id]/barks/[barkId]
 *
 * Delete the caller's OWN comment/bark (night-run A3 — delete-your-own-content, an
 * Apple-1.2 UGC control that the feed comment sheet was missing). Author-only: the
 * bark is matched on BOTH its id and `user_id = <caller's user_profiles.id>` (and
 * scoped to the post), so a user can never delete someone else's comment. RLS
 * `post_barks_author_all` (user_id = current_app_user_id()) enforces the same at the
 * DB level as defence-in-depth. Hard delete — post_barks has no soft-delete column
 * (moderation "hide" is a separate `hidden_at` admin path).
 */
async function DELETE(request, { params }) {
  try {
    const postId = parseInt(params?.id ?? "", 10);
    const barkId = parseInt(params?.barkId ?? "", 10);
    if (!Number.isInteger(postId) || !Number.isInteger(barkId)) {
      return Response.json({ error: "Invalid id" }, { status: 400 });
    }

    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userProfile = await sql`
      SELECT id FROM user_profiles
      WHERE auth_user_id = ${session.user.id}
      LIMIT 1
    `;
    if (userProfile.length === 0) {
      return Response.json({ error: "User profile not found" }, { status: 404 });
    }
    const userId = userProfile[0].id;

    // Author-scoped delete: returns the row only if it existed AND belonged to me.
    const deleted = await sql`
      DELETE FROM post_barks
      WHERE id = ${barkId} AND post_id = ${postId} AND user_id = ${userId}
      RETURNING id
    `;

    if (deleted.length === 0) {
      // Either the bark doesn't exist or it isn't the caller's — don't leak which.
      return Response.json(
        { error: "Comment not found or not yours" },
        { status: 404 },
      );
    }

    return Response.json({ success: true, deleted: deleted[0] });
  } catch (error) {
    console.error("[DELETE /api/posts/[id]/barks/[barkId]] ERROR:", error.message);
    return Response.json({ error: "Failed to delete comment" }, { status: 500 });
  }
}

const wrappedDELETE = withRequestContext(DELETE);
export { wrappedDELETE as DELETE };
