import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";

// GET - Fetch all routines for the authenticated user
export async function GET(request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get user profile from auth_user_id
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

    // Get petId from query params if provided
    const { searchParams } = new URL(request.url);
    const petId = searchParams.get("petId");

    let routines;
    if (petId) {
      // Verify pet ownership and get routines for specific pet (excluding deleted)
      const pets = await sql`
        SELECT id FROM pets WHERE id = ${petId} AND owner_user_id = ${ownerUserId}
      `;

      if (pets.length === 0) {
        return Response.json(
          { error: "Pet not found or access denied" },
          { status: 403 },
        );
      }

      routines = await sql`
        SELECT * FROM routines 
        WHERE owner_user_id = ${ownerUserId} 
          AND pet_id = ${petId}
          AND deleted_at IS NULL
        ORDER BY created_at DESC
      `;
    } else {
      // Get all routines for user (excluding deleted)
      routines = await sql`
        SELECT * FROM routines 
        WHERE owner_user_id = ${ownerUserId}
          AND deleted_at IS NULL
        ORDER BY created_at DESC
      `;
    }

    console.log("[routines] Fetched routines:", routines.length);
    return Response.json({ routines }, { status: 200 });
  } catch (error) {
    console.error("[routines] Error fetching routines:", error);
    return Response.json(
      { error: "Failed to fetch routines" },
      { status: 500 },
    );
  }
}

// POST - Create a new routine
export async function POST(request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get user profile from auth_user_id
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
      type,
      isActive,
      title,
      description,
      feedingSchedule,
      walkSchedule,
      medicationDetails,
      photoCheckDetails,
      medicalCareDetails,
      wellnessCheckSchedule,
      vetAppointmentSchedule,
      frequency,
      preferredDay,
      times,
      days,
      notificationEnabled,
      timeSensitive,
      notes,
    } = body;

    if (!petId) {
      return Response.json({ error: "petId is required" }, { status: 400 });
    }

    if (!type) {
      return Response.json(
        { error: "Routine type is required" },
        { status: 400 },
      );
    }

    // Verify pet ownership
    const pets = await sql`
      SELECT id FROM pets WHERE id = ${petId} AND owner_user_id = ${ownerUserId}
    `;

    if (pets.length === 0) {
      return Response.json(
        { error: "Pet not found or access denied" },
        { status: 403 },
      );
    }

    // Create routine
    const result = await sql`
      INSERT INTO routines (
        pet_id,
        owner_user_id,
        routine_type,
        is_active,
        title,
        description,
        feeding_schedule,
        walk_schedule,
        medication_details,
        photo_check_details,
        medical_care_details,
        wellness_check_schedule,
        vet_appointment_schedule,
        frequency,
        preferred_day,
        times,
        days,
        notification_enabled,
        time_sensitive,
        notes
      ) VALUES (
        ${petId},
        ${ownerUserId},
        ${type},
        ${isActive ?? true},
        ${title || null},
        ${description || null},
        ${feedingSchedule ? sql.json(feedingSchedule) : null},
        ${walkSchedule ? sql.json(walkSchedule) : null},
        ${medicationDetails ? sql.json(medicationDetails) : null},
        ${photoCheckDetails ? sql.json(photoCheckDetails) : null},
        ${medicalCareDetails ? sql.json(medicalCareDetails) : null},
        ${wellnessCheckSchedule ? sql.json(wellnessCheckSchedule) : null},
        ${vetAppointmentSchedule ? sql.json(vetAppointmentSchedule) : null},
        ${frequency || null},
        ${preferredDay || null},
        ${times || null},
        ${days || null},
        ${notificationEnabled ?? true},
        ${timeSensitive ?? true},
        ${notes || null}
      )
      RETURNING *
    `;

    console.log("[routines] Routine created:", result[0]);
    return Response.json({ routine: result[0] }, { status: 201 });
  } catch (error) {
    console.error("[routines] Error creating routine:", error);
    return Response.json(
      { error: "Failed to create routine" },
      { status: 500 },
    );
  }
}

