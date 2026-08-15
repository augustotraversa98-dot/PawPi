// BX4 — the catalog of SERVER-SIDE, gate-backed BUSINESS notification categories.
//
// A category appears here ONLY when a real notification of that category actually
// fires to a business recipient today (the "no fake toggle" rule). The audit behind
// this list (see supabase/migrations/0108_notification_prefs.sql):
//   • walk_requests — walk_request_targeted + walk_request_broadcast land on a
//     WALKER's active staff. This is the sole business-recipient path in the app.
//   Regular provider bookings do not notify the provider; chat/reviews/payouts fire
//   no notification at all — so none of those get a category until they do.
//
// The TYPE → CATEGORY mapping below MUST mirror the CASE in app_notify() (0108);
// it exists here for route validation + tests, not as the gate itself (the DB is
// authoritative). Adding a future business event = one arm in both places + a row.

// Canonical list of gate-backed business categories.
export const BUSINESS_NOTIFICATION_CATEGORIES = ["walk_requests"];

// Notification type → the business category that gates it (null = owner-only /
// ungated). Kept in lockstep with the SQL CASE in app_notify().
export const NOTIFICATION_TYPE_TO_BUSINESS_CATEGORY = {
  walk_request_targeted: "walk_requests",
  walk_request_broadcast: "walk_requests",
};

export function isBusinessNotificationCategory(category) {
  return BUSINESS_NOTIFICATION_CATEGORIES.includes(category);
}
