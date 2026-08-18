import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

/**
 * Owner-side read + write of a pet's medications (pet_medications, 0117).
 *
 * Backend: GET/POST/PATCH/DELETE /api/health/medications — owner-scoped
 *   (WHERE owner_user_id = me), deleted_at IS NULL, active first then newest.
 * A medication is "current" while status = 'active'; "Mark as completed" PATCHes
 * status = 'completed' (the route stamps end_date).
 */
export function medicationsKey(petId) {
  return ["pet-medications", petId];
}

export function usePetMedications(petId) {
  return useQuery({
    queryKey: medicationsKey(petId),
    queryFn: async () => {
      const res = await fetch(`/api/health/medications?petId=${petId}`);
      if (!res.ok) throw new Error("Failed to fetch medications");
      const { medications } = await res.json();
      return medications;
    },
    enabled: !!petId,
  });
}

export function useCreateMedication(petId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data) => {
      const res = await fetch(`/api/health/medications`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ petId, ...data }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || "Failed to save medication");
      }
      return res.json();
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: medicationsKey(petId) }),
  });
}

export function useUpdateMedication(petId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }) => {
      const res = await fetch(`/api/health/medications`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...data }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || "Failed to update medication");
      }
      return res.json();
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: medicationsKey(petId) }),
  });
}

export function useDeleteMedication(petId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id) => {
      const res = await fetch(`/api/health/medications?id=${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || "Failed to delete medication");
      }
      return res.json();
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: medicationsKey(petId) }),
  });
}
