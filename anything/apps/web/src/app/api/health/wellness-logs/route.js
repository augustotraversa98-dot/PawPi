import sql from "@/app/api/utils/sql";
import { jsonbWriteValue } from "@/app/api/utils/jsonb";
import { auth } from "@/auth";
import { withRequestContext } from "@/app/api/utils/requestContext";

async function GET(request) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const petId = searchParams.get("petId");
  const checkType = searchParams.get("checkType");
  const limit = parseInt(searchParams.get("limit") || "20");

  if (!petId) {
    return Response.json({ error: "petId is required" }, { status: 400 });
  }

  try {
    // Get user profile
    const userProfiles = await sql`
      SELECT id FROM user_profiles WHERE auth_user_id = ${session.user.id}
    `;
    if (userProfiles.length === 0) {
      return Response.json(
        { error: "User profile not found" },
        { status: 404 },
      );
    }
    const userProfileId = userProfiles[0].id;

    // Build query with optional checkType filter
    let logs;
    if (checkType) {
      logs = await sql`
        SELECT * FROM health_wellness_logs
        WHERE pet_id = ${parseInt(petId)}
          AND owner_user_id = ${userProfileId}
          AND check_type = ${checkType}
        ORDER BY logged_at DESC
        LIMIT ${limit}
      `;
    } else {
      logs = await sql`
        SELECT * FROM health_wellness_logs
        WHERE pet_id = ${parseInt(petId)}
          AND owner_user_id = ${userProfileId}
        ORDER BY logged_at DESC
        LIMIT ${limit}
      `;
    }

    return Response.json({ logs });
  } catch (error) {
    console.error("[wellness-logs GET] Error:", error);
    return Response.json(
      { error: "Failed to fetch wellness logs" },
      { status: 500 },
    );
  }
}

const VALID_CHECK_TYPES = new Set([
  "general",
  "body_condition",
  "mobility",
  "mood_energy",
  "skin_coat",
  "appetite_hydration",
  "custom",
]);

async function POST(request) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const {
      petId,
      checkType,
      loggedAt,
      valuesJson,
      notes,
      imageUrl,
      routineId,
      wellnessCheckItemIndex,
    } = body;

    if (!petId || !checkType) {
      return Response.json(
        { error: "petId and checkType are required" },
        { status: 400 },
      );
    }
    if (!VALID_CHECK_TYPES.has(checkType)) {
      return Response.json(
        { error: `checkType must be one of: ${[...VALID_CHECK_TYPES].join(", ")}` },
        { status: 400 },
      );
    }

    // Get user profile
    const userProfiles = await sql`
      SELECT id FROM user_profiles WHERE auth_user_id = ${session.user.id}
    `;
    if (userProfiles.length === 0) {
      return Response.json(
        { error: "User profile not found" },
        { status: 404 },
      );
    }
    const userProfileId = userProfiles[0].id;

    // Insert wellness log
    const result = await sql`
      INSERT INTO health_wellness_logs (
        pet_id,
        owner_user_id,
        routine_id,
        wellness_check_item_index,
        check_type,
        logged_at,
        values_json,
        notes,
        image_url
      ) VALUES (
        ${parseInt(petId)},
        ${userProfileId},
        ${routineId || null},
        ${wellnessCheckItemIndex !== undefined ? parseInt(wellnessCheckItemIndex) : null},
        ${checkType},
        ${loggedAt || new Date().toISOString()},
        ${valuesJson ? sql.json(jsonbWriteValue(valuesJson)) : null},
        ${notes || null},
        ${imageUrl || null}
      )
      RETURNING *
    `;

    return Response.json({ log: result[0] });
  } catch (error) {
    console.error("[wellness-logs POST] Error:", error);
    return Response.json(
      { error: "Failed to create wellness log" },
      { status: 500 },
    );
  }
}

// Delete a single wellness log the caller owns — the undo path for the Care Ring's
// "quick check-in" (NR3): a just-created "all good" wellness log can be removed. Owner-
// scoped in the WHERE (and enforced again by the table's own-row RLS), so a caller can
// never delete another owner's log.
async function DELETE(request) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const userProfiles = await sql`
      SELECT id FROM user_profiles WHERE auth_user_id = ${session.user.id}
    `;
    if (userProfiles.length === 0) {
      return Response.json({ error: "User profile not found" }, { status: 404 });
    }
    const userProfileId = userProfiles[0].id;

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) {
      return Response.json({ error: "id is required" }, { status: 400 });
    }

    const deleted = await sql`
      DELETE FROM health_wellness_logs
      WHERE id = ${parseInt(id)} AND owner_user_id = ${userProfileId}
      RETURNING id
    `;
    if (deleted.length === 0) {
      return Response.json({ error: "Wellness log not found" }, { status: 404 });
    }
    return Response.json({ ok: true });
  } catch (error) {
    console.error("[wellness-logs DELETE] Error:", error);
    return Response.json(
      { error: "Failed to delete wellness log" },
      { status: 500 },
    );
  }
}

// RLS R1-rollout: identity-scoped wrappers (docs/rls-hardening.md). Handler
// bodies are unchanged — only their DB connection is now request-scoped.
const wrappedGET = withRequestContext(GET);
const wrappedPOST = withRequestContext(POST);
const wrappedDELETE = withRequestContext(DELETE);
export { wrappedGET as GET, wrappedPOST as POST, wrappedDELETE as DELETE };
