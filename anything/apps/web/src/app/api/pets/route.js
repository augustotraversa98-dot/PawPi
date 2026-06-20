import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import {
  withRequestContext,
  setCurrentUserId,
} from "@/app/api/utils/requestContext";
import { moderationResponse } from "@/app/api/utils/moderateText";

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

    // Content filter (T7): reject objectionable pet name / breed / bio text before insert.
    const blockedPet = moderationResponse(name, breed, notes);
    if (blockedPet) return blockedPet;

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

// NOTE: a legacy PATCH /api/pets owner_user_id repair handler used to live here. It rewrote pets whose
// `owner_user_id` was mistakenly set to the auth id back to user_profiles.id. Under the RLS model
// (pawpi_app + FORCE RLS, 0019–0026) reads are already scoped to the profile id, so it could never
// match a row — dead code. Removed pre-submission (with its mobile caller RepairPetsButton + the
// usePetProfile auto-repair). There is no longer a PATCH method on this route.

// RLS R1: export the identity-scoped wrappers under the public method names.
const wrappedGET = withRequestContext(GET);
const wrappedPOST = withRequestContext(POST);
export { wrappedGET as GET, wrappedPOST as POST };
