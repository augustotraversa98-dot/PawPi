import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

// Get all pets for the current user
export function usePetProfile() {
  const queryClient = useQueryClient();
  const repairAttempted = useRef(false);

  const query = useQuery({
    queryKey: ["pets"],
    queryFn: async () => {
      console.log("[usePetProfile] Fetching pets from database...");
      const response = await fetch("/api/pets");

      console.log("[usePetProfile] Response status:", response.status);

      if (!response.ok) {
        const errorText = await response.text();
        console.error("[usePetProfile] ERROR: Failed to fetch pets");
        console.error("[usePetProfile] Status:", response.status);
        console.error("[usePetProfile] Response:", errorText);
        throw new Error("Failed to fetch pets");
      }

      const data = await response.json();
      console.log("[usePetProfile] Pets data:", data);
      console.log("[usePetProfile] Number of pets:", data.pets?.length || 0);

      if (data.pets && data.pets.length > 0) {
        console.log(
          "[usePetProfile] ✅ Found pets:",
          data.pets.map((p) => ({ id: p.id, name: p.name })),
        );
      } else {
        console.log("[usePetProfile] ⚠️ No pets found for this user");
      }

      return data.pets;
    },
    staleTime: 0, // Always fetch fresh data to catch newly created pets
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  });

  // Auto-repair if no pets found but repair not yet attempted
  useEffect(() => {
    if (
      query.data?.length === 0 &&
      !query.isLoading &&
      !repairAttempted.current
    ) {
      console.log("[usePetProfile] ========================================");
      console.log("[usePetProfile] No pets found - attempting auto-repair...");
      console.log("[usePetProfile] ========================================");
      repairAttempted.current = true;

      // Attempt repair
      fetch("/api/pets", { method: "PATCH" })
        .then(async (response) => {
          if (response.ok) {
            const result = await response.json();
            console.log(
              "[usePetProfile] ========================================",
            );
            console.log("[usePetProfile] Auto-repair result:", result);

            if (result.repaired > 0) {
              console.log("[usePetProfile] ✅ AUTO-REPAIR SUCCESSFUL!");
              console.log(
                "[usePetProfile] Repaired",
                result.repaired,
                "pet(s)",
              );
              console.log(
                "[usePetProfile] Pet IDs:",
                result.details?.repaired_pet_ids,
              );
              console.log("[usePetProfile] Refetching pets...");
              console.log(
                "[usePetProfile] ========================================",
              );
              // Refetch pets after repair
              queryClient.invalidateQueries({ queryKey: ["pets"] });
            } else {
              console.log(
                "[usePetProfile] Auto-repair found no pets to repair",
              );
              console.log(
                "[usePetProfile] ========================================",
              );
            }
          } else {
            const errorData = await response.json();
            console.log("[usePetProfile] Auto-repair response:", errorData);
            console.log(
              "[usePetProfile] ========================================",
            );
          }
        })
        .catch((error) => {
          console.error(
            "[usePetProfile] ========================================",
          );
          console.error("[usePetProfile] Auto-repair error:", error);
          console.error(
            "[usePetProfile] ========================================",
          );
        });
    }
  }, [query.data, query.isLoading, queryClient]);

  return query;
}

// Get the current/primary pet (first pet sorted by created_at DESC)
export function useCurrentPet() {
  const { data: pets, isLoading, error } = usePetProfile();

  const currentPet = pets && pets.length > 0 ? pets[0] : null;

  console.log(
    "[useCurrentPet] Current pet:",
    currentPet ? { id: currentPet.id, name: currentPet.name } : null,
  );

  return {
    data: currentPet,
    isLoading,
    error,
    hasPet: !!currentPet,
  };
}

// Manual repair mutation (can be triggered by user)
export function useRepairPets() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      console.log("[useRepairPets] ========================================");
      console.log("[useRepairPets] Triggering manual pet ownership repair...");
      console.log("[useRepairPets] ========================================");

      const response = await fetch("/api/pets", {
        method: "PATCH",
      });

      console.log("[useRepairPets] Response status:", response.status);

      if (!response.ok) {
        const error = await response.json();
        console.error("[useRepairPets] ERROR:", error);
        throw new Error(error.error || "Failed to repair pets");
      }

      const result = await response.json();
      console.log("[useRepairPets] ========================================");
      console.log("[useRepairPets] ✅ Repair completed:", result);
      console.log("[useRepairPets] Repaired", result.repaired, "pet(s)");
      console.log("[useRepairPets] ========================================");

      return result;
    },
    onSuccess: (data) => {
      console.log("[useRepairPets] Repair successful, refetching pets...");
      queryClient.invalidateQueries({ queryKey: ["pets"] });
    },
  });
}

export function useCreatePet() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (petData) => {
      console.log("[useCreatePet] Creating pet with data:", petData);

      const response = await fetch("/api/pets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
