// discoveryCategories — the SHARED unified category taxonomy for the Services discovery surface
// (GET /api/services/discover). The single source of truth mapping each user-facing category to its
// backing source, mirroring the placeReviews / careAccess vocab pattern (one const imported by both
// the route and its tests, so the two can never drift).
//
// Two kinds of category:
//   • PROVIDER categories → a provider CAPABILITY filter (providers are city-wide services). The
//     category KEY is the human/URL name; `capability` is the underlying provider_capabilities value
//     (a mirror of ALLOWED_CAPABILITIES in providerAuth.js) — they differ where the friendly name
//     differs from the capability key (grooming→groomer, walking→walker, sitting→sitter,
//     training→trainer).
//   • PLACE categories → a places.category value (venues are physical spots).
//
// `all` (or an omitted category) returns BOTH sources. Any category NOT in this map resolves to
// neither source (an unknown filter matches nothing), which the route surfaces as an empty list.

// category key → { source: 'provider', capability } for provider (capability-backed) categories.
export const PROVIDER_CATEGORIES = {
  vet: { source: 'provider', capability: 'vet' },
  telehealth: { source: 'provider', capability: 'telehealth' },
  grooming: { source: 'provider', capability: 'groomer' },
  walking: { source: 'provider', capability: 'walker' },
  daycare: { source: 'provider', capability: 'daycare' },
  sitting: { source: 'provider', capability: 'sitter' },
  training: { source: 'provider', capability: 'trainer' },
  shop: { source: 'provider', capability: 'shop' },
  adoption: { source: 'provider', capability: 'adoption' },
  transport: { source: 'provider', capability: 'transport' },
  insurance: { source: 'provider', capability: 'insurance' },
};

// category key → { source: 'place', placeCategory } for place (venue-backed) categories. Each
// placeCategory is an exact match against places.category (0075).
export const PLACE_CATEGORIES = {
  restaurant: { source: 'place', placeCategory: 'restaurant' },
  cafe: { source: 'place', placeCategory: 'cafe' },
  bakery: { source: 'place', placeCategory: 'bakery' },
  brewery: { source: 'place', placeCategory: 'brewery' },
  bar: { source: 'place', placeCategory: 'bar' },
  park: { source: 'place', placeCategory: 'park' },
  hotel: { source: 'place', placeCategory: 'hotel' },
  market: { source: 'place', placeCategory: 'market' },
};

// The full taxonomy — every valid category key across both sources.
export const DISCOVERY_CATEGORIES = {
  ...PROVIDER_CATEGORIES,
  ...PLACE_CATEGORIES,
};

/**
 * Resolve a ?category value into a discovery plan for the route:
 *   { includeProviders, includePlaces, capability, placeCategory }
 *
 *   • null / '' / 'all'        → both sources, no capability/placeCategory cutoff
 *   • a provider category      → providers only, filtered to its capability
 *   • a place category         → places only, filtered to its placeCategory
 *   • any other (unknown) value → NEITHER source (an unknown filter matches nothing)
 */
export function resolveDiscoveryCategory(category) {
  if (category == null || category === '' || category === 'all') {
    return {
      includeProviders: true,
      includePlaces: true,
      capability: null,
      placeCategory: null,
    };
  }

  const entry = DISCOVERY_CATEGORIES[category];
  if (!entry) {
    return {
      includeProviders: false,
      includePlaces: false,
      capability: null,
      placeCategory: null,
    };
  }

  if (entry.source === 'provider') {
    return {
      includeProviders: true,
      includePlaces: false,
      capability: entry.capability,
      placeCategory: null,
    };
  }

  return {
    includeProviders: false,
    includePlaces: true,
    capability: null,
    placeCategory: entry.placeCategory,
  };
}
