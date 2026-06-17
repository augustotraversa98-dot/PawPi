import { useQuery } from "@tanstack/react-query";

// Real Discover data for the Search & Discover screen (ticket 2.25): popular pet
// profiles (ranked by followers/paws) + recent pet moments. Replaces the mock data.
export function useDiscover(limit = 12) {
  return useQuery({
    queryKey: ["discover", limit],
    queryFn: async () => {
      const res = await fetch(`/api/discover?limit=${limit}`);
      if (!res.ok) throw new Error("Failed to load discover");
      return res.json(); // { profiles, moments }
    },
    staleTime: 1000 * 60, // a minute is plenty for a discovery feed
  });
}
