import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { safeNotify } from "@/app/api/utils/notify";
import { withRequestContext } from "@/app/api/utils/requestContext";

// Add a paw to a post
async function POST(request, { params }) {
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

    // Check if post exists (user_id = the owner, the notification recipient)
    const post = await sql`
      SELECT id, user_id FROM posts WHERE id = ${postId} LIMIT 1
    `;

    if (post.length === 0) {
      return Response.json({ error: "Post not found" }, { status: 404 });
    }

    // Check if already pawed
    const existingPaw = await sql`
      SELECT id FROM post_paws 
      WHERE post_id = ${postId} AND user_id = ${userId}
      LIMIT 1
    `;

    if (existingPaw.length > 0) {
      return Response.json({ message: "Already pawed" }, { status: 200 });
    }

    // Add paw
    await sql`
      INSERT INTO post_paws (post_id, user_id)
      VALUES (${postId}, ${userId})
    `;

    // Get new paw count
    const pawCount = await sql`
      SELECT COUNT(*)::int as count
      FROM post_paws
      WHERE post_id = ${postId}
    `;

    // Notify the post's owner (ticket 2.26). Fire-and-don't-block; never self-notify.
    await safeNotify({
      recipient: post[0].user_id,
      actor: userId,
      type: "paw",
      subjectRef: String(postId),
      body: "pawed your post",
    });

    return Response.json({
      success: true,
      paw_count: pawCount[0].count,
    });
  } catch (error) {
    console.error("Error adding paw:", error);
    return Response.json({ error: "Failed to add paw" }, { status: 500 });
  }
}

// Remove a paw from a post
async function DELETE(request, { params }) {
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

    // Remove paw
    await sql`
      DELETE FROM post_paws 
      WHERE post_id = ${postId} AND user_id = ${userId}
    `;

    // Get new paw count
    const pawCount = await sql`
      SELECT COUNT(*)::int as count 
      FROM post_paws 
      WHERE post_id = ${postId}
    `;

    return Response.json({
      success: true,
      paw_count: pawCount[0].count,
    });
  } catch (error) {
    console.error("Error removing paw:", error);
    return Response.json({ error: "Failed to remove paw" }, { status: 500 });
  }
}

// RLS R1-rollout: identity-scoped wrappers (docs/rls-hardening.md). Handler
// bodies are unchanged — only their DB connection is now request-scoped.
const wrappedPOST = withRequestContext(POST);
const wrappedDELETE = withRequestContext(DELETE);
export { wrappedPOST as POST, wrappedDELETE as DELETE };
