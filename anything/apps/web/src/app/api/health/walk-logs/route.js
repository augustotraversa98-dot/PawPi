import sql from "@/app/api/utils/sql";
import { jsonbWriteValue } from "@/app/api/utils/jsonb";
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

    const pets = await sql`
      SELECT id FROM pets WHERE id = ${petId} AND owner_user_id = ${ownerUserId}
    `;

    if (pets.length === 0) {
      return Response.json(
        { error: "Pet not found or access denied" },
        { status: 403 },
      );
    }

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
        ${durationMinutes || null},
        ${distance || null},
        ${distanceUnit || "miles"},
        ${pace || null},
        ${energyAfter || null},
        ${pottyEvents ? sql.json(jsonbWriteValue(pottyEvents)) : null},
        ${routeOrLocation || null},
        ${notes || null},
        ${steps || null},
        ${averageSpeed || null},
        ${source || "manual"},
        ${sourceDevice || null}
      )
      RETURNING *
    `;

    const walkLog = result[0];

    // Create timeline event
    try {
      const walkName = routeOrLocation || "Walk";
      const summary = durationMinutes
        ? `${walkName} · ${durationMinutes} min`
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

    console.log("[health/walk-logs] Log created:", walkLog);
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
        WHERE owner_user_id = ${ownerUserId} AND pet_id = ${petId}
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

    return Response.json({ logs }, { status: 200 });
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
