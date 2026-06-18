import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

// Pet-friendly places (ticket 2.73). The place DATA comes from a key-gated PawPi web proxy
// (/api/places/*) that talks to Google — the app NEVER calls Google directly and never holds the
// key. When the key is unset the proxy returns { configured: false } so the UI degrades cleanly.
// Favorites (saved_places) are owner-scoped.

export function usePlacesSearch({ lat, lng, category }) {
  return useQuery({
    queryKey: ["places-search", lat, lng, category],
    enabled: lat != null && lng != null,
    queryFn: async () => {
      const qs = new URLSearchParams({
        lat: String(lat),
        lng: String(lng),
        category: category || "park",
      });
      const res = await fetch(`/api/places/search?${qs}`);
      if (!res.ok) throw new Error("Failed to search places");
      return res.json(); // { configured, places }
    },
  });
}

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
