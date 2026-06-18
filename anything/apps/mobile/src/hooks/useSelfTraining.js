import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert } from "react-native";
import { completionId } from "@/data/trainingCurriculum";

// DIY self-training progress (ticket 2.45). Completion persists per owner + pet, scoped to
// the active pet so progress switches when the current pet changes.

export function useSelfTrainingProgress(petId) {
  const query = useQuery({
    queryKey: ["self-training", petId],
    queryFn: async () => {
      const res = await fetch(`/api/training/self-progress?petId=${petId}`);
      if (!res.ok) throw new Error("Failed to load progress");
      const data = await res.json();
      return data.completed || [];
    },
    enabled: !!petId,
  });

  // A Set of "programKey/sessionKey" ids for O(1) lookups in the UI.
  const completedSet = useMemo(
    () =>
      new Set(
        (query.data || []).map((r) => completionId(r.program_key, r.session_key)),
      ),
    [query.data],
  );

  return { ...query, completedSet };
}

export function useToggleSession(petId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ programKey, sessionKey, completed }) => {
      const res = await fetch("/api/training/self-progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ petId, programKey, sessionKey, completed }),
      });
      if (!res.ok) {
        const e = await res.json();
        throw new Error(e.error || "Failed to save progress");
      }
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["self-training", petId] }),
    onError: (e) => Alert.alert("Error", e.message || "Could not save progress."),
  });
}
