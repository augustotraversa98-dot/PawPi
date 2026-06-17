import { useQuery } from "@tanstack/react-query";

// Owner-facing grooming sessions for a pet (ticket 2.6 — grooming module).
// Wraps GET /api/pets/[id]/groom-sessions — the owner-context read that returns the
// before/after photos + coat/skin notes a groomer logged, so they surface on the PET
// PROFILE. Pattern mirrors useProviders / usePetProfile: relative fetch, a query key,
// throw on !res.ok. Disabled until a petId is known; empty → [] (the profile shows an
// empty state, no fake data).
export function useGroomSessions(petId) {
  return useQuery({
    queryKey: ["pets", petId, "groom-sessions"],
    enabled: petId != null,
    queryFn: async () => {
      const response = await fetch(`/api/pets/${petId}/groom-sessions`);
      if (!response.ok) {
        throw new Error("Failed to fetch groom sessions");
      }
      const data = await response.json();
      return data.sessions ?? [];
    },
  });
}
