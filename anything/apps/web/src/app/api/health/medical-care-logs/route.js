import sql from "@/app/api/utils/sql";
import { resolvePetLogOwner, policyExists } from "@/app/api/utils/petLogAccess";
import { jsonbWriteValue } from "@/app/api/utils/jsonb";
import { auth } from "@/auth";
import { withRequestContext } from "@/app/api/utils/requestContext";
import { recordBusinessEvent } from "@/lib/telemetry/business";

// POST - Save a medical care log entry (mark as given / completed / issue reported)
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

    // Owner OR an active grantee may log (family: everything; caregiver: logs only — owner decision 2, 2026-11-23).
    // The row is anchored to the pet's OWNER so it stays visible to the household.
    const access = await resolvePetLogOwner(ownerUserId, petId, { allowCaregiver: true, logTable: "health_medical_care_logs" });
    if (access.error) {
      return Response.json(
        { error: access.error, ...(access.code ? { code: access.code } : {}) },
        { status: access.status },
      );
    }
    // A vaccine administered through a medical-care log is ALSO written to pet_vaccinations (below). That is the vaccine record, so it
    // is OWNER or FAMILY (co-owner) only (owner decision 2, PR3b): a caregiver can log/complete other care but not record a vaccine.
    // A family member additionally needs pet_vaccinations_family_all (0141) - absent => friendly 403, never a mid-statement RLS 500.
    if (!access.isOwner && careType === "vaccine" && ["given", "completed"].includes(status)) {
      if (access.role !== "family") {
        return Response.json(
          { error: "Only the pet's owner or family can record a vaccine.", code: "vaccine_family_only" },
          { status: 403 },
        );
      }
      if (!(await policyExists("pet_vaccinations", "pet_vaccinations_family_all"))) {
        return Response.json(
          { error: "Recording a vaccine isn't available for family members yet.", code: "family_write_unavailable" },
          { status: 403 },
        );
      }
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
          ${access.ownerUserId},
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

    recordBusinessEvent("health_log_created");
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
    // (AUDIT A-30) Optional lower time bound for the overdue derivation.
    const since = searchParams.get("since");
    const sinceClause = since ? sql`AND given_at >= ${since}` : sql``;

    let logs;
    if (petId) {
      logs = await sql`
        SELECT * FROM health_medical_care_logs
        WHERE pet_id = ${petId} AND owner_user_id = (SELECT p.owner_user_id FROM pets p WHERE p.id = ${petId} AND (p.owner_user_id = ${ownerUserId} OR app_user_has_pet_access(p.id)))
          ${sinceClause}
        ORDER BY given_at DESC
        LIMIT ${limit}
      `;
    } else {
      logs = await sql`
        SELECT * FROM health_medical_care_logs
        WHERE owner_user_id = ${ownerUserId}
          ${sinceClause}
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

// RLS R1-rollout: identity-scoped wrappers (docs/rls-hardening.md). Handler
// bodies are unchanged — only their DB connection is now request-scoped.
const wrappedPOST = withRequestContext(POST);
const wrappedGET = withRequestContext(GET);
export { wrappedPOST as POST, wrappedGET as GET };
