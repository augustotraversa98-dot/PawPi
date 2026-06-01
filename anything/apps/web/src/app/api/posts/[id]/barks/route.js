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
        up.avatar_url
      FROM post_barks pb
      INNER JOIN user_profiles up ON pb.user_id = up.id
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
    const { text } = body;

    if (!text || text.trim() === "") {
      return Response.json({ error: "Bark text is required" }, { status: 400 });
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
      INSERT INTO post_barks (post_id, user_id, text)
      VALUES (${postId}, ${userId}, ${text})
      RETURNING *
    `;

    // Get user info for response
    const barkWithUser = await sql`
      SELECT 
        pb.*,
        up.username,
        up.avatar_url
      FROM post_barks pb
      INNER JOIN user_profiles up ON pb.user_id = up.id
      WHERE pb.id = ${bark[0].id}
      LIMIT 1
    `;

    return Response.json({ bark: barkWithUser[0] }, { status: 201 });
  } catch (error) {
    console.error("Error creating bark:", error);
    return Response.json({ error: "Failed to create bark" }, { status: 500 });
  }
}
