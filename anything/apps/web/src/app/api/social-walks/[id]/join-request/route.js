import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { withRequestContext } from "@/app/api/utils/requestContext";

// Create a join request
async function POST(request, { params }) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userProfiles = await sql`
      SELECT id FROM user_profiles WHERE auth_user_id = ${session.user.id}
    `;

    if (userProfiles.length === 0) {
      return Response.json(
        { error: "User profile not found" },
        { status: 404 },
      );
    }

    const requesterUserId = userProfiles[0].id;
    const socialWalkId = parseInt(params.id);

    const body = (await request.json().catch(() => ({}))) ?? {};
    const { petId, message } = body;

    if (!petId) {
      return Response.json({ error: "petId is required" }, { status: 400 });
    }

    // Verify pet ownership
    const pets = await sql`
      SELECT id FROM pets WHERE id = ${petId} AND owner_user_id = ${requesterUserId}
    `;

    if (pets.length === 0) {
      return Response.json(
        { error: "Pet not found or access denied" },
        { status: 403 },
      );
    }

    // Verify social walk exists and is scheduled
    const socialWalks = await sql`
      SELECT * FROM social_walks 
      WHERE id = ${socialWalkId} AND status = 'scheduled'
    `;

    if (socialWalks.length === 0) {
      return Response.json(
        { error: "Social walk not found or not available" },
        { status: 404 },
      );
    }

    const socialWalk = socialWalks[0];

    // Cannot join your own walk
    if (socialWalk.owner_user_id === requesterUserId) {
      return Response.json(
        { error: "Cannot join your own walk" },
        { status: 400 },
      );
    }

    // Check if already approved
    const existingApproved = await sql`
      SELECT id FROM social_walk_join_requests
      WHERE social_walk_id = ${socialWalkId}
        AND requester_user_id = ${requesterUserId}
        AND requester_pet_id = ${petId}
        AND status = 'approved'
    `;

    if (existingApproved.length > 0) {
      return Response.json(
        { error: "Already approved for this walk" },
        { status: 400 },
      );
    }

    // Check max pets
    const approvedCount = await sql`
      SELECT COUNT(*) as count
      FROM social_walk_join_requests
      WHERE social_walk_id = ${socialWalkId} AND status = 'approved'
    `;

    if (parseInt(approvedCount[0].count) >= socialWalk.max_pets) {
      return Response.json({ error: "Walk is full" }, { status: 400 });
    }

    const result = await sql`
      INSERT INTO social_walk_join_requests (
        social_walk_id,
        requester_user_id,
        requester_pet_id,
        message,
        status
      ) VALUES (
        ${socialWalkId},
        ${requesterUserId},
        ${petId},
        ${message || null},
        'pending'
      )
      RETURNING *
    `;


    // Create notification for walk owner
    // This will be handled via a notification system

    return Response.json({ joinRequest: result[0] }, { status: 201 });
  } catch (error) {
    console.error("[social-walks] Error creating join request:", error);

    // Duplicate pending request → 23505 unique_violation on
    // idx_social_walk_join_requests_unique_pending (0007_social_walks.sql).
    // Key off SQLSTATE, not the message text (driver-stable).
    if (
      error.code === "23505" ||
      error.message?.includes("duplicate key value")
    ) {
      return Response.json(
        { error: "Join request already pending" },
        { status: 400 },
      );
    }

    return Response.json(
      { error: "Failed to create join request" },
      { status: 500 },
    );
  }
}

// Get join requests for a social walk
async function GET(request, { params }) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userProfiles = await sql`
      SELECT id FROM user_profiles WHERE auth_user_id = ${session.user.id}
    `;

    if (userProfiles.length === 0) {
      return Response.json(
        { error: "User profile not found" },
        { status: 404 },
      );
    }

    const ownerUserId = userProfiles[0].id;
    const socialWalkId = parseInt(params.id);

    // Verify ownership of the social walk
    const socialWalks = await sql`
      SELECT * FROM social_walks 
      WHERE id = ${socialWalkId} AND owner_user_id = ${ownerUserId}
    `;

    if (socialWalks.length === 0) {
      return Response.json(
        { error: "Social walk not found or access denied" },
        { status: 403 },
      );
    }

    const joinRequests = await sql`
      SELECT 
        swjr.*,
        p.name as pet_name,
        p.avatar_url as pet_avatar,
        p.species,
        up.username as requester_username
      FROM social_walk_join_requests swjr
      JOIN pets p ON swjr.requester_pet_id = p.id
      JOIN user_profiles up ON swjr.requester_user_id = up.id
      WHERE swjr.social_walk_id = ${socialWalkId}
      ORDER BY swjr.created_at DESC
    `;

    return Response.json({ joinRequests }, { status: 200 });
  } catch (error) {
    console.error("[social-walks] Error fetching join requests:", error);
    return Response.json(
      { error: "Failed to fetch join requests" },
      { status: 500 },
    );
  }
}

// RLS R1-rollout: identity-scoped wrappers (docs/rls-hardening.md). Handler
// bodies are unchanged — only their DB connection is now request-scoped.
const wrappedPOST = withRequestContext(POST);
const wrappedGET = withRequestContext(GET);
export { wrappedPOST as POST, wrappedGET as GET };
