import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import {
  withRequestContext,
  withSavepoint,
} from "@/app/api/utils/requestContext";
import { withRateLimit } from "@/app/api/utils/rateLimit";
import { moderationResponse } from "@/app/api/utils/moderateText";
import { isVideoEligible } from "@/app/api/utils/videoEligibility";

// Following-first, then Suggested. `following` and `suggested` are each already
// ordered newest-first by SQL and are disjoint by construction (Suggested
// excludes followed pets), so we just concatenate Following ahead of Suggested,
// de-dupe by post id as a guarantee, and slice the requested page window.
//
// Each group is fetched with `LIMIT (offset + limit)`, so concatenating the two
// fetched prefixes yields the correct global window for any offset/limit: if
// Following has >= offset+limit rows the page is pure Following; otherwise
// Following is exhausted and Suggested backfills the remainder.
// A feed item's dedupe identity. Pet posts and business (provider) posts each have
// their own integer id space, so key by (type, id) — a pet post id 5 and a business
// post id 5 must never collide and drop one another. Pet posts carry no item_type.
const feedItemKey = (post) => `${post.item_type ?? "pet_post"}:${post.id}`;

export function mergeFeed(following, suggested, { limit, offset }) {
  const seen = new Set();
  const ordered = [];
  // Tag each post's feed_group so the client can render a "Suggested for you"
  // divider at the boundary (ticket 2.58) — additive labeling, ordering unchanged.
  for (const post of following) {
    const key = feedItemKey(post);
    if (seen.has(key)) continue;
    seen.add(key);
    ordered.push({ ...post, feed_group: "following" });
  }
  for (const post of suggested) {
    const key = feedItemKey(post);
    if (seen.has(key)) continue;
    seen.add(key);
    ordered.push({ ...post, feed_group: "suggested" });
  }
  return ordered.slice(offset, offset + limit);
}

// Interleave the pet "Following+own" posts with the business posts from providers the
// viewer FOLLOWS, ordered newest-first, then truncate to `cap` (= offset+limit). Both
// inputs are already newest-first, so a standard merge of the two yields the true global
// top-`cap` of their union — which keeps mergeFeed's pagination invariant intact (a full
// Following window is still pure Following; Suggested only backfills the remainder).
// Business posts keep their item_type discriminator so the client renders them distinctly.
export function mergeFollowingByRecency(petPosts, providerPosts, cap) {
  const a = Array.isArray(petPosts) ? petPosts : [];
  const b = Array.isArray(providerPosts) ? providerPosts : [];
  if (b.length === 0) return a.slice(0, cap);
  const ts = (p) => new Date(p?.created_at ?? 0).getTime();
  const merged = [...a, ...b].sort((x, y) => ts(y) - ts(x));
  return merged.slice(0, cap);
}

