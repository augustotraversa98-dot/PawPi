// Shared pets for the OPT-IN variant of GET /api/pets (family-sharing series PR 3/7).
//
// WHY OPT-IN. Builds 30-32 do not know what a shared pet is: if GET /api/pets listed one they would put it in the pet selector
// with the owner's edit controls. So the DEFAULT response of that route is unchanged byte for byte, and shared pets are added
// ONLY when the client asks (`?include_shared=1`). New clients also get `is_shared` / `access_role` on every pet.
//
// WHICH PETS. Pets this user holds an ACTIVE, UNEXPIRED grant on (pet_caregivers.status = 'active', expires_at null or in the
// future). Pending, declined, revoked and expired grants are not listed — exactly the set app_user_has_pet_access() lets
// through, so the list never shows a pet whose data the server would then refuse.
//
// WHAT. The full pet row (a grantee may read the pet profile — 0049 pets_grantee_read), plus:
//   is_shared: true, access_role: 'family' | 'caregiver', grant_id, grant_expires_at,
//   owner_display: { full_name (null when unset — never the username/e-mail, see ownerDisplay.js), username, avatar_url }.
// weight / weight_unit are resolved like the owned list does: the latest health_weight_logs row of the pet, else pets.weight
// (looked up by pet_id, since a grantee's weigh-ins are anchored to the pet's owner).

import sql from "./sql";
import { withSavepoint } from "./requestContext";
import { normalizeWeightUnit } from "./weightUnitAlias";
import { publicOwnerName } from "./ownerDisplay";

const UNDEFINED_TABLE = "42P01";

export const ACCESS_ROLES = ["owner", "family", "caregiver"];

/** Decorate an owned pet for the opt-in response (the default response never goes through this). */
export function asOwnedPet(pet) {
  return { ...pet, is_shared: false, access_role: "owner" };
}

/**
 * The pets `userId` holds an active, unexpired grant on, newest grant first, shaped for the opt-in list.
 * Returns [] when the grant table is absent (pre-0049) or on any "nothing shared" case; never throws for a missing table.
 */
export async function loadSharedPets(userId, { excludePetIds = [] } = {}) {
  let rows;
  try {
    rows = await withSavepoint(
      () => sql`
        SELECT p.*,
               pc.id AS _grant_id,
               pc.role AS _grant_role,
               pc.expires_at AS _grant_expires_at,
               up.full_name AS _owner_full_name,
               up.username AS _owner_username,
               up.avatar_url AS _owner_avatar
        FROM pet_caregivers pc
        JOIN pets p ON p.id = pc.pet_id
        JOIN user_profiles up ON up.id = p.owner_user_id
        WHERE pc.grantee_user_id = ${userId}
          AND pc.status = 'active'
          AND (pc.expires_at IS NULL OR pc.expires_at > now())
        ORDER BY pc.created_at DESC, p.id
      `,
    );
  } catch (e) {
    if (e?.code === UNDEFINED_TABLE) return [];
    throw e;
  }

  const skip = new Set(excludePetIds);
  const seen = new Set();
  const live = rows.filter((r) => {
    if (skip.has(r.id) || seen.has(r.id)) return false; // never a duplicate (owned pet or two grants on one pet)
    seen.add(r.id);
    return true;
  });
  if (live.length === 0) return [];

  // Latest weigh-in per shared pet (by pet_id; the rows are anchored to the pet's owner). Falls back to pets.weight.
  let latest = [];
  try {
    latest = await withSavepoint(
      () => sql`
        SELECT DISTINCT ON (pet_id) pet_id, weight, weight_unit
        FROM health_weight_logs
        WHERE pet_id = ANY(${live.map((r) => r.id)})
        ORDER BY pet_id, logged_at DESC
      `,
    );
  } catch (e) {
    if (e?.code !== UNDEFINED_TABLE) throw e;
  }
  const latestByPet = new Map(latest.map((w) => [w.pet_id, w]));

  return live.map((r) => {
    const {
      _grant_id, _grant_role, _grant_expires_at, _owner_full_name, _owner_username, _owner_avatar,
      ...pet
    } = r;
    const w = latestByPet.get(pet.id);
    return {
      ...pet,
      weight: w ? w.weight : pet.weight,
      weight_unit: normalizeWeightUnit(w ? w.weight_unit : pet.weight_unit),
      is_shared: true,
      access_role: _grant_role,
      grant_id: _grant_id,
      grant_expires_at: _grant_expires_at,
      owner_display: {
        full_name: publicOwnerName({ full_name: _owner_full_name }),
        username: _owner_username ?? null,
        avatar_url: _owner_avatar ?? null,
      },
    };
  });
}
