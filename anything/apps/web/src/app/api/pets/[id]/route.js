import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";

// Update a specific pet
export async function PATCH(request, { params }) {
  try {
    console.log(
      "[PATCH /api/pets/[id]] ========================================",
    );
    console.log("[PATCH /api/pets/[id]] Updating pet");

    const session = await auth();
    console.log("[PATCH /api/pets/[id]] Session:", session);

    if (!session?.user?.id) {
      console.error("[PATCH /api/pets/[id]] ERROR: No session or user ID");
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const authUserId = session.user.id;
    const petId = params.id;
    console.log("[PATCH /api/pets/[id]] Auth user ID:", authUserId);
    console.log("[PATCH /api/pets/[id]] Pet ID:", petId);

    // Get user profile
    console.log("[PATCH /api/pets/[id]] Fetching user profile...");
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
    console.log("[PATCH /api/pets/[id]] User profile ID:", userId);

    // Check if pet exists and belongs to user
    console.log("[PATCH /api/pets/[id]] Checking pet ownership...");
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

    console.log("[PATCH /api/pets/[id]] ✅ Pet found:", existingPet[0].name);

    const body = await request.json();
    console.log("[PATCH /api/pets/[id]] Request body:", body);

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
      console.log("[PATCH /api/pets/[id]] Checking handle uniqueness:", handle);

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
    if (weight !== undefined) {
      updates.push(`weight = $${paramIndex++}`);
      values.push(weight);
    }
    if (weight_unit !== undefined) {
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

    if (updates.length === 1) {
      // Only updated_at, no real changes
      console.log("[PATCH /api/pets/[id]] No fields to update");
      return Response.json({ pet: existingPet[0] });
    }

    console.log("[PATCH /api/pets/[id]] Updating fields:", updates);
    console.log("[PATCH /api/pets/[id]] Values:", values);

    // Add petId as the last parameter for WHERE clause
    values.push(petId);

    // Build and execute dynamic UPDATE query
    const updateQuery = `
      UPDATE pets
      SET ${updates.join(", ")}
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    console.log("[PATCH /api/pets/[id]] Update query:", updateQuery);

    const result = await sql(updateQuery, values);

    console.log("[PATCH /api/pets/[id]] ✅ Pet updated successfully");
    console.log("[PATCH /api/pets/[id]] Updated pet:", result[0]);
    console.log(
      "[PATCH /api/pets/[id]] ========================================",
    );

    return Response.json({ pet: result[0] });
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
export async function GET(request, { params }) {
  try {
    console.log(
      "[GET /api/pets/[id]] ========================================",
    );
    console.log("[GET /api/pets/[id]] Fetching pet");

    const session = await auth();

    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const petId = params.id;
    const authUserId = session.user.id;
    console.log("[GET /api/pets/[id]] Pet ID:", petId);
    console.log("[GET /api/pets/[id]] Auth user ID:", authUserId);

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

    console.log("[GET /api/pets/[id]] ✅ Pet found:", pet[0].name);
    console.log(
      "[GET /api/pets/[id]] ========================================",
    );

    return Response.json({ pet: pet[0] });
  } catch (error) {
    console.error("[GET /api/pets/[id]] ERROR:", error);
    return Response.json({ error: "Failed to fetch pet" }, { status: 500 });
  }
}
