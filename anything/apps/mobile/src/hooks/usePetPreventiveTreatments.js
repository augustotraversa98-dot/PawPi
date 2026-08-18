import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

/**
 * Owner-side read + write of a pet's preventive treatments
 * (pet_preventive_treatments, 0117): flea/tick/heartworm prevention, dewormers,
 * supplements.
 *
 * Backend: GET/POST/PATCH/DELETE /api/health/preventive-treatments — owner-scoped
 *   (WHERE owner_user_id = me), deleted_at IS NULL, next_due soonest first.
 */
export function preventiveTreatmentsKey(petId) {
  return ["pet-preventive-treatments", petId];
}

export function usePetPreventiveTreatments(petId) {
  return useQuery({
    queryKey: preventiveTreatmentsKey(petId),
    queryFn: async () => {
      const res = await fetch(`/api/health/preventive-treatments?petId=${petId}`);
      if (!res.ok) throw new Error("Failed to fetch preventive treatments");
      const { treatments } = await res.json();
      return treatments;
    },
    enabled: !!petId,
  });
}

export function useCreatePreventiveTreatment(petId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data) => {
      const res = await fetch(`/api/health/preventive-treatments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ petId, ...data }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || "Failed to save preventive care");
      }
      return res.json();
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: preventiveTreatmentsKey(petId) }),
  });
}

export function useUpdatePreventiveTreatment(petId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }) => {
      const res = await fetch(`/api/health/preventive-treatments`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...data }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || "Failed to update preventive care");
      }
      return res.json();
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: preventiveTreatmentsKey(petId) }),
  });
}

export function useDeletePreventiveTreatment(petId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id) => {
      const res = await fetch(`/api/health/preventive-treatments?id=${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || "Failed to delete preventive care");
      }
      return res.json();
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: preventiveTreatmentsKey(petId) }),
  });
}
