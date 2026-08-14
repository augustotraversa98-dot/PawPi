// usePackStreaks — the data layer for shared "pack" streaks (unit E7).
//
// Reads the current pet's pack streaks (active flames + pending invites) from
// GET /api/pets/[id]/pack-streaks, and exposes request / accept / boop / end mutations. Degrades
// cleanly: a pre-migration backend returns an empty list, and each action surfaces a friendly result.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export function packStreaksKey(petId) {
  return ["pack-streaks", petId];
}

export function usePackStreaks(petId) {
  return useQuery({
    queryKey: packStreaksKey(petId),
    enabled: !!petId,
    staleTime: 0,
    queryFn: async () => {
      const res = await fetch(`/api/pets/${petId}/pack-streaks`);
      if (!res.ok) throw new Error("Failed to load pack streaks");
      const data = await res.json();
      return Array.isArray(data.pack_streaks) ? data.pack_streaks : [];
    },
  });
}

function usePackAction(petId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body) => {
      const res = await fetch(`/api/pets/${petId}/pack-streaks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const err = new Error(data.error || "Pack action failed");
        err.status = res.status;
        err.data = data;
        throw err;
      }
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: packStreaksKey(petId) }),
  });
}

export function useRequestPackStreak(petId) {
  const action = usePackAction(petId);
  return {
    ...action,
    request: (partnerHandle) => action.mutateAsync({ action: "request", partner_handle: partnerHandle }),
  };
}

export function useAcceptPackStreak(petId) {
  const action = usePackAction(petId);
  return { ...action, accept: (packId) => action.mutateAsync({ action: "accept", pack_id: packId }) };
}

export function useEndPackStreak(petId) {
  const action = usePackAction(petId);
  return { ...action, end: (packId) => action.mutateAsync({ action: "end", pack_id: packId }) };
}

export function useBoopPackStreak(petId) {
  const action = usePackAction(petId);
  return { ...action, boop: (packId) => action.mutateAsync({ action: "boop", pack_id: packId }) };
}
