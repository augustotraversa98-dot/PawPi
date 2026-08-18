import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

/**
 * Owner-side read + write of a pet's vaccinations (pet_vaccinations).
 *
 * pet_vaccinations is the single source of truth post-#87 — owner medical-care
 * "Vaccine" completions and provider-written vaccinations both land there. NR4
 * adds owner create/edit/delete so the Medications & Care → Vaccines tab persists.
 *
 * Backend: GET/POST/PATCH/DELETE /api/pet-vaccinations — owner-scoped
 *   (WHERE owner_user_id = me), deleted_at IS NULL, ordered date_given DESC.
 */
export function vaccinationsKey(petId) {
  return ["pet-vaccinations", petId];
}

export function usePetVaccinations(petId) {
  return useQuery({
    queryKey: vaccinationsKey(petId),
    queryFn: async () => {
      const response = await fetch(`/api/pet-vaccinations?petId=${petId}`);
      if (!response.ok) {
        throw new Error("Failed to fetch vaccinations");
      }
      const { vaccinations } = await response.json();
      return vaccinations;
    },
    enabled: !!petId,
  });
}

export function useCreateVaccination(petId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data) => {
      const res = await fetch(`/api/pet-vaccinations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ petId, ...data }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || "Failed to save vaccine");
      }
      return res.json();
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: vaccinationsKey(petId) }),
  });
}

export function useUpdateVaccination(petId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }) => {
      const res = await fetch(`/api/pet-vaccinations`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...data }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || "Failed to update vaccine");
      }
      return res.json();
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: vaccinationsKey(petId) }),
  });
}

export function useDeleteVaccination(petId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id) => {
      const res = await fetch(`/api/pet-vaccinations?id=${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || "Failed to delete vaccine");
      }
      return res.json();
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: vaccinationsKey(petId) }),
  });
}
