// businessNotificationPrefs — the business-mode notification catalog + settings (BX4 + BN2).
//
// Unlike the pet-owner E5 categories (client-side, AsyncStorage — notificationPreferences.js),
// business categories are SERVER-BACKED: they gate real, server-sent notifications, so the
// toggle has to live where the sender can read it. This helper talks to the owner-scoped
// GET/PUT /api/notification-prefs (migration 0108). Never throws — Settings must always render.
//
// BN2 (2026-08-15) turned the single walk-request category into the full business catalog and
// added a PUSH CHANNEL CLASS per category (mirrors the web catalog notificationCategories.js):
//   • push     — "Notify my phone": rings the phone unless turned off (default ON).
//   • optional — "Optional push": review / payout, default OFF (opt-in).
//   • inapp    — "In-app only": post activity / followers — always a bell, never a push (no toggle).
//
// Every category ALWAYS writes an in-app bell; the toggle only governs the phone push. The
// settings UI (PR3) groups them by `group`; the send layer (web) respects the stored pref.

export const CHANNEL_GROUP = { PUSH: "push", OPTIONAL: "optional", INAPP: "inapp" };

// The full catalog — the single source of truth for the settings UI. Labels/hints are i18n
// keys under `bizNotif.*` (EN + ES). Icon is resolved in the component (keeps this module free
// of the RN icon import).
export const BUSINESS_NOTIF_CATALOG = [
  // ── Notify my phone (PUSH, default ON) ──
  { key: "walk_requests", group: CHANNEL_GROUP.PUSH, labelKey: "bizNotif.walkRequests", hintKey: "bizNotif.walkRequestsHint" },
  { key: "biz_booking", group: CHANNEL_GROUP.PUSH, labelKey: "bizNotif.booking", hintKey: "bizNotif.bookingHint" },
  { key: "biz_booking_change", group: CHANNEL_GROUP.PUSH, labelKey: "bizNotif.bookingChange", hintKey: "bizNotif.bookingChangeHint" },
  { key: "biz_order", group: CHANNEL_GROUP.PUSH, labelKey: "bizNotif.order", hintKey: "bizNotif.orderHint" },
  { key: "biz_message", group: CHANNEL_GROUP.PUSH, labelKey: "bizNotif.message", hintKey: "bizNotif.messageHint" },
  { key: "biz_adoption_application", group: CHANNEL_GROUP.PUSH, labelKey: "bizNotif.adoptionApplication", hintKey: "bizNotif.adoptionApplicationHint" },
  // ── Optional push (OPTIONAL_PUSH, default OFF) ──
  { key: "biz_review", group: CHANNEL_GROUP.OPTIONAL, labelKey: "bizNotif.review", hintKey: "bizNotif.reviewHint" },
  { key: "biz_payout", group: CHANNEL_GROUP.OPTIONAL, labelKey: "bizNotif.payout", hintKey: "bizNotif.payoutHint" },
  // ── In-app only (IN_APP_ONLY, no toggle — shown for transparency) ──
  { key: "biz_post_engagement", group: CHANNEL_GROUP.INAPP, labelKey: "bizNotif.postEngagement", hintKey: "bizNotif.postEngagementHint" },
  { key: "biz_follow", group: CHANNEL_GROUP.INAPP, labelKey: "bizNotif.follow", hintKey: "bizNotif.followHint" },
];

// The TOGGLEABLE categories (push + optional) — what the API accepts and the switches control.
// (The current flat settings list renders these; PR3 groups them + adds the in-app-only info row.)
export const BUSINESS_NOTIF_CATEGORIES = BUSINESS_NOTIF_CATALOG.filter(
  (c) => c.group !== CHANNEL_GROUP.INAPP,
);

// The IN-APP-ONLY info categories (displayed, never toggled).
export const BUSINESS_NOTIF_INFO_CATEGORIES = BUSINESS_NOTIF_CATALOG.filter(
  (c) => c.group === CHANNEL_GROUP.INAPP,
);

// Per-category default when the recipient has no stored pref: push → ON, optional → OFF.
export function categoryDefaultEnabled(category) {
  const row = BUSINESS_NOTIF_CATALOG.find((c) => c.key === category);
  return row?.group === CHANNEL_GROUP.PUSH;
}

/**
 * Load the caller's server-side business notification prefs.
 * Returns a { [category]: boolean } map over the TOGGLEABLE categories; per-category default
 * (push→on, optional→off) when a category is missing. Never throws.
 * @returns {Promise<Record<string, boolean>>}
 */
export async function getBusinessNotificationPrefs() {
  const fallback = defaultPrefs();
  try {
    const res = await fetch("/api/notification-prefs");
    if (!res.ok) return fallback;
    const data = await res.json();
    const prefs = data && typeof data.prefs === "object" ? data.prefs : {};
    // Merge over the per-category defaults so an omitted category still reads its default.
    return { ...fallback, ...prefs };
  } catch {
    return fallback;
  }
}

/**
 * Toggle one business category on/off server-side and return the merged map.
 * Optimistic callers update local state first; this persists the change. Never throws.
 * @param {string} category one of BUSINESS_NOTIF_CATEGORIES[].key
 * @param {boolean} enabled
 * @returns {Promise<Record<string, boolean>>}
 */
export async function setBusinessCategoryEnabled(category, enabled) {
  const current = await getBusinessNotificationPrefs();
  if (!BUSINESS_NOTIF_CATEGORIES.some((c) => c.key === category)) return current;
  const next = { ...current, [category]: !!enabled };
  try {
    await fetch("/api/notification-prefs", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category, enabled: !!enabled }),
    });
  } catch {
    // Best-effort; the optimistic/local value is still returned.
  }
  return next;
}

function defaultPrefs() {
  const prefs = {};
  for (const c of BUSINESS_NOTIF_CATEGORIES) prefs[c.key] = categoryDefaultEnabled(c.key);
  return prefs;
}
