import sql from "@/app/api/utils/sql";
import { resolvePetLogOwner } from "@/app/api/utils/petLogAccess";
import { auth } from "@/auth";
import { withRequestContext } from "@/app/api/utils/requestContext";
import { recordBusinessEvent } from "@/lib/telemetry/business";
import { withLoggedByNames } from "@/app/api/utils/loggedBy";

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
      amount,
      shape,
      color,
      blood,
      mucus,
      straining,
      accidentInHouse,
      photoUrl,
      notes,
    } = body;

    if (!petId) {
      return Response.json({ error: "petId is required" }, { status: 400 });
    }

    // Owner OR an active grantee may log (family: everything; caregiver: logs only — owner decision 2, 2026-11-23).
    // The row is anchored to the pet's OWNER so it stays visible to the household.
    const access = await resolvePetLogOwner(ownerUserId, petId, { allowCaregiver: true, logTable: "health_poo_logs" });
    if (access.error) {
      return Response.json(
        { error: access.error, ...(access.code ? { code: access.code } : {}) },
        { status: access.status },
      );
    }

    const result = await sql`
      INSERT INTO health_poo_logs (
        pet_id,
        owner_user_id,
        amount,
        shape,
        color,
        blood,
        mucus,
        straining,
        accident_in_house,
        photo_url,
        notes
      ) VALUES (
        ${petId},
        ${access.ownerUserId},
        ${amount || null},
        ${shape || null},
        ${color || null},
        ${blood || false},
        ${mucus || false},
        ${straining || false},
        ${accidentInHouse || false},
        ${photoUrl || null},
        ${notes || null}
      )
      RETURNING *
    `;

    recordBusinessEvent("health_log_created");
    return Response.json({ log: result[0] }, { status: 201 });
  } catch (error) {
    console.error("[health/poo-logs] Error creating log:", error);
    return Response.json(
      { error: "Failed to create poo log" },
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

    let logs;
    if (petId) {
      logs = await sql`
        SELECT * FROM health_poo_logs
        WHERE pet_id = ${petId} AND owner_user_id = (SELECT p.owner_user_id FROM pets p WHERE p.id = ${petId} AND (p.owner_user_id = ${ownerUserId} OR app_user_has_pet_access(p.id)))
        ORDER BY logged_at DESC
        LIMIT ${limit}
      `;
    } else {
      logs = await sql`
        SELECT * FROM health_poo_logs
        WHERE owner_user_id = ${ownerUserId}
        ORDER BY logged_at DESC
        LIMIT ${limit}
      `;
    }

    return Response.json({ logs: await withLoggedByNames(logs) }, { status: 200 });
  } catch (error) {
    console.error("[health/poo-logs] Error fetching logs:", error);
    return Response.json(
      { error: "Failed to fetch poo logs" },
      { status: 500 },
    );
  }
}

// RLS R1-rollout: identity-scoped wrappers (docs/rls-hardening.md). Handler
// bodies are unchanged — only their DB connection is now request-scoped.
const wrappedPOST = withRequestContext(POST);
const wrappedGET = withRequestContext(GET);
export { wrappedPOST as POST, wrappedGET as GET };
