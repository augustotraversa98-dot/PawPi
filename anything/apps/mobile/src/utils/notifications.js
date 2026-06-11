/**
 * Notification utilities for Social Pet
 * Handles local notifications using expo-notifications
 */

import * as Notifications from "expo-notifications";
import { Platform, Alert } from "react-native";
import { ROUTINE_TYPES } from "@/data/routinesData";
import { formatScheduledTime } from "./scheduledTimeFormat";

// Configure notification behavior
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

/**
 * Pure: does a getPermissionsAsync()/requestPermissionsAsync() response mean we
 * may schedule? Accepts the whole permissions object (or null). expo-notifications
 * exposes both a `granted` boolean and a `status` string ("granted" includes iOS
 * provisional authorization) — treat either as granted, and a missing object as not.
 *
 * @param {{granted?: boolean, status?: string}|null|undefined} permissions
 * @returns {boolean}
 */
export function isNotificationPermissionGranted(permissions) {
  if (!permissions) return false;
  if (permissions.granted === true) return true;
  return permissions.status === "granted";
}

/**
 * One-time startup init: create the Android channel and ask for permission ONCE.
 * Called from src/app/_layout.jsx on mount. Memoized so a remount / React 18
 * double-invoked effect can't stack a second "Enable Reminders" alert. The
 * per-reminder schedule path no longer asks — it reads the granted state silently.
 *
 * @returns {Promise<boolean>} whether notifications are granted after init
 */
let initNotificationsPromise = null;
export async function initNotifications() {
  if (initNotificationsPromise) return initNotificationsPromise;
  initNotificationsPromise = (async () => {
    try {
      // Android shows nothing for scheduled notifications without a channel.
      if (Platform.OS === "android") {
        await Notifications.setNotificationChannelAsync("default", {
          name: "Reminders",
          importance: Notifications.AndroidImportance.HIGH,
          sound: "default",
        });
      }
      // Ask once (the explainer Alert lives in requestNotificationPermissions,
      // which no-ops when permission is already granted).
      return await requestNotificationPermissions();
    } catch (error) {
      console.error("Error initializing notifications:", error);
      return false;
    }
  })();
  return initNotificationsPromise;
}

/**
 * Request notification permissions from the user
 * Shows an explanation first, then requests permission
 */
export async function requestNotificationPermissions() {
  try {
    const { status: existingStatus } =
      await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== "granted") {
      // Show explanation modal first
      return new Promise((resolve) => {
        Alert.alert(
          "🔔 Enable Reminders",
          "Social Pet can remind you about feeding, walks, medication, and photo checks so Phoebe's care routine stays on track.",
          [
            {
              text: "Maybe later",
              style: "cancel",
              onPress: () => resolve(false),
            },
            {
              text: "Enable reminders",
              onPress: async () => {
                const { status } =
                  await Notifications.requestPermissionsAsync();
                finalStatus = status;
                resolve(finalStatus === "granted");
              },
            },
          ],
        );
      });
    }

    return finalStatus === "granted";
  } catch (error) {
    console.error("Error requesting notification permissions:", error);
    return false;
  }
}

// =========================================================================
// Early-reminder lead-time (OS-notification only)
//
// ScheduleBlock's "Early reminder" picker writes a `reminderTiming` lead-time
// onto the routine item. We honor it by scheduling the OS notification at
// (event − leadTime) WITHOUT moving the stored instance: nextTriggerAt /
// scheduledAt / id stay pinned to the event time, so Today, overdue, and the
// dismissal-resolution key are all unchanged. Only the heads-up alert moves
// earlier — the iOS-faithful behavior.
//
// `LEAD_TIME_MS` mirrors ScheduleBlock's EARLY_REMINDER_OPTIONS values verbatim
// (on_time / 5m / 15m / 30m / 1h / 1d / 1w). Keep the two in sync; do not invent
// new option values here.
// =========================================================================
const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

export const LEAD_TIME_MS = {
  on_time: 0,
  "5m": 5 * MINUTE_MS,
  "15m": 15 * MINUTE_MS,
  "30m": 30 * MINUTE_MS,
  "1h": HOUR_MS,
  "1d": DAY_MS,
  "1w": 7 * DAY_MS,
};