// Posts from businesses the CURRENT USER follows (provider_follows, 0083) — the business
// "daily moments" that surface in a follower's feed. Public provider fields + the post's
// media + paw/comment counts only; never provider-private data. Scoped to published
// providers' visible (non-deleted, non-hidden) posts. current_app_user_id() is the
// request-scoped viewer, so a non-follower selects nothing (the follows subquery is empty).
//
// DEGRADE-CLEAN, and crucially SAVEPOINT-WRAPPED: this route runs inside withRequestContext's
// per-request transaction, where ANY query error aborts the whole tx and the wrapper turns a
// would-be-handled error into a 500 (see requestContext.withSavepoint). So every fallible read
// runs in its own savepoint:
//   • video columns absent (pre-0087) → undefined_column (42703) → retry WITHOUT them, as image;
//   • provider_follows/provider_posts absent → undefined_table (42P01) → [];
//   • provider_post_paws/comments absent → counts degrade to 0.
// The feed's pet content is never disturbed and the endpoint never 500s on any of these.
async function fetchFollowedProviderPosts(cap) {
  // Two full queries (NOT a shared template with an interpolated column fragment): the media-aware
  // read and, for pre-0087 degrade, the image-only read that synthesizes the media columns.
  const selectWithMedia = () =>
    withSavepoint(
      () => sql`
        SELECT
          pp.id, pp.provider_id, pp.body, pp.image_urls,
          pp.media_type, pp.video_url, pp.video_thumbnail_url,
          pp.created_at,
          pr.name AS provider_name, pr.slug AS provider_slug, pr.logo_url AS provider_logo_url
        FROM provider_posts pp
        JOIN providers pr ON pr.id = pp.provider_id
        WHERE pp.provider_id IN (
                SELECT provider_id FROM provider_follows
                WHERE follower_user_id = current_app_user_id()
              )
          AND pp.deleted_at IS NULL
          AND pp.hidden_at IS NULL
          AND pr.status = 'published'
        ORDER BY pp.created_at DESC, pp.id DESC
        LIMIT ${cap}
      `,
    );

  const selectImageOnly = () =>
    withSavepoint(
      () => sql`
        SELECT
          pp.id, pp.provider_id, pp.body, pp.image_urls,
          'image'::text AS media_type, NULL::text AS video_url, NULL::text AS video_thumbnail_url,
          pp.created_at,
          pr.name AS provider_name, pr.slug AS provider_slug, pr.logo_url AS provider_logo_url
        FROM provider_posts pp
        JOIN providers pr ON pr.id = pp.provider_id
        WHERE pp.provider_id IN (
                SELECT provider_id FROM provider_follows
                WHERE follower_user_id = current_app_user_id()
              )
          AND pp.deleted_at IS NULL
          AND pp.hidden_at IS NULL
          AND pr.status = 'published'
        ORDER BY pp.created_at DESC, pp.id DESC
        LIMIT ${cap}
      `,
    );

  let rows;
  try {
    rows = await selectWithMedia();
  } catch (e) {
    if (e?.code === "42703") {
      // Pre-0087: no media columns yet → image-only read (video option is hidden in compose too).
      rows = await selectImageOnly();
    } else if (e?.code === "42P01") {
      // provider_follows or provider_posts absent → no business posts in the feed.
      return [];
    } else {
      throw e;
    }
  }

  if (!Array.isArray(rows) || rows.length === 0) return [];
  const ids = rows.map((r) => r.id);

  // Paw + comment counts, each best-effort (the tables are hand-applied separately; a missing
  // table degrades that count to 0 without touching the rest of the feed).
  const pawMap = {};
  await withSavepoint(async () => {
    const counts = await sql`
      SELECT post_id, COUNT(*)::int AS n
      FROM provider_post_paws
      WHERE post_id = ANY(${ids})
      GROUP BY post_id
    `;
    for (const c of counts) pawMap[c.post_id] = c.n;
  }).catch(() => {});

  const commentMap = {};
  await withSavepoint(async () => {
    const counts = await sql`
      SELECT post_id, COUNT(*)::int AS n
      FROM provider_post_comments
      WHERE post_id = ANY(${ids}) AND deleted_at IS NULL AND hidden_at IS NULL
      GROUP BY post_id
    `;
    for (const c of counts) commentMap[c.post_id] = c.n;
  }).catch(() => {});

  return rows.map((r) => ({
    id: r.id,
    provider_id: r.provider_id,
    body: r.body,
    image_urls: Array.isArray(r.image_urls) ? r.image_urls : [],
    media_type: r.media_type ?? "image",
    video_url: r.video_url ?? null,
    video_thumbnail_url: r.video_thumbnail_url ?? null,
    created_at: r.created_at,
    // Public business identity for the feed card + the provider-post detail handoff.
    provider: {
      id: r.provider_id,
      name: r.provider_name,
      slug: r.provider_slug,
      logo_url: r.provider_logo_url,
    },
    paw_count: pawMap[r.id] ?? 0,
    comment_count: commentMap[r.id] ?? 0,
    // Discriminator: the mobile feed renders these with the business card, never as a pet post.
    item_type: "provider_post",
  }));
}

