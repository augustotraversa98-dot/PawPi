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
export const SERVICE_CATEGORIES = [
  { key: "vet", labelKey: "discover.cap.vet", capability: "vet" },
  { key: "telehealth", labelKey: "discover.cap.telehealth", capability: "telehealth" },
  { key: "grooming", labelKey: "discover.cap.groomer", capability: "groomer" },
  { key: "walking", labelKey: "discover.cap.walker", capability: "walker" },
  { key: "daycare", labelKey: "discover.cap.daycare", capability: "daycare" },
  { key: "sitting", labelKey: "discover.cap.sitter", capability: "sitter" },
  { key: "training", labelKey: "discover.cap.trainer", capability: "trainer" },
  { key: "shop", labelKey: "discover.cap.shop", capability: "shop" },
  { key: "adoption", labelKey: "discover.cap.adoption", capability: "adoption" },
  { key: "transport", labelKey: "discover.cap.transport", capability: "transport" },
  { key: "insurance", labelKey: "discover.cap.insurance", capability: "insurance" },
];

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

// Resolve a raw ?category deep-link value into a valid chip key; unknown → "all".
export function resolveInitialCategory(raw) {
  if (typeof raw === "string") {
    if (raw === "all") return "all";
    if (PROVIDER_CATEGORY_KEYS.has(raw) || PLACE_CATEGORY_KEYS.has(raw)) return raw;
    if (CATEGORY_ALIASES[raw]) return CATEGORY_ALIASES[raw];
  }
  return "all";
}
