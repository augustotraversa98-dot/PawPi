import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { withRequestContext, withSavepoint } from "@/app/api/utils/requestContext";
import { bizNotifyBody } from "@/app/api/utils/notify";
import { notifyProviderTeam } from "@/app/api/utils/providerNotify";
import { recordBusinessEvent } from "@/lib/telemetry/business";

// GET - Fetch all non-deleted vet appointments for the current pet
async function GET(request) {
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
async function POST(request) {
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

    recordBusinessEvent("booking_created");
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
// Owner-editable lifecycle values (the DB CHECK allows these; anything else used to be a raw 500).
const OWNER_STATUSES = ["scheduled", "completed", "cancelled", "missed"];

// Postgres hands back `date` as a JS Date (UTC midnight) and `time` as "HH:MM:SS"; clients send
// "YYYY-MM-DD" / "HH:MM". Normalize both sides before comparing.
const ymd = (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v ?? "").slice(0, 10));
const hm = (v) => String(v ?? "").slice(0, 5);

// A booking made with a PROVIDER is a two-party record: the provider confirms/declines/completes it,
// the owner may only cancel it. Cancelling a provider booking must also close the booking workflow
// (booking_status), stop reminders and cancel the linked consult — otherwise the provider's inbox
// still shows it as live and they can "confirm" or "complete" a cancelled booking (flow audit F3-08).
async function cancelLinkedConsult(appointmentId) {
  try {
    await withSavepoint(() => sql`
      UPDATE telehealth_sessions
      SET status = 'cancelled', updated_at = NOW()
      WHERE booking_id = ${appointmentId} AND status IN ('scheduled', 'in_progress')
    `);
  } catch {
    // RLS/permissions: best effort — the provider-side cancel performs the same cascade.
  }
}

async function PUT(request) {
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

    if (status !== undefined && !OWNER_STATUSES.includes(status)) {
      return Response.json({ error: "Invalid status" }, { status: 400 });
    }

    // Load the row (owner-scoped) to decide what the owner may change on a PROVIDER booking.
    const current = await sql`
      SELECT provider_id, status, appointment_date, appointment_time
      FROM vet_appointments
      WHERE id = ${id} AND owner_user_id = ${ownerUserId} AND deleted_at IS NULL
      LIMIT 1
    `;
    if (current.length === 0) {
      return Response.json({ error: "Appointment not found or unauthorized" }, { status: 404 });
    }
    const isProviderBooking = current[0].provider_id != null;
    let cancellingProviderBooking = false;
    if (isProviderBooking) {
      // The owner cannot self-complete / reopen a provider booking: "completed" is what unlocks the
      // review, so only the provider may set it (flow audit F3-04).
      if (status !== undefined && status !== current[0].status && status !== "cancelled") {
        return Response.json(
          { error: "This booking's status is managed by the business.", code: "managed_by_provider" },
          { status: 409 },
        );
      }
      // A date/time edit would desync the provider's calendar and skip availability (F3-05). The edit
      // form re-sends the unchanged values, so only a real change is refused.
      const dateChanged = appointmentDate !== undefined && ymd(appointmentDate) !== ymd(current[0].appointment_date);
      const timeChanged = appointmentTime !== undefined && hm(appointmentTime) !== hm(current[0].appointment_time);
      if (dateChanged || timeChanged) {
        return Response.json(
          {
            error: "To change the date or time, cancel this booking and book again with the business.",
            code: "reschedule_not_supported",
          },
          { status: 409 },
        );
      }
      cancellingProviderBooking = status === "cancelled" && current[0].status !== "cancelled";
    }

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
    if (cancellingProviderBooking) {
      // Close the booking workflow and stop reminders together with the lifecycle status.
      updates.push(`booking_status = 'cancelled'`);
      updates.push(`reminder_enabled = false`);
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

    if (cancellingProviderBooking) {
      await cancelLinkedConsult(result[0].id);
    }

    // PROVIDER NOTIFICATION (BN2 biz_booking_change). When the CLIENT reschedules (date/time)
    // or changes the status of a PROVIDER booking, tell the provider's team. Gate on a
    // schedule-relevant change + a real provider (personal vet appts have no provider_id).
    // actor = the client (ownerUserId) so the acting owner never self-notifies.
    const scheduleChanged =
      appointmentDate !== undefined ||
      appointmentTime !== undefined ||
      status !== undefined;
    if (scheduleChanged && result[0].provider_id != null) {
      await notifyProviderTeam({
        providerId: result[0].provider_id,
        actor: ownerUserId,
        type: "biz_booking_change",
        subjectRef: result[0].id,
        body: bizNotifyBody({
          kind: "reschedule",
          date: result[0].appointment_date,
          time: result[0].appointment_time,
          status: result[0].status ?? null,
        }),
      });
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
async function DELETE(request) {
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
        -- A provider booking also leaves the booking workflow (F3-08): otherwise the provider's inbox
        -- keeps it as live and the linked consult stays "Scheduled".
        booking_status = CASE WHEN provider_id IS NOT NULL THEN 'cancelled' ELSE booking_status END,
        reminder_enabled = CASE WHEN provider_id IS NOT NULL THEN false ELSE reminder_enabled END,
        updated_at = NOW()
      WHERE id = ${id}
        AND owner_user_id = ${ownerUserId}
        AND deleted_at IS NULL
      RETURNING id, provider_id, appointment_date, appointment_time
    `;

    if (result.length === 0) {
      return Response.json(
        { error: "Appointment not found or unauthorized" },
        { status: 404 },
      );
    }

    if (result[0].provider_id != null) {
      await cancelLinkedConsult(result[0].id);
    }

    // PROVIDER NOTIFICATION (BN2 biz_booking_change) — the CLIENT cancelled a PROVIDER
    // booking. Gate on a real provider_id (personal vet appts have none). actor = the client.
    if (result[0].provider_id != null) {
      await notifyProviderTeam({
        providerId: result[0].provider_id,
        actor: ownerUserId,
        type: "biz_booking_change",
        subjectRef: result[0].id,
        body: bizNotifyBody({
          kind: "cancel",
          date: result[0].appointment_date,
          time: result[0].appointment_time,
        }),
      });
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

// RLS R1-rollout: identity-scoped wrappers (docs/rls-hardening.md). Handler
// bodies are unchanged — only their DB connection is now request-scoped.
const wrappedGET = withRequestContext(GET);
const wrappedPOST = withRequestContext(POST);
const wrappedPUT = withRequestContext(PUT);
const wrappedDELETE = withRequestContext(DELETE);
export { wrappedGET as GET, wrappedPOST as POST, wrappedPUT as PUT, wrappedDELETE as DELETE };
