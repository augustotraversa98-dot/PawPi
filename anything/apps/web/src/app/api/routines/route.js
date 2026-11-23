import sql from "@/app/api/utils/sql";
import { resolvePetLogOwner } from "@/app/api/utils/petLogAccess";
import { jsonbWriteValue } from "@/app/api/utils/jsonb";
import { auth } from "@/auth";
import { withRequestContext } from "@/app/api/utils/requestContext";
import { recordBusinessEvent } from "@/lib/telemetry/business";

// GET - Fetch all routines for the authenticated user
async function GET(request) {
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
      // Read access: the pet's owner OR an active, unexpired grantee (family AND caregiver can read feeding / meds
      // instructions — owner decision 2, 2026-11-23; 0049's routines_grantee_read already allows it). Editing stays
      // owner-only here (family routine editing is a later step). Routines of a pet are anchored to its owner.
      const pets = await sql`
        SELECT id, owner_user_id FROM pets
        WHERE id = ${petId} AND (owner_user_id = ${ownerUserId} OR app_user_has_pet_access(id))
      `;

      if (pets.length === 0) {
        return Response.json(
          { error: "Pet not found or access denied" },
          { status: 403 },
        );
      }

      routines = await sql`
        SELECT * FROM routines 
        WHERE owner_user_id = ${pets[0].owner_user_id} 
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
async function POST(request) {
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

    // The pet's OWNER or an active FAMILY grantee (co-owner) may create routines — owner decision 2 (PR3b); the row is
    // anchored to the pet's owner so the whole household sees it. A caregiver is read-only here.
    const access = await resolvePetLogOwner(ownerUserId, petId);
    if (access.error) {
      return Response.json({ error: "Pet not found or access denied" }, { status: 403 });
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
        ${access.ownerUserId},
        ${type},
        ${isActive ?? true},
        ${title || null},
        ${description || null},
        ${feedingSchedule ? sql.json(jsonbWriteValue(feedingSchedule)) : null},
        ${walkSchedule ? sql.json(jsonbWriteValue(walkSchedule)) : null},
        ${medicationDetails ? sql.json(jsonbWriteValue(medicationDetails)) : null},
        ${photoCheckDetails ? sql.json(jsonbWriteValue(photoCheckDetails)) : null},
        ${medicalCareDetails ? sql.json(jsonbWriteValue(medicalCareDetails)) : null},
        ${wellnessCheckSchedule ? sql.json(jsonbWriteValue(wellnessCheckSchedule)) : null},
        ${vetAppointmentSchedule ? sql.json(jsonbWriteValue(vetAppointmentSchedule)) : null},
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

    recordBusinessEvent("routine_created");
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
async function PUT(request) {
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
      SELECT id, owner_user_id FROM routines 
      WHERE id = ${id} AND (owner_user_id = ${ownerUserId} OR app_user_has_pet_family(pet_id))
    `;

    if (existingRoutines.length === 0) {
      return Response.json(
        { error: "Routine not found or access denied" },
        { status: 403 },
      );
    }

    // Moving a routine to ANOTHER pet is only allowed onto a pet the caller owns. Without this check the own-row RLS policy
    // (owner_user_id = me) let an owner re-point their routine at someone else's dog (fixed at the DB level by 0140; this is the
    // API half, so the route is safe before 0140 is applied).
    // (PR3b: a family co-owner may do this too, but only between dogs of the SAME owner, so the row stays anchored to it.)
    const routineOwnerId = existingRoutines[0].owner_user_id;
    if (petId) {
      const target = await sql`
        SELECT id FROM pets
        WHERE id = ${petId} AND owner_user_id = ${routineOwnerId}
          AND (owner_user_id = ${ownerUserId} OR app_user_has_pet_family(id))
      `;
      if (target.length === 0) {
        return Response.json(
          { error: "Pet not found or access denied" },
          { status: 403 },
        );
      }
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
          feedingSchedule ? sql.json(jsonbWriteValue(feedingSchedule)) : null
        }, feeding_schedule),
        walk_schedule = COALESCE(${
          walkSchedule ? sql.json(jsonbWriteValue(walkSchedule)) : null
        }, walk_schedule),
        medication_details = COALESCE(${
          medicationDetails ? sql.json(jsonbWriteValue(medicationDetails)) : null
        }, medication_details),
        photo_check_details = COALESCE(${
          photoCheckDetails ? sql.json(jsonbWriteValue(photoCheckDetails)) : null
        }, photo_check_details),
        medical_care_details = COALESCE(${
          medicalCareDetails ? sql.json(jsonbWriteValue(medicalCareDetails)) : null
        }, medical_care_details),
        wellness_check_schedule = COALESCE(${
          wellnessCheckSchedule ? sql.json(jsonbWriteValue(wellnessCheckSchedule)) : null
        }, wellness_check_schedule),
        vet_appointment_schedule = COALESCE(${
          vetAppointmentSchedule ? sql.json(jsonbWriteValue(vetAppointmentSchedule)) : null
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
      WHERE id = ${id} AND owner_user_id = ${routineOwnerId}
      RETURNING *
    `;

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
async function DELETE(request) {
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
        AND (owner_user_id = ${ownerUserId} OR app_user_has_pet_family(pet_id))
        AND deleted_at IS NULL
      RETURNING id
    `;

    if (result.length === 0) {
      return Response.json(
        { error: "Routine not found or access denied" },
        { status: 403 },
      );
    }

    return Response.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error("[routines] Error deleting routine:", error);
    return Response.json(
      { error: "Failed to delete routine" },
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
