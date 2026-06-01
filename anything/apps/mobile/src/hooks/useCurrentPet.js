import { useQuery } from "@tanstack/react-query";

// Hook to get the user's first/current pet
// For now, we just get the first pet from the user's pet list
// Later this can be expanded to support multi-pet selection
export function useCurrentPet() {
  return useQuery({
    queryKey: ["pets", "current"],
    queryFn: async () => {
      const response = await fetch("/api/pets");
      if (!response.ok) {
        throw new Error("Failed to fetch pets");
      }
      const data = await response.json();

      // Return the first pet, or null if no pets
      return data.pets && data.pets.length > 0 ? data.pets[0] : null;
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}
