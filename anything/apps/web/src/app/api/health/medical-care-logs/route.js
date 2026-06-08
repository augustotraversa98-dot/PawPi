import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";

// POST - Save a medical care log entry (mark as given / completed / issue reported)
export async function POST(request) {
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
      routineId,
      medicalCareItemId,
      careType,
      name,
      dose,
      givenAt,
      status,
      notes,
      reactionOrIssue,
    } = body;

    if (!petId) {
      return Response.json({ error: "petId is required" }, { status: 400 });
    }
    if (!status) {
      return Response.json({ error: "status is required" }, { status: 400 });
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
      INSERT INTO health_medical_care_logs (
        pet_id,
        owner_user_id,
        routine_id,
        medical_care_item_id,
        care_type,
        name,
        dose,
        given_at,
        status,
        notes,
        reaction_or_issue
      ) VALUES (
        ${petId},
        ${ownerUserId},
        ${routineId || null},
        ${medicalCareItemId || null},
        ${careType || null},
        ${name || null},
        ${dose || null},
        ${givenAt || new Date().toISOString()},
        ${status},
        ${notes || null},
        ${reactionOrIssue ? sql.json(reactionOrIssue) : null}
      )
      RETURNING *
    `;

    return Response.json({ log: result[0] }, { status: 201 });
  } catch (error) {
    console.error("[health/medical-care-logs] Error creating log:", error);
    return Response.json(
      { error: "Failed to create medical care log" },
      { status: 500 },
    );
  }
}

// GET - Fetch medical care logs for a pet (history)
export async function GET(request) {
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
        SELECT * FROM health_medical_care_logs
        WHERE owner_user_id = ${ownerUserId} AND pet_id = ${petId}
        ORDER BY given_at DESC
        LIMIT ${limit}
      `;
    } else {
      logs = await sql`
        SELECT * FROM health_medical_care_logs
        WHERE owner_user_id = ${ownerUserId}
        ORDER BY given_at DESC
        LIMIT ${limit}
      `;
    }

    return Response.json({ logs }, { status: 200 });
  } catch (error) {
    console.error("[health/medical-care-logs] Error fetching logs:", error);
    return Response.json(
      { error: "Failed to fetch medical care logs" },
      { status: 500 },
    );
  }
}