// PUT - Update an existing routine
export async function PUT(request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get user profile from auth_user_id
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
      id,
      petId,
      type,
      isActive,
      title,
      description,
      feedingSchedule,
      walkSchedule,
      medicationDetails,
      photoCheckDetails,
      medicalCareDetails,
      wellnessCheckSchedule,
      vetAppointmentSchedule,
      frequency,
      preferredDay,
      times,
      days,
      notificationEnabled,
      timeSensitive,
      notes,
    } = body;

    if (!id) {
      return Response.json(
        { error: "Routine ID is required" },
        { status: 400 },
      );
    }

    // Verify ownership
    const existingRoutines = await sql`
      SELECT id FROM routines 
      WHERE id = ${id} AND owner_user_id = ${ownerUserId}
    `;

    if (existingRoutines.length === 0) {
      return Response.json(
        { error: "Routine not found or access denied" },
        { status: 403 },
      );
    }

    // Update routine
    const result = await sql`
      UPDATE routines SET
        pet_id = COALESCE(${petId || null}, pet_id),
        routine_type = COALESCE(${type || null}, routine_type),
        is_active = COALESCE(${isActive ?? null}, is_active),
        title = COALESCE(${title || null}, title),
        description = COALESCE(${description || null}, description),
        feeding_schedule = COALESCE(${
          feedingSchedule ? sql.json(feedingSchedule) : null
        }, feeding_schedule),
        walk_schedule = COALESCE(${
          walkSchedule ? sql.json(walkSchedule) : null
        }, walk_schedule),
        medication_details = COALESCE(${
          medicationDetails ? sql.json(medicationDetails) : null
        }, medication_details),
        photo_check_details = COALESCE(${
          photoCheckDetails ? sql.json(photoCheckDetails) : null
        }, photo_check_details),
        medical_care_details = COALESCE(${
          medicalCareDetails ? sql.json(medicalCareDetails) : null
        }, medical_care_details),
        wellness_check_schedule = COALESCE(${
          wellnessCheckSchedule ? sql.json(wellnessCheckSchedule) : null
        }, wellness_check_schedule),
        vet_appointment_schedule = COALESCE(${
          vetAppointmentSchedule ? sql.json(vetAppointmentSchedule) : null
        }, vet_appointment_schedule),
        frequency = COALESCE(${frequency || null}, frequency),
        preferred_day = ${preferredDay !== undefined ? preferredDay : null},
        times = COALESCE(${times || null}, times),
        days = COALESCE(${days || null}, days),
        notification_enabled = COALESCE(${
          notificationEnabled ?? null
        }, notification_enabled),
        time_sensitive = COALESCE(${timeSensitive ?? null}, time_sensitive),
        notes = COALESCE(${notes || null}, notes),
        updated_at = NOW()
      WHERE id = ${id} AND owner_user_id = ${ownerUserId}
      RETURNING *
    `;

    console.log("[routines] Routine updated:", result[0]);
    return Response.json({ routine: result[0] }, { status: 200 });
  } catch (error) {
    console.error("[routines] Error updating routine:", error);
    return Response.json(
      { error: "Failed to update routine" },
      { status: 500 },
    );
  }
}

// DELETE - Soft delete a routine (does not delete past walk history)
export async function DELETE(request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get user profile from auth_user_id
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
    const id = searchParams.get("id");

    if (!id) {
      return Response.json(
        { error: "Routine ID is required" },
        { status: 400 },
      );
    }

    // Soft delete: set deleted_at and is_active = false
    // This preserves past walk logs while removing future reminders
    const result = await sql`
      UPDATE routines 
      SET 
        deleted_at = NOW(),
        is_active = false,
        updated_at = NOW()
      WHERE id = ${id} 
        AND owner_user_id = ${ownerUserId}
        AND deleted_at IS NULL
      RETURNING id
    `;

    if (result.length === 0) {
      return Response.json(
        { error: "Routine not found or access denied" },
        { status: 403 },
      );
    }

    console.log("[routines] Routine soft-deleted:", id);
    return Response.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error("[routines] Error deleting routine:", error);
    return Response.json(
      { error: "Failed to delete routine" },
      { status: 500 },
    );
  }
}
