import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { withRequestContext } from "@/app/api/utils/requestContext";

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
      petId,
      eyesStatus,
      earsStatus,
      teethStatus,
      skinFurStatus,
      pawsStatus,
      faceStatus,
      mood,
      energy,
      notes,
    } = body;

    if (!petId) {
      return Response.json({ error: "petId is required" }, { status: 400 });
    }

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
      INSERT INTO health_general_checks (
        pet_id,
        owner_user_id,
        eyes_status,
        ears_status,
        teeth_status,
        skin_fur_status,
        paws_status,
        face_status,
        mood,
        energy,
        notes
      ) VALUES (
        ${petId},
        ${ownerUserId},
        ${eyesStatus || null},
        ${earsStatus || null},
        ${teethStatus || null},
        ${skinFurStatus || null},
        ${pawsStatus || null},
        ${faceStatus || null},
        ${mood || null},
        ${energy || null},
        ${notes || null}
      )
      RETURNING *
    `;

    return Response.json({ check: result[0] }, { status: 201 });
  } catch (error) {
    console.error("[health/general-checks] Error creating check:", error);
    return Response.json(
      { error: "Failed to create general check" },
      { status: 500 },
    );
  }
}

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
    const petId = searchParams.get("petId");
    const limit = parseInt(searchParams.get("limit") || "50");

    let checks;
    if (petId) {
      checks = await sql`
        SELECT * FROM health_general_checks
        WHERE owner_user_id = ${ownerUserId} AND pet_id = ${petId}
        ORDER BY logged_at DESC
        LIMIT ${limit}
      `;
    } else {
      checks = await sql`
        SELECT * FROM health_general_checks
        WHERE owner_user_id = ${ownerUserId}
        ORDER BY logged_at DESC
        LIMIT ${limit}
      `;
    }

    return Response.json({ checks }, { status: 200 });
  } catch (error) {
    console.error("[health/general-checks] Error fetching checks:", error);
    return Response.json(
      { error: "Failed to fetch general checks" },
      { status: 500 },
    );
  }
}

// RLS R1-rollout: identity-scoped wrappers (docs/rls-hardening.md). Handler
// bodies are unchanged — only their DB connection is now request-scoped.
const wrappedPOST = withRequestContext(POST);
const wrappedGET = withRequestContext(GET);
export { wrappedPOST as POST, wrappedGET as GET };
