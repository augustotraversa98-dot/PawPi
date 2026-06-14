import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";

// GET - Fetch all non-deleted vet appointments for the current pet
export async function GET(request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const petId = searchParams.get("petId");

    if (!petId) {
      return Response.json({ error: "petId is required" }, { status: 400 });
    }

    // Get user_profile id from auth_user id
    const userProfileResult = await sql`
      SELECT id FROM user_profiles WHERE auth_user_id = ${session.user.id}
    `;

    if (userProfileResult.length === 0) {
      return Response.json(
        { error: "User profile not found" },
        { status: 404 },
      );
    }

    const ownerUserId = userProfileResult[0].id;

    // Fetch non-deleted appointments for this pet, ordered by date (upcoming first)
    const appointments = await sql`
      SELECT 
        id,
        pet_id,
        owner_user_id,
        title,
        appointment_date,
        appointment_time,
        clinic,
        veterinarian,
        reason_for_visit,
        notes,
        reminder_enabled,
        time_sensitive,
        reminder_timing,
        add_to_calendar,
        calendar_event_id,
        status,
        provider_id,
        provider_location_id,
        service_id,
        staff_user_id,
        booking_status,
        source,
        created_at,
        updated_at
      FROM vet_appointments
      WHERE pet_id = ${petId}
        AND owner_user_id = ${ownerUserId}
        AND deleted_at IS NULL
      ORDER BY appointment_date ASC, appointment_time ASC
    `;

    return Response.json({ appointments });
  } catch (error) {
    console.error("[GET /api/vet-appointments] Error:", error);
    return Response.json(
      { error: "Failed to fetch appointments" },
      { status: 500 },
    );
  }
}

// POST - Create a new vet appointment
export async function POST(request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const {
      petId,
      title,
      appointmentDate,
      appointmentTime,
      clinic,
      veterinarian,
      reasonForVisit,
      notes,
      reminderEnabled,
      timeSensitive,
      reminderTiming,
      addToCalendar,
      calendarEventId,
      status,
    } = body;

    // Validate required fields
    if (!petId || !title || !appointmentDate || !appointmentTime) {
      return Response.json(
        {
          error:
            "petId, title, appointmentDate, and appointmentTime are required",
        },
        { status: 400 },
      );
    }

    // Get user_profile id from auth_user id
    const userProfileResult = await sql`
      SELECT id FROM user_profiles WHERE auth_user_id = ${session.user.id}
    `;

    if (userProfileResult.length === 0) {
      return Response.json(
        { error: "User profile not found" },
        { status: 404 },
      );
    }

    const ownerUserId = userProfileResult[0].id;

    // Verify pet belongs to user
    const petCheck = await sql`
      SELECT id FROM pets WHERE id = ${petId} AND owner_user_id = ${ownerUserId}
    `;

    if (petCheck.length === 0) {
      return Response.json(
        { error: "Pet not found or unauthorized" },
        { status: 404 },
      );
    }

    // Insert new appointment
    const result = await sql`
      INSERT INTO vet_appointments (
        pet_id,
        owner_user_id,
        title,
        appointment_date,
        appointment_time,
        clinic,
        veterinarian,
        reason_for_visit,
        notes,
        reminder_enabled,
        time_sensitive,
        reminder_timing,
        add_to_calendar,
        calendar_event_id,
        status
      ) VALUES (
        ${petId},
        ${ownerUserId},
        ${title},
        ${appointmentDate},
        ${appointmentTime},
        ${clinic || null},
        ${veterinarian || null},
        ${reasonForVisit || null},
        ${notes || null},
        ${reminderEnabled ?? true},
        ${timeSensitive ?? true},
        ${reminderTiming || "at_time"},
        ${addToCalendar ?? false},
        ${calendarEventId || null},
        ${status || "scheduled"}
      )
      RETURNING *
    `;

    return Response.json({ appointment: result[0] }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/vet-appointments] Error:", error);
    return Response.json(
      { error: "Failed to create appointment" },
      { status: 500 },
    );
  }
}

