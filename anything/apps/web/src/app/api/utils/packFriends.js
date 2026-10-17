// "Friends" for pack streaks (night run #2, PR C).
//
// The app has two social edges between dogs:
//   * pet_friendships (status = 'accepted')  — the original request/accept model;
//   * pet_follows                            — one-directional, instant.
// A "friend" for a pack streak is EITHER an accepted friendship OR a MUTUAL follow (each dog follows
// the other). One-way follows are not enough: the other owner never opted in to anything.
// (Decision logged in docs/qa/runs/2026-10-17_fix-log.md — today no code path creates
// pet_friendships rows, so mutual follows are what actually populates the list.)
//
// Everything is scoped to the caller's pet: the friend set is computed FROM that pet, the partner must
// belong to a different owner, must have a handle (the DEFINER request function resolves by handle),
// and a live block in either direction removes the dog from the list AND from validation. Public
// fields only — never an e-mail, never the username as a display name.

import { publicOwnerName } from "./ownerDisplay";

const LIKE_ESCAPE = /[\\%_]/g;

export function likePattern(q) {
  return `%${String(q ?? "").trim().replace(LIKE_ESCAPE, (c) => `\\${c}`)}%`;
}

/**
 * Friends of `petId` (owned by `ownerUserId`) matching `q` (name / handle / owner name, case
 * insensitive, optional). Excludes the caller's own dogs, dogs without a handle and blocked owners.
 */
export async function listPackFriends(sql, { petId, ownerUserId, q = "", limit = 20 }) {
  const term = String(q ?? "").trim();
  const pattern = likePattern(term);
  const rows = await sql`
    WITH friend_pets AS (
      SELECT CASE WHEN f.requester_pet_id = ${petId} THEN f.receiver_pet_id
                  ELSE f.requester_pet_id END AS pet_id
      FROM pet_friendships f
      WHERE f.status = 'accepted'
        AND (f.requester_pet_id = ${petId} OR f.receiver_pet_id = ${petId})
      UNION
      SELECT a.followed_pet_id AS pet_id
      FROM pet_follows a
      JOIN pet_follows b
        ON b.follower_pet_id = a.followed_pet_id AND b.followed_pet_id = a.follower_pet_id
      WHERE a.follower_pet_id = ${petId}
    )
    SELECT p.id, p.name, p.handle, p.avatar_url, up.full_name
    FROM friend_pets fp
    JOIN pets p ON p.id = fp.pet_id
    LEFT JOIN user_profiles up ON up.id = p.owner_user_id
    WHERE p.owner_user_id <> ${ownerUserId}
      AND p.handle IS NOT NULL AND p.handle <> ''
      AND NOT app_user_is_blocked(${ownerUserId}, p.owner_user_id)
      AND (
        ${term} = ''
        OR p.name ILIKE ${pattern}
        OR p.handle ILIKE ${pattern}
        OR up.full_name ILIKE ${pattern}
      )
    ORDER BY lower(p.name), p.id
    LIMIT ${Math.min(Math.max(limit, 1), 50)}
  `;
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    handle: r.handle,
    avatar_url: r.avatar_url || null,
    owner_name: publicOwnerName(r),
  }));
}

/** Is `partnerPetId` a pack-eligible friend of `petId`? (same rules as the list). */
export async function isPackFriend(sql, { petId, ownerUserId, partnerPetId }) {
  const rows = await sql`
    WITH friend_pets AS (
      SELECT CASE WHEN f.requester_pet_id = ${petId} THEN f.receiver_pet_id
                  ELSE f.requester_pet_id END AS pet_id
      FROM pet_friendships f
      WHERE f.status = 'accepted'
        AND (f.requester_pet_id = ${petId} OR f.receiver_pet_id = ${petId})
      UNION
      SELECT a.followed_pet_id AS pet_id
      FROM pet_follows a
      JOIN pet_follows b
        ON b.follower_pet_id = a.followed_pet_id AND b.followed_pet_id = a.follower_pet_id
      WHERE a.follower_pet_id = ${petId}
    )
    SELECT p.id, p.handle
    FROM friend_pets fp
    JOIN pets p ON p.id = fp.pet_id
    WHERE p.id = ${partnerPetId}
      AND p.owner_user_id <> ${ownerUserId}
      AND p.handle IS NOT NULL AND p.handle <> ''
      AND NOT app_user_is_blocked(${ownerUserId}, p.owner_user_id)
    LIMIT 1
  `;
  return rows[0] ?? null;
}

/** Existing pack (any status) between two pets, as the participant sees it; null if none. */
export async function findExistingPack(sql, petId, partnerPetId) {
  const rows = await sql`
    SELECT id, status FROM pet_pack_streaks
    WHERE least(requester_pet_id, receiver_pet_id) = least(${petId}::int, ${partnerPetId}::int)
      AND greatest(requester_pet_id, receiver_pet_id) = greatest(${petId}::int, ${partnerPetId}::int)
    LIMIT 1
  `;
  return rows[0] ?? null;
}
