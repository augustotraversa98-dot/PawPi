import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { safeNotify } from "@/app/api/utils/notify";
import { withRequestContext } from "@/app/api/utils/requestContext";
import { isBlockedBetween } from "@/app/api/utils/moderation";
import { moderationResponse } from "@/app/api/utils/moderateText";

// Get barks (comments) for a post
async function GET(request, { params }) {
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
        -- Moderation (T3): hide barks removed by us + barks from a blocked user.
        AND pb.hidden_at IS NULL
        AND NOT app_user_is_blocked(current_app_user_id(), pb.user_id)
      ORDER BY pb.created_at ASC
    `;

    return Response.json({ barks });
  } catch (error) {
    console.error("Error fetching barks:", error);
    return Response.json({ error: "Failed to fetch barks" }, { status: 500 });
  }
}

// Create a bark (comment)
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

    const body = await request.json();
    const { text, petId } = body;

    if (!text || text.trim() === "") {
      return Response.json({ error: "Bark text is required" }, { status: 400 });
    }

    // Content filter (T7): reject objectionable bark text before insert.
    const blocked = moderationResponse(text);
    if (blocked) return blocked;

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

    // Check if post exists (user_id = the owner, the notification recipient)
    const post = await sql`
      SELECT id, user_id FROM posts WHERE id = ${postId} LIMIT 1
    `;

    if (post.length === 0) {
      return Response.json({ error: "Post not found" }, { status: 404 });
    }

    // Moderation (T3): a blocked pair can't interact — no barking on a blocking/blocked
    // user's post (either direction).
    if (await isBlockedBetween(userId, post[0].user_id)) {
      return Response.json(
        { error: "You can't interact with this user" },
        { status: 403 },
      );
    }

    // Create bark
    const bark = await sql`
      INSERT INTO post_barks (post_id, user_id, pet_id, text)
      VALUES (${postId}, ${userId}, ${petId}, ${text})
      RETURNING *
    `;

    // Notify the post's owner (ticket 2.26). Fire-and-don't-block; never self-notify.
    await safeNotify({
      recipient: post[0].user_id,
      actor: userId,
      type: "bark",
      subjectRef: String(postId),
      body: "barked on your post",
    });

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

// RLS R1-rollout: identity-scoped wrappers (docs/rls-hardening.md). Handler
// bodies are unchanged — only their DB connection is now request-scoped.
const wrappedGET = withRequestContext(GET);
const wrappedPOST = withRequestContext(POST);
export { wrappedGET as GET, wrappedPOST as POST };
