import { normalizeWeightUnit } from "@/app/api/utils/weightUnitAlias";
import sql from "@/app/api/utils/sql";
import { usernameBaseFor } from "@/app/api/utils/ownerDisplay";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { auth } from "@/auth";
import {
  withRequestContext,
  setCurrentUserId,
  withSavepoint,
} from "@/app/api/utils/requestContext";
import {
  normalizeHandle,
  handleFormatCode,
  handleCandidates,
  findFreeHandles,
  takenAmong,
  alternativesFor,
  isHandleUniqueViolation,
} from "@/app/api/utils/petHandle";
import { moderationResponse } from "@/app/api/utils/moderateText";
import { recordBusinessEvent } from "@/lib/telemetry/business";

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

// 409 for a taken handle: friendly copy plus up to 3 free alternatives so the app can offer chips.
// Additive for older clients, which only read `error` (they throw it as the message).
async function handleTakenResponse(handle) {
  let alternatives = [];
  try {
    alternatives = await alternativesFor(sql, handle, 3);
  } catch {
    alternatives = [];
  }
  return Response.json(
    {
      error: "That handle was just taken. Pick another one.",
      code: "handle_taken",
      alternatives,
    },
    { status: 409 },
  );
}

// Get all pets for the current user (owner-scoped; pets.owner_user_id = user_profiles.id).
async function GET(request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    const authUserId = session.user.id;

    // PERF (perf audit 2026-10-23): withRequestContext already resolved this caller's profile id at the
    // top of the request transaction; resolveUserId reuses it instead of paying a second cross-region
    // round trip for the same lookup. Only the id was ever used from the old full-row SELECT.
    const userId = await resolveUserId(authUserId);
    if (userId === null) {
      return Response.json({ pets: [] });
    }

    // PERF (perf audit 5.2): pets and their latest weigh-ins are independent once the owner id is known (the
    // weights are filtered on the same owner_user_id, then looked up only for the owner's own pets below), so
    // both are queued together and awaited TOGETHER: one round trip instead of two.
    //
    // "Current weight" is a history, not a single field (Dog Profile
    // weight-source ticket): prefer each pet's latest health_weight_logs row,
    // falling back to pets.weight only when it has zero weigh-ins logged yet.
    // Every consumer of this list (useCurrentPet/usePetProfile — Dog Profile,
    // the Edit Pet Profile prefill, headers) gets the correct value for free.
    //
    // Batched in one query (same fix as api/shop/orders/route.js) instead of
    // one getCurrentWeight round-trip per pet.
    const [pets, latestWeights] = await Promise.all([
      sql`
        SELECT * FROM pets
        WHERE owner_user_id = ${userId}
        ORDER BY created_at DESC
      `,
      sql`
        SELECT DISTINCT ON (pet_id) pet_id, weight, weight_unit
        FROM health_weight_logs
        WHERE owner_user_id = ${userId}
        ORDER BY pet_id, logged_at DESC
      `,
    ]);
    const latestWeightByPetId = new Map(latestWeights.map((w) => [w.pet_id, w]));

    const petsWithCurrentWeight = pets.map((pet) => {
      const latest = latestWeightByPetId.get(pet.id);
      return {
        ...pet,
        weight: latest ? latest.weight : pet.weight,
        weight_unit: normalizeWeightUnit(latest ? latest.weight_unit : pet.weight_unit),
      };
    });

    return Response.json({ pets: petsWithCurrentWeight });
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
      // Generate username from the NAME (or a random neutral handle) — never from the
      // e-mail (privacy, QA 2026-10-16 bug 04) — then uniquify on conflict: an
      // orphaned/duplicate profile may already own this base, which would otherwise
      // throw a raw 23505 → 500.
      const baseUsername = usernameBaseFor(session.user.name);
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

    // Handle: normalized (lowercase, no leading "@"), validated with the SAME rules as the app,
    // and compared case-insensitively. A taken handle is a friendly 409 that carries fresh free
    // alternatives (never a raw error); the INSERT below also catches the unique-violation race.
    let finalHandle;
    if (handle != null && String(handle).trim() !== "") {
      finalHandle = normalizeHandle(handle);
      const reason = handleFormatCode(finalHandle);
      if (reason) {
        return Response.json(
          {
            error: "That handle can't be used. Try a different one.",
            code: "handle_invalid",
            reason,
          },
          { status: 400 },
        );
      }
      if ((await takenAmong(sql, [finalHandle])).length > 0) {
        return handleTakenResponse(finalHandle);
      }
    } else {
      // No handle supplied: pick the first FREE deterministic candidate from the pet name.
      const [free] = await findFreeHandles(
        handleCandidates({ name, breed }),
        (chunk) => takenAmong(sql, chunk),
        1,
      );
      finalHandle = free || `pup${Date.now()}`.slice(0, 20);
    }

    // Convert birthday/adoption date strings to proper format if provided
    const birthdayDate = birthday && birthday !== "" ? birthday : null;
    const adoptionDateFormatted =
      adoption_date && adoption_date !== "" ? adoption_date : null;

    // Create pet. The INSERT runs in a savepoint so a same-handle race (unique violation) is
    // handled as a friendly 409 instead of aborting the request transaction into a blanket 500.
    let pet;
    try {
      pet = await withSavepoint(() => sql`
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
    `);
    } catch (insertError) {
      if (isHandleUniqueViolation(insertError)) {
        return handleTakenResponse(finalHandle);
      }
      throw insertError;
    }

    recordBusinessEvent("pet_created");
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
// REQUEST_SINGLE_FLIGHT: read-only GET, so its COMMIT is not awaited (utils/singleFlightTx.js; skipped if a write is seen).
const wrappedGET = withRequestContext(GET, { deferCommit: true });
const wrappedPOST = withRequestContext(POST);
export { wrappedGET as GET, wrappedPOST as POST };
