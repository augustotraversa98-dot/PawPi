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

    // Get authenticated user
    const session = await auth();

    if (!session?.user?.id) {
      console.error(
        "[GET /api/posts/today-daily-update] ERROR: No session or user ID",
      );
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
        "[GET /api/posts/today-daily-update] ERROR: User profile not found for auth_user_id:",
        authUserId,
      );
      return Response.json(
        { error: "User profile not found" },
        { status: 404 },
      );
    }

    const userId = userProfile[0].id;

    // Get pet_id from query params or use first pet
    const { searchParams } = new URL(request.url);
    let petId = searchParams.get("pet_id");

    if (!petId) {
      const pets = await sql`
        SELECT id FROM pets 
        WHERE owner_user_id = ${userId}
        ORDER BY created_at DESC
        LIMIT 1
      `;

      if (pets.length === 0) {
        return Response.json({
          post: null,
          hasPostedToday: false,
          todayDate: new Date().toISOString().split("T")[0],
        });
      }

      petId = pets[0].id;
    } else {
      petId = parseInt(petId);

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


    const post = todayPost.length > 0 ? todayPost[0] : null;
    const hasPostedToday = !!post;

    if (hasPostedToday) {
    } else {
    }


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
