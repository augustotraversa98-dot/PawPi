// ───────────────────────────────────────────────────────────────────────────
// Widget snapshot — the small JSON payload the RN app writes into the shared
// App Group container for the iOS Home/Lock-screen widget to read (ticket 2.76,
// Phase 1). This file is PURE + deterministic (no React, no I/O) so it is fully
// unit-testable in jest; the native write + WidgetCenter reload live in the
// guarded bridge (src/native/widgetBridge.ts), and the data gathering lives in
// the useWidgetSync hook.
//
// Rules honored here:
//  • NO fake data — every field comes from real app data the caller passes in;
//    when there is no pet / nothing to show, we emit a minimal snapshot whose
//    `hasPet`/empty fields drive the widget's "Open PawPi to get started" state.
//  • Small payload — at most `maxReminders` upcoming items; long strings are
//    trimmed by the widget, not here.
//  • One primary tap target per snapshot (an in-progress walk/trip outranks the
//    Today list), encoded as a deep-link URL the widget opens.
// ───────────────────────────────────────────────────────────────────────────

import { APP_URL_SCHEME } from "@/native/appGroup";

export const WIDGET_SNAPSHOT_SCHEMA_VERSION = 1;

// Deep-link targets the widget can request. Kept stable + small.
export const WIDGET_TARGETS = {
  HOME: "home", // open the app / feed (default + empty state)
  TODAY: "today", // Health → Today
  STREAK: "streak", // feed (where the streak lives)
  APPOINTMENT: "appointment", // Health → Vet Record
  WALK: "walk", // live walk watch (needs sessionId)
  TRIP: "trip", // transport service (optional tripId)
};

/**
 * Build the widget deep-link URL for a target, e.g.
 *   widgetDeepLink("walk", { sessionId: "42" }) → "pawpi://widget/walk?sessionId=42"
 * The Swift widget embeds these as the tap `widgetURL`.
 */
export function widgetDeepLink(target, params = {}) {
  const t = target || WIDGET_TARGETS.HOME;
  const query = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join("&");
  return `${APP_URL_SCHEME}://widget/${t}${query ? `?${query}` : ""}`;
}

/**
 * Resolve a widget deep-link URL back into an expo-router destination.
 * Pure + defensive: any unknown / malformed URL falls back to the feed so a
 * tap never dead-ends. Returns { pathname, params } for router.push().
 *
 * @param {string} url e.g. "pawpi://widget/walk?sessionId=42"
 * @returns {{ pathname: string, params: Record<string,string> }}
 */
export function resolveWidgetRoute(url) {
  const home = { pathname: "/(tabs)", params: {} };
  if (typeof url !== "string" || !url) return home;

  // Accept only our own widget links — ignore anything else.
  const prefix = `${APP_URL_SCHEME}://widget/`;
  if (!url.startsWith(prefix)) return home;

  const rest = url.slice(prefix.length);
  const [rawTarget, rawQuery = ""] = rest.split("?");
  const target = decodeURIComponent(rawTarget || "").toLowerCase();

  const params = {};
  for (const pair of rawQuery.split("&")) {
    if (!pair) continue;
    const [k, v = ""] = pair.split("=");
    if (k) params[decodeURIComponent(k)] = decodeURIComponent(v);
  }

  switch (target) {
    case WIDGET_TARGETS.TODAY:
      return { pathname: "/(tabs)/health", params: { section: "today" } };
    case WIDGET_TARGETS.APPOINTMENT:
      return { pathname: "/(tabs)/health", params: { section: "vet-record" } };
    case WIDGET_TARGETS.STREAK:
      return { pathname: "/(tabs)", params: {} };
    case WIDGET_TARGETS.WALK:
      // Need a session to watch; without one fall back to the feed.
      return params.sessionId
        ? { pathname: "/walk-live", params: { sessionId: params.sessionId } }
        : home;
    case WIDGET_TARGETS.TRIP:
      return { pathname: "/service/transport", params: {} };
    case WIDGET_TARGETS.HOME:
    default:
      return home;
  }
}

