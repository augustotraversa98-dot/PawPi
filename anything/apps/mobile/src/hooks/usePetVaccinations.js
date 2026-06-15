import { useQuery } from "@tanstack/react-query";

/**
 * Owner-side read of a pet's vaccinations.
 *
 * pet_vaccinations is the single source of truth post-#87 — owner medical-care
 * "Vaccine" completions and provider-written vaccinations both land there. This
 * is the owner half of the contract (see docs/provider-design.md §4 item 8).
 *
 * Backend: GET /api/pet-vaccinations?petId=<id> → { vaccinations: [...] }
 *   owner-scoped (WHERE owner_user_id = me), deleted_at IS NULL, ordered
 *   date_given DESC NULLS LAST, created_at DESC.
 *
 * Returns the vaccinations[] array (newest first as returned by the API).
 */
export function usePetVaccinations(petId) {
  return useQuery({
    queryKey: ["pet-vaccinations", petId],
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
