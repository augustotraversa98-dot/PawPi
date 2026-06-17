import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { withRequestContext } from "@/app/api/utils/requestContext";

// Following-first, then Suggested. `following` and `suggested` are each already
// ordered newest-first by SQL and are disjoint by construction (Suggested
// excludes followed pets), so we just concatenate Following ahead of Suggested,
// de-dupe by post id as a guarantee, and slice the requested page window.
//
// Each group is fetched with `LIMIT (offset + limit)`, so concatenating the two
// fetched prefixes yields the correct global window for any offset/limit: if
// Following has >= offset+limit rows the page is pure Following; otherwise
// Following is exhausted and Suggested backfills the remainder.
export function mergeFeed(following, suggested, { limit, offset }) {
  const seen = new Set();
  const ordered = [];
  for (const post of [...following, ...suggested]) {
    if (seen.has(post.id)) continue;
    seen.add(post.id);
    ordered.push(post);
  }
  return ordered.slice(offset, offset + limit);
}

// Get feed posts
async function GET(request) {
  try {
    console.log("[GET /api/posts] ========================================");
    console.log("[GET /api/posts] Fetching posts from database");

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

    console.log("[GET /api/posts] Query params:");
    console.log("[GET /api/posts]   - limit:", limit);
    console.log("[GET /api/posts]   - offset:", offset);
    console.log("[GET /api/posts]   - viewerPetId:", viewerPetId);

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
      ORDER BY p.created_at DESC
      LIMIT ${groupLimit}
    `;

    const posts = mergeFeed(following, suggested, { limit, offset });

    console.log(
      "[GET /api/posts] Following:",
      following.length,
      "Suggested:",
      suggested.length,
      "-> page:",
      posts.length,
    );

    // Check if current user has pawed each post
    const session = await auth();
    if (session?.user?.id) {
      console.log(
        "[GET /api/posts] Checking user paws for auth_user_id:",
        session.user.id,
      );

      const userProfile = await sql`
        SELECT id FROM user_profiles 
        WHERE auth_user_id = ${session.user.id}
        LIMIT 1
      `;

      if (userProfile.length > 0) {
        const userId = userProfile[0].id;
        console.log("[GET /api/posts] User profile ID:", userId);

        const postIds = posts.map((p) => p.id);

        if (postIds.length > 0) {
          const userPaws = await sql`
            SELECT post_id 
            FROM post_paws 
            WHERE user_id = ${userId} 
              AND post_id = ANY(${postIds})
          `;

          const pawedPostIds = new Set(userPaws.map((p) => p.post_id));

          posts.forEach((post) => {
            post.user_has_pawed = pawedPostIds.has(post.id);
          });
        }
      }
    }

    console.log("[GET /api/posts] ✅ Returning", posts.length, "posts");
    console.log("[GET /api/posts] Posts summary:");
    posts.forEach((post, index) => {
      console.log(
        `[GET /api/posts]   ${index + 1}. ID: ${post.id}, Pet: ${post.pet_name}, Daily: ${post.is_daily_update}, Date: ${post.post_date}`,
      );
    });
    console.log("[GET /api/posts] ========================================");

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
    console.log("[POST /api/posts] ========================================");
    console.log("[POST /api/posts] Starting post creation");

    const session = await auth();
    console.log("[POST /api/posts] Session:", session);

    if (!session?.user?.id) {
      console.error("[POST /api/posts] ERROR: No session or user ID");
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const authUserId = session.user.id;
    console.log("[POST /api/posts] Auth user ID:", authUserId);

    // Get user profile
    console.log("[POST /api/posts] Fetching user profile...");
    const userProfile = await sql`
      SELECT id FROM user_profiles 
      WHERE auth_user_id = ${authUserId}
      LIMIT 1
    `;

    console.log("[POST /api/posts] User profile query result:", userProfile);

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
    console.log("[POST /api/posts] User profile ID:", userId);

    const body = await request.json();
    console.log(
      "[POST /api/posts] Request body:",
      JSON.stringify(body, null, 2),
    );

    const {
      pet_id,
      image_url,
      caption,
      is_daily_update = false,
      post_date,
    } = body;

    console.log("[POST /api/posts] Extracted fields:");
    console.log("[POST /api/posts]   - pet_id:", pet_id);
    console.log("[POST /api/posts]   - image_url:", image_url);
    console.log("[POST /api/posts]   - caption:", caption);
    console.log("[POST /api/posts]   - is_daily_update:", is_daily_update);
    console.log("[POST /api/posts]   - post_date:", post_date);

    // Validate pet ownership
    console.log("[POST /api/posts] Validating pet ownership...");
    const pet = await sql`
      SELECT id FROM pets 
      WHERE id = ${pet_id} AND owner_user_id = ${userId}
      LIMIT 1
    `;

    console.log("[POST /api/posts] Pet ownership query result:", pet);

    if (pet.length === 0) {
      console.error("[POST /api/posts] ERROR: Pet not found or unauthorized");
      console.error("[POST /api/posts]   - pet_id:", pet_id);
      console.error("[POST /api/posts]   - user_id:", userId);
      return Response.json(
        { error: "Pet not found or unauthorized" },
        { status: 403 },
      );
    }

    console.log("[POST /api/posts] ✅ Pet ownership validated");

    // If daily update, check if one already exists today
    if (is_daily_update) {
      console.log("[POST /api/posts] Checking for existing daily update...");
      const today = new Date().toISOString().split("T")[0];
      console.log("[POST /api/posts] Today's date:", today);

      const existingDaily = await sql`
        SELECT id FROM posts
        WHERE pet_id = ${pet_id}
          AND is_daily_update = true
          AND post_date = ${today}
        LIMIT 1
      `;

      console.log(
        "[POST /api/posts] Existing daily query result:",
        existingDaily,
      );

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

      console.log("[POST /api/posts] ✅ No existing daily update found");
    }

    // Create post
    console.log("[POST /api/posts] Inserting post into database...");

    const finalPostDate = post_date || new Date().toISOString().split("T")[0];
    console.log("[POST /api/posts] Final post_date for insert:", finalPostDate);

    const insertedPost = await sql`
      INSERT INTO posts (user_id, pet_id, image_url, caption, is_daily_update, post_date)
      VALUES (
        ${userId}, 
        ${pet_id}, 
        ${image_url || null}, 
        ${caption || null}, 
        ${is_daily_update},
        ${finalPostDate}
      )
      RETURNING id
    `;

    console.log("[POST /api/posts] ✅ Post inserted successfully");
    console.log("[POST /api/posts] Post ID:", insertedPost[0].id);
    console.log("[POST /api/posts] Post date:", finalPostDate);

    // Fetch the complete post with all joined data (same format as GET endpoint)
    console.log("[POST /api/posts] Fetching complete post data...");
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

    console.log("[POST /api/posts] ✅ Full post data fetched");
    console.log("[POST /api/posts] Full post:", fullPost[0]);
    console.log("[POST /api/posts] ========================================");

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
const wrappedGET = withRequestContext(GET);
const wrappedPOST = withRequestContext(POST);
export { wrappedGET as GET, wrappedPOST as POST };
