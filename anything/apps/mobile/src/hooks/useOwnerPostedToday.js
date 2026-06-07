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
    staleTime: 0, // Always fresh so a new post unlocks the feed immediately
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  });
}
