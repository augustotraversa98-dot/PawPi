import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { safeNotify } from "@/app/api/utils/notify";
import { withRequestContext } from "@/app/api/utils/requestContext";

// Resolve the caller's user_profiles.id and verify they own followerPetId.
// Returns { error, status } on failure, or { userId } on success.
async function resolveOwnedFollower(authUserId, followerPetId) {
  if (!followerPetId) {
    return { error: "followerPetId is required", status: 400 };
  }

  const userProfile = await sql`
    SELECT id FROM user_profiles
    WHERE auth_user_id = ${authUserId}
    LIMIT 1
  `;

  if (userProfile.length === 0) {
    return { error: "User profile not found", status: 404 };
  }

  const userId = userProfile[0].id;

  // The follower pet must belong to the caller.
  const ownedPet = await sql`
    SELECT id FROM pets
    WHERE id = ${followerPetId} AND owner_user_id = ${userId}
    LIMIT 1
  `;

  if (ownedPet.length === 0) {
    return { error: "Not allowed to act for this pet", status: 403 };
  }

  return { userId };
}

async function followersCountOf(followedPetId) {
  const rows = await sql`
    SELECT COUNT(*)::int as count
    FROM pet_follows
    WHERE followed_pet_id = ${followedPetId}
  `;
  return rows[0].count;
}

// Follow a pet ([id] = the pet being followed)
async function POST(request, { params }) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const followedPetId = params.id;
    const body = await request.json().catch(() => ({}));
    const { followerPetId } = body;

    const owner = await resolveOwnedFollower(session.user.id, followerPetId);
    if (owner.error) {
      return Response.json({ error: owner.error }, { status: owner.status });
    }

    // Cannot follow yourself.
    if (String(followerPetId) === String(followedPetId)) {
      return Response.json(
        { error: "A pet cannot follow itself" },
        { status: 400 },
      );
    }

    // The followed pet must exist (owner_user_id = the notification recipient).
    const followedPet = await sql`
      SELECT id, owner_user_id FROM pets WHERE id = ${followedPetId} LIMIT 1
    `;

    if (followedPet.length === 0) {
      return Response.json({ error: "Pet not found" }, { status: 404 });
    }

    // Idempotent: a repeat follow is a no-op, not a duplicate. RETURNING tells us
    // whether a NEW follow happened, so we only notify on a genuine new follow.
    const inserted = await sql`
      INSERT INTO pet_follows (follower_pet_id, followed_pet_id)
      VALUES (${followerPetId}, ${followedPetId})
      ON CONFLICT (follower_pet_id, followed_pet_id) DO NOTHING
      RETURNING follower_pet_id
    `;

    if (inserted.length > 0) {
      // Notify the followed pet's owner (ticket 2.26). Fire-and-don't-block.
      await safeNotify({
        recipient: followedPet[0].owner_user_id,
        actor: owner.userId,
        type: "follow",
        subjectRef: String(followedPetId),
        body: "started following your pet",
      });
    }

    const followersCount = await followersCountOf(followedPetId);

    return Response.json({ following: true, followersCount });
  } catch (error) {
    console.error("Error following pet:", error);
    return Response.json({ error: "Failed to follow pet" }, { status: 500 });
  }
}

// Unfollow a pet ([id] = the pet being unfollowed)
async function DELETE(request, { params }) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const followedPetId = params.id;
    const body = await request.json().catch(() => ({}));
    const { followerPetId } = body;

    const owner = await resolveOwnedFollower(session.user.id, followerPetId);
    if (owner.error) {
      return Response.json({ error: owner.error }, { status: owner.status });
    }

    await sql`
      DELETE FROM pet_follows
      WHERE follower_pet_id = ${followerPetId}
        AND followed_pet_id = ${followedPetId}
    `;

    const followersCount = await followersCountOf(followedPetId);

    return Response.json({ following: false, followersCount });
  } catch (error) {
    console.error("Error unfollowing pet:", error);
    return Response.json({ error: "Failed to unfollow pet" }, { status: 500 });
  }
}

// RLS R1-rollout: identity-scoped wrappers (docs/rls-hardening.md). Handler
// bodies are unchanged — only their DB connection is now request-scoped.
const wrappedPOST = withRequestContext(POST);
const wrappedDELETE = withRequestContext(DELETE);
export { wrappedPOST as POST, wrappedDELETE as DELETE };
