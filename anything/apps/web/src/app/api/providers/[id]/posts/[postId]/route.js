import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import {
  requireProviderRole,
  ALL_PROVIDER_ROLES,
} from "@/app/api/utils/providerAuth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { withRequestContext } from "@/app/api/utils/requestContext";

// One storefront post.
//   GET    — PUBLIC single-post view (any logged-in user). The post is visible only when its
//            provider is PUBLISHED and the post is non-deleted (author) AND non-hidden
//            (moderation, Guideline 1.2). A hidden/removed/draft-provider post → 404 on direct
//            view, the same window as the storefront list in providers/public/[slug].
//   DELETE — SOFT delete (ticket 2.22): any active staff member may remove a post (the
//            storefront is the team's). Soft delete = set deleted_at (the public read filters
//            deleted_at IS NULL), never a row delete, so the audit trail survives. Scoped by
//            BOTH the path provider :id AND the postId — a post of another provider matches no
//            row -> 404.

async function GET(request, { params }) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const providerId = parseInt(params.id ?? "", 10);
    const postId = parseInt(params.postId ?? "", 10);
    if (!Number.isInteger(providerId) || !Number.isInteger(postId)) {
      return Response.json({ error: "Invalid id" }, { status: 404 });
    }

    // author_user_id is surfaced so the mobile ModerationMenu can Block the author; is_own
    // lets that menu hide Report on the viewer's own post. hidden_at IS NULL (+ the provider
    // must be published, post non-deleted) is the public visibility window — a hidden post 404s.
    const rows = await sql`
      SELECT pp.id, pp.provider_id, pp.body, pp.image_urls, pp.created_at, pp.author_user_id,
             (pp.author_user_id = current_app_user_id()) AS is_own
      FROM provider_posts pp
      JOIN providers p ON p.id = pp.provider_id
      WHERE pp.id = ${postId}
        AND pp.provider_id = ${providerId}
        AND pp.deleted_at IS NULL
        AND pp.hidden_at IS NULL
        AND p.status = 'published'
      LIMIT 1
    `;
    if (rows.length === 0) {
      return Response.json({ error: "Post not found" }, { status: 404 });
    }

    return Response.json({ post: rows[0] });
  } catch (error) {
    console.error(
      "[GET /api/providers/[id]/posts/[postId]] Error:",
      error.message,
    );
    return Response.json({ error: "Failed to fetch post" }, { status: 500 });
  }
}

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

const wrappedGET = withRequestContext(GET);
const wrappedDELETE = withRequestContext(DELETE);
export { wrappedGET as GET, wrappedDELETE as DELETE };
