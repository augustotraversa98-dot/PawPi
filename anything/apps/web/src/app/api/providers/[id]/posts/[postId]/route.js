import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import {
  requireProviderRole,
  ALL_PROVIDER_ROLES,
} from "@/app/api/utils/providerAuth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { invalidImageUrls } from "@/app/api/utils/providerValidation";
import {
  withRequestContext,
  withSavepoint,
} from "@/app/api/utils/requestContext";
import { normalizeProviderPostMedia } from "@/app/api/utils/providerPostMedia";

// One storefront post.
//   GET    — PUBLIC single-post view (any logged-in user). The post is visible only when its
//            provider is PUBLISHED and the post is non-deleted (author) AND non-hidden
//            (moderation, Guideline 1.2). A hidden/removed/draft-provider post → 404 on direct
//            view, the same window as the storefront list in providers/public/[slug].
//   PATCH  — EDIT body/image_urls (ticket 2.22): any active staff member may edit (the
//            storefront is the team's, same gate as POST). The composer reopens prefilled and
//            re-saves the full post, so this REPLACES both fields and enforces the same
//            "must carry text or an image" invariant as create. Scoped by provider :id AND
//            postId AND deleted_at IS NULL — a post of another (or a deleted) provider 404s.
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
    // Media columns (0087) ride along so a video post renders its player on the detail screen.
    // DEGRADE-CLEAN: pre-migration those columns are absent → 42703 → fall back to the base select
    // (image-only) inside a savepoint so the aborted statement never 500s the request.
    let rows;
    try {
      rows = await withSavepoint(
        () => sql`
          SELECT pp.id, pp.provider_id, pp.body, pp.image_urls,
                 pp.media_type, pp.video_url, pp.video_thumbnail_url,
                 pp.created_at, pp.author_user_id,
                 (pp.author_user_id = current_app_user_id()) AS is_own
          FROM provider_posts pp
          JOIN providers p ON p.id = pp.provider_id
          WHERE pp.id = ${postId}
            AND pp.provider_id = ${providerId}
            AND pp.deleted_at IS NULL
            AND pp.hidden_at IS NULL
            AND p.status = 'published'
          LIMIT 1
        `,
      );
    } catch (e) {
      if (e?.code !== "42703") throw e;
      rows = await sql`
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
    }
    if (rows.length === 0) {
      return Response.json({ error: "Post not found" }, { status: 404 });
    }

    // Paw count + whether the viewer has pawed (ticket 2.94). DEGRADE-CLEAN: the provider_post_paws
    // table (0085) is hand-applied after this deploys, so a missing table (42P01) → 0 / not-pawed,
    // never a 500. current_app_user_id() is the request-scoped viewer.
    let paw_count = 0;
    let is_pawed = false;
    try {
      const pawRows = await sql`
        SELECT
          COUNT(*)::int AS paw_count,
          COUNT(*) FILTER (WHERE user_id = current_app_user_id()) > 0 AS is_pawed
        FROM provider_post_paws
        WHERE post_id = ${postId}
      `;
      paw_count = pawRows?.[0]?.paw_count ?? 0;
      is_pawed = pawRows?.[0]?.is_pawed === true;
    } catch (e) {
      if (e?.code !== "42P01") throw e; // undefined_table → degrade to the zero state
    }

    return Response.json({ post: { ...rows[0], paw_count, is_pawed } });
  } catch (error) {
    console.error(
      "[GET /api/providers/[id]/posts/[postId]] Error:",
      error.message,
    );
    return Response.json({ error: "Failed to fetch post" }, { status: 500 });
  }
}

async function PATCH(request, { params }) {
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

    // Any active staff member may edit (same gate as create/delete).
    await requireProviderRole(providerId, userId, ALL_PROVIDER_ROLES);

    const payload = (await request.json()) ?? {};
    const text = typeof payload.body === "string" ? payload.body.trim() : "";
    const imageError = invalidImageUrls(payload.image_urls);
    if (imageError) {
      return Response.json({ error: imageError }, { status: 400 });
    }
    const images = Array.isArray(payload.image_urls) ? payload.image_urls : [];

    // Media kind (business daily moments + video). The composer reopens prefilled and re-saves the
    // WHOLE post, so this replaces the media too. 400 on an invalid shape (mirrors POST).
    const media = normalizeProviderPostMedia(payload);
    if (!media.ok) {
      return Response.json({ error: media.error }, { status: 400 });
    }
    const isVideo = media.media_type === "video";

    // A post must carry SOMETHING — text, at least one image, or a video (mirrors POST).
    if (text.length === 0 && images.length === 0 && !isVideo) {
      return Response.json(
        { error: "A post needs text, an image, or a video" },
        { status: 400 },
      );
    }

    // Scoped by provider + postId + non-deleted; RLS (provider_posts_staff_all) also gates it.
    // DEGRADE-CLEAN: pre-0087 the media columns are absent → attempt the media-aware update in a
    // savepoint and, on undefined_column (42703), fall back to the base update so an image edit
    // still works and the aborted statement never 500s the request.
    let updated;
    try {
      updated = await withSavepoint(
        () => sql`
          UPDATE provider_posts
          SET body = ${text.length > 0 ? text : null},
              image_urls = ${images},
              media_type = ${media.media_type},
              video_url = ${media.video_url},
              video_thumbnail_url = ${media.video_thumbnail_url},
              updated_at = NOW()
          WHERE id = ${postId} AND provider_id = ${providerId} AND deleted_at IS NULL
          RETURNING id, provider_id, author_user_id, body, image_urls,
                    media_type, video_url, video_thumbnail_url, created_at, updated_at
        `,
      );
    } catch (e) {
      if (e?.code !== "42703") throw e;
      // Pre-0087: no media columns. A VIDEO edit can't be stored → clean 409 (never a 500). An
      // image/text edit saves fine on the base columns.
      if (isVideo) {
        return Response.json(
          { error: "Video posts aren't available yet — try again soon." },
          { status: 409 },
        );
      }
      updated = await sql`
        UPDATE provider_posts
        SET body = ${text.length > 0 ? text : null}, image_urls = ${images}, updated_at = NOW()
        WHERE id = ${postId} AND provider_id = ${providerId} AND deleted_at IS NULL
        RETURNING id, provider_id, author_user_id, body, image_urls, created_at, updated_at
      `;
    }

    if (updated.length === 0) {
      return Response.json({ error: "Post not found" }, { status: 404 });
    }

    return Response.json({ post: updated[0] });
  } catch (error) {
    if (error.status === 403) {
      return Response.json({ error: error.message }, { status: 403 });
    }
    console.error(
      "[PATCH /api/providers/[id]/posts/[postId]] Error:",
      error.message,
    );
    return Response.json({ error: "Failed to update post" }, { status: 500 });
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
const wrappedPATCH = withRequestContext(PATCH);
const wrappedDELETE = withRequestContext(DELETE);
export { wrappedGET as GET, wrappedPATCH as PATCH, wrappedDELETE as DELETE };
