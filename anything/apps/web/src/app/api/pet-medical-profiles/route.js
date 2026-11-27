import { auth } from "@/auth";
import sql from "@/app/api/utils/sql";
import { resolvePetLogOwner } from "@/app/api/utils/petLogAccess";
import { withRequestContext } from "@/app/api/utils/requestContext";
import { getCurrentWeight, logCurrentWeight } from "@/app/api/utils/petWeight";
import { estimateColumnsOf, planAgeUpdate, presentPet } from "@/app/api/utils/petAge";

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
        p.notes,
        p.owner_user_id AS _pet_owner,
        to_jsonb(p) AS _row
      FROM pets p
      WHERE p.id = ${petId}
        AND (p.owner_user_id = ${ownerUserId} OR app_user_has_pet_access(p.id))
    `;

    if (!pet || pet.length === 0) {
      return Response.json({ error: "Pet not found" }, { status: 404 });
    }
    // Read access: the owner OR an active, unexpired grantee (family or caregiver — 0049 policies already allow the read).
    // The medical profile and weight history are keyed on the pet's OWNER, so use that id (identical to the caller for an owner);
    // the helper column is stripped so the response shape is unchanged.
    const petOwnerId = pet[0]._pet_owner;
    delete pet[0]._pet_owner;
    // `_row` only supplies the age estimate columns (absent on a database without them).
    const petRow = { ...pet[0], ...estimateColumnsOf(pet[0]._row) };
    delete petRow._row;

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
      WHERE pet_id = ${petId} AND owner_user_id = ${petOwnerId} AND deleted_at IS NULL
    `;

    const currentWeight = await getCurrentWeight(
      petId,
      petOwnerId,
      pet[0].weight,
      pet[0].weight_unit,
    );

    return Response.json({
      pet: presentPet(petRow),
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

async function POST(request) {
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
      ageYears,
      ageMonths,
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

    // The pet's OWNER or an active FAMILY grantee (co-owner) may save the medical profile (owner decision 2, PR3b). A first-time
    // INSERT by family needs pet_medical_profiles_family_insert (0141) — absent => friendly 403. Everything below is anchored to the
    // pet's OWNER (the profile, weigh-ins and the pets row all belong to the household owner).
    const access = await resolvePetLogOwner(ownerUserId, petId, {
      familyPolicy: { table: "pet_medical_profiles", policy: "pet_medical_profiles_family_insert" },
    });
    if (access.error) {
      return access.code
        ? Response.json({ error: access.error, code: access.code }, { status: access.status })
        : Response.json({ error: "Pet not found" }, { status: 404 });
    }
    const anchorOwnerId = access.ownerUserId;

    // Update shared fields in pets table
    const updateFields = [];
    const updateValues = [];
    let paramIndex = 1;

    if (breed !== undefined) {
      updateFields.push(`breed = $${paramIndex++}`);
      updateValues.push(breed);
    }
    if (adoptionDate !== undefined) {
      updateFields.push(`adoption_date = $${paramIndex++}`);
      updateValues.push(adoptionDate || null);
    }
    // Birthday and age together: utils/petAge.js decides what an edit means, and the column names come from there.
    // The client only sends ageYears/ageMonths for an estimate.
    if (birthday !== undefined || ageYears !== undefined || ageMonths !== undefined) {
      const [stored] = await sql`SELECT * FROM pets WHERE id = ${petId} AND owner_user_id = ${anchorOwnerId}`;
      const ageWrites = planAgeUpdate(stored, { birthday, age_years: ageYears, age_months: ageMonths });
      for (const [column, value] of Object.entries(ageWrites)) {
        updateFields.push(`${column} = $${paramIndex++}`);
        updateValues.push(value);
      }
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
    updateValues.push(anchorOwnerId);

    if (updateFields.length > 1) {
      await sql.unsafe(
        `UPDATE pets SET ${updateFields.join(", ")} WHERE id = $${paramIndex++} AND owner_user_id = $${paramIndex++}`,
        updateValues,
      );
    }

    // Handle weight update: routed through the shared logCurrentWeight
    // helper (petWeight.js) — the same one Dog Profile edit uses — so there
    // is exactly one implementation of "how a weight edit gets saved".
    if (
      currentWeight !== undefined &&
      currentWeight !== null &&
      currentWeight !== ""
    ) {
      const numericWeight = parseFloat(currentWeight);
      if (!isNaN(numericWeight)) {
        await logCurrentWeight(
          petId,
          anchorOwnerId,
          numericWeight,
          weightUnit || "lbs",
        );
      }
    }

    // Upsert medical profile
    const existingProfile = await sql`
      SELECT id FROM pet_medical_profiles 
      WHERE pet_id = ${petId} AND owner_user_id = ${anchorOwnerId} AND deleted_at IS NULL
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
          ${petId}, ${anchorOwnerId}, ${microchipId || null}, ${spayedNeuteredStatus || null},
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

// RLS R1-rollout: identity-scoped wrappers (docs/rls-hardening.md). Handler
// bodies are unchanged — only their DB connection is now request-scoped.
const wrappedGET = withRequestContext(GET);
const wrappedPOST = withRequestContext(POST);
export { wrappedGET as GET, wrappedPOST as POST };
