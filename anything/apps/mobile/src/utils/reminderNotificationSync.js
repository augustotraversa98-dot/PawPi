import { getReminderStatus, REMINDER_STATUS } from "@/data/remindersData";
import {
  generateNotificationFromReminder,
  shouldCreateNotification,
} from "./notificationGenerator";
import useRemindersStore from "@/store/remindersStore";
import useSocialPetStore from "@/store/socialPetStore";

/**
 * Sync reminders with notification center
 * Checks all active reminders and creates notifications for due/due soon reminders
 */
export function syncRemindersToNotifications() {
  const remindersStore = useRemindersStore.getState();
  const socialStore = useSocialPetStore.getState();

  const activeReminders = remindersStore.reminders.filter(
    (r) =>
      r.status !== REMINDER_STATUS.COMPLETED &&
      r.status !== REMINDER_STATUS.DISABLED,
  );

  const existingNotifications = socialStore.notifications;

  activeReminders.forEach((reminder) => {
    const status = getReminderStatus(reminder);

    // Create notification if due soon, due now, or overdue
    if (
      status === REMINDER_STATUS.DUE_SOON ||
      status === REMINDER_STATUS.DUE_NOW ||
      status === REMINDER_STATUS.OVERDUE
    ) {
      // Check if notification already exists for this reminder
      const existingNotif = existingNotifications.find(
        (n) => n.reminderId === reminder.id && !n.read,
      );

      if (
        !existingNotif &&
        shouldCreateNotification(reminder, existingNotifications)
      ) {
        const notification = generateNotificationFromReminder(reminder);
        if (notification) {
          socialStore.addNotification(notification);
        }
      }
    }
  });
}

/**
 * Start background sync
 * Checks every minute for due reminders and creates notifications
 */
export function startReminderNotificationSync() {
  // Initial sync after a short delay to let stores initialize
  setTimeout(() => {
    syncRemindersToNotifications();
  }, 1000);

  // Check every minute
  const interval = setInterval(() => {
    syncRemindersToNotifications();
  }, 60000); // 60 seconds

  return () => clearInterval(interval);
}

/**
 * Clean up old notifications for completed reminders
 */
export function cleanupCompletedReminderNotifications() {
  const remindersStore = useRemindersStore.getState();
  const socialStore = useSocialPetStore.getState();

  const completedReminderIds = remindersStore.reminders
    .filter((r) => r.status === REMINDER_STATUS.COMPLETED)
    .map((r) => r.id);

  // Mark notifications as read for completed reminders
  socialStore.notifications.forEach((notif) => {
    if (
      notif.reminderId &&
      completedReminderIds.includes(notif.reminderId) &&
      !notif.read
    ) {
      socialStore.markNotificationRead(notif.id);
    }
  });
}
