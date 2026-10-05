// The two reads the app makes at launch, defined ONCE so the EntryPoint (which decides where to
// route) and the screens that later need the same data share a single React Query cache entry
// instead of each fetching it:
//
//   ["pets"]               GET /api/pets       — EntryPoint routes on it; every tab reads it via
//                                                usePetProfile()/useCurrentPet()
//   ["providers","mine"]   GET /api/providers  — EntryPoint's business-account check (only needed
//                                                when the account has no pets); OwnerMenu et al.
//                                                read it via useMyProviders()
//
// Dependency-free on purpose (no hooks, no stores) so the EntryPoint can import it without pulling
// the hook modules into its graph. Both are scoped by the caller's session on the server (the
// Bearer token) and the cache is cleared on every identity change (utils/auth/store.js), so one
// user's entry can never be served to another.

export const PETS_QUERY_KEY = ["pets"];
export const MY_PROVIDERS_QUERY_KEY = ["providers", "mine"];

// Freshness window for the pets list, shared by every ["pets"] observer AND the EntryPoint's launch
// read (which seeds this entry, so the tabs mounting right after it do not refetch). Creating a
// pet still invalidates ["pets"] to refetch immediately.
export const PETS_STALE_MS = 1000 * 45;

// GET /api/pets → the owner's pets (newest first). Throws an Error carrying `.status` on a non-OK
// response so the EntryPoint can tell an auth failure (401/403) from a transient one; `signal`
// lets it bound the launch read.
export async function fetchPets({ signal } = {}) {
  const response = await fetch("/api/pets", signal ? { signal } : undefined);
  if (!response.ok) {
    const error = new Error("Failed to fetch pets");
    error.status = response.status;
    throw error;
  }
  const data = await response.json();
  return data.pets;
}

// GET /api/providers → the businesses the caller is ACTIVE STAFF of. Empty → [].
export async function fetchMyProviders({ signal } = {}) {
  const response = await fetch("/api/providers", signal ? { signal } : undefined);
  if (!response.ok) {
    throw new Error("Failed to fetch your providers");
  }
  const data = await response.json();
  return data.providers ?? [];
}
