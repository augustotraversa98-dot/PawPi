import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";

// Durable skip/dismiss for overdue reminder instances (Ticket 8). Reconciled on
// load alongside the log-derived "resolved" set so a skipped overdue item does not
// reappear after an app restart. Scoped by owner_user_id (= user_profiles.id) + pet_id.

export async function GET(request) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const petId = searchParams.get("petId");

  if (!petId) {
    return Response.json({ error: "petId is required" }, { status: 400 });
  }

  try {
    const userProfiles = await sql`
      SELECT id FROM user_profiles WHERE auth_user_id = ${session.user.id}
    `;
    if (userProfiles.length === 0) {
      return Response.json({ error: "User profile not found" }, { status: 404 });
    }
    const userProfileId = userProfiles[0].id;

    const dismissals = await sql`
      SELECT id, pet_id, routine_id, reminder_type, instance_key, scheduled_date, dismissed_at
      FROM reminder_dismissals
      WHERE pet_id = ${parseInt(petId)}
        AND owner_user_id = ${userProfileId}
      ORDER BY dismissed_at DESC
    `;

    return Response.json({ dismissals });
  } catch (error) {
    console.error("[reminder-dismissals GET] Error:", error);
    return Response.json(
      { error: "Failed to fetch reminder dismissals" },
      { status: 500 },
    );
  }
}

export async function POST(request) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { petId, routineId, reminderType, instanceKey, scheduledDate } = body;

    if (!petId || !reminderType || !instanceKey) {
      return Response.json(
        { error: "petId, reminderType and instanceKey are required" },
        { status: 400 },
      );
    }

    const userProfiles = await sql`
      SELECT id FROM user_profiles WHERE auth_user_id = ${session.user.id}
    `;
    if (userProfiles.length === 0) {
      return Response.json({ error: "User profile not found" }, { status: 404 });
    }
    const userProfileId = userProfiles[0].id;

    // Idempotent: a repeat dismissal of the same instance is a no-op.
    const result = await sql`
      INSERT INTO reminder_dismissals (
        pet_id,
        owner_user_id,
        routine_id,
        reminder_type,
        instance_key,
        scheduled_date
      ) VALUES (
        ${parseInt(petId)},
        ${userProfileId},
        ${routineId || null},
        ${reminderType},
        ${instanceKey},
        ${scheduledDate || null}
      )
      ON CONFLICT (owner_user_id, pet_id, instance_key) DO NOTHING
      RETURNING *
    `;

    // On conflict nothing is returned; fetch the existing row so the client always
    // gets the dismissal back.
    if (result.length === 0) {
      const existing = await sql`
        SELECT * FROM reminder_dismissals
        WHERE owner_user_id = ${userProfileId}
          AND pet_id = ${parseInt(petId)}
          AND instance_key = ${instanceKey}
      `;
      return Response.json({ dismissal: existing[0] || null });
    }

    return Response.json({ dismissal: result[0] });
  } catch (error) {
    console.error("[reminder-dismissals POST] Error:", error);
    return Response.json(
      { error: "Failed to create reminder dismissal" },
      { status: 500 },
    );
  }
}

// Clear a routine's heads-up acknowledgments so editing / re-enabling the routine
// rebuilds its early reminders fresh — a previously-Closed heads-up for a still-
// future occurrence reappears (ticket/early-reminder-headsup). Scoped to the
// owner + pet + routine, and ONLY to the `${id}::early` keys: real skip dismissals
// (no `::early` suffix) and every health log/history are left untouched. Hard
// delete is fine — this is an ack table, not health history.
export async function DELETE(request) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const petId = searchParams.get("petId");
  const routineId = searchParams.get("routineId");

  if (!petId || !routineId) {
    return Response.json(
      { error: "petId and routineId are required" },
      { status: 400 },
    );
  }

  try {
    const userProfiles = await sql`
      SELECT id FROM user_profiles WHERE auth_user_id = ${session.user.id}
    `;
    if (userProfiles.length === 0) {
      return Response.json({ error: "User profile not found" }, { status: 404 });
    }
    const userProfileId = userProfiles[0].id;

    const deleted = await sql`
      DELETE FROM reminder_dismissals
      WHERE pet_id = ${parseInt(petId)}
        AND owner_user_id = ${userProfileId}
        AND routine_id = ${parseInt(routineId)}
        AND instance_key LIKE ${"%::early"}
      RETURNING id
    `;

    return Response.json({ deleted: deleted.length });
  } catch (error) {
    console.error("[reminder-dismissals DELETE] Error:", error);
    return Response.json(
      { error: "Failed to clear reminder dismissals" },
      { status: 500 },
    );
  }
}
