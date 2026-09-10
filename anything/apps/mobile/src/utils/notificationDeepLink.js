// Notification tap → route (AUDIT_2026-09 A-08).
//
// Two tap sources share one mapping:
//   1. In-app reminder rows on the Notifications screen (handleNotificationTap).
//   2. OS notification taps — local reminders scheduled by utils/notifications.js (data:
//      {reminderId, type, relatedTracker, relatedBodyArea}) and server pushes from
//      BN2 (data: {type, subjectRef}).
// Before this module, (1) pushed /(tabs)/health and then nothing per type (and twice on the
// default branch), and (2) had no listener at all — a push tap only foregrounded the app.
//
// Cold start: a tap that LAUNCHES the app must not navigate before the EntryPoint has made
// its own routing decision (its <Redirect> would replace the deep link). The response is
// parked until the EntryPoint calls markNavigationReady(), which flushes it.

import * as Notifications from "expo-notifications";
import { router } from "expo-router";
import { ROUTINE_TYPES } from "@/data/routinesData";

const HEALTH_ROUTE = "/(tabs)/health";
const INBOX_ROUTE = "/notifications";

// Reminder types whose home is the Vet Record section; everything else lands on Today,
// where the reminder itself is listed with its action button.
const VET_RECORD_TYPES = new Set([
  "vaccine",
  "vet_appointment",
  ROUTINE_TYPES.VACCINE,
  ROUTINE_TYPES.VET_APPOINTMENT,
]);

/** Route for a REMINDER notification (in-app row or local OS notification data). */
export function reminderTapRoute(notification) {
  const type = notification?.type;
  const section = VET_RECORD_TYPES.has(type) ? "vet-record" : "today";
  return { pathname: HEALTH_ROUTE, params: { section } };
}

/**
 * Route for the `data` payload of an OS notification tap. Reminders go to Health; every
 * server push (bookings, walk requests, messages, access requests…) opens the in-app
 * inbox, which lists it with its own tap-through. Never returns a route that does not
 * exist; returns null only when there is nothing to open.
 */
export function pushTapRoute(data) {
  if (!data || typeof data !== "object") return { pathname: INBOX_ROUTE };
  if (data.reminderId != null) return reminderTapRoute(data);
  return { pathname: INBOX_ROUTE };
}

let navigationReady = false;
let pending = null;
const delivered = new Set();

const navigate = (route) => {
  try {
    router.push(route);
  } catch {
    // Navigation must never crash the app because of a stale notification.
  }
};

/** Called by the EntryPoint once its own redirect is in place; flushes a parked deep link. */
export function markNavigationReady() {
  navigationReady = true;
  if (pending) {
    const route = pending;
    pending = null;
    navigate(route);
  }
}

function deliver(response) {
  const request = response?.notification?.request;
  const id = request?.identifier;
  if (id) {
    if (delivered.has(id)) return; // the launch tap can arrive via both paths
    delivered.add(id);
  }
  const route = pushTapRoute(request?.content?.data);
  if (!route) return;
  if (navigationReady) navigate(route);
  else pending = route;
}

/**
 * Register OS notification-tap routing. Returns an unsubscribe. Handles both a tap while
 * the app is running (listener) and the tap that launched it (last response, parked until
 * markNavigationReady()).
 */
export function registerNotificationTapRouting() {
  const sub = Notifications.addNotificationResponseReceivedListener(deliver);
  Promise.resolve()
    .then(() => Notifications.getLastNotificationResponseAsync?.())
    .then((response) => {
      if (response) deliver(response);
    })
    .catch(() => {});
  return () => sub?.remove?.();
}

// Test-only.
export function __resetNotificationDeepLinkForTests() {
  navigationReady = false;
  pending = null;
  delivered.clear();
}
