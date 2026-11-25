// petAccess — what the app does when the person's access to a SHARED pet changes or is lost.
//
// The server denies a revoked / departed / expired member's very next request (403 { code: "pet_access_revoked" }) and
// fingerprints the active grants in `access_version` (GET /api/pets?include_shared=1). Without this module the member's
// phone would keep showing the dog (and offering writes the server will refuse) until the 45 s pets cache and the 5 min
// default staleTime ran out. Here: drop everything keyed to the lost pet, refetch the pets list, and tell the person once, kindly.
//
// Never throws: a cache housekeeping problem must not break the request or the screen it rode in on.

import usePetAccessStore, { noteAccessVersion, markPetLost } from "@/store/petAccessStore";

export { noteAccessVersion };
import useSelectedPetStore from "@/store/selectedPetStore";

export const PET_ACCESS_REVOKED_CODE = "pet_access_revoked";

/** Does a (cloned) response body say the caller lost access to the pet? */
export function isAccessRevokedBody(body) {
  return !!body && typeof body === "object" && body.code === PET_ACCESS_REVOKED_CODE;
}

// Query keys that carry a pet id as one of their parts, e.g. ["care-ring", 5, "2026-11-24"], ["pet-grants", 5].
function keyMentionsPet(queryKey, petId) {
  if (!Array.isArray(queryKey)) return false;
  return queryKey.some((part) => part === petId || (typeof part === "string" && part === String(petId)));
}

/** Remove every cached query that belongs to one pet (cache-bleed guard, see memory demo-wrong-pet-cache-bleed). */
export function dropPetScopedCaches(queryClient, petId) {
  if (petId == null || !queryClient) return;
  try {
    queryClient.removeQueries({
      predicate: (q) => q.queryKey?.[0] !== "pets" && keyMentionsPet(q.queryKey, petId),
    });
  } catch {
    // best effort
  }
}

/** Refetch everything that lists the person's pets/grants. The list is the authority on what is still theirs. */
export function refetchAccessLists(queryClient) {
  try {
    queryClient?.invalidateQueries?.({ queryKey: ["pets"] });
    queryClient?.invalidateQueries?.({ queryKey: ["shared-with-me"] });
    queryClient?.invalidateQueries?.({ queryKey: ["household"] });
  } catch {
    // best effort
  }
}

/**
 * The person has lost access to a shared pet `pet` ({ id, name }), as seen by the pets list no longer containing it. Clear what
 * belongs to it (caches, routines, reminders, this phone's pending alarms), forget a persisted selection that points at it, and
 * queue the friendly notice (shown once). Returns a promise that settles when the alarms are cancelled (callers need not await).
 */
export function handleAccessLost(queryClient, pet, { refetchPets = true } = {}) {
  let cleanup = Promise.resolve();
  try {
    if (pet?.id == null) return cleanup;
    const petId = Number(pet.id);
    markPetLost(petId);
    try {
      // Required lazily: the reminder stores and the notification layer stay out of the launch import graph.
      const { purgePetReminders } = require("@/utils/petReminderCleanup");
      cleanup = purgePetReminders([petId]).catch(() => {});
    } catch {
      // best effort
    }
    dropPetScopedCaches(queryClient, petId);
    if (useSelectedPetStore.getState().selectedPetId === petId) {
      useSelectedPetStore.getState().setSelectedPetId(null);
    }
    usePetAccessStore.getState().setLostNotice({ petId, petName: pet.name ?? null });
    if (refetchPets) refetchAccessLists(queryClient);
    else {
      queryClient?.invalidateQueries?.({ queryKey: ["shared-with-me"] });
      queryClient?.invalidateQueries?.({ queryKey: ["household"] });
    }
  } catch {
    // best effort
  }
  return cleanup;
}

/**
 * Called by the fetch wrapper for a first-party 403. We do NOT know which pet the 403 was about, so a revoked code only refetches the
 * lists; the pets list (the authority) then shows what is gone and usePetProfile runs handleAccessLost for it.
 */
export async function onForbiddenResponse(response, queryClient) {
  try {
    if (typeof response?.clone !== "function") return;
    const body = await response.clone().json();
    if (isAccessRevokedBody(body)) refetchAccessLists(queryClient);
  } catch {
    // not JSON / already consumed: nothing to learn
  }
}
