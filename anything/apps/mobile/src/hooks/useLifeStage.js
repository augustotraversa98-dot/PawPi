// useLifeStage — the data layer for life-stage ring goals (unit E15).
//
// Reads GET /api/pets/[id]/life-stage (detected + override + effective stage + ring goals; the ring
// keeps its three segments — only the copy/suggested actions adapt) and exposes the owner override.
// Degrades cleanly: a pre-migration backend returns detected-only (override null).

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export function lifeStageKey(petId) {
  return ["life-stage", petId];
}

export function useLifeStage(petId) {
  return useQuery({
    queryKey: lifeStageKey(petId),
    enabled: !!petId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const res = await fetch(`/api/pets/${petId}/life-stage`);
      if (!res.ok) throw new Error("Failed to load life stage");
      return res.json();
    },
  });
}

export function useSetLifeStageOverride(petId) {
  const queryClient = useQueryClient();
  const action = useMutation({
    mutationFn: async (lifeStage) => {
      const res = await fetch(`/api/pets/${petId}/life-stage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ life_stage: lifeStage }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const err = new Error(data.error || "Failed to set life stage");
        err.status = res.status;
        throw err;
      }
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: lifeStageKey(petId) }),
  });
  return {
    ...action,
    // Pass a stage to pin it, or null to clear back to auto-detect.
    setOverride: (stage) => action.mutateAsync(stage ?? null),
  };
}
