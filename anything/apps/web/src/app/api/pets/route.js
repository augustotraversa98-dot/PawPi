import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import {
  withRequestContext,
  setCurrentUserId,
} from "@/app/api/utils/requestContext";

// RLS R1 pilot route: handlers are wrapped at the bottom with withRequestContext
// so their DB work runs in a transaction carrying the caller's identity. The
// handler bodies (auth + owner-scoped WHERE clauses) are unchanged.

// Append a short random suffix until `base` is free (bounded, with a timestamp
// fallback that guarantees termination). `exists(candidate)` reports whether a
// candidate username is already taken. Mirrors the pet-handle dedup below so a
// taken username never throws a raw duplicate-key 23505 → 500.
async function uniqueUsername(base, exists) {
  if (!(await exists(base))) return base;
  for (let i = 0; i < 5; i++) {
    const candidate = `${base}_${Math.floor(Math.random() * 10000)}`;
    if (!(await exists(candidate))) return candidate;
  }
  return `${base}_${Date.now()}`;
}

// Get all pets for the current user (owner-scoped; pets.owner_user_id = user_profiles.id).
async function GET(request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    const authUserId = session.user.id;

    const userProfile = await sql`
      SELECT id, auth_user_id, full_name, username, role, onboarding_completed
      FROM user_profiles
      WHERE auth_user_id = ${authUserId}
      LIMIT 1
    `;
    if (userProfile.length === 0) {
      return Response.json({ pets: [] });
    }

    const userId = userProfile[0].id;
    const pets = await sql`
      SELECT * FROM pets
      WHERE owner_user_id = ${userId}
      ORDER BY created_at DESC
    `;
    return Response.json({ pets });
  } catch (error) {
    console.error("[GET /api/pets] Error:", error.message);
    return Response.json({ error: "Failed to fetch pets" }, { status: 500 });
  }
}

