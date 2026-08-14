// useLeaderboard — weekly care-effort leagues (unit E8).
//
// Reads GET /api/pets/[id]/leaderboard?flavor= for the current pet, and exposes the neighborhood
// opt-in mutation. The backend is density-gated + empty-safe, so the hook just renders what it returns
// (flavor may fall back to "friends"; gated=true means the requested flavor was too sparse).

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export function leaderboardKey(petId, flavor) {
  return ["leaderboard", petId, flavor];
}

export function useLeaderboard(petId, flavor = "friends") {
  return useQuery({
    queryKey: leaderboardKey(petId, flavor),
    enabled: !!petId,
    staleTime: 60 * 1000,
    queryFn: async () => {
      const res = await fetch(`/api/pets/${petId}/leaderboard?flavor=${flavor}`);
      if (!res.ok) throw new Error("Failed to load leaderboard");
      return res.json();
    },
  });
}

export function useSetLeaderboardArea(petId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ optIn, area }) => {
      const res = await fetch(`/api/pets/${petId}/leaderboard`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "set_area", opt_in: optIn, area }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const err = new Error(data.error || "Failed to update area");
        err.status = res.status;
        throw err;
      }
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["leaderboard", petId] }),
  });
}
