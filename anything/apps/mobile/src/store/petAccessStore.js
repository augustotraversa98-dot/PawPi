import { create } from "zustand";

// In-memory only (never persisted): what the app knows about the CHANGES in this person's access to shared pets.
//   accessVersion  the server's fingerprint of the caller's active grants (GET /api/pets?include_shared=1 → `access_version`).
//                  null until the first read. When a later read carries a different value, the person's access changed
//                  (accepted / revoked / left / expired) and pet-scoped caches must be dropped (utils/petAccess.js).
//   lostNotice     { petId, petName } once access to a shared pet has been lost and the person has not been told yet; the
//                  AccessLostNotice component shows one friendly message and clears it.
const usePetAccessStore = create((set) => ({
  accessVersion: null,
  lostNotice: null,
  setAccessVersion: (accessVersion) => set({ accessVersion }),
  setLostNotice: (lostNotice) => set({ lostNotice }),
  reset: () => set({ accessVersion: null, lostNotice: null }),
}));

export default usePetAccessStore;

/**
 * Record the `access_version` of a fresh pets read. Returns true when it CHANGED since the last one we saw (the person's access moved:
 * accepted / revoked / left / expired). The very first value just becomes the baseline. Lives here (not in utils/petAccess) so the
 * launch read (utils/launchQueries) can call it without pulling the rest of the access machinery into its import graph.
 */
export function noteAccessVersion(version) {
  if (typeof version !== "string" || !version) return false;
  const { accessVersion, setAccessVersion } = usePetAccessStore.getState();
  setAccessVersion(version);
  return accessVersion !== null && accessVersion !== version;
}

// The shared pets the last pets read listed, id -> name. Module-level on purpose: fetchPets runs once per read no matter how many
// screens observe the list, so "a shared pet that was here is now gone" is detected exactly once (not once per useCurrentPet).
let lastSharedPets = new Map();

/**
 * Compare a fresh pets list with the previous one. Returns the SHARED pets that were listed before and are gone now (access lost:
 * revoked / left / expired) and remembers the new set. A list read after sign-out / account switch must not look like a loss:
 * resetSharedPetMemory() is called when the cache is cleared (utils/auth/store).
 */
export function reconcileSharedPets(pets) {
  if (!Array.isArray(pets)) return [];
  const now = new Map();
  for (const p of pets) if (p?.is_shared === true) now.set(Number(p.id), p.name ?? null);
  const lost = [];
  for (const [id, name] of lastSharedPets) if (!now.has(id)) lost.push({ id, name });
  lastSharedPets = now;
  return lost;
}

export function resetSharedPetMemory() {
  lastSharedPets = new Map();
}

/** Forget everything about the previous person (called on every identity change, next to queryClient.clear()). */
export function resetPetAccessMemory() {
  resetSharedPetMemory();
  usePetAccessStore.getState().reset();
}
