// useHealthReinforcement — the E10 payoff hooks (docs/pet-owner-engagement.md).
//
//  • useLogAllGood — "all good today": writes a REAL wellness (general) log, which closes the Care ring
//    segment. Gated behind an explicit confirm in CareRingCard (NR3). Invalidates the ring + health
//    queries so the UI updates instantly. mutateAsync resolves to { log } so the caller can capture the
//    created id for undo.
//  • useDeleteWellnessLog — the undo path (NR3): deletes a just-created wellness log by id (owner-scoped
//    on the server), then re-invalidates the ring so the Care segment re-opens.
//  • useVetSummaryReadiness — the positive "the more you log, the better the next vet summary" indicator
//    that grows with REAL records.
//  • useCareRecap — this month's REAL ring completion (also feeds the E4 share-card recap).

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { careRingKey } from "@/hooks/useCareRing";

export function useLogAllGood(petId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/health/wellness-logs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ petId, checkType: "general", notes: "All good ✓" }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || "Failed to log");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: careRingKey(petId) });
      queryClient.invalidateQueries({ queryKey: ["vet-summary-readiness", petId] });
    },
  });
}

export function useDeleteWellnessLog(petId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id) => {
      const res = await fetch(`/api/health/wellness-logs?id=${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || "Failed to delete");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: careRingKey(petId) });
      queryClient.invalidateQueries({ queryKey: ["vet-summary-readiness", petId] });
    },
  });
}

export function vetReadinessKey(petId) {
  return ["vet-summary-readiness", petId];
}

export function useVetSummaryReadiness(petId) {
  return useQuery({
    queryKey: vetReadinessKey(petId),
    enabled: !!petId,
    staleTime: 60 * 1000,
    queryFn: async () => {
      const res = await fetch(`/api/pets/${petId}/vet-summary-readiness`);
      if (!res.ok) throw new Error("Failed to load readiness");
      return res.json();
    },
  });
}
