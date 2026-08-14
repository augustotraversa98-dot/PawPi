// useHousehold — the data layer for the multi-pet household home (unit E14).
//
// Reads GET /api/household (all the user's dogs — owned + co-cared — each with today's ring status +
// streak, plus the optional family streak) and exposes the family-streak opt-in toggle. Degrades
// cleanly: a pre-migration backend still lists dogs (family streak absent/inert).

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export function householdKey() {
  return ["household"];
}

export function useHousehold() {
  return useQuery({
    queryKey: householdKey(),
    staleTime: 30 * 1000,
    queryFn: async () => {
      const res = await fetch(`/api/household`);
      if (!res.ok) throw new Error("Failed to load household");
      return res.json();
    },
  });
}

export function useFamilyStreakOptIn() {
  const queryClient = useQueryClient();
  const action = useMutation({
    mutationFn: async (body) => {
      const res = await fetch(`/api/household`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const err = new Error(data.error || "Action failed");
        err.status = res.status;
        throw err;
      }
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: householdKey() }),
  });
  return {
    ...action,
    optIn: () => action.mutateAsync({ action: "family_streak_opt_in" }),
    optOut: () => action.mutateAsync({ action: "family_streak_opt_out" }),
  };
}
