import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { safeNotify } from "@/app/api/utils/notify";
import { withRequestContext } from "@/app/api/utils/requestContext";
import { withRateLimit } from "@/app/api/utils/rateLimit";
import { isBlockedBetween } from "@/app/api/utils/moderation";

// Resolve the caller's user_profiles.id and verify they may follow AS followerPetId: its owner, or a family member of
// it (0161). Returns { error, status, code } on failure, or { userId, dogOwnerId } on success (dogOwnerId: family only).
async function resolveFollower(authUserId, followerPetId) {
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

  const ownedPet = await sql`
    SELECT id FROM pets
    WHERE id = ${followerPetId} AND owner_user_id = ${userId}
    LIMIT 1
  `;

  if (ownedPet.length > 0) return { userId };

  // The policy check covers a database without 0161: there the insert would fail and the delete would quietly remove
  // nothing, so family is refused up front.
  const familyPet = await sql`
    SELECT p.owner_user_id FROM pets p
    WHERE p.id = ${followerPetId}
      AND app_user_has_pet_family(p.id)
      AND EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'pet_follows' AND policyname = 'pet_follows_family_delete'
      )
    LIMIT 1
  `;

  if (familyPet.length === 0) {
    return { error: "Not allowed to act for this pet", status: 403, code: "follow_not_allowed" };
  }

  return { userId, dogOwnerId: familyPet[0].owner_user_id };
}

const refusal = ({ error, status, code }) => Response.json(code ? { error, code } : { error }, { status });

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

    const follower = await resolveFollower(session.user.id, followerPetId);
    if (follower.error) return refusal(follower);

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

    // A blocked pair (either direction) cannot follow each other — enforced on the API, not just in
    // the UI (flow audit F2-05). Generic copy: never reveals who blocked whom. For family, a block of
    // the dog's owner counts too: the follow is in that dog's name.
    const targetOwnerId = followedPet[0].owner_user_id;
    if (
      (await isBlockedBetween(follower.userId, targetOwnerId)) ||
      (follower.dogOwnerId && (await isBlockedBetween(follower.dogOwnerId, targetOwnerId)))
    ) {
      return Response.json({ error: "You can't interact with this user" }, { status: 403 });
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
        actor: follower.userId,
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

    const follower = await resolveFollower(session.user.id, followerPetId);
    if (follower.error) return refusal(follower);

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
// PP3: the WRITE handlers are additionally wrapped with withRateLimit (utils/rateLimit)
// — a shared, DB-backed fixed-window counter. Reads are never limited.
const wrappedPOST = withRequestContext(withRateLimit("follow_toggle", POST));
const wrappedDELETE = withRequestContext(withRateLimit("follow_toggle", DELETE));
export { wrappedPOST as POST, wrappedDELETE as DELETE };
