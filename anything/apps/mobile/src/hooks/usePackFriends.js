// usePackFriends — the dog FRIENDS a pack streak can be started with, searchable by pet name,
// @handle or owner name (GET /api/pets/[id]/pack-friends?q=). Server-side because the friend set
// (accepted friendship or mutual follow, minus blocks) is computed under the caller's identity.

import { useQuery } from "@tanstack/react-query";

export function packFriendsKey(petId, q) {
  return ["pack-friends", petId, q];
}

export function usePackFriends(petId, q, { enabled = true } = {}) {
  const term = (q || "").trim();
  return useQuery({
    queryKey: packFriendsKey(petId, term),
    enabled: !!petId && enabled,
    staleTime: 15 * 1000,
    queryFn: async () => {
      const res = await fetch(
        `/api/pets/${petId}/pack-friends${term ? `?q=${encodeURIComponent(term)}` : ""}`,
      );
      if (!res.ok) throw new Error("Failed to load friends");
      const data = await res.json();
      return Array.isArray(data.friends) ? data.friends : [];
    },
  });
}
