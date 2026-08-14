// useActivityInsight — the positive, behavioral activity insight (unit E9).
//
// Reads GET /api/pets/[id]/activity-insight. The SERVER decides the insight `kind` and can NEVER
// return a negative comparison (a below-median pet falls back to personal progress or a gentle nudge),
// so the client only maps `kind` → localized positive copy.

import { useQuery } from "@tanstack/react-query";

export function activityInsightKey(petId) {
  return ["activity-insight", petId];
}

export function useActivityInsight(petId) {
  return useQuery({
    queryKey: activityInsightKey(petId),
    enabled: !!petId,
    staleTime: 60 * 1000,
    queryFn: async () => {
      const res = await fetch(`/api/pets/${petId}/activity-insight`);
      if (!res.ok) throw new Error("Failed to load activity insight");
      return res.json();
    },
  });
}
