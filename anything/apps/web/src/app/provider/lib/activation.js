// Pure activation-checklist derivations for the provider dashboard (ticket 2.99). No storage, no
// network — every item's completion is DERIVED from provider data the dashboard already reads, so
// the "Getting started" card is never a stored flag: it reflects reality and retires only when the
// business is genuinely set up. Web mirror of the mobile owner checklist (2.98).

// Item keys, in display order.
export const PROVIDER_ACTIVATION_ITEMS = [
  "profile",
  "offering",
  "hours",
  "location",
  "post",
];

// Derive the whole checklist from the provider's existing reads. Each input is the array/object an
// existing hook already returns; missing/loading → treated as empty (undone).
// Returns { items:[{key,done}], completed, total, percent, isComplete }.
export function computeProviderActivation({
  provider = null,
  services = [],
  products = [],
  windows = [],
  locations = [],
  posts = [],
} = {}) {
  const done = {
    // Complete your business profile — a logo AND a bio/description.
    profile: !!(provider?.logo_url && provider?.bio && String(provider.bio).trim()),
    // Add what you offer — at least one service OR one product.
    offering: (services?.length ?? 0) > 0 || (products?.length ?? 0) > 0,
    // Set your hours / availability — at least one open-hours window.
    hours: (windows?.length ?? 0) > 0,
    // Add a location / pin.
    location: (locations?.length ?? 0) > 0,
    // Share your first storefront post.
    post: (posts?.length ?? 0) > 0,
  };
  const items = PROVIDER_ACTIVATION_ITEMS.map((key) => ({ key, done: done[key] }));
  const total = items.length;
  const completed = items.filter((i) => i.done).length;
  const percent = total === 0 ? 0 : Math.round((completed / total) * 100);
  return { items, completed, total, percent, isComplete: completed === total };
}
