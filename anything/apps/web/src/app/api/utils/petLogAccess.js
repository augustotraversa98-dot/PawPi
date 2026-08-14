// resolvePetLogOwner — the shared owner-OR-family write gate for pet HEALTH/WALK logs (FF2).
//
// Health-log tables use `owner_user_id` as the SHARED storage + read key: 0049's family policies
// (`*_family_all`) gate writes on `app_user_has_pet_family(pet_id)` — pet access, NOT an owner-match
// — and the E13 care-ring anchors a caregiver's contribution to the pet's OWNER (the ring's
// storage/tz anchor). So a family caregiver's log is written with `owner_user_id = the pet's owner`,
// keeping it visible to the whole household and counted by the owner-scoped ring/weekly-digest.
//
// This mirrors care-ring's resolveOwnerGate but for the FAMILY write scope: per 0049 only a `family`
// grantee may write health logs (a `caregiver`/Viewer gets read-only), so a Viewer is rejected here
// with the same 403 the owner-only gate returned — the app never issues a write it knows RLS denies.
//
// callerId = the caller's already-resolved user_profiles.id.
// Returns { ownerUserId, isOwner } on success, or { error, status } to return verbatim.
// Degrades cleanly pre-0049 (missing app_user_has_pet_family → the caller is simply not a caregiver).

import sql from "./sql";
import { withSavepoint } from "./requestContext";

const MISSING_FN = "42883";
const MISSING_TABLE = "42P01";

export async function resolvePetLogOwner(callerId, petId) {
  if (callerId == null) return { error: "User profile not found", status: 404 };
  if (!petId) return { error: "petId is required", status: 400 };

  // Owner fast-path: the caller owns the pet → they are the anchor.
  const owned = await sql`
    SELECT owner_user_id FROM pets WHERE id = ${petId} AND owner_user_id = ${callerId} LIMIT 1
  `;
  if (owned.length > 0) return { ownerUserId: callerId, isOwner: true };

  // Otherwise: an ACTIVE, UNEXPIRED FAMILY grantee may write (0049); a Viewer may not.
  let isFamily = false;
  try {
    await withSavepoint(async () => {
      const [r] = await sql`SELECT app_user_has_pet_family(${petId}) AS ok`;
      isFamily = !!r?.ok;
    });
  } catch (e) {
    if (e?.code !== MISSING_FN && e?.code !== MISSING_TABLE) throw e; // pre-0049 → not a caregiver
  }
  if (!isFamily) return { error: "Pet not found or access denied", status: 403 };

  // Anchor the write to the pet's ACTUAL owner (grantee can read the pet via 0049 pets_grantee_read).
  const [p] = await sql`SELECT owner_user_id FROM pets WHERE id = ${petId} LIMIT 1`;
  if (!p) return { error: "Pet not found or access denied", status: 403 };
  return { ownerUserId: p.owner_user_id, isOwner: false };
}