// PUT - Update an existing vet appointment
export async function PUT(request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const {
      id,
      title,
      appointmentDate,
      appointmentTime,
      clinic,
      veterinarian,
      reasonForVisit,
      notes,
      reminderEnabled,
      timeSensitive,
      reminderTiming,
      addToCalendar,
      calendarEventId,
      status,
    } = body;

    if (!id) {
      return Response.json({ error: "id is required" }, { status: 400 });
    }

    // Get user_profile id from auth_user id
    const userProfileResult = await sql`
      SELECT id FROM user_profiles WHERE auth_user_id = ${session.user.id}
    `;

    if (userProfileResult.length === 0) {
      return Response.json(
        { error: "User profile not found" },
        { status: 404 },
      );
    }

    const ownerUserId = userProfileResult[0].id;

    // Build dynamic UPDATE query
    const updates = [];
    const values = [];
    let paramCounter = 1;

    if (title !== undefined) {
      updates.push(`title = $${paramCounter++}`);
      values.push(title);
    }
    if (appointmentDate !== undefined) {
      updates.push(`appointment_date = $${paramCounter++}`);
      values.push(appointmentDate);
    }
    if (appointmentTime !== undefined) {
      updates.push(`appointment_time = $${paramCounter++}`);
      values.push(appointmentTime);
    }
    if (clinic !== undefined) {
      updates.push(`clinic = $${paramCounter++}`);
      values.push(clinic || null);
    }
    if (veterinarian !== undefined) {
      updates.push(`veterinarian = $${paramCounter++}`);
      values.push(veterinarian || null);
    }
    if (reasonForVisit !== undefined) {
      updates.push(`reason_for_visit = $${paramCounter++}`);
      values.push(reasonForVisit || null);
    }
    if (notes !== undefined) {
      updates.push(`notes = $${paramCounter++}`);
      values.push(notes || null);
    }
    if (reminderEnabled !== undefined) {
      updates.push(`reminder_enabled = $${paramCounter++}`);
      values.push(reminderEnabled);
    }
    if (timeSensitive !== undefined) {
      updates.push(`time_sensitive = $${paramCounter++}`);
      values.push(timeSensitive);
    }
    if (reminderTiming !== undefined) {
      updates.push(`reminder_timing = $${paramCounter++}`);
      values.push(reminderTiming);
    }
    if (addToCalendar !== undefined) {
      updates.push(`add_to_calendar = $${paramCounter++}`);
      values.push(addToCalendar);
    }
    if (calendarEventId !== undefined) {
      updates.push(`calendar_event_id = $${paramCounter++}`);
      values.push(calendarEventId || null);
    }
    if (status !== undefined) {
      updates.push(`status = $${paramCounter++}`);
      values.push(status);
    }

    // Always update updated_at
    updates.push(`updated_at = NOW()`);

    if (updates.length === 0) {
      return Response.json({ error: "No fields to update" }, { status: 400 });
    }

    // Add WHERE clause parameters
    values.push(id);
    const idParam = `$${paramCounter++}`;
    values.push(ownerUserId);
    const ownerParam = `$${paramCounter}`;

    const query = `
      UPDATE vet_appointments
      SET ${updates.join(", ")}
      WHERE id = ${idParam}
        AND owner_user_id = ${ownerParam}
        AND deleted_at IS NULL
      RETURNING *
    `;

    const result = await sql.unsafe(query, values);

    if (result.length === 0) {
      return Response.json(
        { error: "Appointment not found or unauthorized" },
        { status: 404 },
      );
    }

    return Response.json({ appointment: result[0] });
  } catch (error) {
    console.error("[PUT /api/vet-appointments] Error:", error);
    return Response.json(
      { error: "Failed to update appointment" },
      { status: 500 },
    );
  }
}

// DELETE - Soft delete a vet appointment
export async function DELETE(request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return Response.json({ error: "id is required" }, { status: 400 });
    }

    // Get user_profile id from auth_user id
    const userProfileResult = await sql`
      SELECT id FROM user_profiles WHERE auth_user_id = ${session.user.id}
    `;

    if (userProfileResult.length === 0) {
      return Response.json(
        { error: "User profile not found" },
        { status: 404 },
      );
    }

    const ownerUserId = userProfileResult[0].id;

    // Soft delete by setting deleted_at and status
    const result = await sql`
      UPDATE vet_appointments
      SET 
        deleted_at = NOW(),
        status = 'cancelled',
        updated_at = NOW()
      WHERE id = ${id}
        AND owner_user_id = ${ownerUserId}
        AND deleted_at IS NULL
      RETURNING id
    `;

    if (result.length === 0) {
      return Response.json(
        { error: "Appointment not found or unauthorized" },
        { status: 404 },
      );
    }

    return Response.json({ success: true, deletedId: result[0].id });
  } catch (error) {
    console.error("[DELETE /api/vet-appointments] Error:", error);
    return Response.json(
      { error: "Failed to delete appointment" },
      { status: 500 },
    );
  }
}
