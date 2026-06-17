import { useQuery } from "@tanstack/react-query";

// Phase 2 ticket 2.13 — feed integration. Reads the PUBLIC sibling endpoint
// GET /api/feed/suggestions (published providers + available adoptable dogs, public fields only).
// This is INTENTIONALLY a separate query from useFeedPosts so it can never disturb the social
// feed's Following/Suggested mergeFeed or the BeReal daily-lock — the mobile layer interleaves
// the two client-side via interleaveSuggestions.
//
// Returns the raw { providers, adoptions } shape; the caller flattens + interleaves at the
// configured cadence/cap. A failed/empty fetch yields empty arrays, so the feed simply shows no
// suggestion cards (graceful degradation — never blocks the posts).
export function useFeedSuggestions() {
  return useQuery({
    queryKey: ["feed", "suggestions"],
    queryFn: async () => {
      const response = await fetch("/api/feed/suggestions");
      if (!response.ok) {
        throw new Error("Failed to fetch feed suggestions");
      }
      const data = await response.json();
      return (
        data.suggestions ?? { providers: [], adoptions: [] }
      );
    },
    // Suggestions change slowly (a business publishing, a dog becoming available) — they do not
    // need the always-fresh treatment the posts feed gets.
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}
