/**
 * Notification utilities for Social Pet
 * Handles local notifications using expo-notifications
 */

import * as Notifications from "expo-notifications";
import { Platform, Alert } from "react-native";

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

/**
 * Schedule a local notification for a reminder
 * @param {Object} reminder - The reminder object
 * @returns {Promise<string|null>} - The notification ID or null if failed
 */
export async function scheduleReminderNotification(reminder) {
  try {
    const hasPermission = await requestNotificationPermissions();
    if (!hasPermission) {
      console.log("Notification permission not granted");
      return null;
    }

    const triggerTime = new Date(reminder.nextTriggerAt);
    const now = new Date();

    // Don't schedule if trigger time is in the past
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
