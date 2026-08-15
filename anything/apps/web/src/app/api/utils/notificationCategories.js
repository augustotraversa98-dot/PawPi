// BX4 + BN2 — the shared BUSINESS notification catalog: the categories, their PUSH
// channel class, and the notification-type ↔ category mapping that the send-hook
// (utils/push.js) and the preferences route/UI all read from.
//
// MODEL (BN2, design of record — docs/business-provider.md):
//   • Every business notification ALWAYS writes an in-app bell row (app_notify).
//   • The category's CHANNEL CLASS + the recipient's notification_prefs decide whether
//     it ALSO rings the phone (the push hook):
//       - IN_APP_ONLY   → never push (engagement: post activity, followers).
//       - PUSH          → push unless the recipient disabled the category (absent = ON).
//       - OPTIONAL_PUSH → push only if the recipient explicitly enabled it (absent = OFF).
//
// A category is TOGGLEABLE (appears in the settings UI + the prefs route) when it is
// PUSH or OPTIONAL_PUSH. IN_APP_ONLY categories are informational (shown, never a toggle).
//
// The walk_request_* pair keeps its ORIGINAL BX4 category key `walk_requests` (shipped in
// 0108) rather than the design's `biz_walk_job` label, so no pref rows migrate. app_notify()
// (0108) still gates ONLY `walk_requests` at the DB (disabling suppresses the bell) — a
// harmless legacy quirk; the new categories follow the BN2 model (bell always writes, push
// gated in the JS layer via notification_prefs), so their bell is never suppressed.

export const CHANNEL_CLASS = {
  IN_APP_ONLY: "IN_APP_ONLY",
  PUSH: "PUSH",
  OPTIONAL_PUSH: "OPTIONAL_PUSH",
};

// The catalog — the single source of truth. `push` is the default when no pref row exists
// (PUSH → on, OPTIONAL_PUSH → off, IN_APP_ONLY → never). Ordered as the settings UI groups them.
export const BUSINESS_CATEGORY_CATALOG = [
  { key: "walk_requests", channelClass: CHANNEL_CLASS.PUSH },
  { key: "biz_booking", channelClass: CHANNEL_CLASS.PUSH },
  { key: "biz_booking_change", channelClass: CHANNEL_CLASS.PUSH },
  { key: "biz_order", channelClass: CHANNEL_CLASS.PUSH },
  { key: "biz_message", channelClass: CHANNEL_CLASS.PUSH },
  { key: "biz_adoption_application", channelClass: CHANNEL_CLASS.PUSH },
  { key: "biz_review", channelClass: CHANNEL_CLASS.OPTIONAL_PUSH },
  { key: "biz_payout", channelClass: CHANNEL_CLASS.OPTIONAL_PUSH },
  { key: "biz_post_engagement", channelClass: CHANNEL_CLASS.IN_APP_ONLY },
  { key: "biz_follow", channelClass: CHANNEL_CLASS.IN_APP_ONLY },
];

const CATEGORY_CHANNEL_CLASS = Object.fromEntries(
  BUSINESS_CATEGORY_CATALOG.map((c) => [c.key, c.channelClass]),
);

// The TOGGLEABLE categories (PUSH + OPTIONAL_PUSH) — what the prefs route validates/returns
// and the settings UI lets the user switch. IN_APP_ONLY categories are info-only.
export const BUSINESS_NOTIFICATION_CATEGORIES = BUSINESS_CATEGORY_CATALOG.filter(
  (c) => c.channelClass !== CHANNEL_CLASS.IN_APP_ONLY,
).map((c) => c.key);

// Notification type → the category that gates it. Kept in lockstep with app_notify()'s CASE
// for the DB-gated `walk_requests` pair; the rest gate in the JS push layer only.
export const NOTIFICATION_TYPE_TO_BUSINESS_CATEGORY = {
  walk_request_targeted: "walk_requests",
  walk_request_broadcast: "walk_requests",
  biz_booking: "biz_booking",
  biz_booking_change: "biz_booking_change",
  biz_order: "biz_order",
  biz_message: "biz_message",
  biz_adoption_application: "biz_adoption_application",
  biz_review: "biz_review",
  biz_payout: "biz_payout",
  biz_post_engagement: "biz_post_engagement",
  biz_follow: "biz_follow",
};

export function isBusinessNotificationCategory(category) {
  return BUSINESS_NOTIFICATION_CATEGORIES.includes(category);
}

// The business category that gates a type's push (null = ungated / owner-only pet type).
export function businessCategoryForType(type) {
  return NOTIFICATION_TYPE_TO_BUSINESS_CATEGORY[type] ?? null;
}

// The PUSH channel class for a notification type. An un-cataloged (e.g. pet-owner) type is
// IN_APP_ONLY — PawPi has never pushed, so nothing rings the phone unless the catalog says so.
export function channelClassForType(type) {
  const category = businessCategoryForType(type);
  if (!category) return CHANNEL_CLASS.IN_APP_ONLY;
  return CATEGORY_CHANNEL_CLASS[category] ?? CHANNEL_CLASS.IN_APP_ONLY;
}

// The fail-open default for a category when the recipient has no pref row: PUSH → ON,
// OPTIONAL_PUSH → OFF, (IN_APP_ONLY isn't toggleable, but returns false defensively).
export function categoryDefaultEnabled(category) {
  return CATEGORY_CHANNEL_CLASS[category] === CHANNEL_CLASS.PUSH;
}
