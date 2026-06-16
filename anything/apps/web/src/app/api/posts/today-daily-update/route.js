import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { withRequestContext } from "@/app/api/utils/requestContext";

/**
 * GET /api/posts/today-daily-update
 *
 * Check if the current user's pet has posted today's daily update
 *
 * Query params:
 * - pet_id: The pet's database ID (optional, uses first pet if not provided)
 *
 * Returns:
 * - post: Today's daily update post (if exists)
 * - hasPostedToday: Boolean indicating if today's update exists
 * - todayDate: The date string being checked (YYYY-MM-DD)
 */
async function GET(request) {
  try {
    console.log(
      "[GET /api/posts/today-daily-update] ========================================",
    );
    console.log(
      "[GET /api/posts/today-daily-update] Checking for today's daily update",
    );

    // Get authenticated user
    const session = await auth();
    console.log(
      "[GET /api/posts/today-daily-update] Session user ID:",
      session?.user?.id,
    );

    if (!session?.user?.id) {
      console.error(
        "[GET /api/posts/today-daily-update] ERROR: No session or user ID",
      );
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const authUserId = session.user.id;

    // Get user profile
    console.log("[GET /api/posts/today-daily-update] Fetching user profile...");
    const userProfile = await sql`
      SELECT id FROM user_profiles 
      WHERE auth_user_id = ${authUserId}
      LIMIT 1
    `;

    console.log(
      "[GET /api/posts/today-daily-update] User profile result:",
      userProfile,
    );

    if (userProfile.length === 0) {
      console.error(
        "[GET /api/posts/today-daily-update] ERROR: User profile not found for auth_user_id:",
        authUserId,
      );
      return Response.json(
        { error: "User profile not found" },
        { status: 404 },
      );
    }

    const userId = userProfile[0].id;
    console.log("[GET /api/posts/today-daily-update] User profile ID:", userId);

    // Get pet_id from query params or use first pet
    const { searchParams } = new URL(request.url);
    let petId = searchParams.get("pet_id");

    if (!petId) {
      console.log(
        "[GET /api/posts/today-daily-update] No pet_id provided, fetching first pet...",
      );
      const pets = await sql`
        SELECT id FROM pets 
        WHERE owner_user_id = ${userId}
        ORDER BY created_at DESC
        LIMIT 1
      `;

      if (pets.length === 0) {
        console.log(
          "[GET /api/posts/today-daily-update] No pets found for user",
        );
        return Response.json({
          post: null,
          hasPostedToday: false,
          todayDate: new Date().toISOString().split("T")[0],
        });
      }

      petId = pets[0].id;
      console.log(
        "[GET /api/posts/today-daily-update] Using first pet ID:",
        petId,
      );
    } else {
      petId = parseInt(petId);
      console.log(
        "[GET /api/posts/today-daily-update] Using provided pet ID:",
        petId,
      );

      // Validate pet ownership
      const pet = await sql`
        SELECT id FROM pets 
        WHERE id = ${petId} AND owner_user_id = ${userId}
        LIMIT 1
      `;

      if (pet.length === 0) {
        console.error(
          "[GET /api/posts/today-daily-update] ERROR: Pet not found or unauthorized",
        );
        return Response.json(
          { error: "Pet not found or unauthorized" },
          { status: 403 },
        );
      }
    }

    // Get today's date in YYYY-MM-DD format (local date on server)
    const todayDate = new Date().toISOString().split("T")[0];
    console.log("[GET /api/posts/today-daily-update] Today's date:", todayDate);
    console.log(
      "[GET /api/posts/today-daily-update] Searching for daily update with:",
    );
    console.log("[GET /api/posts/today-daily-update]   - pet_id:", petId);
    console.log(
      "[GET /api/posts/today-daily-update]   - is_daily_update: true",
    );
    console.log(
      "[GET /api/posts/today-daily-update]   - post_date:",
      todayDate,
    );

    // Query for today's daily update
    const todayPost = await sql`
      SELECT 
        p.*,
        up.username,
        up.avatar_url as user_avatar,
        pet.name as pet_name,
        pet.handle as pet_handle,
        pet.avatar_url as pet_avatar,
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
      WHERE p.pet_id = ${petId}
        AND p.is_daily_update = true
        AND p.post_date = ${todayDate}
      ORDER BY p.created_at DESC
      LIMIT 1
    `;

    console.log("[GET /api/posts/today-daily-update] Query result:", todayPost);

    const post = todayPost.length > 0 ? todayPost[0] : null;
    const hasPostedToday = !!post;

    if (hasPostedToday) {
      console.log(
        "[GET /api/posts/today-daily-update] ✅ Today's daily update found!",
      );
      console.log("[GET /api/posts/today-daily-update] Post ID:", post.id);
      console.log(
        "[GET /api/posts/today-daily-update] Post caption:",
        post.caption,
      );
      console.log(
        "[GET /api/posts/today-daily-update] Post date:",
        post.post_date,
      );
    } else {
      console.log(
        "[GET /api/posts/today-daily-update] ❌ No daily update found for today",
      );
    }

    console.log(
      "[GET /api/posts/today-daily-update] ========================================",
    );

    return Response.json({
      post,
      hasPostedToday,
      todayDate,
    });
  } catch (error) {
    console.error(
      "[GET /api/posts/today-daily-update] ========================================",
    );
    console.error("[GET /api/posts/today-daily-update] ERROR:");
    console.error(
      "[GET /api/posts/today-daily-update] Error message:",
      error.message,
    );
    console.error(
      "[GET /api/posts/today-daily-update] Error stack:",
      error.stack,
    );
    console.error(
      "[GET /api/posts/today-daily-update] ========================================",
    );
    return Response.json(
      { error: "Failed to check today's daily update" },
      { status: 500 },
    );
  }
}

// RLS R1-rollout: identity-scoped wrappers (docs/rls-hardening.md). Handler
// bodies are unchanged — only their DB connection is now request-scoped.
const wrappedGET = withRequestContext(GET);
export { wrappedGET as GET };
