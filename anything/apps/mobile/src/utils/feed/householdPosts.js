// Which posts of the Feed belong to the viewer's HOUSEHOLD, so the "post to unlock" lock never covers them.
//
// The lock exists to make a viewer post before they look at OTHER people's moments. A dog the person owns, or a dog they hold an
// active family / caregiver grant on, is their own household's dog: the server never withholds its posts
// (api/utils/dailyMomentsGate.js → applyDailyMomentsLock, householdPetIds), so the phone must not blur them either.
//
// The pets list (GET /api/pets?include_shared=1) is exactly that household: the person's own dogs first, then the dogs shared with
// them through an ACTIVE, unexpired grant. Ids are compared as strings (DB ints arrive as number or string).

/** Set<string> of every dog in the viewer's household (owned + shared with them). Empty when the list is unknown. */
export function householdPetIdSet(pets) {
  const ids = new Set();
  if (!Array.isArray(pets)) return ids;
  for (const p of pets) if (p?.id != null) ids.add(String(p.id));
  return ids;
}

/** True for a pet moment of a household dog. Business (provider_post) items and posts with no dog are never household posts. */
export function isHouseholdPost(post, householdPetIds) {
  if (!post || post.item_type === "provider_post") return false;
  if (post.pet_id == null || !householdPetIds || typeof householdPetIds.has !== "function") return false;
  return householdPetIds.has(String(post.pet_id));
}
