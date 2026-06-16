import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { withRequestContext } from "@/app/api/utils/requestContext";

// Create a social walk
async function POST(request) {
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

    const body = await request.json();
    const {
      routineId,
      routineWalkIndex,
      petId,
      walkName,
      scheduledAt,
      durationMinutes,
      pace,
      visibility,
      meetingArea,
      meetingLocationDetails,
      maxPets,
      approvalRequired,
      notesForGuests,
    } = body;

    if (!petId || !walkName || !scheduledAt || !visibility) {
      return Response.json(
        { error: "petId, walkName, scheduledAt, and visibility are required" },
        { status: 400 },
      );
    }

    // Verify pet ownership
    const pets = await sql`
      SELECT id FROM pets WHERE id = ${petId} AND owner_user_id = ${ownerUserId}
    `;

    if (pets.length === 0) {
      return Response.json(
        { error: "Pet not found or access denied" },
        { status: 403 },
      );
    }

    const result = await sql`
      INSERT INTO social_walks (
        routine_id,
        routine_walk_index,
        pet_id,
        owner_user_id,
        walk_name,
        scheduled_at,
        duration_minutes,
        pace,
        visibility,
        meeting_area,
        meeting_location_details,
        max_pets,
        approval_required,
        notes_for_guests
      ) VALUES (
        ${routineId || null},
        ${routineWalkIndex || null},
        ${petId},
        ${ownerUserId},
        ${walkName},
        ${scheduledAt},
        ${durationMinutes || null},
        ${pace || null},
        ${visibility},
        ${meetingArea || null},
        ${meetingLocationDetails || null},
        ${maxPets || 4},
        ${approvalRequired ?? true},
        ${notesForGuests || null}
      )
      RETURNING *
    `;

    console.log("[social-walks] Social walk created:", result[0]);

    // If friends_only, notify mutual friends
    if (visibility === "friends_only") {
      // Get mutual pet friends
      const mutualFriends = await sql`
        SELECT DISTINCT
          CASE 
            WHEN pf.requester_pet_id = ${petId} THEN pf.receiver_user_id
            ELSE pf.requester_user_id
          END as friend_user_id,
          CASE 
            WHEN pf.requester_pet_id = ${petId} THEN pf.receiver_pet_id
            ELSE pf.requester_pet_id
          END as friend_pet_id
        FROM pet_friendships pf
        WHERE 
          (pf.requester_pet_id = ${petId} OR pf.receiver_pet_id = ${petId})
          AND pf.status = 'accepted'
      `;

      console.log(
        `[social-walks] Notifying ${mutualFriends.length} mutual friends`,
      );
      // Notifications will be created via a separate endpoint or background job
    }

    return Response.json({ socialWalk: result[0] }, { status: 201 });
  } catch (error) {
    console.error("[social-walks] Error creating social walk:", error);
    return Response.json(
      { error: "Failed to create social walk" },
      { status: 500 },
    );
  }
}

