import { useQuery } from "@tanstack/react-query";

/**
 * Shared source of truth for today's daily update
 *
 * This hook checks if the current pet has posted today's daily update.
 * Uses server-side validation for reliability.
 *
 * Used by:
 * - Feed lock/unlock logic
 * - Daily card completed state
 * - Post validation
 *
 * @param {number} petId - Current pet's database ID (from user_profiles -> pets)
 * @returns {Object} Query result with todayDailyUpdate data
 */
export function useTodayDailyUpdate(petId) {
  return useQuery({
    queryKey: ["today-daily-update", petId],
    queryFn: async () => {
      console.log(
        "[useTodayDailyUpdate] ========================================",
      );
      console.log("[useTodayDailyUpdate] Fetching today's daily update...");
      console.log("[useTodayDailyUpdate] Pet ID:", petId);

      if (!petId) {
        console.log("[useTodayDailyUpdate] No pet ID provided, returning null");
        console.log(
          "[useTodayDailyUpdate] ========================================",
        );
        return null;
      }

      // Call server-side API for reliable check
      const url = `/api/posts/today-daily-update?pet_id=${petId}`;
      console.log("[useTodayDailyUpdate] Fetching from:", url);

      const response = await fetch(url);

      if (!response.ok) {
        console.error(
          "[useTodayDailyUpdate] ERROR: Failed to fetch daily update",
        );
        console.error("[useTodayDailyUpdate] Status:", response.status);
        const errorText = await response.text();
        console.error("[useTodayDailyUpdate] Response:", errorText);
        throw new Error("Failed to fetch today's daily update");
      }

      const data = await response.json();

      console.log("[useTodayDailyUpdate] Response data:", data);
      console.log(
        "[useTodayDailyUpdate] Today's date (server):",
        data.todayDate,
      );
      console.log(
        "[useTodayDailyUpdate] Has posted today:",
        data.hasPostedToday,
      );

      if (data.post) {
        console.log("[useTodayDailyUpdate] ✅ Today's daily update exists");
        console.log("[useTodayDailyUpdate] Post ID:", data.post.id);
        console.log("[useTodayDailyUpdate] Post caption:", data.post.caption);
        console.log("[useTodayDailyUpdate] Post date:", data.post.post_date);
      } else {
        console.log("[useTodayDailyUpdate] ❌ No daily update found for today");
      }

      console.log(
        "[useTodayDailyUpdate] ========================================",
      );
      return data.post || null;
    },
    enabled: !!petId,
    staleTime: 0, // Always fetch fresh data to catch newly created posts
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  });
}
