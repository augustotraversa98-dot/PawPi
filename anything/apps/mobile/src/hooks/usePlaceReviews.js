import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

// Hooks for the pet-friendly PLACE detail + reviews surface (drill-in from Services discovery).
// All data is PawPi's OWN — the places catalog (0075) and place_reviews (0074) — NEVER Google.
// Pattern mirrors useProviders / useCareAccessGrants: relative fetch("/api/..."), a query key,
// throw on !res.ok. Detail/reviews are disabled until an id is known so a screen without an id
// never fetches.

// One published place from PawPi's catalog. GET /api/places/[id] → { place }.
export function usePlaceDetail(id) {
  return useQuery({
    queryKey: ["place-detail", id],
    enabled: id != null && id !== "",
    queryFn: async () => {
      const res = await fetch(`/api/places/${encodeURIComponent(id)}`);
      if (!res.ok) throw new Error("Failed to load place");
      const data = await res.json();
      return data.place ?? null;
    },
  });
}

// A place's community reviews + public aggregates. GET /api/places/[id]/reviews →
// { reviews, aggregates }. Returned verbatim so the screen reads both.
export function usePlaceReviews(id) {
  return useQuery({
    queryKey: ["place-reviews", id],
    enabled: id != null && id !== "",
    queryFn: async () => {
      const res = await fetch(`/api/places/${encodeURIComponent(id)}/reviews`);
      if (!res.ok) throw new Error("Failed to load reviews");
      return res.json(); // { reviews, aggregates }
    },
  });
}

// Upsert the caller's single review for this place (backend ON CONFLICT (owner_user_id, place_id)).
// POST /api/places/[id]/reviews. On success, invalidate this place's reviews so the new rating +
// aggregates appear immediately. mutate(body) where body = { overall_rating, pet_welcome_level,
// amenities, comment?, place_name, place_category? } (place_name is required by the backend).
export function useSubmitPlaceReview(id) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body) => {
      const res = await fetch(`/api/places/${encodeURIComponent(id)}/reviews`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.error || "Failed to submit review");
      }
      return res.json(); // { review }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["place-reviews", id] });
    },
  });
}
