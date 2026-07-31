import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { withRequestContext } from "@/app/api/utils/requestContext";
import { getCurrentWeight, logCurrentWeight } from "@/app/api/utils/petWeight";

// Update a specific pet
async function PATCH(request, { params }) {
  try {

    const session = await auth();

    if (!session?.user?.id) {
      console.error("[PATCH /api/pets/[id]] ERROR: No session or user ID");
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const authUserId = session.user.id;
    const petId = params.id;

    // Get user profile
    const userProfile = await sql`
      SELECT id, auth_user_id 
      FROM user_profiles 
      WHERE auth_user_id = ${authUserId}
      LIMIT 1
    `;

    if (userProfile.length === 0) {
      console.error("[PATCH /api/pets/[id]] ERROR: No user profile found");
      return Response.json(
        { error: "User profile not found" },
        { status: 404 },
      );
    }

    const userId = userProfile[0].id;

    // Check if pet exists and belongs to user
    const existingPet = await sql`
      SELECT * FROM pets 
      WHERE id = ${petId} AND owner_user_id = ${userId}
      LIMIT 1
    `;

    if (existingPet.length === 0) {
      console.error(
        "[PATCH /api/pets/[id]] ERROR: Pet not found or not owned by user",
      );
      return Response.json({ error: "Pet not found" }, { status: 404 });
    }


    const body = await request.json();

    const {
      name,
      handle,
      avatar_url,
      breed,
      age_years,
      age_months,
      gender,
      weight,
      weight_unit,
      birthday,
      adoption_date,
      notes,
    } = body;

    // Validate required fields
    if (name !== undefined && !name.trim()) {
      console.error("[PATCH /api/pets/[id]] ERROR: Pet name cannot be empty");
      return Response.json({ error: "Pet name is required" }, { status: 400 });
    }

    // Check handle uniqueness if provided and different from current
    if (handle && handle !== existingPet[0].handle) {

      const existing = await sql`
        SELECT id FROM pets 
        WHERE handle = ${handle} AND id != ${petId}
        LIMIT 1
      `;

      if (existing.length > 0) {
        console.error("[PATCH /api/pets/[id]] ERROR: Handle already taken");
        return Response.json(
          { error: "Handle already taken" },
          { status: 400 },
        );
      }
    }

    // Weight is a HISTORY, not a single field (see petWeight.js) — a valid
    // numeric weight edit is routed through the shared logCurrentWeight
    // helper (same one Edit Medical Profile uses) instead of writing
    // pets.weight directly, so the two edit screens can't silently diverge
    // again. An explicit null (clearing the field) still falls through to
    // the plain column update below.
    let numericWeight = null;
    if (weight !== undefined && weight !== null && weight !== "") {
      const parsed = typeof weight === "number" ? weight : parseFloat(weight);
      if (!isNaN(parsed)) numericWeight = parsed;
    }
    const loggingWeight = numericWeight !== null;

    // Build update fields dynamically (only update provided fields)
    const updates = [];
    const values = [];
    let paramIndex = 1;

    if (name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      values.push(name);
    }
    if (handle !== undefined) {
      updates.push(`handle = $${paramIndex++}`);
      values.push(handle);
    }
    if (avatar_url !== undefined) {
      updates.push(`avatar_url = $${paramIndex++}`);
      values.push(avatar_url);
    }
    if (breed !== undefined) {
      updates.push(`breed = $${paramIndex++}`);
      values.push(breed);
    }
    if (age_years !== undefined) {
      updates.push(`age_years = $${paramIndex++}`);
      values.push(age_years);
    }
    if (age_months !== undefined) {
      updates.push(`age_months = $${paramIndex++}`);
      values.push(age_months);
    }
    if (gender !== undefined) {
      updates.push(`gender = $${paramIndex++}`);
      values.push(gender);
    }
    if (!loggingWeight && weight !== undefined) {
      updates.push(`weight = $${paramIndex++}`);
      values.push(weight);
    }
    if (!loggingWeight && weight_unit !== undefined) {
      updates.push(`weight_unit = $${paramIndex++}`);
      values.push(weight_unit);
    }
    if (birthday !== undefined) {
      updates.push(`birthday = $${paramIndex++}`);
      values.push(birthday);
    }
    if (adoption_date !== undefined) {
      updates.push(`adoption_date = $${paramIndex++}`);
      values.push(adoption_date);
    }
    if (notes !== undefined) {
      updates.push(`notes = $${paramIndex++}`);
      values.push(notes);
    }

    // Always update updated_at
    updates.push(`updated_at = NOW()`);

    let updatedPet = existingPet[0];

    if (updates.length > 1) {
      // Add petId as the last parameter for WHERE clause
      values.push(petId);

      // Build and execute dynamic UPDATE query
      const updateQuery = `
        UPDATE pets
        SET ${updates.join(", ")}
        WHERE id = $${paramIndex}
        RETURNING *
      `;

      const result = await sql.unsafe(updateQuery, values);
      updatedPet = result[0];
    }

    if (loggingWeight) {
      const unitForWeight =
        weight_unit !== undefined ? weight_unit : updatedPet.weight_unit;
      await logCurrentWeight(petId, userId, numericWeight, unitForWeight);

      // logCurrentWeight just wrote this exact value (either seeded onto
      // pets, or as the newest health_weight_logs row) — it IS the pet's
      // current weight now, no need to re-derive it via getCurrentWeight.
      updatedPet = { ...updatedPet, weight: numericWeight, weight_unit: unitForWeight };
    }

    return Response.json({ pet: updatedPet });
  } catch (error) {
    console.error(
      "[PATCH /api/pets/[id]] ========================================",
    );
    console.error("[PATCH /api/pets/[id]] FATAL ERROR:");
    console.error("[PATCH /api/pets/[id]] Error message:", error.message);
    console.error("[PATCH /api/pets/[id]] Error stack:", error.stack);
    console.error(
      "[PATCH /api/pets/[id]] ========================================",
    );
    return Response.json({ error: "Failed to update pet" }, { status: 500 });
  }
}

// Get a specific pet
async function GET(request, { params }) {
  try {

    const session = await auth();

    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const petId = params.id;
    const authUserId = session.user.id;

    // Get user profile
    const userProfile = await sql`
      SELECT id FROM user_profiles 
      WHERE auth_user_id = ${authUserId}
      LIMIT 1
    `;

    if (userProfile.length === 0) {
      return Response.json(
        { error: "User profile not found" },
        { status: 404 },
      );
    }

    const userId = userProfile[0].id;

    // Get pet
    const pet = await sql`
      SELECT * FROM pets 
      WHERE id = ${petId} AND owner_user_id = ${userId}
      LIMIT 1
    `;

    if (pet.length === 0) {
      return Response.json({ error: "Pet not found" }, { status: 404 });
    }

    // See pets/route.js — "current weight" prefers the latest
    // health_weight_logs row, falling back to pets.weight/weight_unit only
    // when the pet has zero weigh-ins logged yet.
    const currentWeight = await getCurrentWeight(
      petId,
      userId,
      pet[0].weight,
      pet[0].weight_unit,
    );

    return Response.json({ pet: { ...pet[0], ...currentWeight } });
  } catch (error) {
    console.error("[GET /api/pets/[id]] ERROR:", error);
    return Response.json({ error: "Failed to fetch pet" }, { status: 500 });
  }
}

// RLS R1-rollout: identity-scoped wrappers (docs/rls-hardening.md). Handler
// bodies are unchanged — only their DB connection is now request-scoped.
const wrappedPATCH = withRequestContext(PATCH);
const wrappedGET = withRequestContext(GET);
export { wrappedPATCH as PATCH, wrappedGET as GET };
