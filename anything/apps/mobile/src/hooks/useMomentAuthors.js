import { useQuery } from "@tanstack/react-query";

// The dog profile's posts do not say who wrote them; the feed read for that dog does (`user_id`). Returns a Map of
// post id → author profile id for the dog's recent moments (the newest 100 of the dog's feed view), so a member can
// remove their own moment from the profile too. Read only while a post is open.
export function useMomentAuthors(petId, { enabled = true } = {}) {
  return useQuery({
    enabled: enabled && petId != null && petId !== "",
    // Under ["posts"] so deleting a post refreshes it.
    queryKey: ["posts", "authors", String(petId)],
    queryFn: async () => {
      const res = await fetch(`/api/posts?viewerPetId=${petId}&limit=100`);
      if (!res.ok) throw new Error("Failed to load post authors");
      const data = await res.json();
      return (data.posts ?? [])
        .filter((p) => String(p.pet_id) === String(petId) && p.item_type !== "provider_post")
        .map((p) => [p.id, p.user_id]);
    },
    select: (pairs) => new Map(pairs),
    staleTime: 60 * 1000,
  });
}
