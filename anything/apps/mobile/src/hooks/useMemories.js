import { useQuery } from "@tanstack/react-query";

// Memories & Wrapped data (ticket 2.49) — the active pet's daily-post history (image + date),
// which the pure helpers in @/utils/memoriesWrapped aggregate into On-this-day / milestones /
// Wrapped.

export function usePetHistory(petId) {
  return useQuery({
    queryKey: ["pet-history", petId],
    queryFn: async () => {
      const res = await fetch(`/api/posts/history?petId=${petId}`);
      if (!res.ok) throw new Error("Failed to load history");
      return (await res.json()).posts || [];
    },
    enabled: !!petId,
    staleTime: 1000 * 60 * 5,
  });
}
