import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PETS_QUERY_KEY } from "@/utils/launchQueries";
import { canDoOnPet } from "@/utils/petPermissions";

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
  // A caregiver on a shared dog has no vaccines (closed by the server): do not ask. The role comes from the cached pets list
  // (no extra fetch); a pet that is not in the cache keeps the old behaviour and lets the server decide.
  const queryClient = useQueryClient();
  const pet = (queryClient.getQueryData(PETS_QUERY_KEY) || []).find((p) => p.id === petId);
  const allowed = pet ? canDoOnPet(pet, "viewVaccinations") : true;
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
    enabled: !!petId && allowed,
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
