// Shared pet-friendly PLACE review vocabulary for the mobile UI — the client mirror of the backend
// utils/placeReviews.js (migration 0074). The KEYS here must stay in lockstep with the backend
// (POST /api/places/[placeId]/reviews validates against those exact strings and the DB CHECK
// enforces them). Only key + display icon live here; the human LABELS come from i18n
// (placeReviews.welcome.* / placeReviews.amenity.*), never hardcoded.

// Pet-welcome tiers, ordered BEST → LEAST welcoming (the order the picker + distribution render in).
// Must match VALID_PET_WELCOME_LEVELS on the backend exactly.
export const PET_WELCOME_LEVELS = [
  { key: "royalty", icon: "👑" },
  { key: "very_welcoming", icon: "😊" },
  { key: "allowed", icon: "🐾" },
  { key: "patio_only", icon: "⛱️" },
  { key: "not_for_pets", icon: "🚫" },
];

// The 9 amenity tags an owner can attach to a review. Must match VALID_PLACE_AMENITIES on the
// backend exactly. The icon is only for display (chips + aggregate tallies).
export const PLACE_AMENITIES = [
  { key: "water_bowls", icon: "🥣" },
  { key: "treats", icon: "🦴" },
  { key: "pet_menu", icon: "🍽️" },
  { key: "indoor_allowed", icon: "🏠" },
  { key: "outdoor_patio", icon: "🪑" },
  { key: "off_leash_area", icon: "🐕" },
  { key: "poop_bags", icon: "💩" },
  { key: "shade_ac", icon: "❄️" },
  { key: "size_or_breed_limits", icon: "📏" },
];

// Quick lookups by key (aggregate tallies / distribution arrive keyed, not ordered).
export const WELCOME_LEVEL_BY_KEY = Object.fromEntries(
  PET_WELCOME_LEVELS.map((l) => [l.key, l]),
);
export const AMENITY_BY_KEY = Object.fromEntries(
  PLACE_AMENITIES.map((a) => [a.key, a]),
);
