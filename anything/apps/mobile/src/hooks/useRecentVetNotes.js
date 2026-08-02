import { useQuery } from "@tanstack/react-query";

// Vet-authored notes on a pet's record, used to give the owner an awareness
// signal in the notifications bell when a vet adds a note (Flow A). Owner-scoped
// by the route; "vet-authored" = vet_name present (owner entries carry no
// vet_name). There is no read-state store and no migration, so the bell bounds
// these by recency (see notifications.jsx) — a note ages out naturally instead of
// staying unread forever. Scoped to one pet because the notes API is per-pet.
export function useRecentVetNotes(petId) {
  return useQuery({
    queryKey: ["recent-vet-notes", petId],
    enabled: !!petId,
    staleTime: 1000 * 60,
    queryFn: async () => {
      const res = await fetch(
        `/api/vet-record/notes?petId=${encodeURIComponent(petId)}`,
      );
      if (!res.ok) throw new Error("Failed to load vet notes");
      const data = await res.json();
      return data.notes ?? [];
    },
  });
}
