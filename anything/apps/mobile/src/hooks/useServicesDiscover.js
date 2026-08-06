import { useQuery } from "@tanstack/react-query";

// Unified Services discovery — GET /api/services/discover → { items: [...] }, one merged, typed
// list of PawPi PROVIDERS + pet-friendly PLACES (see the web route for the item shape). Replaces
// the provider-only useDiscoverProviders on the Discover pane and the paid Google places browser.
//
// Params (all optional): { q, category, neighborhood, lat, lng, radius }. `category` is a unified
// taxonomy key (constants/servicesCategories.js) routed server-side to a provider capability or a
// places.category; "all" (or omitted) returns both sources. `neighborhood` filters PLACES only
// (providers are city-wide). lat/lng attach distance_km + nearest-first ordering. Every param is
// part of the query key so distinct filters cache independently.
export function useServicesDiscover({ q, category, neighborhood, lat, lng, radius } = {}) {
  return useQuery({
    queryKey: [
      "services-discover",
      { q, category, neighborhood, lat, lng, radius },
    ],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (category && category !== "all") params.set("category", category);
      if (neighborhood) params.set("neighborhood", neighborhood);
      if (lat != null && lng != null) {
        params.set("lat", String(lat));
        params.set("lng", String(lng));
        if (radius != null) params.set("radius", String(radius));
      }
      const qs = params.toString();
      const res = await fetch(`/api/services/discover${qs ? `?${qs}` : ""}`);
      if (!res.ok) throw new Error("Failed to fetch discovery");
      const data = await res.json();
      return data.items ?? [];
    },
  });
}