/**
 * Resolve a reminderTiming option to a millisecond lead-time. Absent, "on_time",
 * and unknown values all map to 0 (no shift ⇒ current at-event behavior).
 */
export function resolveLeadTimeMs(reminderTiming) {
  if (!reminderTiming) return 0;
  return LEAD_TIME_MS[reminderTiming] ?? 0;
}

/**
 * Resolve the item-level reminderTiming for a generated reminder instance,
 * dispatched by routine TYPE. The generator does not carry reminderTiming onto
 * instances, so we read it back off the source routine (passed in from the
 * store, where the routine is in scope).
 *
 * Returns null for every path that already applies its own offset elsewhere —
 * vet appointments (useVetAppointmentReminders) and medical-care vaccine items
 * (reminderGenerator) — so they are never double-offset. P3 adds a branch per
 * routine type as each modal adopts ScheduleBlock.
 */
export function resolveReminderTiming(reminder, routine) {
  if (!reminder || !routine) return null;

  switch (reminder.type) {
    case ROUTINE_TYPES.WELLNESS_CHECK: {
      const items = Array.isArray(routine.wellnessCheckItems)
        ? routine.wellnessCheckItems
        : [];
      const item = items[reminder.wellnessCheckItemIndex];
      return item?.reminderTiming ?? null;
    }
    case ROUTINE_TYPES.PHOTO_CHECK: {
      const schedules = Array.isArray(routine.photoCheckSchedule)
        ? routine.photoCheckSchedule
        : [];
      const schedule = schedules[reminder.photoCheckScheduleIndex];
      return schedule?.reminderTiming ?? null;
    }
    // P3 extension point: feeding / walk / general_check / weight_check /
    // preventive get a branch here as their modals adopt ScheduleBlock.
    // vet_appointment + medical-care vaccine stay absent (they own their offset
    // already).
    default:
      return null;
  }
}

/**
 * Pure: build the OS notification {title, body} for a reminder.
 *
 * - On-time (leadMs falsy / 0): UNCHANGED — title "<icon> <title>", body is the
 *   raw reminder.description (kept byte-for-byte, undefined included).
 * - Early (leadMs > 0): a heads-up, because the in-app "Next Up" list only spans
 *   a few hours so the push is the only early artifact the user sees. The title is
 *   prefixed so it doesn't read as a do-it-now task, and the body names the real
 *   due day/time via formatScheduledTime(eventTime, triggerTime) — "Tomorrow" is
 *   thus computed relative to the day the alert fires, never derived from the id.
 *   e.g. body "Time for breakfast\nDue Tomorrow 9:00 AM".
 *
 * @param {Object} reminder
 * @param {{eventTime: Date, triggerTime: Date, leadMs: number}} timing
 * @returns {{title: string, body: string|undefined}}
 */
export function buildReminderNotificationContent(
  reminder,
  { eventTime, triggerTime, leadMs } = {},
) {
  const config = getReminderConfig(reminder.type);

  // On-time path stays exactly as before.
  if (!(leadMs > 0)) {
    return { title: `${config.icon} ${reminder.title}`, body: reminder.description };
  }

  const dueLine = `Due ${formatScheduledTime(eventTime, triggerTime)}`;
  const body = reminder.description
    ? `${reminder.description}\n${dueLine}`
    : dueLine;
  return { title: `${config.icon} Upcoming: ${reminder.title}`, body };
}

/**
 * Schedule a local notification for a reminder
 * @param {Object} reminder - The reminder object
 * @param {string} [reminderTiming] - Early-reminder lead-time option (e.g. "1h").
 *   When set, the OS notification fires at (nextTriggerAt − leadTime); the
 *   reminder instance itself is NOT modified. Absent/"on_time" ⇒ fire at event.
 * @returns {Promise<string|null>} - The notification ID or null if failed
 */
