// Unified Services-discovery category taxonomy — the MOBILE mirror of the web util
// apps/web/src/app/api/utils/discoveryCategories.js. Keys MUST stay in lockstep with it, since the
// selected category key is passed verbatim to GET /api/services/discover, which maps it to a
// provider capability or a places.category. Labels come from i18n (never hardcoded here).
//
// PROVIDER categories → the endpoint filters providers by the backing capability (the friendly key
// differs from the capability where the label differs: grooming→groomer, walking→walker,
// sitting→sitter, training→trainer). PLACE categories → the endpoint filters places.category.

// Provider categories, in chip display order. `labelKey` reuses the existing discover.cap.* catalog;
// `capability` is the backing provider_capabilities value (mirrors the web util) — the friendly key
// differs from the capability only where the label does (grooming→groomer, etc.). `capability` lets
// the pane filter providers CLIENT-side for multi-select (a provider matches a selected category when
// its capabilities include that category's capability).
//
// SPLIT BY INTENT (ticket D1/D2): the owner IA divides discovery into two hubs.
//   • STORES_VETS_CATEGORIES — "Stores & Vets" (shop/vet): things you visit or buy from.
//   • CARE_CATEGORIES        — the "Care" hub (D2): hiring someone to care for the dog.
// SERVICE_CATEGORIES stays the full union (for the label/capability maps, the key set, and the web
// mirror's lockstep). Each hub renders only its allowed slice; the endpoint contract is unchanged.
export const STORES_VETS_CATEGORIES = [
  { key: "vet", labelKey: "discover.cap.vet", capability: "vet" },
  { key: "telehealth", labelKey: "discover.cap.telehealth", capability: "telehealth" },
  { key: "grooming", labelKey: "discover.cap.groomer", capability: "groomer" },
  { key: "shop", labelKey: "discover.cap.shop", capability: "shop" },
  { key: "adoption", labelKey: "discover.cap.adoption", capability: "adoption" },
  { key: "transport", labelKey: "discover.cap.transport", capability: "transport" },
  { key: "insurance", labelKey: "discover.cap.insurance", capability: "insurance" },
];

export const CARE_CATEGORIES = [
  { key: "walking", labelKey: "discover.cap.walker", capability: "walker" },
  { key: "daycare", labelKey: "discover.cap.daycare", capability: "daycare" },
  { key: "sitting", labelKey: "discover.cap.sitter", capability: "sitter" },
  { key: "training", labelKey: "discover.cap.trainer", capability: "trainer" },
];

export const SERVICE_CATEGORIES = [...STORES_VETS_CATEGORIES, ...CARE_CATEGORIES];

export const CARE_CATEGORY_KEYS = new Set(CARE_CATEGORIES.map((c) => c.key));

// Place categories, in chip display order. New i18n keys (discover.placeCat.*).
export const PLACE_CATEGORIES = [
  { key: "restaurant", labelKey: "discover.placeCat.restaurant" },
  { key: "cafe", labelKey: "discover.placeCat.cafe" },
  { key: "bakery", labelKey: "discover.placeCat.bakery" },
  { key: "brewery", labelKey: "discover.placeCat.brewery" },
  { key: "bar", labelKey: "discover.placeCat.bar" },
  { key: "park", labelKey: "discover.placeCat.park" },
  { key: "hotel", labelKey: "discover.placeCat.hotel" },
  { key: "market", labelKey: "discover.placeCat.market" },
];

export const PROVIDER_CATEGORY_KEYS = new Set(SERVICE_CATEGORIES.map((c) => c.key));
export const PLACE_CATEGORY_KEYS = new Set(PLACE_CATEGORIES.map((c) => c.key));

// Legacy / capability aliases still arriving via deep links (the retired grid pushed
// ?category=veterinary / shops; older chips used capability keys). Resolve → a taxonomy key.
const CATEGORY_ALIASES = {
  veterinary: "vet",
  shops: "shop",
  groomer: "grooming",
  walker: "walking",
  sitter: "sitting",
  trainer: "training",
  pharmacy: "shop",
};

// Resolve a raw ?category deep-link value into a valid chip key; unknown → "all". When `allowedKeys`
// (a Set of the hub's rendered chip keys) is given, a resolved key that isn't shown on this hub —
// e.g. a legacy care deep-link (?category=walker) landing on Stores & Vets — falls back to "all"
// gracefully rather than seeding a chip the hub can't display. (D2 routes care deep-links to Care.)
export function resolveInitialCategory(raw, allowedKeys = null) {
  let resolved = "all";
  if (typeof raw === "string") {
    if (raw === "all") resolved = "all";
    else if (PROVIDER_CATEGORY_KEYS.has(raw) || PLACE_CATEGORY_KEYS.has(raw)) resolved = raw;
    else if (CATEGORY_ALIASES[raw]) resolved = CATEGORY_ALIASES[raw];
  }
  if (resolved !== "all" && allowedKeys && !allowedKeys.has(resolved)) return "all";
  return resolved;
}
