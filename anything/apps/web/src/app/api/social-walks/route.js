import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { withRequestContext } from "@/app/api/utils/requestContext";
import { moderationResponse } from "@/app/api/utils/moderateText";

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

    const body = (await request.json().catch(() => ({}))) ?? {};
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
      lat,
      lng,
      locationName,
      inviteUserIds,
    } = body;

    if (!petId || !walkName || !scheduledAt || !visibility) {
      return Response.json(
        { error: "petId, walkName, scheduledAt, and visibility are required" },
        { status: 400 },
      );
    }

    // Content filter (T7): reject objectionable walk name / notes / location text before insert.
    const blocked = moderationResponse(walkName, notesForGuests, meetingArea, locationName);
    if (blocked) return blocked;

    // Coords (optional) — must be a valid lat/lng pair if either is provided.
    const latNum = lat === undefined || lat === null || lat === "" ? null : Number(lat);
    const lngNum = lng === undefined || lng === null || lng === "" ? null : Number(lng);
    if (
      (latNum !== null && (Number.isNaN(latNum) || latNum < -90 || latNum > 90)) ||
      (lngNum !== null && (Number.isNaN(lngNum) || lngNum < -180 || lngNum > 180))
    ) {
      return Response.json({ error: "Invalid lat/lng" }, { status: 400 });
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
        notes_for_guests,
        lat,
        lng,
        location_name
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
        ${notesForGuests || null},
        ${latNum},
        ${lngNum},
        ${locationName || null}
      )
      RETURNING *
    `;

    const socialWalk = result[0];

    // Private walk → record the explicit invitations (owner-issued). Only valid
    // user_profiles ids that are not the owner are invited; deduped.
    if (
      visibility === "private" &&
      Array.isArray(inviteUserIds) &&
      inviteUserIds.length > 0
    ) {
      const cleanIds = [
        ...new Set(
          inviteUserIds
            .map((v) => Number(v))
            .filter((v) => Number.isInteger(v) && v > 0 && v !== ownerUserId),
        ),
      ];
      for (const invitedUserId of cleanIds) {
        await sql`
          INSERT INTO social_walk_invites
            (social_walk_id, invited_user_id, invited_by_user_id)
          VALUES (${socialWalk.id}, ${invitedUserId}, ${ownerUserId})
          ON CONFLICT (social_walk_id, invited_user_id) DO NOTHING
        `;
      }
    }

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
    const invited = searchParams.get("invited") === "true";

    // Optional bounding-box for nearby discovery (no PostGIS — a plain numeric range).
    const centerLat = parseFloat(searchParams.get("lat"));
    const centerLng = parseFloat(searchParams.get("lng"));
    const radiusKm = parseFloat(searchParams.get("radiusKm")) || 25;
    const hasBox = Number.isFinite(centerLat) && Number.isFinite(centerLng);
    let latMin, latMax, lngMin, lngMax;
    if (hasBox) {
      const latDelta = radiusKm / 111;
      const lngDelta =
        radiusKm / (111 * Math.max(0.01, Math.cos((centerLat * Math.PI) / 180)));
      latMin = centerLat - latDelta;
      latMax = centerLat + latDelta;
      lngMin = centerLng - lngDelta;
      lngMax = centerLng + lngDelta;
    }

    let walks;

    if (invited) {
      // Private walks the current user has been invited to (invitee view of discovery).
      walks = await sql`
        SELECT
          sw.id,
          sw.walk_name,
          sw.scheduled_at,
          sw.duration_minutes,
          sw.pace,
          sw.meeting_area,
          sw.lat,
          sw.lng,
          sw.location_name,
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
        JOIN social_walk_invites swi ON swi.social_walk_id = sw.id
          AND swi.invited_user_id = ${ownerUserId}
        JOIN pets p ON sw.pet_id = p.id
        JOIN user_profiles up ON sw.owner_user_id = up.id
        WHERE sw.status = 'scheduled'
          AND sw.scheduled_at > NOW()
          AND sw.hidden_at IS NULL
          AND NOT app_user_is_blocked(${ownerUserId}, sw.owner_user_id)
        ORDER BY sw.scheduled_at ASC
        LIMIT 50
      `;
    } else if (myWalks) {
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
            sw.lat,
            sw.lng,
            sw.location_name,
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
            AND sw.hidden_at IS NULL
            AND NOT app_user_is_blocked(${ownerUserId}, sw.owner_user_id)
            AND (
              ${!hasBox}
              OR (
                sw.lat IS NOT NULL AND sw.lng IS NOT NULL
                AND sw.lat BETWEEN ${latMin ?? null} AND ${latMax ?? null}
                AND sw.lng BETWEEN ${lngMin ?? null} AND ${lngMax ?? null}
              )
            )
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
            sw.lat,
            sw.lng,
            sw.location_name,
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
            AND sw.hidden_at IS NULL
            AND NOT app_user_is_blocked(${ownerUserId}, sw.owner_user_id)
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
