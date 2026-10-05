// GET /api/routines?petId= — ONE definition shared by the two readers of a pet's routines, so they
// share a React Query cache entry (and an in-flight request) instead of each fetching it:
//   • routinesStore.loadRoutines(petId)       — builds the routines + reminders the Health tab shows
//   • useHasReminder(petId) (useGettingStarted) — the Feed's "set your first reminder" checklist item
//
// Scoped by pet: the key carries the pet id (as a string, so 5 and "5" are one entry), and the
// server scopes the rows to the signed-in owner. The cache is cleared on every identity change.

export const routinesQueryKey = (petId) => ["routines", petId == null ? "all" : String(petId)];

export async function fetchRoutinesRaw(petId) {
  const url = petId ? `/api/routines?petId=${petId}` : "/api/routines";
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load routines: ${response.statusText}`);
  }
  return response.json();
}
