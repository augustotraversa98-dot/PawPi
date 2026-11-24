import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import useSelectedPetStore from "@/store/selectedPetStore";
import { PETS_QUERY_KEY, PETS_STALE_MS, fetchPets } from "@/utils/launchQueries";

// Get all pets the current user can use: their own (newest first) THEN the ones shared with them (family / caregiver grants),
// each carrying is_shared / access_role / owner_display (utils/launchQueries → GET /api/pets?include_shared=1).
export function usePetProfile() {
  const query = useQuery({
    queryKey: PETS_QUERY_KEY,
    queryFn: () => fetchPets(),
    staleTime: PETS_STALE_MS, // shared by ~20 sites + the EntryPoint's launch read (utils/launchQueries)
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  });

  return query;
}

// Resolve the active pet: the persisted selection if it still exists in the
// list, otherwise the newest pet (pets[0]), otherwise null.
function resolveCurrentPet(pets, selectedPetId) {
  if (!pets || pets.length === 0) return null;
  return pets.find((p) => p.id === selectedPetId) ?? pets[0] ?? null;
}

// Get the current/active pet.
// The active pet is the user's persisted selection (selectedPetStore), resolved
// against the fetched list (own AND shared pets). Falls back to the first pet (own pets come first), then null.
// This is the ONLY definition of the hook: every screen reads the active pet here, so a shared pet works everywhere at once.
export function useCurrentPet() {
  const { data: pets, isLoading, error, isError, refetch } = usePetProfile();
  const selectedPetId = useSelectedPetStore((s) => s.selectedPetId);
  const setSelectedPetId = useSelectedPetStore((s) => s.setSelectedPetId);
  const hasHydrated = useSelectedPetStore((s) => s.hasHydrated);

  const currentPet = resolveCurrentPet(pets, selectedPetId);

  // Keep the persisted selection consistent with the real list:
  //   0 pets  → clear it (active pet is null; the entry point routes to onboarding). Only for a real, EMPTY answer: a failed read
  //             (pets undefined) must not wipe the stored choice, or a transient error would forget a SHARED dog.
  //   1 pet   → write that pet's id back as the selection
  //   ≥2 pets → if the stored id is gone, fall back to pets[0] and overwrite it
  // Gated on hydration so we never overwrite a stored choice before it loads.
  useEffect(() => {
    if (!hasHydrated || isLoading) return;

    if (!pets) return;
    if (pets.length === 0) {
      if (selectedPetId !== null) setSelectedPetId(null);
      return;
    }

    const stillExists = pets.some((p) => p.id === selectedPetId);
    if (!stillExists && currentPet) {
      setSelectedPetId(currentPet.id);
    }
  }, [hasHydrated, isLoading, pets, selectedPetId, currentPet, setSelectedPetId]);

  return {
    data: currentPet,
    isLoading,
    error,
    isError,
    refetch,
    hasPet: !!currentPet,
    // Persist a new active pet by id; reflected across every useCurrentPet consumer.
    setCurrentPet: setSelectedPetId,
  };
}

export function useCreatePet() {
  const queryClient = useQueryClient();

  return useMutation({
    // `idempotencyKey` (optional, stripped from the body): one key per "add a dog" ATTEMPT, reused by every retry of it, so a lost
    // response / double tap can never create a second row for the same dog (server: POST /api/pets, family-sharing PR2).
    mutationFn: async ({ idempotencyKey, ...petData }) => {
      console.log("[useCreatePet] Creating pet with data:", petData);

      const response = await fetch("/api/pets", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
        },
        body: JSON.stringify(petData),
      });

      console.log("[useCreatePet] Response status:", response.status);

      if (!response.ok) {
        const error = await response.json();
        console.error("[useCreatePet] ERROR:", error);
        throw new Error(error.error || "Failed to create pet");
      }

      const result = await response.json();
      console.log("[useCreatePet] ✅ Pet created successfully:", result.pet);

      return result;
    },
    onSuccess: () => {
      console.log("[useCreatePet] Invalidating pets query...");
      queryClient.invalidateQueries({ queryKey: ["pets"] });
    },
  });
}
