// useDayCard — the data layer for the multi-caregiver "day card" (unit E13 PR2).
//
// Reads GET /api/pets/[id]/day-card?day= — a pet's daily moments for one day, grouped as attributed
// slides (one carousel per author) with day-card-level paw/bark totals + a bump anchor. Owner or active
// caregiver only.

import { useQuery } from "@tanstack/react-query";

export function dayCardKey(petId, day) {
  return ["day-card", petId, day || "today"];
}

export function useDayCard(petId, day) {
  return useQuery({
    queryKey: dayCardKey(petId, day),
    enabled: !!petId,
    staleTime: 30 * 1000,
    queryFn: async () => {
      const qs = day ? `?day=${day}` : "";
      const res = await fetch(`/api/pets/${petId}/day-card${qs}`);
      if (!res.ok) throw new Error("Failed to load day card");
      return res.json();
    },
  });
}
