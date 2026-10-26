import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import {
  withRequestContext,
  withSavepoint,
} from "@/app/api/utils/requestContext";
import { withRateLimit } from "@/app/api/utils/rateLimit";
import { moderationResponse } from "@/app/api/utils/moderateText";
import { isVideoEligible } from "@/app/api/utils/videoEligibility";
import { ownerTodayFrom } from "@/app/api/utils/ownerLocalDay";
import { recordBusinessEvent } from "@/lib/telemetry/business";
import {
  getViewerDailyStatus,
  applyDailyMomentsLock,
} from "@/app/api/utils/dailyMomentsGate";

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
// PERF (docs/perf-audit-2026-10-23.md, finding 2): every statement is a ~170 ms cross-region round
// trip, and each withSavepoint added one more. This used to wrap three reads in savepoints so a
// PRE-migration database would degrade (0083 provider_follows, 0087 media columns, provider_post_paws,
// provider_post_comments). Verified read-only on production 2026-10-23: all of those tables and columns
// exist, and CI applies every migration, so the guards (and the image-only fallback read) are gone.
// The paw / comment counts are correlated subselects in the same statement (only the page's rows are
// counted), so a follower of a business pays ONE round trip for the whole business block.
// The caller still wraps this in try/catch for JS-level failures. A SQL error here aborts the request
// transaction exactly as it does in every other route (it is no longer isolated by a savepoint).
async function fetchFollowedProviderPosts(cap) {
  const rows = await sql`
    SELECT
      pp.id, pp.provider_id, pp.body, pp.image_urls,
      pp.media_type, pp.video_url, pp.video_thumbnail_url,
      pp.created_at,
      pr.name AS provider_name, pr.slug AS provider_slug, pr.logo_url AS provider_logo_url,
      (SELECT COUNT(*)::int FROM provider_post_paws pw WHERE pw.post_id = pp.id) AS paw_count,
      (SELECT COUNT(*)::int FROM provider_post_comments pc
        WHERE pc.post_id = pp.id AND pc.deleted_at IS NULL AND pc.hidden_at IS NULL) AS comment_count
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
  `;

  if (!Array.isArray(rows) || rows.length === 0) return [];

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
    paw_count: r.paw_count ?? 0,
    comment_count: r.comment_count ?? 0,
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
    // PERF: following / suggested / business reads are independent, so they are created here and awaited
    // TOGETHER below (pipelined on the request transaction: one round trip instead of three).
    const followingQuery = viewerPetId
      ? sql`
          SELECT
            p.*,
            NULLIF(BTRIM(up.full_name), '') AS username,
            up.avatar_url as user_avatar,
            pet.name as pet_name,
            pet.handle as pet_handle,
            pet.avatar_url as pet_avatar,
            pet.birthday as pet_birthday,
            pet.adoption_date as pet_adoption_date,
            (SELECT COUNT(*) FROM post_paws pc WHERE pc.post_id = p.id)::int as paw_count,
            (SELECT COUNT(*) FROM post_barks bc WHERE bc.post_id = p.id)::int as bark_count,
            EXISTS (
              SELECT 1 FROM post_paws mine
              WHERE mine.post_id = p.id AND mine.user_id = current_app_user_id()
            ) as user_has_pawed
          FROM posts p
          INNER JOIN user_profiles up ON p.user_id = up.id
          INNER JOIN pets pet ON p.pet_id = pet.id
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
    const suggestedQuery = sql`
      SELECT
        p.*,
        NULLIF(BTRIM(up.full_name), '') AS username,
        up.avatar_url as user_avatar,
        pet.name as pet_name,
        pet.handle as pet_handle,
        pet.avatar_url as pet_avatar,
        pet.birthday as pet_birthday,
        pet.adoption_date as pet_adoption_date,
        (SELECT COUNT(*) FROM post_paws pc WHERE pc.post_id = p.id)::int as paw_count,
        (SELECT COUNT(*) FROM post_barks bc WHERE bc.post_id = p.id)::int as bark_count,
        EXISTS (
          SELECT 1 FROM post_paws mine
          WHERE mine.post_id = p.id AND mine.user_id = current_app_user_id()
        ) as user_has_pawed
      FROM posts p
      INNER JOIN user_profiles up ON p.user_id = up.id
      INNER JOIN pets pet ON p.pet_id = pet.id
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
    //    Following+own posts. Only followed providers — a non-follower sees none. A JS-level
    //    failure drops the business posts, not the pet feed. Gated on a session so anonymous
    //    reads skip the query entirely.
    const session = await auth();
    const providerQuery = session?.user?.id
      ? fetchFollowedProviderPosts(groupLimit).catch((e) => {
          console.error(
            "[GET /api/posts] followed-business posts skipped:",
            e?.message,
          );
          return [];
        })
      : [];

    // The viewer's daily-post status is independent of the three reads above, so it joins the same batch.
    // Daily-post lock, enforced here and not only on-device: until the viewer has posted today,
    // other owners' media never leaves the server (utils/dailyMomentsGate.js — the same query
    // that powers /owner-posted-today, so the Feed's lock and the data returned always agree).
    // Fails closed: an anonymous viewer, or one with no profile yet, counts as "not posted".
    const statusQuery = session?.user?.id
      ? getViewerDailyStatus(session.user.id)
      : null;

    const [following, suggested, providerFollowing, status] = await Promise.all([
      followingQuery,
      suggestedQuery,
      providerQuery,
      statusQuery,
    ]);
    const mergedFollowing = mergeFollowingByRecency(
      following,
      providerFollowing,
      groupLimit,
    );

    const page = mergeFeed(mergedFollowing, suggested, { limit, offset });
    const posts = applyDailyMomentsLock(page, status);

    // Whether the current user has pawed each PET post comes back with the page itself (user_has_pawed,
    // an EXISTS in the feed queries) instead of a follow-up lookup: one round trip fewer. Business posts
    // carry their own paw_count/paw state from fetchFollowedProviderPosts and have no such field. Without
    // a resolved viewer profile the flag is omitted entirely, as before.
    for (const post of posts) {
      if (post.item_type === "provider_post") continue;
      if (!status) delete post.user_has_pawed;
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

    // Get user profile (+ the owner-LOCAL calendar day, see utils/ownerLocalDay.js)
    const userProfile = await sql`
      SELECT id, (now() AT TIME ZONE COALESCE(timezone, 'America/Buenos_Aires'))::date AS local_today
      FROM user_profiles 
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
    // Owner-local today (AUDIT_2026-09 A-10): the UTC date is already tomorrow from 21:00 in
    // Argentina, which put the daily moment on the wrong day, left the Care Ring empty and
    // refused the next morning's post as a duplicate.
    const ownerToday = ownerTodayFrom(userProfile[0]);

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
    // The calendar day this post belongs to: the client's local day when sent, else the
    // owner-local today — never the server's UTC date.
    const finalPostDate = post_date || ownerToday;

    if (is_daily_update) {
      const existingDaily = await sql`
        SELECT id FROM posts
        WHERE pet_id = ${pet_id}
          AND user_id = ${userId}
          AND is_daily_update = true
          AND post_date = ${finalPostDate}
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
        NULLIF(BTRIM(up.full_name), '') AS username,
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


    recordBusinessEvent("post_created");
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
// REQUEST_SINGLE_FLIGHT: read-only GET, so its COMMIT is not awaited (utils/singleFlightTx.js; skipped if a write is seen).
const wrappedGET = withRequestContext(GET, { deferCommit: true });
const wrappedPOST = withRequestContext(withRateLimit("post_create", POST));
export { wrappedGET as GET, wrappedPOST as POST };
