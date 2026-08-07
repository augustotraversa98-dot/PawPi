// MIRROR of apps/mobile/src/constants/storefrontTabs.js — keep in lockstep. This is a
// VERBATIM port (archetype resolution + presence filter + sectionOrder override/validation)
// so the web "view-as-customer" preview (Storefront Phase 2b) orders sections EXACTLY like
// the mobile shell renders them. Same convention as servicesCategories.js mirroring the web
// discoveryCategories util: the two files must not drift. PURE — no hooks, no fetch, no React.

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
//
// sectionOrder (provider.storefront_section_order, Phase 2a) is an OPTIONAL per-provider
// override. When a non-empty array, it reorders the sections this archetype allows: keys
// are honored in the given order, but VALIDATED against the archetype's allowed + present
// sections (unknown / removed / empty keys are dropped), and any allowed-but-missing
// section — e.g. a first-ever product the owner never arranged — is appended in the default
// order. NULL / absent → today's archetype default, unchanged.
export function getStorefrontTabs({
  capabilities = [],
  locations = [],
  services = [],
  products = [],
  posts = [],
  sectionOrder = null,
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

  // Default result: the archetype's allowed sections that have data (today's behavior).
  const allowed = order.filter((key) => has[key]);

  // Optional per-provider override — reorder `allowed` by sectionOrder, drop anything not
  // allowed/present, then append any allowed sections the override left out (default order).
  let resolved = allowed;
  if (Array.isArray(sectionOrder) && sectionOrder.length > 0) {
    const allowedSet = new Set(allowed);
    const seen = new Set();
    const overrideOrdered = [];
    for (const key of sectionOrder) {
      if (allowedSet.has(key) && !seen.has(key)) {
        seen.add(key);
        overrideOrdered.push(key);
      }
    }
    const missing = allowed.filter((key) => !seen.has(key));
    resolved = [...overrideOrdered, ...missing];
  }

  return resolved.map((key) => ({
    key,
    labelKey: STOREFRONT_TAB_LABELS[key],
    panel: key,
  }));
}
