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

// options.allowCaregiver (default false): ALSO admit an active, unexpired CAREGIVER grantee. Only the health LOG routes pass it
// (owner decision 2, 2026-11-23: a caregiver can log / complete tasks). The vet record, media and uploads keep the default, so a
// caregiver stays read-only there (and 0139 gives them INSERT on the log tables only).
// options.logTable: the health_* table the caller is about to INSERT into. Used ONLY for a caregiver-only grantee: before
// 0139 is applied the table has no <logTable>_caregiver_insert policy, so the INSERT would fail inside the request
// transaction (a blanket 500). When that policy is absent we answer a friendly 403 up front instead.
export async function resolvePetLogOwner(callerId, petId, { allowCaregiver = false, logTable = null } = {}) {
  if (callerId == null) return { error: "User profile not found", status: 404 };
  if (!petId) return { error: "petId is required", status: 400 };

  // Owner fast-path: the caller owns the pet → they are the anchor.
  const owned = await sql`
    SELECT owner_user_id FROM pets WHERE id = ${petId} AND owner_user_id = ${callerId} LIMIT 1
  `;
  if (owned.length > 0) return { ownerUserId: callerId, isOwner: true };

  // Otherwise: an ACTIVE, UNEXPIRED FAMILY grantee may write (0049); a caregiver only when allowCaregiver (log routes).
  let isFamily = false;
  let caregiverOnly = false;
  try {
    await withSavepoint(async () => {
      if (allowCaregiver) {
        const [r] = await sql`
          SELECT app_user_has_pet_access(${petId}) AS ok, app_user_has_pet_family(${petId}) AS fam
        `;
        isFamily = !!r?.ok;
        caregiverOnly = !!r?.ok && !r?.fam;
      } else {
        const [r] = await sql`SELECT app_user_has_pet_family(${petId}) AS ok`;
        isFamily = !!r?.ok;
      }
    });
  } catch (e) {
    if (e?.code !== MISSING_FN && e?.code !== MISSING_TABLE) throw e; // pre-0049 → not a caregiver
  }
  if (!isFamily) return { error: "Pet not found or access denied", status: 403 };

  // A caregiver may only APPEND to a log table, via <table>_caregiver_insert (0139). Without it (migration not applied yet)
  // refuse cleanly rather than let RLS abort the request transaction.
  if (caregiverOnly && logTable) {
    const policy = `${logTable}_caregiver_insert`;
    const present = await sql`
      SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = ${logTable} AND policyname = ${policy} LIMIT 1
    `;
    if (present.length === 0) {
      return { error: "Logging for caregivers isn't available yet.", status: 403, code: "caregiver_logging_unavailable" };
    }
  }

  // Anchor the write to the pet's ACTUAL owner (grantee can read the pet via 0049 pets_grantee_read).
  const [p] = await sql`SELECT owner_user_id FROM pets WHERE id = ${petId} LIMIT 1`;
  if (!p) return { error: "Pet not found or access denied", status: 403 };
  return { ownerUserId: p.owner_user_id, isOwner: false };
}