// Shorten a string for the small payload (the widget also truncates visually).
function clip(str, max = 60) {
  if (typeof str !== "string") return "";
  const s = str.trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

// Pick the in-progress activity (if any) and describe it for the widget.
function describeActivity(activeWalk, activeTrip) {
  if (activeWalk && activeWalk.status === "in_progress") {
    return {
      kind: "walk",
      sessionId: activeWalk.id != null ? String(activeWalk.id) : undefined,
      status: activeWalk.status,
      label: clip(activeWalk.walker_name || activeWalk.provider_name || "Walk in progress", 40),
      deepLink: widgetDeepLink(WIDGET_TARGETS.WALK, {
        sessionId: activeWalk.id != null ? String(activeWalk.id) : undefined,
      }),
    };
  }
  if (activeTrip && activeTrip.status === "in_transit") {
    return {
      kind: "trip",
      tripId: activeTrip.id != null ? String(activeTrip.id) : undefined,
      status: activeTrip.status,
      label: clip(activeTrip.dropoff_address || "Trip in progress", 40),
      eta: activeTrip.estimated_arrival || null,
      deepLink: widgetDeepLink(WIDGET_TARGETS.TRIP, {
        tripId: activeTrip.id != null ? String(activeTrip.id) : undefined,
      }),
    };
  }
  return null;
}

/**
 * Build the widget snapshot from the real data the app already computes.
 *
 * @param {object} input
 * @param {{id?:any,name?:string,avatar_url?:string}|null} input.pet active pet
 * @param {Array<{id?:any,title?:string,scheduledAt?:string,status?:string}>} input.reminders
 *        today's still-upcoming reminders (already today-scoped by the caller)
 * @param {number} input.completedCount reminders completed today
 * @param {number} input.streakDays posting streak (0 hides the flame)
 * @param {{title?:string,clinic?:string,appointmentDateTime?:string}|null} input.nextAppointment
 * @param {object|null} input.activeWalk in-progress walk session (or null)
 * @param {object|null} input.activeTrip in-progress transport trip (or null)
 * @param {Date} input.now reactive clock (defaults to new Date())
 * @param {number} input.maxReminders cap for the upcoming list (default 3)
 * @returns {object} small, serializable snapshot for the shared container
 */
export function buildWidgetSnapshot({
  pet = null,
  reminders = [],
  completedCount = 0,
  streakDays = 0,
  nextAppointment = null,
  activeWalk = null,
  activeTrip = null,
  now = new Date(),
  maxReminders = 3,
} = {}) {
  const generatedAt = (now instanceof Date ? now : new Date()).toISOString();

  // No pet → minimal "open PawPi to get started" snapshot.
  if (!pet || pet.name == null || pet.name === "") {
    return {
      schemaVersion: WIDGET_SNAPSHOT_SCHEMA_VERSION,
      generatedAt,
      hasPet: false,
      petName: null,
      petId: null,
      petPhoto: null,
      streakDays: 0,
      todayReminders: [],
      doneCount: 0,
      totalCount: 0,
      nextAppointment: null,
      activeActivity: null,
      deepLink: widgetDeepLink(WIDGET_TARGETS.HOME),
    };
  }

  const upcoming = (Array.isArray(reminders) ? reminders : [])
    .filter((r) => r && r.status !== "completed" && r.status !== "disabled")
    .map((r) => ({
      title: clip(r.title || "Reminder", 48),
      time: r.scheduledAt || r.nextTriggerAt || null,
      done: false,
    }))
    .filter((r) => r.time)
    .sort((a, b) => new Date(a.time) - new Date(b.time))
    .slice(0, Math.max(0, maxReminders));

  const done = Number.isFinite(completedCount) ? Math.max(0, completedCount) : 0;
  const streak = Number.isFinite(streakDays) ? Math.max(0, streakDays) : 0;

  const appointment =
    nextAppointment && (nextAppointment.appointmentDateTime || nextAppointment.scheduledAt)
      ? {
          title: clip(nextAppointment.title || nextAppointment.reasonForVisit || "Vet appointment", 48),
          clinic: clip(nextAppointment.clinic || "", 40) || null,
          time: nextAppointment.appointmentDateTime || nextAppointment.scheduledAt,
        }
      : null;

  const activeActivity = describeActivity(activeWalk, activeTrip);

  // Primary tap target: an in-progress activity wins, else the Today list, else
  // an appointment, else the feed.
  let deepLink = widgetDeepLink(WIDGET_TARGETS.HOME);
  if (activeActivity) deepLink = activeActivity.deepLink;
  else if (upcoming.length > 0) deepLink = widgetDeepLink(WIDGET_TARGETS.TODAY);
  else if (appointment) deepLink = widgetDeepLink(WIDGET_TARGETS.APPOINTMENT);

  return {
    schemaVersion: WIDGET_SNAPSHOT_SCHEMA_VERSION,
    generatedAt,
    hasPet: true,
    petName: clip(pet.name, 24),
    petId: pet.id != null ? String(pet.id) : null,
    petPhoto: pet.avatar_url || null,
    streakDays: streak,
    todayReminders: upcoming,
    doneCount: done,
    totalCount: done + upcoming.length,
    nextAppointment: appointment,
    activeActivity,
    deepLink,
  };
}
