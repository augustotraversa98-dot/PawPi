// BX4 + BN2 — the catalog of SERVER-SIDE BUSINESS notification categories AND the
// per-notification-type PUSH channel class that governs whether an in-app bell row
// also rings the phone (BN2 remote-push foundation).
//
// A *gate-backed* category (BUSINESS_NOTIFICATION_CATEGORIES) appears here ONLY when a
// real notification of that category actually fires to a business recipient (the "no
// fake toggle" rule). The TYPE → CATEGORY map (NOTIFICATION_TYPE_TO_BUSINESS_CATEGORY)
// MUST mirror the CASE in app_notify() (0108) — it is the DB gate that suppresses the
// bell row when a PUSH category is disabled; this JS copy exists for route validation
// + tests, the DB is authoritative.
//
// BN2 adds the PUSH CHANNEL CLASS per notification type (NOTIFICATION_TYPE_CHANNEL).
// Every notification ALWAYS writes an in-app bell row (app_notify); the channel class
// only decides whether the post-insert push hook (utils/push.js) ALSO rings the phone:
//   • IN_APP_ONLY   → never push.
//   • PUSH          → push unless the recipient disabled the category (absent = ON).
//                     For a PUSH category the DB gate already dropped the bell row when
//                     disabled, so if we have a bell id we push.
//   • OPTIONAL_PUSH → push only if the recipient explicitly enabled it (absent = OFF).
//
// PR1 stubs the catalog with the TYPES THAT EXIST TODAY (only the walk_request_* pair
// reaches a business recipient — a PUSH category). PR2 adds the full business catalog
// (biz_booking / biz_order / biz_message / biz_adoption_application PUSH; biz_review /
// biz_payout OPTIONAL_PUSH; biz_post_engagement / biz_follow IN_APP_ONLY) — one arm
// per type here + the emission at each route.

export const CHANNEL_CLASS = {
  IN_APP_ONLY: "IN_APP_ONLY",
  PUSH: "PUSH",
  OPTIONAL_PUSH: "OPTIONAL_PUSH",
};

// Canonical list of gate-backed business categories (drives the pref UI + validation).
export const BUSINESS_NOTIFICATION_CATEGORIES = ["walk_requests"];

// Notification type → the business category that gates it (null = owner-only / ungated).
// Kept in lockstep with the SQL CASE in app_notify().
export const NOTIFICATION_TYPE_TO_BUSINESS_CATEGORY = {
  walk_request_targeted: "walk_requests",
  walk_request_broadcast: "walk_requests",
};

// Notification type → PUSH channel class. A type ABSENT here defaults to IN_APP_ONLY:
// PawPi has never pushed, so an un-cataloged (e.g. pet-owner) type must NOT suddenly
// start ringing phones — only an explicitly-cataloged PUSH/OPTIONAL_PUSH type does.
export const NOTIFICATION_TYPE_CHANNEL = {
  walk_request_targeted: CHANNEL_CLASS.PUSH,
  walk_request_broadcast: CHANNEL_CLASS.PUSH,
};

export function isBusinessNotificationCategory(category) {
  return BUSINESS_NOTIFICATION_CATEGORIES.includes(category);
}

// The PUSH channel class for a notification type. Unknown/owner-only types are
// IN_APP_ONLY (never push) — the conservative default described above.
export function channelClassForType(type) {
  return NOTIFICATION_TYPE_CHANNEL[type] ?? CHANNEL_CLASS.IN_APP_ONLY;
}

// The business category that gates a type's push (for the OPTIONAL_PUSH pref lookup).
// null = ungated.
export function businessCategoryForType(type) {
  return NOTIFICATION_TYPE_TO_BUSINESS_CATEGORY[type] ?? null;
}
