// Notifications v2 — the PET-OWNER notification preference catalog (docs/notifications-v2-design.md).
//
// Stored in the existing notification_prefs table (0108: user_id, category, enabled), so adding a category
// never needs a migration. Business categories live in notificationCategories.js and are untouched.
//
// `channel`      'email' | 'push'
// `promotional`  App Store guideline 4.5.4: promotional pushes/emails need EXPLICIT opt-in, so promotional
//                categories default OFF; transactional ones (something the owner asked for or a reply to their
//                own action) default ON.
// A category is exposed by GET/PUT /api/notification-prefs only while NOTIF_V2_ENABLED is on.

export const OWNER_NOTIFICATION_CATALOG = [
  { key: "winback_email", channel: "email", promotional: true, defaultEnabled: false },
  // PR 3b — the weekly digest and the win-back become a real PHONE push only for owners who opt in.
  { key: "weekly_digest_push", channel: "push", promotional: true, defaultEnabled: false },
  { key: "winback_push", channel: "push", promotional: true, defaultEnabled: false },
];

export const OWNER_NOTIFICATION_CATEGORIES = OWNER_NOTIFICATION_CATALOG.map((c) => c.key);

const BY_KEY = Object.fromEntries(OWNER_NOTIFICATION_CATALOG.map((c) => [c.key, c]));

export function isOwnerNotificationCategory(category) {
  return typeof category === "string" && Object.prototype.hasOwnProperty.call(BY_KEY, category);
}

/** Effective value when the owner has no stored row: transactional ON, promotional OFF. */
export function ownerCategoryDefault(category) {
  return BY_KEY[category]?.defaultEnabled === true;
}

/** { category: boolean } for every owner category, from a Map/Object of stored rows. */
export function resolveOwnerPrefs(stored) {
  const get = (k) => (stored instanceof Map ? stored.get(k) : stored?.[k]);
  const out = {};
  for (const c of OWNER_NOTIFICATION_CATALOG) {
    const v = get(c.key);
    out[c.key] = typeof v === "boolean" ? v : c.defaultEnabled;
  }
  return out;
}