// Create a new pet
async function POST(request) {
  try {
    console.log("[POST /api/pets] ========================================");
    console.log("[POST /api/pets] Creating new pet");

    const session = await auth();
    console.log("[POST /api/pets] Session:", session);

    if (!session?.user?.id) {
      console.error("[POST /api/pets] ERROR: No session or user ID");
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const authUserId = session.user.id;
    console.log("[POST /api/pets] Auth user ID:", authUserId);

    // Get or create user profile
    console.log("[POST /api/pets] Fetching user profile...");
    let userProfile = await sql`
      SELECT id, auth_user_id, full_name, username, role, onboarding_completed 
      FROM user_profiles 
      WHERE auth_user_id = ${authUserId}
      LIMIT 1
    `;

    console.log("[POST /api/pets] User profile query result:", userProfile);

    if (userProfile.length === 0) {
      console.log(
        "[POST /api/pets] No user profile found, creating new one...",
      );

      // Generate username from email or name, then uniquify on conflict: an
      // orphaned/duplicate profile (or two users sharing an email prefix) may
      // already own this base, which would otherwise throw a raw 23505 → 500.
      const baseUsername =
        session.user.email?.split("@")[0] ||
        session.user.name?.toLowerCase().replace(/\s+/g, "") ||
        `user_${Date.now()}`;
      const username = await uniqueUsername(baseUsername, async (candidate) => {
        const taken = await sql`
          SELECT id FROM user_profiles WHERE username = ${candidate} LIMIT 1
        `;
        return taken.length > 0;
      });

      console.log("[POST /api/pets] Creating user profile:");
      console.log("[POST /api/pets]   - auth_user_id:", authUserId);
      console.log("[POST /api/pets]   - full_name:", session.user.name);
      console.log("[POST /api/pets]   - username:", username);

      userProfile = await sql`
        INSERT INTO user_profiles (auth_user_id, full_name, username, role)
        VALUES (${authUserId}, ${session.user.name || null}, ${username}, 'pet_owner')
        RETURNING *
      `;

      console.log("[POST /api/pets] ✅ User profile created:", userProfile[0]);

      // RLS R3 fix: identity was resolved at request START, where this brand-new
      // user had no profile yet, so app.current_user_id is unset. Stamp it now —
      // BEFORE the same-request pet INSERT, whose WITH CHECK (owner_user_id =
      // current_app_user_id()) would otherwise see NULL under pawpi_app + FORCE
      // RLS and be DENIED. No-op safe outside a request context.
      await setCurrentUserId(userProfile[0].id);
    } else {
      console.log("[POST /api/pets] ✅ User profile found");
    }

    const userId = userProfile[0].id;
    console.log("[POST /api/pets] User profile ID:", userId);
    console.log("[POST /api/pets] User profile details:");
    console.log(
      "[POST /api/pets]   - auth_user_id:",
      userProfile[0].auth_user_id,
    );
    console.log("[POST /api/pets]   - id:", userProfile[0].id);

    const body = await request.json();
    console.log("[POST /api/pets] Request body:", body);

    const {
      name,
      handle,
      avatar_url,
      species = "dog",
      breed,
      age_years,
      age_months,
      gender,
      weight,
      weight_unit = "lbs",
      birthday,
      adoption_date,
      notes,
    } = body;

    // Validate required fields
    if (!name) {
      console.error("[POST /api/pets] ERROR: Pet name is required");
      return Response.json({ error: "Pet name is required" }, { status: 400 });
    }

    console.log("[POST /api/pets] Pet name:", name);

    // Generate unique handle if not provided
    let finalHandle = handle;
    if (!finalHandle) {
      const baseName = name.toLowerCase().replace(/\s+/g, "");
      finalHandle = baseName;

      console.log("[POST /api/pets] Generating handle:", finalHandle);

      // Check if handle exists
      const existing = await sql`
        SELECT id FROM pets WHERE handle = ${finalHandle}
      `;

      if (existing.length > 0) {
        // Add random suffix
        finalHandle = `${baseName}_${Math.floor(Math.random() * 10000)}`;
        console.log("[POST /api/pets] Handle exists, using:", finalHandle);
      }
    } else {
      console.log("[POST /api/pets] Using provided handle:", finalHandle);

      // Check if provided handle is unique
      const existing = await sql`
        SELECT id FROM pets WHERE handle = ${finalHandle}
      `;

      if (existing.length > 0) {
        console.error("[POST /api/pets] ERROR: Handle already taken");
        return Response.json(
          { error: "Handle already taken" },
          { status: 400 },
        );
      }
    }

    // Convert birthday/adoption date strings to proper format if provided
    const birthdayDate = birthday && birthday !== "" ? birthday : null;
    const adoptionDateFormatted =
      adoption_date && adoption_date !== "" ? adoption_date : null;

    console.log("[POST /api/pets] Creating pet with:");
    console.log(
      "[POST /api/pets]   - owner_user_id:",
      userId,
      "(user_profiles.id)",
    );
    console.log("[POST /api/pets]   - name:", name);
    console.log("[POST /api/pets]   - handle:", finalHandle);
    console.log("[POST /api/pets]   - species:", species);

    // Create pet
    const pet = await sql`
      INSERT INTO pets (
        owner_user_id, name, handle, avatar_url, species, breed,
        age_years, age_months, gender, weight, weight_unit,
        birthday, adoption_date, notes
      )
      VALUES (
        ${userId}, ${name}, ${finalHandle}, ${avatar_url || null}, ${species},
        ${breed || null}, ${age_years || null}, ${age_months || null},
        ${gender || null}, ${weight || null}, ${weight_unit},
        ${birthdayDate}, ${adoptionDateFormatted}, ${notes || null}
      )
      RETURNING *
    `;

    console.log("[POST /api/pets] ✅ Pet created successfully");
    console.log("[POST /api/pets] Pet ID:", pet[0].id);
    console.log("[POST /api/pets] Pet name:", pet[0].name);
    console.log("[POST /api/pets] Pet owner_user_id:", pet[0].owner_user_id);
    console.log("[POST /api/pets] ========================================");

    return Response.json({ pet: pet[0] }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/pets] ========================================");
    console.error("[POST /api/pets] FATAL ERROR:");
    console.error("[POST /api/pets] Error message:", error.message);
    console.error("[POST /api/pets] Error stack:", error.stack);
    console.error("[POST /api/pets] ========================================");
    return Response.json({ error: "Failed to create pet" }, { status: 500 });
  }
}

// Repair pet ownership data (fix pets with wrong owner_user_id)
async function PATCH(request) {
  try {
    console.log("[PATCH /api/pets] ========================================");
    console.log("[PATCH /api/pets] REPAIRING PET OWNERSHIP DATA");

    const session = await auth();
    console.log("[PATCH /api/pets] Session:", session);

    if (!session?.user?.id) {
      console.error("[PATCH /api/pets] ERROR: No session or user ID");
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const authUserId = session.user.id;
    console.log("[PATCH /api/pets] Auth user ID:", authUserId);

    // Get or create user profile
    console.log("[PATCH /api/pets] Fetching user profile...");
    let userProfile = await sql`
      SELECT id, auth_user_id, full_name, username, role, onboarding_completed 
      FROM user_profiles 
      WHERE auth_user_id = ${authUserId}
      LIMIT 1
    `;

    console.log("[PATCH /api/pets] User profile query result:", userProfile);

    if (userProfile.length === 0) {
      console.log(
        "[PATCH /api/pets] No user profile found, creating new one...",
      );

      // Generate username from email or name, then uniquify on conflict: an
      // orphaned/duplicate profile (or two users sharing an email prefix) may
      // already own this base, which would otherwise throw a raw 23505 → 500.
      const baseUsername =
        session.user.email?.split("@")[0] ||
        session.user.name?.toLowerCase().replace(/\s+/g, "") ||
        `user_${Date.now()}`;
      const username = await uniqueUsername(baseUsername, async (candidate) => {
        const taken = await sql`
          SELECT id FROM user_profiles WHERE username = ${candidate} LIMIT 1
        `;
        return taken.length > 0;
      });

      console.log("[PATCH /api/pets] Creating user profile:");
      console.log("[PATCH /api/pets]   - auth_user_id:", authUserId);
      console.log("[PATCH /api/pets]   - full_name:", session.user.name);
      console.log("[PATCH /api/pets]   - username:", username);

      userProfile = await sql`
        INSERT INTO user_profiles (auth_user_id, full_name, username, role)
        VALUES (${authUserId}, ${session.user.name || null}, ${username}, 'pet_owner')
        RETURNING *
      `;

      console.log("[PATCH /api/pets] ✅ User profile created:", userProfile[0]);

      // RLS R3 fix: identity was resolved at request START, where this brand-new
      // user had no profile yet, so app.current_user_id is unset. Stamp it now —
      // BEFORE any same-request owner-scoped pet write, whose RLS predicate
      // (owner_user_id = current_app_user_id()) would otherwise see NULL under
      // pawpi_app + FORCE RLS. No-op safe outside a request context.
      await setCurrentUserId(userProfile[0].id);
    } else {
      console.log("[PATCH /api/pets] ✅ User profile found");
    }

    const correctUserId = userProfile[0].id;
    console.log("[PATCH /api/pets] ========================================");
    console.log("[PATCH /api/pets] CORRECT IDs:");
    console.log("[PATCH /api/pets]   - auth_user_id:", authUserId);
    console.log("[PATCH /api/pets]   - user_profiles.id:", correctUserId);
    console.log("[PATCH /api/pets] ========================================");

    // Step 1: Find pets with wrong owner_user_id (pointing to auth_user_id)
    console.log(
      "[PATCH /api/pets] Step 1: Finding pets with wrong owner_user_id...",
    );
    console.log(
      "[PATCH /api/pets] Looking for pets where owner_user_id =",
      authUserId,
      "(auth_user_id)",
    );

    const wrongPets = await sql`
      SELECT id, name, handle, owner_user_id, avatar_url, breed, species, 
             age_years, age_months, gender, weight, weight_unit, 
             birthday, adoption_date, notes, created_at, updated_at
      FROM pets 
      WHERE owner_user_id = ${authUserId}
      ORDER BY created_at ASC
    `;

    console.log(
      "[PATCH /api/pets] Found",
      wrongPets.length,
      "pets with wrong owner_user_id",
    );

    if (wrongPets.length === 0) {
      console.log(
        "[PATCH /api/pets] ✅ No pets need repair. All pets have correct owner_user_id.",
      );

      // Also check if they have pets with correct owner_user_id
      const correctPets = await sql`
        SELECT id, name, owner_user_id FROM pets 
        WHERE owner_user_id = ${correctUserId}
      `;

      console.log(
        "[PATCH /api/pets] User has",
        correctPets.length,
        "pets with CORRECT owner_user_id",
      );

      if (correctPets.length > 0) {
        console.log("[PATCH /api/pets] Correct pets:");
        correctPets.forEach((p) => {
          console.log(
            `[PATCH /api/pets]   - ID: ${p.id}, Name: ${p.name}, owner_user_id: ${p.owner_user_id}`,
          );
        });
      }

      console.log("[PATCH /api/pets] ========================================");
      return Response.json({
        message: "No pets need repair",
        repaired: 0,
        pets: correctPets,
      });
    }

    console.log("[PATCH /api/pets] Pets with WRONG owner_user_id:");
    wrongPets.forEach((p) => {
      console.log(
        `[PATCH /api/pets]   - ID: ${p.id}, Name: ${p.name}, owner_user_id: ${p.owner_user_id} (WRONG - should be ${correctUserId})`,
      );
    });

    // Step 2: Check if user already has pets with correct owner_user_id
    console.log(
      "[PATCH /api/pets] Step 2: Checking for existing pets with correct owner_user_id...",
    );
    const existingCorrectPets = await sql`
      SELECT id, name, handle FROM pets 
      WHERE owner_user_id = ${correctUserId}
    `;

    console.log(
      "[PATCH /api/pets] Found",
      existingCorrectPets.length,
      "pets with CORRECT owner_user_id",
    );

    if (existingCorrectPets.length > 0) {
      console.log("[PATCH /api/pets] Existing correct pets:");
      existingCorrectPets.forEach((p) => {
        console.log(
          `[PATCH /api/pets]   - ID: ${p.id}, Name: ${p.name}, Handle: ${p.handle}`,
        );
      });

      // Check for handle conflicts
      const wrongHandles = wrongPets.map((p) => p.handle);
      const correctHandles = existingCorrectPets.map((p) => p.handle);
      const conflicts = wrongHandles.filter((h) => correctHandles.includes(h));

      if (conflicts.length > 0) {
        console.error(
          "[PATCH /api/pets] ⚠️ WARNING: Handle conflicts detected!",
        );
        console.error("[PATCH /api/pets] Conflicting handles:", conflicts);
        console.error(
          "[PATCH /api/pets] Cannot repair - this would create duplicate handles",
        );
        console.log(
          "[PATCH /api/pets] ========================================",
        );
        return Response.json(
          {
            error: "Handle conflicts detected. Manual intervention required.",
            conflicts,
            wrongPets: wrongPets.map((p) => ({
              id: p.id,
              name: p.name,
              handle: p.handle,
            })),
            correctPets: existingCorrectPets,
          },
          { status: 409 },
        );
      }
    }

    // Step 3: Update pets to use correct owner_user_id
    console.log(
      "[PATCH /api/pets] Step 3: Updating pets to correct owner_user_id...",
    );
    console.log("[PATCH /api/pets] Updating", wrongPets.length, "pets");
    console.log(
      "[PATCH /api/pets] Setting owner_user_id from",
      authUserId,
      "to",
      correctUserId,
    );

    const repairedPets = [];

    for (const pet of wrongPets) {
      console.log(
        `[PATCH /api/pets] Repairing pet ID ${pet.id} (${pet.name})...`,
      );

      const updated = await sql`
        UPDATE pets
        SET owner_user_id = ${correctUserId},
            updated_at = NOW()
        WHERE id = ${pet.id}
        RETURNING *
      `;

      if (updated.length > 0) {
        console.log(
          `[PATCH /api/pets] ✅ Pet ID ${pet.id} repaired successfully`,
        );
        console.log(
          `[PATCH /api/pets]    Old owner_user_id: ${pet.owner_user_id}`,
        );
        console.log(
          `[PATCH /api/pets]    New owner_user_id: ${updated[0].owner_user_id}`,
        );
        repairedPets.push(updated[0]);
      } else {
        console.error(`[PATCH /api/pets] ❌ Failed to repair pet ID ${pet.id}`);
      }
    }

    console.log("[PATCH /api/pets] ========================================");
    console.log("[PATCH /api/pets] ✅ REPAIR COMPLETE");
    console.log("[PATCH /api/pets] Total pets repaired:", repairedPets.length);
    console.log("[PATCH /api/pets] Repaired pets:");
    repairedPets.forEach((p) => {
      console.log(
        `[PATCH /api/pets]   - ID: ${p.id}, Name: ${p.name}, NEW owner_user_id: ${p.owner_user_id}`,
      );
    });
    console.log("[PATCH /api/pets] ========================================");

    // Step 4: Verify repair
    console.log("[PATCH /api/pets] Step 4: Verifying repair...");
    const allUserPets = await sql`
      SELECT id, name, owner_user_id FROM pets 
      WHERE owner_user_id = ${correctUserId}
      ORDER BY created_at DESC
    `;

    console.log(
      "[PATCH /api/pets] User now has",
      allUserPets.length,
      "total pets with correct owner_user_id",
    );
    console.log("[PATCH /api/pets] ========================================");

    return Response.json({
      message: `Successfully repaired ${repairedPets.length} pet(s)`,
      repaired: repairedPets.length,
      pets: allUserPets,
      details: {
        auth_user_id: authUserId,
        user_profiles_id: correctUserId,
        repaired_pet_ids: repairedPets.map((p) => p.id),
      },
    });
  } catch (error) {
    console.error("[PATCH /api/pets] ========================================");
    console.error("[PATCH /api/pets] FATAL ERROR:");
    console.error("[PATCH /api/pets] Error message:", error.message);
    console.error("[PATCH /api/pets] Error stack:", error.stack);
    console.error("[PATCH /api/pets] ========================================");
    return Response.json({ error: "Failed to repair pets" }, { status: 500 });
  }
}

// RLS R1: export the identity-scoped wrappers under the public method names.
const wrappedGET = withRequestContext(GET);
const wrappedPOST = withRequestContext(POST);
const wrappedPATCH = withRequestContext(PATCH);
export { wrappedGET as GET, wrappedPOST as POST, wrappedPATCH as PATCH };
