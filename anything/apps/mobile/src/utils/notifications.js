/**
 * Notification utilities for Social Pet
 * Handles local notifications using expo-notifications
 */

import * as Notifications from "expo-notifications";
import { Platform, Alert } from "react-native";
import { ROUTINE_TYPES } from "@/data/routinesData";

// Configure notification behavior
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

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
    // P3 extension point: feeding / walk / photo_check / general_check /
    // weight_check / preventive get a branch here as their modals adopt
    // ScheduleBlock. vet_appointment + medical-care vaccine stay absent (they
    // own their offset already).
    default:
      return null;
  }
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
    const hasPermission = await requestNotificationPermissions();
    if (!hasPermission) {
      console.log("Notification permission not granted");
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
      console.log("Trigger time is in the past, skipping notification");
      return null;
    }

    // Get reminder config for icon and action label
    const config = getReminderConfig(reminder.type);

    const notificationId = await Notifications.scheduleNotificationAsync({
      content: {
        title: `${config.icon} ${reminder.title}`,
        body: reminder.description,
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
      trigger: triggerTime,
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
