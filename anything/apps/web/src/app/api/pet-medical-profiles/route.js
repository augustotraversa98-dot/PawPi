import { auth } from "@/auth";
import sql from "@/app/api/utils/sql";

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

    const userProfile = await sql`
      SELECT id FROM user_profiles WHERE auth_user_id = ${session.user.id}
    `;

    if (!userProfile || userProfile.length === 0) {
      return Response.json(
        { error: "User profile not found" },
        { status: 404 },
      );
    }

    const ownerUserId = userProfile[0].id;

    // Verify pet ownership
    const pet = await sql`
      SELECT 
        p.id,
        p.name,
        p.breed,
        p.age_years,
        p.age_months,
        p.gender,
        p.weight,
        p.weight_unit,
        p.birthday,
        p.adoption_date,
        p.avatar_url,
        p.notes
      FROM pets p
      WHERE p.id = ${petId} AND p.owner_user_id = ${ownerUserId}
    `;

    if (!pet || pet.length === 0) {
      return Response.json({ error: "Pet not found" }, { status: 404 });
    }

    // Get latest weight from weight logs
    const latestWeight = await sql`
      SELECT weight, weight_unit, logged_at
      FROM health_weight_logs
      WHERE pet_id = ${petId} AND owner_user_id = ${ownerUserId}
      ORDER BY logged_at DESC
      LIMIT 1
    `;

    // Get medical profile
    const medicalProfile = await sql`
      SELECT 
        id,
        microchip_id,
        spayed_neutered_status,
        spayed_neutered_date,
        primary_vet_name,
        primary_clinic_name,
        vet_phone,
        vet_email,
        emergency_contact_name,
        emergency_contact_phone,
        insurance_provider,
        insurance_policy_number,
        medical_notes
      FROM pet_medical_profiles
      WHERE pet_id = ${petId} AND owner_user_id = ${ownerUserId} AND deleted_at IS NULL
    `;

    const currentWeight =
      latestWeight.length > 0
        ? {
            weight: latestWeight[0].weight,
            weight_unit: latestWeight[0].weight_unit,
          }
        : { weight: pet[0].weight, weight_unit: pet[0].weight_unit };

    return Response.json({
      pet: pet[0],
      currentWeight,
      medicalProfile: medicalProfile.length > 0 ? medicalProfile[0] : null,
    });
  } catch (error) {
    console.error("[Pet Medical Profile] GET Error:", error);
    return Response.json(
      { error: "Failed to fetch medical profile" },
      { status: 500 },
    );
  }
}

