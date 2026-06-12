import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";

// Get barks (comments) for a post
export async function GET(request, { params }) {
  try {
    const postId = params.id;

    const barks = await sql`
      SELECT
        pb.*,
        up.username,
        up.avatar_url,
        p.handle AS pet_handle,
        p.name AS pet_name,
        p.avatar_url AS pet_avatar_url
      FROM post_barks pb
      INNER JOIN user_profiles up ON pb.user_id = up.id
      LEFT JOIN pets p ON pb.pet_id = p.id
      WHERE pb.post_id = ${postId}
      ORDER BY pb.created_at ASC
    `;

    return Response.json({ barks });
  } catch (error) {
    console.error("Error fetching barks:", error);
    return Response.json({ error: "Failed to fetch barks" }, { status: 500 });
  }
}

// Create a bark (comment)
export async function POST(request, { params }) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const authUserId = session.user.id;
    const postId = params.id;

    // Get user profile
    const userProfile = await sql`
      SELECT id FROM user_profiles 
      WHERE auth_user_id = ${authUserId}
      LIMIT 1
    `;

    if (userProfile.length === 0) {
      return Response.json(
        { error: "User profile not found" },
        { status: 404 },
      );
    }

    const userId = userProfile[0].id;

    const body = await request.json();
    const { text, petId } = body;

    if (!text || text.trim() === "") {
      return Response.json({ error: "Bark text is required" }, { status: 400 });
    }

    if (!petId) {
      return Response.json({ error: "petId is required" }, { status: 400 });
    }

    // The bark is posted AS a pet; that pet must exist and be owned by the caller.
    const ownedPet = await sql`
      SELECT id FROM pets
      WHERE id = ${petId} AND owner_user_id = ${userId}
      LIMIT 1
    `;

    if (ownedPet.length === 0) {
      return Response.json(
        { error: "Pet not found or not owned by caller" },
        { status: 400 },
      );
    }

    // Check if post exists
    const post = await sql`
      SELECT id FROM posts WHERE id = ${postId} LIMIT 1
    `;

    if (post.length === 0) {
      return Response.json({ error: "Post not found" }, { status: 404 });
    }

    // Create bark
    const bark = await sql`
      INSERT INTO post_barks (post_id, user_id, pet_id, text)
      VALUES (${postId}, ${userId}, ${petId}, ${text})
      RETURNING *
    `;

    // Get enriched info for response (same shape GET returns)
    const barkWithUser = await sql`
      SELECT
        pb.*,
        up.username,
        up.avatar_url,
        p.handle AS pet_handle,
        p.name AS pet_name,
        p.avatar_url AS pet_avatar_url
      FROM post_barks pb
      INNER JOIN user_profiles up ON pb.user_id = up.id
      LEFT JOIN pets p ON pb.pet_id = p.id
      WHERE pb.id = ${bark[0].id}
      LIMIT 1
    `;

    return Response.json({ bark: barkWithUser[0] }, { status: 201 });
  } catch (error) {
    console.error("Error creating bark:", error);
    return Response.json({ error: "Failed to create bark" }, { status: 500 });
  }
}
