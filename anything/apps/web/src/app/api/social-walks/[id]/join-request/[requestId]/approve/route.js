import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { withRequestContext } from "@/app/api/utils/requestContext";

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

    const ownerUserId = userProfiles[0].id;
    const socialWalkId = parseInt(params.id);
    const requestId = parseInt(params.requestId);

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

    const socialWalk = socialWalks[0];

    // Check max pets
    const approvedCount = await sql`
      SELECT COUNT(*) as count
      FROM social_walk_join_requests
      WHERE social_walk_id = ${socialWalkId} AND status = 'approved'
    `;

    if (parseInt(approvedCount[0].count) >= socialWalk.max_pets) {
      return Response.json({ error: "Walk is full" }, { status: 400 });
    }

    // Update join request status
    const result = await sql`
      UPDATE social_walk_join_requests
      SET status = 'approved', updated_at = NOW()
      WHERE id = ${requestId} AND social_walk_id = ${socialWalkId} AND status = 'pending'
      RETURNING *
    `;

    if (result.length === 0) {
      return Response.json(
        { error: "Join request not found or already processed" },
        { status: 404 },
      );
    }


    // Create notification for requester
    // This will be handled via a notification system

    return Response.json({ joinRequest: result[0] }, { status: 200 });
  } catch (error) {
    console.error("[social-walks] Error approving join request:", error);
    return Response.json(
      { error: "Failed to approve join request" },
      { status: 500 },
    );
  }
}

// RLS R1-rollout: identity-scoped wrappers (docs/rls-hardening.md). Handler
// bodies are unchanged — only their DB connection is now request-scoped.
const wrappedPOST = withRequestContext(POST);
export { wrappedPOST as POST };