export async function POST(request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const {
      petId,
      // Shared fields (stored in pets table)
      breed,
      birthday,
      adoptionDate,
      gender,
      currentWeight,
      weightUnit,
      // Medical-only fields (stored in pet_medical_profiles)
      spayedNeuteredStatus,
      spayedNeuteredDate,
      microchipId,
      primaryVetName,
      primaryClinicName,
      vetPhone,
      vetEmail,
      emergencyContactName,
      emergencyContactPhone,
      insuranceProvider,
      insurancePolicyNumber,
      medicalNotes,
    } = body;

    if (!petId) {
      return Response.json({ error: "petId is required" }, { status: 400 });
    }

    const userProfile = await sql`
      SELECT id FROM user_profiles WHERE auth_user_id = ${session.user.id}
    `;

    if (!userProfile || userProfile.length === 0) {
      return Response.json(
        { error: "User profile not found" },
        { status: 404 },
      );
    }

    const ownerUserId = userProfile[0].id;

    // Verify pet ownership
    const pet = await sql`
      SELECT id, weight FROM pets 
      WHERE id = ${petId} AND owner_user_id = ${ownerUserId}
    `;

    if (!pet || pet.length === 0) {
      return Response.json({ error: "Pet not found" }, { status: 404 });
    }

    // Update shared fields in pets table
    const updateFields = [];
    const updateValues = [];
    let paramIndex = 1;

    if (breed !== undefined) {
      updateFields.push(`breed = $${paramIndex++}`);
      updateValues.push(breed);
    }
    if (birthday !== undefined) {
      updateFields.push(`birthday = $${paramIndex++}`);
      updateValues.push(birthday || null);
    }
    if (adoptionDate !== undefined) {
      updateFields.push(`adoption_date = $${paramIndex++}`);
      updateValues.push(adoptionDate || null);
    }
    if (gender !== undefined) {
      updateFields.push(`gender = $${paramIndex++}`);
      updateValues.push(gender);
    }
    if (weightUnit !== undefined) {
      updateFields.push(`weight_unit = $${paramIndex++}`);
      updateValues.push(weightUnit || "lbs");
    }

    updateFields.push(`updated_at = NOW()`);
    updateValues.push(petId);
    updateValues.push(ownerUserId);

    if (updateFields.length > 1) {
      await sql.unsafe(
        `UPDATE pets SET ${updateFields.join(", ")} WHERE id = $${paramIndex++} AND owner_user_id = $${paramIndex++}`,
        updateValues,
      );
    }

    // Handle weight update: create a new weight log if weight changed
    if (
      currentWeight !== undefined &&
      currentWeight !== null &&
      currentWeight !== ""
    ) {
      const numericWeight = parseFloat(currentWeight);
      if (!isNaN(numericWeight)) {
        // Check if there are existing weight logs
        const hasWeightLogs = await sql`
          SELECT COUNT(*)::int as count 
          FROM health_weight_logs 
          WHERE pet_id = ${petId} AND owner_user_id = ${ownerUserId}
        `;

        if (hasWeightLogs[0].count > 0) {
          // Create new weight log entry
          await sql`
            INSERT INTO health_weight_logs (
              pet_id, owner_user_id, weight, weight_unit, logged_at
            ) VALUES (
              ${petId}, ${ownerUserId}, ${numericWeight}, 
              ${weightUnit || "lbs"}, NOW()
            )
          `;
        } else {
          // No weight logs exist yet, update pets.weight
          await sql`
            UPDATE pets 
            SET weight = ${numericWeight}, updated_at = NOW()
            WHERE id = ${petId} AND owner_user_id = ${ownerUserId}
          `;
        }
      }
    }

    // Upsert medical profile
    const existingProfile = await sql`
      SELECT id FROM pet_medical_profiles 
      WHERE pet_id = ${petId} AND owner_user_id = ${ownerUserId} AND deleted_at IS NULL
    `;

    if (existingProfile.length > 0) {
      // Update existing profile
      await sql`
        UPDATE pet_medical_profiles SET
          microchip_id = ${microchipId || null},
          spayed_neutered_status = ${spayedNeuteredStatus || null},
          spayed_neutered_date = ${spayedNeuteredDate || null},
          primary_vet_name = ${primaryVetName || null},
          primary_clinic_name = ${primaryClinicName || null},
          vet_phone = ${vetPhone || null},
          vet_email = ${vetEmail || null},
          emergency_contact_name = ${emergencyContactName || null},
          emergency_contact_phone = ${emergencyContactPhone || null},
          insurance_provider = ${insuranceProvider || null},
          insurance_policy_number = ${insurancePolicyNumber || null},
          medical_notes = ${medicalNotes || null},
          updated_at = NOW()
        WHERE id = ${existingProfile[0].id}
      `;
    } else {
      // Create new profile
      await sql`
        INSERT INTO pet_medical_profiles (
          pet_id, owner_user_id, microchip_id, spayed_neutered_status, spayed_neutered_date,
          primary_vet_name, primary_clinic_name, vet_phone, vet_email,
          emergency_contact_name, emergency_contact_phone, insurance_provider,
          insurance_policy_number, medical_notes
        ) VALUES (
          ${petId}, ${ownerUserId}, ${microchipId || null}, ${spayedNeuteredStatus || null},
          ${spayedNeuteredDate || null}, ${primaryVetName || null}, ${primaryClinicName || null},
          ${vetPhone || null}, ${vetEmail || null}, ${emergencyContactName || null},
          ${emergencyContactPhone || null}, ${insuranceProvider || null},
          ${insurancePolicyNumber || null}, ${medicalNotes || null}
        )
      `;
    }

    return Response.json({ success: true, message: "Medical profile saved" });
  } catch (error) {
    console.error("[Pet Medical Profile] POST Error:", error);
    return Response.json(
      { error: "Failed to save medical profile" },
      { status: 500 },
    );
  }
}
