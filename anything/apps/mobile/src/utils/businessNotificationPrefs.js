// businessNotificationPrefs — the business-mode notification settings (BX4).
//
// Unlike the pet-owner E5 categories (client-side, AsyncStorage — notificationPreferences.js),
// business categories are SERVER-BACKED: they gate real, server-sent notifications, so the
// toggle has to live where the sender can read it. This helper talks to the owner-scoped
// GET/PUT /api/notification-prefs (migration 0108). Never throws — Settings must always render.
//
// A category appears here ONLY when a real notification of that category actually fires to a
// business recipient today (the "no fake toggle" rule). The audit (see
// supabase/migrations/0108_notification_prefs.sql): the sole business-recipient path in the app
// is a walk request landing on a walker's active staff — so the only category is `walk_requests`.
// Booking-to-provider, chat, reviews and payouts fire no business notification yet; when one
// does, add its category here + an arm in app_notify()'s CASE.

// Icon is resolved in the component (keeps this module free of the RN icon import). The
// labels/hints are i18n keys under `bizNotif.*` (EN + ES).
export const BUSINESS_NOTIF_CATEGORIES = [
  {
    key: "walk_requests",
    labelKey: "bizNotif.walkRequests",
    hintKey: "bizNotif.walkRequestsHint",
  },
];

/**
 * Load the caller's server-side business notification prefs.
 * Returns a { [category]: boolean } map; fail-open (missing => enabled). Never throws.
 * @returns {Promise<Record<string, boolean>>}
 */
export async function getBusinessNotificationPrefs() {
  const fallback = defaultsAllEnabled();
  try {
    const res = await fetch("/api/notification-prefs");
    if (!res.ok) return fallback;
    const data = await res.json();
    const prefs = data && typeof data.prefs === "object" ? data.prefs : {};
    // Merge over the fail-open defaults so an omitted category still reads enabled.
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

function defaultsAllEnabled() {
  const prefs = {};
  for (const c of BUSINESS_NOTIF_CATEGORIES) prefs[c.key] = true;
  return prefs;
}
