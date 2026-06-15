import sql from "@/app/api/utils/sql";
import { jsonbWriteValue } from "@/app/api/utils/jsonb";
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

    // Write-through to pet_vaccinations (the vaccination-history SSOT) is part of
    // the SAME statement as the medical-care log, so the two can never diverge: a
    // single CTE inserts the log, then — ONLY when that log is an ADMINISTERED
    // vaccine — inserts the matching vaccination row linked by
    // source_medical_care_log_id. The log row is still returned unchanged, so the
    // reminder engine (which resolves off health_medical_care_logs) is untouched.
    //
    // Administered set = status in ('given','completed'): the vaccine routine flow
    // emits 'completed' (mobile reminderLogFlow.js vaccine branch — both
    // "add vet record" and "Mark completed"); 'given' is the generic medical-care
    // administered status. A skipped / 'issue_reported' completion is NOT
    // administered → the WHERE filters it out and no vaccination row is written
    // (any reaction stays on the medical-care log). For a non-vaccine log the
    // SELECT matches nothing, so only the log is inserted. given_at::date→date_given
    // (given_at is intentionally backdated to the scheduled day — kept as-is);
    // expires_on/lot/administered_by_provider_id stay null (not captured by the
    // routine flow). ON CONFLICT DO NOTHING keeps the write-through idempotent on
    // the source-log link.
    const result = await sql`
      WITH new_log AS (
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
          ${reactionOrIssue ? sql.json(jsonbWriteValue(reactionOrIssue)) : null}
        )
        RETURNING *
      ), new_vaccination AS (
        INSERT INTO pet_vaccinations (
          pet_id, owner_user_id, name, date_given, source, source_medical_care_log_id
        )
        SELECT
          pet_id,
          owner_user_id,
          COALESCE(name, 'Vaccine'),
          given_at::date,
          'owner',
          id
        FROM new_log
        WHERE care_type = 'vaccine' AND status IN ('given', 'completed')
        ON CONFLICT (source_medical_care_log_id)
          WHERE source_medical_care_log_id IS NOT NULL
          DO NOTHING
        RETURNING id
      )
      SELECT * FROM new_log
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