export async function scheduleReminderNotification(reminder, reminderTiming) {
  try {
    // Silent guard — startup (initNotifications) already asked. Never pop an
    // Alert here: this runs once per reminder in the load loop and would stack.
    const permissions = await Notifications.getPermissionsAsync();
    if (!isNotificationPermissionGranted(permissions)) {
      return null;
    }

    const eventTime = new Date(reminder.nextTriggerAt);
    const leadMs = resolveLeadTimeMs(reminderTiming);
    // Fire the heads-up early; the stored instance stays at the event time.
    const triggerTime =
      leadMs > 0 ? new Date(eventTime.getTime() - leadMs) : eventTime;
    const now = new Date();

    // Don't schedule if the (possibly lead-shifted) trigger is in the past. With
    // a lead-time this can skip an alert whose event is still upcoming — that's
    // intentional: we never schedule a past trigger.
    if (triggerTime < now) {
      if (__DEV__) {
        console.warn(
          `[notifications] skipping past reminder ${reminder.id} — trigger ${triggerTime.toISOString()}`,
        );
      }
      return null;
    }

    // Build the title/body. Early (leadMs > 0) reads as a heads-up naming the
    // real due day/time; on-time is unchanged.
    const { title, body } = buildReminderNotificationContent(reminder, {
      eventTime,
      triggerTime,
      leadMs,
    });

    const notificationId = await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data: {
          reminderId: reminder.id,
          type: reminder.type,
          relatedTracker: reminder.relatedTracker,
          relatedBodyArea: reminder.relatedBodyArea,
        },
        sound: true,
        priority: reminder.timeSensitive
          ? Notifications.AndroidNotificationPriority.HIGH
          : Notifications.AndroidNotificationPriority.DEFAULT,
        categoryIdentifier: reminder.type,
      },
      // SDK 54 (expo-notifications 0.32) rejects a bare Date — the trigger must
      // be typed. channelId routes Android to the "default" channel
      // initNotifications() creates; iOS ignores it.
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: triggerTime,
        channelId: "default",
      },
    });

    return notificationId;
  } catch (error) {
    console.error("Error scheduling notification:", error);
    return null;
  }
}

/**
 * Cancel a scheduled notification
 * @param {string} notificationId - The notification ID to cancel
 */
export async function cancelNotification(notificationId) {
  try {
    if (notificationId) {
      await Notifications.cancelScheduledNotificationAsync(notificationId);
    }
  } catch (error) {
    console.error("Error canceling notification:", error);
  }
}

/**
 * Cancel all scheduled notifications
 */
export async function cancelAllNotifications() {
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
  } catch (error) {
    console.error("Error canceling all notifications:", error);
  }
}

/**
 * Get all scheduled notifications
 */
export async function getScheduledNotifications() {
  try {
    return await Notifications.getAllScheduledNotificationsAsync();
  } catch (error) {
    console.error("Error getting scheduled notifications:", error);
    return [];
  }
}

/**
 * Helper to get reminder type configuration
 */
function getReminderConfig(type) {
  const configs = {
    feeding: { icon: "🍽️", actionLabel: "Log food" },
    water: { icon: "💧", actionLabel: "Log water" },
    walk: { icon: "🚶", actionLabel: "Start walk" },
    medication: { icon: "💊", actionLabel: "Mark as given" },
    preventive: { icon: "🛡️", actionLabel: "Mark as done" },
    vaccine: { icon: "💉", actionLabel: "Mark as done" },
    vet_appointment: { icon: "🩺", actionLabel: "View details" },
    general_check: { icon: "✅", actionLabel: "Start check" },
    weight_check: { icon: "⚖️", actionLabel: "Log weight" },
    photo_check: { icon: "📸", actionLabel: "Take photo" },
  };
  return configs[type] || { icon: "📌", actionLabel: "Done" };
}

/**
 * Set up notification response listener
 * This handles what happens when the user taps a notification
 */
export function addNotificationResponseListener(callback) {
  return Notifications.addNotificationResponseReceivedListener(callback);
}

/**
 * Set up notification received listener
 * This handles what happens when a notification is received while app is open
 */
export function addNotificationReceivedListener(callback) {
  return Notifications.addNotificationReceivedListener(callback);
}