// Get social walks (discoverable nearby walks or user's own walks)
async function GET(request) {
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

    const { searchParams } = new URL(request.url);
    const visibility = searchParams.get("visibility");
    const status = searchParams.get("status") || "scheduled";
    const myWalks = searchParams.get("myWalks") === "true";

    let walks;

    if (myWalks) {
      // Get user's own social walks
      walks = await sql`
        SELECT 
          sw.*,
          p.name as pet_name,
          p.avatar_url as pet_avatar,
          up.username as owner_username,
          (
            SELECT COUNT(*)
            FROM social_walk_join_requests swjr
            WHERE swjr.social_walk_id = sw.id AND swjr.status = 'approved'
          ) as approved_participants_count,
          (
            SELECT COUNT(*)
            FROM social_walk_join_requests swjr
            WHERE swjr.social_walk_id = sw.id AND swjr.status = 'pending'
          ) as pending_requests_count
        FROM social_walks sw
        JOIN pets p ON sw.pet_id = p.id
        JOIN user_profiles up ON sw.owner_user_id = up.id
        WHERE sw.owner_user_id = ${ownerUserId}
          AND sw.status = ${status}
          AND sw.scheduled_at > NOW()
        ORDER BY sw.scheduled_at ASC
      `;
    } else {
      // Get discoverable social walks (nearby_pets or friends_only where user is a friend)
      if (visibility === "nearby_pets") {
        walks = await sql`
          SELECT 
            sw.id,
            sw.walk_name,
            sw.scheduled_at,
            sw.duration_minutes,
            sw.pace,
            sw.meeting_area,
            sw.max_pets,
            sw.approval_required,
            sw.notes_for_guests,
            sw.visibility,
            sw.status,
            p.name as pet_name,
            p.avatar_url as pet_avatar,
            up.username as owner_username,
            (
              SELECT COUNT(*)
              FROM social_walk_join_requests swjr
              WHERE swjr.social_walk_id = sw.id AND swjr.status = 'approved'
            ) as approved_participants_count
          FROM social_walks sw
          JOIN pets p ON sw.pet_id = p.id
          JOIN user_profiles up ON sw.owner_user_id = up.id
          WHERE sw.visibility = 'nearby_pets'
            AND sw.status = 'scheduled'
            AND sw.scheduled_at > NOW()
            AND sw.owner_user_id != ${ownerUserId}
          ORDER BY sw.scheduled_at ASC
          LIMIT 50
        `;
      } else if (visibility === "friends_only") {
        // Get user's pets
        const userPets = await sql`
          SELECT id FROM pets WHERE owner_user_id = ${ownerUserId}
        `;

        if (userPets.length === 0) {
          return Response.json({ walks: [] }, { status: 200 });
        }

        const userPetIds = userPets.map((p) => p.id);

        // Get walks from mutual pet friends
        walks = await sql`
          SELECT DISTINCT
            sw.id,
            sw.walk_name,
            sw.scheduled_at,
            sw.duration_minutes,
            sw.pace,
            sw.meeting_area,
            sw.max_pets,
            sw.approval_required,
            sw.notes_for_guests,
            sw.visibility,
            sw.status,
            p.name as pet_name,
            p.avatar_url as pet_avatar,
            up.username as owner_username,
            (
              SELECT COUNT(*)
              FROM social_walk_join_requests swjr
              WHERE swjr.social_walk_id = sw.id AND swjr.status = 'approved'
            ) as approved_participants_count
          FROM social_walks sw
          JOIN pets p ON sw.pet_id = p.id
          JOIN user_profiles up ON sw.owner_user_id = up.id
          JOIN pet_friendships pf ON (
            (pf.requester_pet_id = sw.pet_id AND pf.receiver_pet_id = ANY(${userPetIds}))
            OR
            (pf.receiver_pet_id = sw.pet_id AND pf.requester_pet_id = ANY(${userPetIds}))
          )
          WHERE sw.visibility = 'friends_only'
            AND sw.status = 'scheduled'
            AND sw.scheduled_at > NOW()
            AND sw.owner_user_id != ${ownerUserId}
            AND pf.status = 'accepted'
          ORDER BY sw.scheduled_at ASC
          LIMIT 50
        `;
      } else {
        walks = [];
      }
    }

    return Response.json({ walks }, { status: 200 });
  } catch (error) {
    console.error("[social-walks] Error fetching social walks:", error);
    return Response.json(
      { error: "Failed to fetch social walks" },
      { status: 500 },
    );
  }
}

// RLS R1-rollout: identity-scoped wrappers (docs/rls-hardening.md). Handler
// bodies are unchanged — only their DB connection is now request-scoped.
const wrappedPOST = withRequestContext(POST);
const wrappedGET = withRequestContext(GET);
export { wrappedPOST as POST, wrappedGET as GET };