// Get feed posts
async function GET(request) {
  try {

    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") || "20");
    const offset = parseInt(searchParams.get("offset") || "0");
    const rawViewerPetId = searchParams.get("viewerPetId");
    const parsedViewerPetId = parseInt(rawViewerPetId ?? "", 10);
    // The active pet drives Following-first ordering. Absent/invalid => no
    // following set, so the whole feed is Suggested (the no-empty guarantee).
    const viewerPetId = Number.isInteger(parsedViewerPetId)
      ? parsedViewerPetId
      : null;


    // Cap each group's fetch at the far edge of the requested page so we never
    // pull the whole table; mergeFeed then slices the exact window.
    const groupLimit = offset + limit;

    // 1) Following + own: posts from pets that viewerPetId follows AND the
    //    viewer's own active pet (newest first), so your own posts always appear
    //    in your feed in chronological order (ticket 2.36). Empty when there's
    //    no active pet — Suggested carries the feed.
    const following = viewerPetId
      ? await sql`
          SELECT
            p.*,
            up.username,
            up.avatar_url as user_avatar,
            pet.name as pet_name,
            pet.handle as pet_handle,
            pet.avatar_url as pet_avatar,
            pet.birthday as pet_birthday,
            pet.adoption_date as pet_adoption_date,
            COALESCE(paw_count.count, 0)::int as paw_count,
            COALESCE(bark_count.count, 0)::int as bark_count
          FROM posts p
          INNER JOIN user_profiles up ON p.user_id = up.id
          INNER JOIN pets pet ON p.pet_id = pet.id
          LEFT JOIN (
            SELECT post_id, COUNT(*) as count
            FROM post_paws
            GROUP BY post_id
          ) paw_count ON p.id = paw_count.post_id
          LEFT JOIN (
            SELECT post_id, COUNT(*) as count
            FROM post_barks
            GROUP BY post_id
          ) bark_count ON p.id = bark_count.post_id
          WHERE (
            p.pet_id = ${viewerPetId}
            OR p.pet_id IN (
              SELECT followed_pet_id FROM pet_follows
              WHERE follower_pet_id = ${viewerPetId}
            )
          )
          -- Moderation (T3): hide content removed by us + content from a blocked user.
          AND p.hidden_at IS NULL
          AND NOT app_user_is_blocked(current_app_user_id(), p.user_id)
          ORDER BY p.created_at DESC
          LIMIT ${groupLimit}
        `
      : [];

    // 2) Suggested: public pets globally, excluding pets the viewer already
    //    follows and the viewer's own pet (newest first). When there's no active
    //    pet the guards are no-ops and this returns the full global feed.
    const suggested = await sql`
      SELECT
        p.*,
        up.username,
        up.avatar_url as user_avatar,
        pet.name as pet_name,
        pet.handle as pet_handle,
        pet.avatar_url as pet_avatar,
        pet.birthday as pet_birthday,
        pet.adoption_date as pet_adoption_date,
        COALESCE(paw_count.count, 0)::int as paw_count,
        COALESCE(bark_count.count, 0)::int as bark_count
      FROM posts p
      INNER JOIN user_profiles up ON p.user_id = up.id
      INNER JOIN pets pet ON p.pet_id = pet.id
      LEFT JOIN (
        SELECT post_id, COUNT(*) as count
        FROM post_paws
        GROUP BY post_id
      ) paw_count ON p.id = paw_count.post_id
      LEFT JOIN (
        SELECT post_id, COUNT(*) as count
        FROM post_barks
        GROUP BY post_id
      ) bark_count ON p.id = bark_count.post_id
      WHERE (
        ${viewerPetId}::int IS NULL
        OR (
          p.pet_id <> ${viewerPetId}
          AND p.pet_id NOT IN (
            SELECT followed_pet_id FROM pet_follows
            WHERE follower_pet_id = ${viewerPetId}
          )
        )
      )
      -- Moderation (T3): hide content removed by us + content from a blocked user.
      AND p.hidden_at IS NULL
      AND NOT app_user_is_blocked(current_app_user_id(), p.user_id)
      -- Exclude demo/seed posts (0111) from the Suggested feed of real users.
      AND up.is_demo IS NOT TRUE
      ORDER BY p.created_at DESC
      LIMIT ${groupLimit}
    `;

    // 3) Business "daily moments": posts from PROVIDERS the current user FOLLOWS
    //    (provider_follows) surface in the feed, interleaved by recency with the pet
    //    Following+own posts. Only followed providers — a non-follower sees none. This is
    //    best-effort and savepoint-isolated (fetchFollowedProviderPosts): a missing
    //    table/column degrades to fewer/no business posts, never a 500, and never disturbs
    //    the pet feed. Gated on a session so anonymous reads skip the query entirely.
    const session = await auth();
    let providerFollowing = [];
    if (session?.user?.id) {
      try {
        providerFollowing = await fetchFollowedProviderPosts(groupLimit);
      } catch (e) {
        console.error(
          "[GET /api/posts] followed-business posts skipped:",
          e?.message,
        );
        providerFollowing = [];
      }
    }
    const mergedFollowing = mergeFollowingByRecency(
      following,
      providerFollowing,
      groupLimit,
    );

    const posts = mergeFeed(mergedFollowing, suggested, { limit, offset });

    // Check if current user has pawed each PET post. Business posts carry their own
    // paw_count/paw state from fetchFollowedProviderPosts and are EXCLUDED here — their id
    // space is separate from pet posts, so mixing them into a post_paws lookup would be wrong.
    if (session?.user?.id) {

      const userProfile = await sql`
        SELECT id FROM user_profiles
        WHERE auth_user_id = ${session.user.id}
        LIMIT 1
      `;

      if (userProfile.length > 0) {
        const userId = userProfile[0].id;

        const postIds = posts
          .filter((p) => p.item_type !== "provider_post")
          .map((p) => p.id);

        if (postIds.length > 0) {
          const userPaws = await sql`
            SELECT post_id
            FROM post_paws
            WHERE user_id = ${userId}
              AND post_id = ANY(${postIds})
          `;

          const pawedPostIds = new Set(userPaws.map((p) => p.post_id));

          posts.forEach((post) => {
            if (post.item_type === "provider_post") return;
            post.user_has_pawed = pawedPostIds.has(post.id);
          });
        }
      }
    }

    return Response.json({ posts });
  } catch (error) {
    console.error("[GET /api/posts] ========================================");
    console.error("[GET /api/posts] ERROR fetching posts:");
    console.error("[GET /api/posts] Error message:", error.message);
    console.error("[GET /api/posts] Error stack:", error.stack);
    console.error("[GET /api/posts] ========================================");
    return Response.json({ error: "Failed to fetch posts" }, { status: 500 });
  }
}

