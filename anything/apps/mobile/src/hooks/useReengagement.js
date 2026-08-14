// useReengagement — the data layer for the comeback loop (unit E12).
//
// Reads GET /api/pets/[id]/reengagement (lapse status + the "welcome back" payload: friends' REAL recent
// moments, next milestone, pack + streak status, repair availability) and exposes the POST actions
// (opt_out / repair / seen). Degrades cleanly: a pre-migration backend returns lapsed=false + empty
// welcome_back and each action surfaces a friendly result.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export function reengagementKey(petId) {
  return ["reengagement", petId];
}

export function useReengagement(petId) {
  return useQuery({
    queryKey: reengagementKey(petId),
    enabled: !!petId,
    staleTime: 60 * 1000,
    queryFn: async () => {
      const res = await fetch(`/api/pets/${petId}/reengagement`);
      if (!res.ok) throw new Error("Failed to load reengagement");
      return res.json();
    },
  });
}

export function useReengagementAction(petId) {
  const queryClient = useQueryClient();
  const action = useMutation({
    mutationFn: async (body) => {
      const res = await fetch(`/api/pets/${petId}/reengagement`, {
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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: reengagementKey(petId) }),
  });
  return {
    ...action,
    optOut: () => action.mutateAsync({ action: "opt_out" }),
    repair: () => action.mutateAsync({ action: "repair" }),
    markSeen: () => action.mutateAsync({ action: "seen" }),
  };
}
