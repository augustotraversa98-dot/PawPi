// places.js — the server-side Google Places proxy (Wave 7 ticket 2.73). The GOOGLE_PLACES_API_KEY
// lives ONLY here (web server env); the mobile client calls the PawPi /api/places routes, never
// Google directly, so the key never ships to the device. When the key is unset the feature DEGRADES
// CLEANLY — these helpers return a { configured: false } signal, never throw — so the UI shows a
// "not set up yet" state instead of crashing (the 2.21-enrichment dormant-behind-keys pattern).

const PLACES_BASE = "https://maps.googleapis.com/maps/api/place";

// Category → Google Places `type` + an optional keyword. "pet friendly" is appended as a keyword so
// results lean pet-welcoming; Google has no formal pet-friendly filter, so this is best-effort.
const CATEGORY = {
  park: { type: "park", keyword: "dog park" },
  cafe: { type: "cafe", keyword: "pet friendly cafe" },
  restaurant: { type: "restaurant", keyword: "pet friendly restaurant" },
  hotel: { type: "lodging", keyword: "pet friendly hotel" },
  beach: { type: "natural_feature", keyword: "dog beach" },
  pet_store: { type: "pet_store", keyword: "" },
  vet: { type: "veterinary_care", keyword: "" },
};

export function placesConfigured() {
  return Boolean(process.env.GOOGLE_PLACES_API_KEY);
}

function normalizePlace(r) {
  return {
    place_id: r.place_id,
    name: r.name,
    lat: r.geometry?.location?.lat ?? null,
    lng: r.geometry?.location?.lng ?? null,
    address: r.vicinity ?? r.formatted_address ?? null,
    rating: r.rating ?? null,
    user_ratings_total: r.user_ratings_total ?? null,
    open_now: r.opening_hours?.open_now ?? null,
    price_level: r.price_level ?? null,
  };
}

// Nearby pet-friendly places. Returns { configured, places }. Never throws on a config/network
// issue — a failed upstream call yields an empty list with configured=true so the UI can say
// "no results" rather than crash.
export async function searchPlaces({ lat, lng, category, radius = 5000 }, fetchImpl = fetch) {
  if (!placesConfigured()) return { configured: false, places: [] };
  const key = process.env.GOOGLE_PLACES_API_KEY;
  const cat = CATEGORY[category] || CATEGORY.park;
  const params = new URLSearchParams({
    location: `${lat},${lng}`,
    radius: String(radius),
    key,
  });
  if (cat.type) params.set("type", cat.type);
  if (cat.keyword) params.set("keyword", cat.keyword);

  try {
    const res = await fetchImpl(`${PLACES_BASE}/nearbysearch/json?${params}`);
    const data = await res.json();
    if (data.status && data.status !== "OK" && data.status !== "ZERO_RESULTS") {
      // A REQUEST_DENIED / quota error is an upstream problem, not a crash — return empty.
      return { configured: true, places: [], category };
    }
    return {
      configured: true,
      category,
      places: (data.results || []).map((r) => ({
        ...normalizePlace(r),
        category,
      })),
    };
  } catch {
    return { configured: true, places: [], category };
  }
}

// Full detail for one place. Returns { configured, place } (place null when not found/unconfigured).
export async function placeDetails(placeId, fetchImpl = fetch) {
  if (!placesConfigured()) return { configured: false, place: null };
  const key = process.env.GOOGLE_PLACES_API_KEY;
  const params = new URLSearchParams({
    place_id: placeId,
    key,
    fields:
      "place_id,name,geometry,formatted_address,formatted_phone_number,website,rating,user_ratings_total,opening_hours,url",
  });
  try {
    const res = await fetchImpl(`${PLACES_BASE}/details/json?${params}`);
    const data = await res.json();
    const r = data.result;
    if (!r) return { configured: true, place: null };
    return {
      configured: true,
      place: {
        ...normalizePlace(r),
        address: r.formatted_address ?? null,
        phone: r.formatted_phone_number ?? null,
        website: r.website ?? null,
        google_maps_url: r.url ?? null,
        hours: r.opening_hours?.weekday_text ?? null,
      },
    };
  } catch {
    return { configured: true, place: null };
  }
}
