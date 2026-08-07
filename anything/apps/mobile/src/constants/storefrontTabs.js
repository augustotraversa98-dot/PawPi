// Presence-aware storefront tab resolver (Storefront redesign — Phase 1, PR-1). PURE: no
// hooks, no fetch. Given the already-fetched public-profile shape, it returns the ordered
// tabs for the Rappi-style shell. It mirrors the SAME shop/bookable axis the provider
// screen's capability→CTA block uses (SHOP_CAPS / BOOKABLE_CAPS), so the tab order matches
// the primary action — but it NEVER changes CTA behavior. It only decides which section
// panels are shown and in what order. A tab appears only when its data exists; Reviews and
// About are always present (Reviews is the store header's tappable-rating jump target).

// Kept in sync with the same-named lists in app/service/provider.jsx (the CTA block owns the
// canonical copy; these drive tab ordering only).
export const BOOKABLE_CAPS = [
  "vet",
  "groomer",
  "telehealth",
  "walker",
  "sitter",
  "daycare",
  "trainer",
];
export const SHOP_CAPS = ["shop", "pharmacy"];

// Panel key → i18n label key (storefront.tabs.*). Tab keys are generic section names, so
// they use the storefront.tabs.* namespace (not discover.cap.*, which labels capabilities).
export const STOREFRONT_TAB_LABELS = {
  services: "storefront.tabs.services",
  items: "storefront.tabs.items",
  posts: "storefront.tabs.posts",
  reviews: "storefront.tabs.reviews",
  locations: "storefront.tabs.locations",
  about: "storefront.tabs.about",
};

// Resolve the ordered storefront tabs for a provider's public profile.
// Returns [{ key, labelKey, panel }] — key/panel are the same generic section id.
export function getStorefrontTabs({
  capabilities = [],
  locations = [],
  services = [],
  products = [],
  posts = [],
} = {}) {
  // Same axis as the screen's CTA block: a SHOP holds a shop/pharmacy capability OR any
  // product; a BOOKABLE provider holds any bookable capability.
  const isShop =
    capabilities.some((c) => SHOP_CAPS.includes(c)) || products.length > 0;
  const hasBookable = capabilities.some((c) => BOOKABLE_CAPS.includes(c));

  // Presence predicates — a section tab is included only when its data exists (so the shell
  // never shows an empty/fake section). Reviews + About are always available.
  const has = {
    services: services.length > 0,
    items: products.length > 0,
    posts: posts.length > 0,
    locations: locations.length > 0,
    reviews: true,
    about: true,
  };

  // Canonical order per archetype (mirrors showShop/showBook). shop-first and fallback fold
  // locations into About (no separate Locations tab); bookable and mixed give it its own tab.
  let order;
  if (isShop && hasBookable) {
    // mixed: services + a store
    order = ["services", "items", "posts", "reviews", "locations", "about"];
  } else if (isShop) {
    // shop-first (includes the Instagram / "social shop": shop cap or products, no services)
    order = ["items", "posts", "reviews", "about"];
  } else if (hasBookable) {
    // bookable
    order = ["services", "posts", "reviews", "locations", "about"];
  } else {
    // fallback (no known capability) — matches today's showBook fallback
    order = ["services", "posts", "reviews", "about"];
  }

  return order
    .filter((key) => has[key])
    .map((key) => ({ key, labelKey: STOREFRONT_TAB_LABELS[key], panel: key }));
}
