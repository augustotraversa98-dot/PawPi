import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import {
  requireProviderRole,
  ALL_PROVIDER_ROLES,
} from "@/app/api/utils/providerAuth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { withRequestContext } from "@/app/api/utils/requestContext";

// One storefront post — SOFT delete (ticket 2.22). Any active staff member may remove a
// post (the storefront is the team's). Soft delete = set deleted_at (the public read
// filters deleted_at IS NULL), never a row delete, so the audit trail survives. Scoped by
// BOTH the path provider :id AND the postId — a post of another provider matches no row -> 404.

async function DELETE(request, { params }) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const providerId = params.id;
    const postId = params.postId;
    const userId = await resolveUserId(session.user.id);
    if (userId === null) {
      return Response.json({ error: "User profile not found" }, { status: 404 });
    }

    // Any active staff member may delete.
    await requireProviderRole(providerId, userId, ALL_PROVIDER_ROLES);

    const result = await sql`
      UPDATE provider_posts
      SET deleted_at = NOW(), updated_at = NOW()
      WHERE id = ${postId} AND provider_id = ${providerId} AND deleted_at IS NULL
      RETURNING id
    `;

    if (result.length === 0) {
      return Response.json({ error: "Post not found" }, { status: 404 });
    }

    return Response.json({ ok: true });
  } catch (error) {
    if (error.status === 403) {
      return Response.json({ error: error.message }, { status: 403 });
    }
    console.error(
      "[DELETE /api/providers/[id]/posts/[postId]] Error:",
      error.message,
    );
    return Response.json({ error: "Failed to delete post" }, { status: 500 });
  }
}

const wrappedDELETE = withRequestContext(DELETE);
export { wrappedDELETE as DELETE };
