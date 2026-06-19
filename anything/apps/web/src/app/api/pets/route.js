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
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const authUserId = session.user.id;

    // Get or create user profile
    let userProfile = await sql`
      SELECT id, auth_user_id, full_name, username, role, onboarding_completed
      FROM user_profiles
      WHERE auth_user_id = ${authUserId}
      LIMIT 1
    `;

    if (userProfile.length === 0) {
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

      userProfile = await sql`
        INSERT INTO user_profiles (auth_user_id, full_name, username, role)
        VALUES (${authUserId}, ${session.user.name || null}, ${username}, 'pet_owner')
        RETURNING *
      `;

      // RLS R3 fix: identity was resolved at request START, where this brand-new
      // user had no profile yet, so app.current_user_id is unset. Stamp it now —
      // BEFORE the same-request pet INSERT, whose WITH CHECK (owner_user_id =
      // current_app_user_id()) would otherwise see NULL under pawpi_app + FORCE
      // RLS and be DENIED. No-op safe outside a request context.
      await setCurrentUserId(userProfile[0].id);
    }

    const userId = userProfile[0].id;
    const body = await request.json();

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
      return Response.json({ error: "Pet name is required" }, { status: 400 });
    }

    // Generate unique handle if not provided
    let finalHandle = handle;
    if (!finalHandle) {
      const baseName = name.toLowerCase().replace(/\s+/g, "");
      finalHandle = baseName;

      // Check if handle exists
      const existing = await sql`
        SELECT id FROM pets WHERE handle = ${finalHandle}
      `;

      if (existing.length > 0) {
        // Add random suffix
        finalHandle = `${baseName}_${Math.floor(Math.random() * 10000)}`;
      }
    } else {
      // Check if provided handle is unique
      const existing = await sql`
        SELECT id FROM pets WHERE handle = ${finalHandle}
      `;

      if (existing.length > 0) {
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

    return Response.json({ pet: pet[0] }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/pets] Error:", error.message);
    return Response.json({ error: "Failed to create pet" }, { status: 500 });
  }
}

// PATCH /api/pets — legacy owner_user_id REPAIR tool (historical migration; see ARCHITECTURE.md §3).
//
// It rewrites pets whose `owner_user_id` was mistakenly set to the auth id back to user_profiles.id.
// Under the current RLS model (pawpi_app + FORCE RLS, 0019–0026) this can no longer find such rows —
// reads are already scoped to `owner_user_id = current_app_user_id()` (the profile id), so the
// `WHERE owner_user_id = <auth id>` lookup matches nothing. The handler is therefore DORMANT and is
// gated OFF by default; it runs only when ENABLE_PET_OWNERSHIP_REPAIR === "true" (a one-off admin/dev
// toggle for a pre-RLS dataset). Disabled → a clean 410 with no DB access.
//
// Follow-up (do NOT do here): the mobile caller `RepairPetsButton.jsx` lives in an open redesign PR
// (#209) — remove the button + this handler together once that lands. Flagged in docs/test-backlog.md.
async function PATCH(request) {
  if (process.env.ENABLE_PET_OWNERSHIP_REPAIR !== "true") {
    return Response.json(
      { error: "Pet ownership repair is disabled" },
      { status: 410 },
    );
  }
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const authUserId = session.user.id;

    // Get or create user profile
    let userProfile = await sql`
      SELECT id, auth_user_id, full_name, username, role, onboarding_completed
      FROM user_profiles
      WHERE auth_user_id = ${authUserId}
      LIMIT 1
    `;

    if (userProfile.length === 0) {
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

      userProfile = await sql`
        INSERT INTO user_profiles (auth_user_id, full_name, username, role)
        VALUES (${authUserId}, ${session.user.name || null}, ${username}, 'pet_owner')
        RETURNING *
      `;

      // Same RLS R3 identity-stamp as POST (see note above).
      await setCurrentUserId(userProfile[0].id);
    }

    const correctUserId = userProfile[0].id;

    // Find pets with the wrong owner_user_id (pointing at the auth id, not the profile id).
    const wrongPets = await sql`
      SELECT id, name, handle, owner_user_id
      FROM pets
      WHERE owner_user_id = ${authUserId}
      ORDER BY created_at ASC
    `;

    if (wrongPets.length === 0) {
      const correctPets = await sql`
        SELECT id, name, owner_user_id FROM pets
        WHERE owner_user_id = ${correctUserId}
      `;
      return Response.json({
        message: "No pets need repair",
        repaired: 0,
        pets: correctPets,
      });
    }

    // Guard against handle collisions with the user's already-correct pets.
    const existingCorrectPets = await sql`
      SELECT id, name, handle FROM pets
      WHERE owner_user_id = ${correctUserId}
    `;
    if (existingCorrectPets.length > 0) {
      const correctHandles = existingCorrectPets.map((p) => p.handle);
      const conflicts = wrongPets
        .map((p) => p.handle)
        .filter((h) => correctHandles.includes(h));
      if (conflicts.length > 0) {
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

    // Rewrite each wrong pet to the correct (profile) owner id.
    const repairedPets = [];
    for (const pet of wrongPets) {
      const updated = await sql`
        UPDATE pets
        SET owner_user_id = ${correctUserId}, updated_at = NOW()
        WHERE id = ${pet.id}
        RETURNING *
      `;
      if (updated.length > 0) repairedPets.push(updated[0]);
    }

    const allUserPets = await sql`
      SELECT id, name, owner_user_id FROM pets
      WHERE owner_user_id = ${correctUserId}
      ORDER BY created_at DESC
    `;

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
    console.error("[PATCH /api/pets] Error:", error.message);
    return Response.json({ error: "Failed to repair pets" }, { status: 500 });
  }
}

// RLS R1: export the identity-scoped wrappers under the public method names.
const wrappedGET = withRequestContext(GET);
const wrappedPOST = withRequestContext(POST);
const wrappedPATCH = withRequestContext(PATCH);
export { wrappedGET as GET, wrappedPOST as POST, wrappedPATCH as PATCH };
