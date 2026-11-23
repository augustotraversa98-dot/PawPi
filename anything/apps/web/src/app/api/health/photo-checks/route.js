import sql from "@/app/api/utils/sql";
import { resolvePetLogOwner } from "@/app/api/utils/petLogAccess";
import { auth } from "@/auth";
import { withRequestContext } from "@/app/api/utils/requestContext";
import { recordBusinessEvent } from "@/lib/telemetry/business";

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

    // Owner OR an active grantee may log (family: everything; caregiver: logs only — owner decision 2, 2026-11-23).
    // The row is anchored to the pet's OWNER so it stays visible to the household.
    const access = await resolvePetLogOwner(ownerUserId, petId, { allowCaregiver: true, logTable: "health_photo_checks" });
    if (access.error) {
      return Response.json(
        { error: access.error, ...(access.code ? { code: access.code } : {}) },
        { status: access.status },
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
        ${access.ownerUserId},
        ${bodyArea},
        ${imageUrl},
        ${notes || null}
      )
      RETURNING *
    `;

    recordBusinessEvent("health_log_created");
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
    // (AUDIT A-30) Optional lower time bound for the overdue derivation.
    const since = searchParams.get("since");
    const sinceClause = since ? sql`AND created_at >= ${since}` : sql``;

    let photoChecks;
    if (petId && bodyArea) {
      photoChecks = await sql`
        SELECT * FROM health_photo_checks
        WHERE pet_id = ${petId} AND owner_user_id = (SELECT p.owner_user_id FROM pets p WHERE p.id = ${petId} AND (p.owner_user_id = ${ownerUserId} OR app_user_has_pet_access(p.id))) AND body_area = ${bodyArea}
          ${sinceClause}
        ORDER BY created_at DESC
        LIMIT ${limit}
      `;
    } else if (petId) {
      photoChecks = await sql`
        SELECT * FROM health_photo_checks
        WHERE pet_id = ${petId} AND owner_user_id = (SELECT p.owner_user_id FROM pets p WHERE p.id = ${petId} AND (p.owner_user_id = ${ownerUserId} OR app_user_has_pet_access(p.id)))
          ${sinceClause}
        ORDER BY created_at DESC
        LIMIT ${limit}
      `;
    } else {
      photoChecks = await sql`
        SELECT * FROM health_photo_checks
        WHERE owner_user_id = ${ownerUserId}
          ${sinceClause}
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
