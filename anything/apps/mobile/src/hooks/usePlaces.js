import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

// Saved pet-friendly places (favorites). Owner-scoped saved_places, whose text place_id holds our
// own catalog place ids. Live place DISCOVERY now flows through the unified /api/services/discover
// pane (useServicesDiscover), so the old key-gated Google search hook (usePlacesSearch) is retired —
// only the favorites hooks remain.

export function useSavedPlaces() {
  return useQuery({
    queryKey: ["saved-places"],
    queryFn: async () => {
      const res = await fetch(`/api/saved-places`);
      if (!res.ok) throw new Error("Failed to load saved places");
      const data = await res.json();
      return data.places ?? [];
    },
  });
}

export function useSavePlace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (place) => {
      const res = await fetch(`/api/saved-places`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(place),
      });
      if (!res.ok) throw new Error("Failed to save place");
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["saved-places"] }),
  });
}

export function useUnsavePlace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id) => {
      const res = await fetch(`/api/saved-places/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to remove place");
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["saved-places"] }),
  });
}
