// useShareStats — REAL stats for the share-card deck (unit E4). Owner-scoped; degrades to empty
// (zeros / null streak) so the deck still renders honest empty states instead of fake numbers.

import { useQuery } from "@tanstack/react-query";
import { getLocalPostDateString } from "@/utils/dateUtils";

export function shareStatsKey(petId) {
  return ["share-stats", petId];
}

export function useShareStats(petId) {
  const day = getLocalPostDateString();
  return useQuery({
    queryKey: shareStatsKey(petId),
    enabled: !!petId,
    staleTime: 60 * 1000,
    queryFn: async () => {
      const res = await fetch(`/api/pets/${petId}/share-stats?day=${day}`);
      if (!res.ok) throw new Error("Failed to load share stats");
      return res.json();
    },
  });
}