// Create a new post
async function POST(request) {
  try {

    const session = await auth();

    if (!session?.user?.id) {
      console.error("[POST /api/posts] ERROR: No session or user ID");
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const authUserId = session.user.id;

    // Get user profile
    const userProfile = await sql`
      SELECT id FROM user_profiles 
      WHERE auth_user_id = ${authUserId}
      LIMIT 1
    `;


    if (userProfile.length === 0) {
      console.error(
        "[POST /api/posts] ERROR: User profile not found for auth_user_id:",
        authUserId,
      );
      return Response.json(
        { error: "User profile not found" },
        { status: 404 },
      );
    }

    const userId = userProfile[0].id;

    const body = await request.json();

    const {
      pet_id,
      image_url,
      caption,
      is_daily_update = false,
      post_date,
      media_type = "image",
      video_url,
      video_thumbnail_url,
    } = body;

    // Daily video moments: a post is an 'image' (default, unchanged) or a 'video'.
    if (media_type !== "image" && media_type !== "video") {
      return Response.json(
        { error: "Invalid media_type" },
        { status: 400 },
      );
    }

    // Content filter (T7): reject objectionable caption text before insert.
    const blocked = moderationResponse(caption);
    if (blocked) return blocked;


    // Validate pet access. Owner always. For the DAILY MOMENT (E13 PR2), a 'family' caregiver may also
    // post — so a whole household can each add their slide to the pet's day card. (Viewers cannot post to
    // the public profile; a normal non-daily post stays owner-only.) app_user_has_pet_family degrades
    // cleanly if 0049 isn't applied (missing fn → caregiver simply not authorized).
    const pet = await sql`
      SELECT id FROM pets
      WHERE id = ${pet_id} AND owner_user_id = ${userId}
      LIMIT 1
    `;
    let isOwner = pet.length > 0;
    let isFamilyCaregiver = false;
    if (!isOwner && is_daily_update) {
      try {
        await withSavepoint(async () => {
          const [r] = await sql`SELECT app_user_has_pet_family(${pet_id}) AS ok`;
          isFamilyCaregiver = !!r?.ok;
        });
      } catch (e) {
        if (e?.code !== "42883" && e?.code !== "42P01") throw e; // pre-0049 → not a caregiver
      }
    }

    if (!isOwner && !isFamilyCaregiver) {
      console.error("[POST /api/posts] ERROR: Pet not found or unauthorized");
      console.error("[POST /api/posts]   - pet_id:", pet_id);
      console.error("[POST /api/posts]   - user_id:", userId);
      return Response.json(
        { error: "Pet not found or unauthorized" },
        { status: 403 },
      );
    }


    // Daily moment cap: ONE per AUTHOR per pet per day (E13 PR2 — a caregiver adds their OWN slide, but
    // not a second one). Was one-per-pet-per-day; now scoped to this author so the household can each
    // contribute. (The DB index idx_posts_one_daily_per_author_per_pet_per_day backstops this.)
    if (is_daily_update) {
      const today = new Date().toISOString().split("T")[0];

      const existingDaily = await sql`
        SELECT id FROM posts
        WHERE pet_id = ${pet_id}
          AND user_id = ${userId}
          AND is_daily_update = true
          AND post_date = ${today}
        LIMIT 1
      `;


      if (existingDaily.length > 0) {
        console.error(
          "[POST /api/posts] ERROR: Daily update already posted today",
        );
        return Response.json(
          {
            error: "Daily update already posted today",
          },
          { status: 400 },
        );
      }

    }

    // Create post

    const finalPostDate = post_date || new Date().toISOString().split("T")[0];

    // Video posts: require a playable URL and re-check eligibility SERVER-SIDE for
    // the post's day. Never trust a client-sent eligibility flag — the gate is the
    // deterministic server computation, computed against the SAME date we'll store.
    if (media_type === "video") {
      if (!video_url) {
        return Response.json(
          { error: "video_url is required for a video post" },
          { status: 400 },
        );
      }
      if (!isVideoEligible(userId, finalPostDate)) {
        return Response.json(
          { error: "Video posting isn't available for you today" },
          { status: 403 },
        );
      }
    }

    // Image posts store NULL video columns and behave exactly as before.
    const isVideo = media_type === "video";

    const insertedPost = await sql`
      INSERT INTO posts (user_id, pet_id, image_url, caption, is_daily_update, post_date, media_type, video_url, video_thumbnail_url)
      VALUES (
        ${userId},
        ${pet_id},
        ${image_url || null},
        ${caption || null},
        ${is_daily_update},
        ${finalPostDate},
        ${media_type},
        ${isVideo ? video_url : null},
        ${isVideo ? video_thumbnail_url || null : null}
      )
      RETURNING id
    `;


    // Fetch the complete post with all joined data (same format as GET endpoint)
    const fullPost = await sql`
      SELECT 
        p.*,
        up.username,
        up.avatar_url as user_avatar,
        pet.name as pet_name,
        pet.handle as pet_handle,
        pet.avatar_url as pet_avatar,
        0::int as paw_count,
        0::int as bark_count,
        false as user_has_pawed
      FROM posts p
      INNER JOIN user_profiles up ON p.user_id = up.id
      INNER JOIN pets pet ON p.pet_id = pet.id
      WHERE p.id = ${insertedPost[0].id}
      LIMIT 1
    `;


    return Response.json({ post: fullPost[0] }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/posts] ========================================");
    console.error("[POST /api/posts] FATAL ERROR:");
    console.error("[POST /api/posts] Error message:", error.message);
    console.error("[POST /api/posts] Error stack:", error.stack);
    console.error("[POST /api/posts] Error object:", error);
    console.error("[POST /api/posts] ========================================");
    return Response.json({ error: "Failed to create post" }, { status: 500 });
  }
}

// RLS R1-rollout: identity-scoped wrappers (docs/rls-hardening.md). Handler
// bodies are unchanged — only their DB connection is now request-scoped.
// PP3: the WRITE handlers are additionally wrapped with withRateLimit (utils/rateLimit)
// — a shared, DB-backed fixed-window counter. Reads are never limited.
const wrappedGET = withRequestContext(GET);
const wrappedPOST = withRequestContext(withRateLimit("post_create", POST));
export { wrappedGET as GET, wrappedPOST as POST };
