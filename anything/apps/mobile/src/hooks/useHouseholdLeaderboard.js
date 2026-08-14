// useHouseholdLeaderboard — the data layer for the private household leaderboard (unit E13 PR3).
//
// Reads GET /api/pets/[id]/household-leaderboard (per-caregiver weekly contributions, ranked positively;
// the server names the most-active member and never a least-active one) and exposes the owner-only
// opt-out. Degrades cleanly: a pre-migration backend returns an empty board.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export function householdLeaderboardKey(petId) {
  return ["household-leaderboard", petId];
}

export function useHouseholdLeaderboard(petId) {
  return useQuery({
    queryKey: householdLeaderboardKey(petId),
    enabled: !!petId,
    staleTime: 60 * 1000,
    queryFn: async () => {
      const res = await fetch(`/api/pets/${petId}/household-leaderboard`);
      if (!res.ok) throw new Error("Failed to load household leaderboard");
      return res.json();
    },
  });
}

export function useHouseholdLeaderboardOptOut(petId) {
  const queryClient = useQueryClient();
  const action = useMutation({
    mutationFn: async (body) => {
      const res = await fetch(`/api/pets/${petId}/household-leaderboard`, {
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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: householdLeaderboardKey(petId) }),
  });
  return {
    ...action,
    optOut: () => action.mutateAsync({ action: "opt_out" }),
    optIn: () => action.mutateAsync({ action: "opt_in" }),
  };
}
