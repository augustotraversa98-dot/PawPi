import { useQuery } from "@tanstack/react-query";

// Real date-ranged Vet Summary aggregation (ticket 2.50). Owner+pet scoped server-side.
export function useVetSummary(petId, from, to, enabled = true) {
  return useQuery({
    queryKey: ["vet-summary", petId, from, to],
    queryFn: async () => {
      const params = new URLSearchParams({ petId: String(petId), from, to });
      const res = await fetch(`/api/vet-record/full-summary?${params}`);
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || "Failed to load summary");
      }
      return (await res.json()).summary;
    },
    enabled: !!petId && !!from && !!to && enabled,
    staleTime: 1000 * 60,
  });
}
