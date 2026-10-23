import { useQuery } from "@tanstack/react-query";

/**
 * Owner-level "posted today" status for the BeReal-style feed lock.
 *
 * True when ANY pet owned by the current user has posted a daily update today.
 * The owner is resolved server-side from the session, so this is NOT pet-keyed
 * — switching the active dog must not change it (and must not re-lock the feed).
 *
 * Distinct from useTodayDailyUpdate(petId), which is per active pet and drives
 * the DailyPromptCard prompt.
 *
 * @param {boolean} enabled - Gate the query (e.g. only when the user has a pet)
 * @returns {Object} Query result; data is a boolean
 */
export function useOwnerPostedToday(enabled = true) {
  return useQuery({
    queryKey: ["owner-posted-today"],
    queryFn: async () => {
      const response = await fetch("/api/posts/owner-posted-today");
      if (!response.ok) {
        throw new Error("Failed to fetch owner's daily-update status");
      }
      const data = await response.json();
      return !!data.hasPostedToday;
    },
    enabled,
    // Perf audit 2026-10-23: was 0, which refetched on EVERY mount, pet-profile open and return from background
    // (5-6 requests after a 3 s app switch). Mutations invalidate this key explicitly, and a stale entry still
    // refetches on mount/focus once the window passes, so freshness is bounded, not lost.
    // A new post still unlocks the feed immediately: useCreatePost invalidates this key. A post made on another
    // device is picked up on the next mount/focus after the window.
    staleTime: 30 * 1000,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  });
}
