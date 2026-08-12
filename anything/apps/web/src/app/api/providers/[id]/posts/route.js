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

// Provider STOREFRONT posts (ticket 2.22). The dashboard-side management surface:
//   GET  — list ALL of this provider's non-deleted posts (any active staff).
//   POST — compose a post: body and/or images (any active staff is the author).
//
// Identity resolves auth_users.id -> user_profiles.id; authorization is provider_staff
// membership via requireProviderRole (ANY active role can post — the storefront voice is
// the team's, not admin-only). The public storefront read lives in providers/public/[slug].
// DB is porsager's tagged-template `sql` (SCHEMA_NOTES "neon→porsager").

async function GET(request, { params }) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const providerId = params.id;
    const userId = await resolveUserId(session.user.id);
    if (userId === null) {
      return Response.json({ error: "User profile not found" }, { status: 404 });
    }

    // Any active staff member may read the management list.
    await requireProviderRole(providerId, userId, ALL_PROVIDER_ROLES);

    // Include the media columns (0087) so the composer can prefill a video when editing.
    // DEGRADE-CLEAN: pre-migration those columns are absent → undefined_column (42703) → fall back
    // to the base select inside a savepoint so the aborted statement never 500s the request.
    let posts;
    try {
      posts = await withSavepoint(
        () => sql`
          SELECT id, provider_id, author_user_id, body, image_urls,
                 media_type, video_url, video_thumbnail_url, created_at, updated_at
          FROM provider_posts
          WHERE provider_id = ${providerId} AND deleted_at IS NULL
          ORDER BY created_at DESC, id DESC
        `,
      );
    } catch (e) {
      if (e?.code !== "42703") throw e;
      posts = await sql`
        SELECT id, provider_id, author_user_id, body, image_urls, created_at, updated_at
        FROM provider_posts
        WHERE provider_id = ${providerId} AND deleted_at IS NULL
        ORDER BY created_at DESC, id DESC
      `;
    }

    return Response.json({ posts });
  } catch (error) {
    if (error.status === 403) {
      return Response.json({ error: error.message }, { status: 403 });
    }
    console.error("[GET /api/providers/[id]/posts] Error:", error.message);
    return Response.json({ error: "Failed to fetch posts" }, { status: 500 });
  }
}

async function POST(request, { params }) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const providerId = params.id;
    const userId = await resolveUserId(session.user.id);
    if (userId === null) {
      return Response.json({ error: "User profile not found" }, { status: 404 });
    }

    // Any active staff member may post.
    await requireProviderRole(providerId, userId, ALL_PROVIDER_ROLES);

    const body = (await request.json()) ?? {};
    const text = typeof body.body === "string" ? body.body.trim() : "";
    const imageError = invalidImageUrls(body.image_urls);
    if (imageError) {
      return Response.json({ error: imageError }, { status: 400 });
    }
    const images = Array.isArray(body.image_urls) ? body.image_urls : [];

    // Media kind (ticket: business daily moments + video). An image post is the default; a video
    // post carries media_type='video' + a video_url (validated here). 400 on an invalid shape.
    const media = normalizeProviderPostMedia(body);
    if (!media.ok) {
      return Response.json({ error: media.error }, { status: 400 });
    }
    const isVideo = media.media_type === "video";

    // A post must carry SOMETHING — text, at least one image, or a video.
    if (text.length === 0 && images.length === 0 && !isVideo) {
      return Response.json(
        { error: "A post needs text, an image, or a video" },
        { status: 400 },
      );
    }

    // RLS (provider_posts_staff_all) scopes the insert to active staff of THIS provider.
    // DEGRADE-CLEAN: the media columns (0087) are hand-applied AFTER this deploys. Attempt the
    // media-aware insert inside a savepoint (a failed statement would otherwise abort the request
    // transaction — see requestContext.withSavepoint); on undefined_column (42703) fall back to
    // the base image-only insert so an image post still works pre-migration and never 500s.
    let created;
    try {
      created = await withSavepoint(
        () => sql`
          INSERT INTO provider_posts
            (provider_id, author_user_id, body, image_urls, media_type, video_url, video_thumbnail_url)
          VALUES (
            ${providerId}, ${userId}, ${text.length > 0 ? text : null}, ${images},
            ${media.media_type}, ${media.video_url}, ${media.video_thumbnail_url}
          )
          RETURNING id, provider_id, author_user_id, body, image_urls,
                    media_type, video_url, video_thumbnail_url, created_at, updated_at
        `,
      );
    } catch (e) {
      if (e?.code !== "42703") throw e;
      // Pre-0087: the media columns don't exist yet. A VIDEO post can't be stored → answer with a
      // clean 409 (never a blank post, never a 500); the composer surfaces it and stays image-only.
      if (isVideo) {
        return Response.json(
          { error: "Video posts aren't available yet — try again soon." },
          { status: 409 },
        );
      }
      // An image/text post stores fine on the base columns.
      created = await sql`
        INSERT INTO provider_posts (provider_id, author_user_id, body, image_urls)
        VALUES (${providerId}, ${userId}, ${text.length > 0 ? text : null}, ${images})
        RETURNING id, provider_id, author_user_id, body, image_urls, created_at, updated_at
      `;
    }

    return Response.json({ post: created[0] }, { status: 201 });
  } catch (error) {
    if (error.status === 403) {
      return Response.json({ error: error.message }, { status: 403 });
    }
    console.error("[POST /api/providers/[id]/posts] Error:", error.message);
    return Response.json({ error: "Failed to create post" }, { status: 500 });
  }
}

// RLS R1-rollout: identity-scoped wrappers (docs/rls-hardening.md).
const wrappedGET = withRequestContext(GET);
const wrappedPOST = withRequestContext(POST);
export { wrappedGET as GET, wrappedPOST as POST };
