// useCareRing — the Care Ring's data layer (unit E1).
//
// Reads the derived ring state for a pet's LOCAL day from GET /api/pets/[id]/care-ring, and exposes
// rest-day + pause mutations (POST). Kept fresh (staleTime 0 + refetch on mount/focus) so logging a
// walk/moment/care fills a segment without a manual reload; the log mutations also invalidate
// ["care-ring"] so the ring updates the instant a source log lands. Degrades cleanly: a pre-migration
// backend (pet_care_days/pet_streaks absent) still returns derived segments; rest/pause 503s → no-op.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getLocalPostDateString } from "@/utils/dateUtils";

export function careRingKey(petId) {
  return ["care-ring", petId];
}

export function useCareRing(petId) {
  const day = getLocalPostDateString();
  return useQuery({
    queryKey: careRingKey(petId),
    enabled: !!petId,
    staleTime: 0,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const res = await fetch(`/api/pets/${petId}/care-ring?day=${day}`);
      if (!res.ok) throw new Error("Failed to load care ring");
      return res.json();
    },
  });
}

export function useSetRestDay(petId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (restDay) => {
      const day = getLocalPostDateString();
      const res = await fetch(`/api/pets/${petId}/care-ring`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "set_rest", day, rest_day: restDay }),
      });
      if (!res.ok) throw new Error("Failed to set rest day");
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: careRingKey(petId) }),
  });
}

export function useSetPause(petId) {
  const queryClient = useQueryClient();
  return useMutation({
    // pausedUntil: "YYYY-MM-DD" to pause through that day (inclusive), or null to resume now.
    mutationFn: async (pausedUntil) => {
      const res = await fetch(`/api/pets/${petId}/care-ring`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "set_pause", paused_until: pausedUntil ?? null }),
      });
      if (!res.ok) throw new Error("Failed to set pause");
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: careRingKey(petId) }),
  });
}
