import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { withRequestContext } from "@/app/api/utils/requestContext";

/**
 * DELETE /api/posts/[id]
 *
 * Delete the caller's OWN post (ticket 2.36). Owner-only: the post is matched on
 * BOTH its id and `user_id = <caller's user_profiles.id>`, so a user can never
 * delete someone else's post (RLS `posts_author_all` enforces the same at the DB
 * level as defence-in-depth).
 *
 * Hard delete — `posts` has no `deleted_at` column, and `post_paws` / `post_barks`
 * are `ON DELETE CASCADE`, so a delete cleans up its reactions. Deleting TODAY's
 * daily update also frees the `(pet_id, post_date) WHERE is_daily_update` unique
 * slot, so `owner-posted-today` flips back to false and the BeReal composer
 * reopens for a re-upload — no extra bookkeeping needed.
 */
async function DELETE(request, { params }) {
  try {
    const postId = parseInt(params?.id ?? "", 10);
    if (!Number.isInteger(postId)) {
      return Response.json({ error: "Invalid post id" }, { status: 400 });
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

    // Owner-scoped delete: returns the row only if it existed AND belonged to me.
    const deleted = await sql`
      DELETE FROM posts
      WHERE id = ${postId} AND user_id = ${userId}
      RETURNING id, is_daily_update, post_date
    `;

    if (deleted.length === 0) {
      // Either the post doesn't exist or it isn't the caller's — don't leak which.
      return Response.json(
        { error: "Post not found or not yours" },
        { status: 404 },
      );
    }

    return Response.json({ success: true, deleted: deleted[0] });
  } catch (error) {
    console.error("[DELETE /api/posts/[id]] ERROR:", error.message);
    return Response.json({ error: "Failed to delete post" }, { status: 500 });
  }
}

// RLS R1-rollout: identity-scoped wrapper (docs/rls-hardening.md).
const wrappedDELETE = withRequestContext(DELETE);
export { wrappedDELETE as DELETE };
