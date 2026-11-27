import sql from "@/app/api/utils/sql";
import { jsonbWriteValue } from "@/app/api/utils/jsonb";
import { auth } from "@/auth";
import { withRequestContext } from "@/app/api/utils/requestContext";
import { resolvePetLogOwner } from "@/app/api/utils/petLogAccess";
import { recordBusinessEvent } from "@/lib/telemetry/business";
import { withLoggedByNames } from "@/app/api/utils/loggedBy";
import { invalidNumberResponse } from "@/app/api/utils/invalidNumber";
import { DISTANCE_MAX, INT_MAX, readClientDecimal, readClientInteger } from "@/lib/decimal";
import { distanceInKm } from "@/app/api/utils/walkDistance";

// The most average_speed numeric(5,2) can hold.
const SPEED_MAX = 999.99;

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

    const callerId = userProfiles[0].id;

    const body = await request.json();
    const {
      petId,
      startTime,
      durationMinutes,
      distance,
      distanceUnit,
      pace,
      energyAfter,
      pottyEvents,
      routeOrLocation,
      notes,
      steps,
      averageSpeed,
      source,
      sourceDevice,
    } = body;

    if (!petId) {
      return Response.json({ error: "petId is required" }, { status: 400 });
    }

    // FF2: owner OR accepted FAMILY caregiver may log a walk (0049). The write anchors to the
    // pet's OWNER (owner_user_id), so a caregiver's walk stays visible to the whole household
    // and counts in the owner-scoped care-ring / weekly digest.
    const access = await resolvePetLogOwner(callerId, petId, { allowCaregiver: true, logTable: "health_walk_logs" });
    if (access.error) {
      return Response.json(
        { error: access.error, ...(access.code ? { code: access.code } : {}) },
        { status: access.status },
      );
    }
    const ownerUserId = access.ownerUserId;

    // Numeric and integer columns. Typed text from installed builds is read ("2,5"); anything unreadable is a 400
    // rather than a database error. A tracked distance may carry any precision; the column rounds it.
    const typed = readClientDecimal(distance, { max: DISTANCE_MAX });
    if (typed.invalid) return invalidNumberResponse(request, "distance_invalid", "distance");
    const km = await distanceInKm(request, callerId, typed.value, distanceUnit);
    const speed = readClientDecimal(averageSpeed, { max: SPEED_MAX });
    if (speed.invalid) return invalidNumberResponse(request, "speed_invalid", "averageSpeed", { max: SPEED_MAX });
    // Negative minutes were stored before this check and still are: only what the column cannot hold is refused.
    const minutes = readClientInteger(durationMinutes, { min: -INT_MAX });
    if (minutes.invalid) return invalidNumberResponse(request, "whole_number_invalid", "durationMinutes");
    const stepCount = readClientInteger(steps);
    if (stepCount.invalid) return invalidNumberResponse(request, "whole_number_invalid", "steps");

    // Use provided startTime or default to NOW()
    const walkStartTime = startTime ? new Date(startTime).toISOString() : null;

    const result = await sql`
      INSERT INTO health_walk_logs (
        pet_id,
        owner_user_id,
        start_time,
        duration_minutes,
        distance,
        distance_unit,
        pace,
        energy_after,
        potty_events,
        route_or_location,
        notes,
        steps,
        average_speed,
        source,
        source_device
      ) VALUES (
        ${petId},
        ${ownerUserId},
        ${walkStartTime || sql`NOW()`},
        ${minutes.value || null},
        ${km || null},
        'km',
        ${pace || null},
        ${energyAfter || null},
        ${pottyEvents ? sql.json(jsonbWriteValue(pottyEvents)) : null},
        ${routeOrLocation || null},
        ${notes || null},
        ${stepCount.value || null},
        ${speed.value || null},
        ${source || "manual"},
        ${sourceDevice || null}
      )
      RETURNING *
    `;

    const walkLog = result[0];

    // Create timeline event
    try {
      const walkName = routeOrLocation || "Walk";
      const summary = minutes.value
        ? `${walkName} · ${minutes.value} min`
        : walkName;

      await sql`
        INSERT INTO health_timeline_events (
          pet_id,
          owner_user_id,
          event_type,
          related_record_id,
          title,
          summary,
          event_time
        ) VALUES (
          ${petId},
          ${ownerUserId},
          'walk',
          ${walkLog.id},
          'Walk completed',
          ${summary},
          ${walkLog.start_time}
        )
      `;
    } catch (timelineError) {
      console.error(
        "[health/walk-logs] Timeline creation failed:",
        timelineError,
      );
      // Don't fail the whole request if timeline fails
    }

    recordBusinessEvent("walk_logged");
    return Response.json({ log: walkLog }, { status: 201 });
  } catch (error) {
    console.error("[health/walk-logs] Error creating log:", error);
    return Response.json(
      { error: "Failed to create walk log" },
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
        SELECT * FROM health_walk_logs
        WHERE pet_id = ${petId} AND owner_user_id = (SELECT p.owner_user_id FROM pets p WHERE p.id = ${petId} AND (p.owner_user_id = ${ownerUserId} OR app_user_has_pet_access(p.id)))
        ORDER BY start_time DESC
        LIMIT ${limit}
      `;
    } else {
      logs = await sql`
        SELECT * FROM health_walk_logs
        WHERE owner_user_id = ${ownerUserId}
        ORDER BY start_time DESC
        LIMIT ${limit}
      `;
    }

    return Response.json({ logs: await withLoggedByNames(logs) }, { status: 200 });
  } catch (error) {
    console.error("[health/walk-logs] Error fetching logs:", error);
    return Response.json(
      { error: "Failed to fetch walk logs" },
      { status: 500 },
    );
  }
}

// RLS R1-rollout: identity-scoped wrappers (docs/rls-hardening.md). Handler
// bodies are unchanged — only their DB connection is now request-scoped.
const wrappedPOST = withRequestContext(POST);
const wrappedGET = withRequestContext(GET);
export { wrappedPOST as POST, wrappedGET as GET };
