// getCurrentWeight — the single "what is this pet's current weight" query,
// shared by every route/screen that needs to DISPLAY a pet's current weight.
//
// Decision (Dog Profile weight-source ticket, follow-up to #274): weight is a
// HISTORY, not a single field. "Current weight" always means the latest
// health_weight_logs row for the pet, falling back to pets.weight/weight_unit
// only when the pet has zero weigh-ins logged yet. This is the same read
// pet-medical-profiles' GET already did for its own `currentWeight` field —
// extracted here so there is exactly one implementation, reused by
// pet-medical-profiles GET and pets GET/[id] GET (which feeds
// useCurrentPet/usePetProfile — Dog Profile, the Edit Pet Profile prefill,
// and every header that shows a pet's weight).
//
// Callers pass the pet's own `weight`/`weight_unit` columns as the fallback so
// this stays a pure lookup — it does not re-verify pet ownership; callers are
// expected to have already scoped the pet row to the caller (owner_user_id).

import sql from './sql';

export async function getCurrentWeight(
  petId,
  ownerUserId,
  fallbackWeight,
  fallbackWeightUnit,
) {
  const latestWeight = await sql`
    SELECT weight, weight_unit
    FROM health_weight_logs
    WHERE pet_id = ${petId} AND owner_user_id = ${ownerUserId}
    ORDER BY logged_at DESC
    LIMIT 1
  `;

  return latestWeight.length > 0
    ? { weight: latestWeight[0].weight, weight_unit: latestWeight[0].weight_unit }
    : { weight: fallbackWeight, weight_unit: fallbackWeightUnit };
}

// logCurrentWeight — the single "how does a weight edit get saved" write,
// shared by every screen that lets an owner edit a pet's current weight
// (Dog Profile edit, Edit Medical Profile, and any future one). Mirrors the
// getCurrentWeight fallback rule exactly: once a pet has any health_weight_logs
// history, a weight edit is an ongoing log entry (INSERT a new row — the pet's
// current weight is always its latest log after that point). Only when the pet
// has zero weigh-ins yet does the edit seed pets.weight/weight_unit directly,
// which is the value getCurrentWeight falls back to.
//
// Not for pet creation (POST /api/pets) — that write is the legitimate
// "no history yet" seed value itself, not an edit, and stays a direct
// pets.weight/weight_unit write.
export async function logCurrentWeight(petId, ownerUserId, weight, weightUnit) {
  const existingLogs = await sql`
    SELECT COUNT(*)::int as count
    FROM health_weight_logs
    WHERE pet_id = ${petId} AND owner_user_id = ${ownerUserId}
  `;

  if (existingLogs[0].count > 0) {
    await sql`
      INSERT INTO health_weight_logs (
        pet_id, owner_user_id, weight, weight_unit, logged_at
      ) VALUES (
        ${petId}, ${ownerUserId}, ${weight}, ${weightUnit}, NOW()
      )
    `;
  } else {
    await sql`
      UPDATE pets
      SET weight = ${weight}, weight_unit = ${weightUnit}, updated_at = NOW()
      WHERE id = ${petId} AND owner_user_id = ${ownerUserId}
    `;
  }
}
