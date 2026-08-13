// Share-card helpers (unit E4) — the @handle label + the deep link, and the deck built from REAL
// stats only. The link is derived ONLY from the public handle — NEVER from location. A card with a
// 0/absent stat is marked unavailable so the UI shows a clean empty state, never a fabricated number.

// Public deep-link base: the domain we actually own (pawpi.info) or an app-config override.
const SHARE_BASE = String(process.env.EXPO_PUBLIC_APP_URL || "https://pawpi.info").replace(/\/+$/, "");

export function petHandleLabel(handle) {
  const h = String(handle || "").replace(/^@/, "").trim();
  return h ? `@${h}` : "";
}

// Deep link back to the pet's public profile — handle only, never any location.
export function petShareUrl(handle) {
  const h = String(handle || "").replace(/^@/, "").trim();
  return h ? `${SHARE_BASE}/@${h}` : SHARE_BASE;
}

export const SHARE_TEMPLATES = [
  "milestone",
  "week_in_walks",
  "streak",
  "pet_of_the_day",
  "care_recap",
];

/**
 * Build the deck's cards from REAL data. Each card:
 *   { template, available, value?, milestone?, stub? }
 * `available:false` → the UI renders a clean empty state (or "unlock" hint); NO fake number is shown.
 * care_recap is an empty-safe STUB until E10 (monthly recap) lands.
 */
export function buildShareCards({ stats, milestone } = {}) {
  const s = stats || {};
  const streak = s.streak?.current ?? 0;
  const walks = s.walks_this_week ?? 0;
  const moments = s.moments_total ?? 0;
  return [
    { template: "milestone", available: !!milestone, milestone: milestone || null },
    { template: "week_in_walks", available: walks > 0, value: walks },
    { template: "streak", available: streak > 0, value: streak },
    // An identity/belonging badge — real photo + name, no numeric claim (needs a named pet).
    { template: "pet_of_the_day", available: !!(s.pet && s.pet.name), value: null },
    // Monthly care recap depends on E10 — ships as an empty-safe stub for now.
    { template: "care_recap", available: false, stub: true },
  ];
}
