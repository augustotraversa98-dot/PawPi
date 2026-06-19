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
    const { petId, bodyArea, imageUrl, notes } = body;

    if (!petId || !bodyArea || !imageUrl) {
      return Response.json(
        { error: "petId, bodyArea, and imageUrl are required" },
        { status: 400 },
      );
    }

    const validBodyAreas = [
      "paws",
      "ears",
      "eyes",
      "teeth",
      "skin_fur",
      "face",
      "full_body",
      "other",
    ];
    if (!validBodyAreas.includes(bodyArea)) {
      return Response.json({ error: "Invalid body area" }, { status: 400 });
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
      INSERT INTO health_photo_checks (
        pet_id,
        owner_user_id,
        body_area,
        image_url,
        notes
      ) VALUES (
        ${petId},
        ${ownerUserId},
        ${bodyArea},
        ${imageUrl},
        ${notes || null}
      )
      RETURNING *
    `;

    return Response.json({ photoCheck: result[0] }, { status: 201 });
  } catch (error) {
    console.error("[health/photo-checks] Error creating photo check:", error);
    return Response.json(
      { error: "Failed to create photo check" },
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
    const bodyArea = searchParams.get("bodyArea");
    const limit = parseInt(searchParams.get("limit") || "50");

    let photoChecks;
    if (petId && bodyArea) {
      photoChecks = await sql`
        SELECT * FROM health_photo_checks
        WHERE owner_user_id = ${ownerUserId} AND pet_id = ${petId} AND body_area = ${bodyArea}
        ORDER BY created_at DESC
        LIMIT ${limit}
      `;
    } else if (petId) {
      photoChecks = await sql`
        SELECT * FROM health_photo_checks
        WHERE owner_user_id = ${ownerUserId} AND pet_id = ${petId}
        ORDER BY created_at DESC
        LIMIT ${limit}
      `;
    } else {
      photoChecks = await sql`
        SELECT * FROM health_photo_checks
        WHERE owner_user_id = ${ownerUserId}
        ORDER BY created_at DESC
        LIMIT ${limit}
      `;
    }

    return Response.json({ photoChecks }, { status: 200 });
  } catch (error) {
    console.error("[health/photo-checks] Error fetching photo checks:", error);
    return Response.json(
      { error: "Failed to fetch photo checks" },
      { status: 500 },
    );
  }
}

// RLS R1-rollout: identity-scoped wrappers (docs/rls-hardening.md). Handler
// bodies are unchanged — only their DB connection is now request-scoped.
const wrappedPOST = withRequestContext(POST);
const wrappedGET = withRequestContext(GET);
export { wrappedPOST as POST, wrappedGET as GET };
