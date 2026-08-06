// placeReviews — shared vocabulary for pet-friendly PLACE reviews (migration 0074).
//
// Mirrors careAccess.js's VALID_CARE_SCOPES: a SINGLE source of truth the client and server both
// import, so a review can never store a pet-welcome tier or an amenity tag the other side won't
// recognize. The API route (POST /api/places/[placeId]/reviews) validates every submitted value
// against these lists before any write, and the DB CHECK on place_reviews.pet_welcome_level mirrors
// VALID_PET_WELCOME_LEVELS exactly.

// The enumerated pet-welcome tiers, best → least welcoming. Must stay in lockstep with the
// place_reviews.pet_welcome_level CHECK constraint (0074).
export const VALID_PET_WELCOME_LEVELS = [
  'royalty',
  'very_welcoming',
  'allowed',
  'patio_only',
  'not_for_pets',
];

// The enumerated amenity tags an owner can attach to a place review.
export const VALID_PLACE_AMENITIES = [
  'water_bowls',
  'treats',
  'pet_menu',
  'indoor_allowed',
  'outdoor_patio',
  'off_leash_area',
  'poop_bags',
  'shade_ac',
  'size_or_breed_limits',
];
