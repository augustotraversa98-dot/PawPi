import { create } from "zustand";
import { getReminderStatus, REMINDER_STATUS } from "@/data/remindersData";
import useSocialPetStore from "./socialPetStore";
import {
  scheduleReminderNotification,
  cancelNotification,
} from "@/utils/notifications";

const useRemindersStore = create((set, get) => ({
  // State - start with empty array, will be populated from routines
  reminders: [],

  // Active snoozes keyed by instance id (id → snoozedUntil ISO). This map — not
  // the per-reminder snoozedUntil field — is the read path for Today's
  // sectioning, because some reminders never live in this store (vet
  // appointments come from React Query) yet still need a working snooze.
  // In-memory only, like the rest of this store: lost on app restart.
  snoozes: {},

  // Actions
  addReminder: async (reminder) => {
    // Schedule notification if enabled and not disabled
    let scheduledNotificationId = null;
    if (
      reminder.notificationEnabled &&
      reminder.status !== REMINDER_STATUS.DISABLED
    ) {
      scheduledNotificationId = await scheduleReminderNotification(reminder);
    }

    const newReminder = {
      ...reminder,
      scheduledNotificationId:
        scheduledNotificationId || reminder.scheduledNotificationId,
    };

    set((state) => ({
      reminders: [...state.reminders, newReminder],
    }));

    // Create in-app notification
    get().createReminderNotification(newReminder);

    return newReminder;
  },

  // Add reminder from routine (without notification creation)
  addReminderFromRoutine: async (reminder) => {
    // Check for duplicates
    const existing = get().reminders.find((r) => r.id === reminder.id);
    if (existing) return;

    // Schedule notification if enabled
    let scheduledNotificationId = null;
    if (
      reminder.notificationEnabled &&
      reminder.status !== REMINDER_STATUS.DISABLED
    ) {
      scheduledNotificationId = await scheduleReminderNotification(reminder);
    }

    const newReminder = {
      ...reminder,
      scheduledNotificationId,
    };

    set((state) => ({
      reminders: [...state.reminders, newReminder],
    }));

    return newReminder;
  },

  // Remove future reminders by routine (keeps completed)
  removeFutureRemindersByRoutine: async (routineId) => {
    const reminders = get().reminders;
    const now = new Date();

    const toRemove = reminders.filter(
      (r) =>
        r.routineId === routineId &&
        r.status !== REMINDER_STATUS.COMPLETED &&
        new Date(r.scheduledAt) >= now,
    );

    // Cancel notifications
    for (const reminder of toRemove) {
      if (reminder.scheduledNotificationId) {
        await cancelNotification(reminder.scheduledNotificationId);
      }
    }

    set((state) => ({
      reminders: state.reminders.filter(
        (r) =>
          r.routineId !== routineId ||
          r.status === REMINDER_STATUS.COMPLETED ||
          new Date(r.scheduledAt) < now,
      ),
    }));
  },

  // Disable future reminders by routine
  disableFutureRemindersByRoutine: async (routineId) => {
    const reminders = get().reminders;
    const now = new Date();

    const toDisable = reminders.filter(
      (r) =>
        r.routineId === routineId &&
        r.status !== REMINDER_STATUS.COMPLETED &&
        new Date(r.scheduledAt) >= now,
    );

    // Cancel notifications
    for (const reminder of toDisable) {
      if (reminder.scheduledNotificationId) {
        await cancelNotification(reminder.scheduledNotificationId);
      }
    }

    set((state) => ({
      reminders: state.reminders.map((r) =>
        r.routineId === routineId &&
        r.status !== REMINDER_STATUS.COMPLETED &&
        new Date(r.scheduledAt) >= now
          ? { ...r, status: REMINDER_STATUS.DISABLED }
          : r,
      ),
    }));
  },

  updateReminder: async (id, updates) => {
    const currentReminder = get().reminders.find((r) => r.id === id);
    if (!currentReminder) return;

    // If time changed, reschedule notification
    if (
      updates.nextTriggerAt &&
      updates.nextTriggerAt !== currentReminder.nextTriggerAt
    ) {
      if (currentReminder.scheduledNotificationId) {
        await cancelNotification(currentReminder.scheduledNotificationId);
      }
      if (
        updates.notificationEnabled !== false &&
        updates.status !== REMINDER_STATUS.DISABLED
      ) {
        const newNotificationId = await scheduleReminderNotification({
          ...currentReminder,
          ...updates,
        });
        updates.scheduledNotificationId = newNotificationId;
      }
    }

    set((state) => ({
      reminders: state.reminders.map((reminder) =>
        reminder.id === id
          ? { ...reminder, ...updates, updatedAt: new Date().toISOString() }
          : reminder,
      ),
    }));

    // Update in-app notification
    get().updateReminderNotification(id, { ...currentReminder, ...updates });
  },

  deleteReminder: async (id) => {
    const reminder = get().reminders.find((r) => r.id === id);
    if (reminder?.scheduledNotificationId) {
      await cancelNotification(reminder.scheduledNotificationId);
    }

    set((state) => ({
      reminders: state.reminders.filter((reminder) => reminder.id !== id),
    }));

    // Remove from notification center
    get().removeReminderNotification(id);
  },

  // Drop an active snooze (after the instance is logged or skipped — the snooze
  // no longer means anything once the instance is resolved).
  clearSnooze: (id) => {
    set((state) => {
      if (!(id in state.snoozes)) return {};
      const next = { ...state.snoozes };
      delete next[id];
      return { snoozes: next };
    });
  },

  completeReminder: (id) => {
    get().clearSnooze(id);
    const reminder = get().reminders.find((r) => r.id === id);
    if (!reminder) return;

    set((state) => ({
      reminders: state.reminders.map((reminder) =>
        reminder.id === id
          ? {
              ...reminder,
              status: REMINDER_STATUS.COMPLETED,
              completedAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            }
          : reminder,
      ),
    }));

    // Mark notification as read in notification center
    const socialStore = useSocialPetStore.getState();
    const notification = socialStore.notifications.find(
      (n) => n.reminderId === id,
    );
    if (notification) {
      socialStore.markNotificationRead(notification.id);
    }
  },

  snoozeReminder: async (id, snoozeOption) => {
    let snoozeUntil;
    const snoozeMinutes = snoozeOption.value;

    if (snoozeMinutes === "tonight") {
      snoozeUntil = new Date();
      snoozeUntil.setHours(20, 0, 0, 0);
      if (snoozeUntil < new Date()) {
        snoozeUntil.setDate(snoozeUntil.getDate() + 1);
      }
    } else if (snoozeMinutes === "tomorrow") {
      snoozeUntil = new Date();
      snoozeUntil.setDate(snoozeUntil.getDate() + 1);
      snoozeUntil.setHours(9, 0, 0, 0);
    } else {
      snoozeUntil = new Date(Date.now() + snoozeMinutes * 60 * 1000);
    }

    set((state) => ({
      snoozes: { ...state.snoozes, [id]: snoozeUntil.toISOString() },
    }));

    const reminder = get().reminders.find((r) => r.id === id);
    // Not store-backed (vet appointments): the map entry above is the whole
    // snooze — there's no notification or reminder object to reschedule.
    if (!reminder) return;

    // Cancel old notification
    if (reminder.scheduledNotificationId) {
      await cancelNotification(reminder.scheduledNotificationId);
    }

    // Mark old in-app notification as read to prevent duplicates
    const socialStore = useSocialPetStore.getState();
    const oldNotification = socialStore.notifications.find(
      (n) => n.reminderId === reminder.id,
    );
    if (oldNotification && !oldNotification.read) {
      socialStore.markNotificationRead(oldNotification.id);
    }

    // Schedule new notification
    const newNotificationId = await scheduleReminderNotification({
      ...reminder,
      nextTriggerAt: snoozeUntil.toISOString(),
    });

    set((state) => ({
      reminders: state.reminders.map((reminder) =>
        reminder.id === id
          ? {
              ...reminder,
              snoozedUntil: snoozeUntil.toISOString(),
              nextTriggerAt: snoozeUntil.toISOString(),
              status: REMINDER_STATUS.SNOOZED,
              scheduledNotificationId: newNotificationId,
              updatedAt: new Date().toISOString(),
            }
          : reminder,
      ),
    }));
  },

  rescheduleReminder: async (id, newDateTime) => {
    const reminder = get().reminders.find((r) => r.id === id);
    if (!reminder) return;

    // Cancel old notification
    if (reminder.scheduledNotificationId) {
      await cancelNotification(reminder.scheduledNotificationId);
    }

    // Schedule new notification
    const newNotificationId = await scheduleReminderNotification({
      ...reminder,
      nextTriggerAt: newDateTime,
    });

    set((state) => ({
      reminders: state.reminders.map((reminder) =>
        reminder.id === id
          ? {
              ...reminder,
              nextTriggerAt: newDateTime,
              scheduledNotificationId: newNotificationId,
              updatedAt: new Date().toISOString(),
            }
          : reminder,
      ),
    }));
  },

  toggleReminderEnabled: async (id) => {
    const reminder = get().reminders.find((r) => r.id === id);
    if (!reminder) return;

    const newStatus =
      reminder.status === REMINDER_STATUS.DISABLED
        ? REMINDER_STATUS.UPCOMING
        : REMINDER_STATUS.DISABLED;

    if (newStatus === REMINDER_STATUS.DISABLED) {
      // Cancel notification
      if (reminder.scheduledNotificationId) {
        await cancelNotification(reminder.scheduledNotificationId);
      }
    } else {
      // Re-schedule notification
      const newNotificationId = await scheduleReminderNotification(reminder);
      set((state) => ({
        reminders: state.reminders.map((r) =>
          r.id === id
            ? { ...r, scheduledNotificationId: newNotificationId }
            : r,
        ),
      }));
    }

    set((state) => ({
      reminders: state.reminders.map((reminder) =>
        reminder.id === id
          ? {
              ...reminder,
              status: newStatus,
              updatedAt: new Date().toISOString(),
            }
          : reminder,
      ),
    }));
  },

  // Auto-complete reminder when tracker action happens
  completeReminderByTracker: (trackerType, bodyArea = null) => {
    const reminders = get().reminders;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const matchingReminders = reminders.filter((r) => {
      const status = getReminderStatus(r);
      const reminderDate = new Date(r.nextTriggerAt);
      reminderDate.setHours(0, 0, 0, 0);

      // Only auto-complete today's reminders or overdue ones
      const isDueToday = reminderDate <= today;

      return (
        r.relatedTracker === trackerType &&
        (bodyArea ? r.relatedBodyArea === bodyArea : true) &&
        isDueToday &&
        status !== REMINDER_STATUS.COMPLETED &&
        status !== REMINDER_STATUS.DISABLED
      );
    });

    matchingReminders.forEach((reminder) => {
      get().completeReminder(reminder.id);
    });
  },

  // Helper to create notification in social store
  createReminderNotification: (reminder) => {
    const socialStore = useSocialPetStore.getState();
    const config = {
      feeding: { actionLabel: "Log food" },
      water: { actionLabel: "Log water" },
      walk: { actionLabel: "Start walk" },
      medication: { actionLabel: "Mark as given" },
      preventive: { actionLabel: "Mark as done" },
      vaccine: { actionLabel: "Mark as done" },
      vet_appointment: { actionLabel: "View details" },
      general_check: { actionLabel: "Start check" },
      weight_check: { actionLabel: "Log weight" },
      photo_check: { actionLabel: "Take photo" },
    };

    const typeConfig = config[reminder.type] || { actionLabel: "Done" };

    socialStore.addNotification({
      id: `notif_${reminder.id}`,
      type: reminder.type,
      title: reminder.title,
      message: reminder.description,
      timestamp: new Date().toISOString(),
      read: false,
      priority: reminder.priority,
      reminderId: reminder.id,
      routineId: reminder.routineId, // Add routineId
      relatedTracker: reminder.relatedTracker,
      relatedBodyArea: reminder.relatedBodyArea,
      actionLabel: typeConfig.actionLabel,
      avatar: null,
    });
  },

  // Helper to update notification in social store
  updateReminderNotification: (reminderId, reminder) => {
    const socialStore = useSocialPetStore.getState();
    const notifIndex = socialStore.notifications.findIndex(
      (n) => n.reminderId === reminderId,
    );

    if (notifIndex !== -1) {
      const updatedNotifications = [...socialStore.notifications];
      updatedNotifications[notifIndex] = {
        ...updatedNotifications[notifIndex],
        title: reminder.title,
        message: reminder.description,
        timestamp: new Date().toISOString(),
      };
      useSocialPetStore.setState({ notifications: updatedNotifications });
    }
  },

  // Helper to remove notification from social store
  removeReminderNotification: (reminderId) => {
    const socialStore = useSocialPetStore.getState();
    const filteredNotifications = socialStore.notifications.filter(
      (n) => n.reminderId !== reminderId,
    );
    const unreadCount = filteredNotifications.filter((n) => !n.read).length;
    useSocialPetStore.setState({
      notifications: filteredNotifications,
      unreadNotificationCount: unreadCount,
    });
  },

  // Getters
  getActiveReminders: () => {
    return get().reminders.filter(
      (r) =>
        r.status !== REMINDER_STATUS.COMPLETED &&
        r.status !== REMINDER_STATUS.DISABLED,
    );
  },

  getTimeSensitiveReminders: () => {
    return get().reminders.filter((r) => {
      const status = getReminderStatus(r);
      return (
        r.timeSensitive &&
        (status === REMINDER_STATUS.DUE_NOW ||
          status === REMINDER_STATUS.DUE_SOON ||
          status === REMINDER_STATUS.OVERDUE) &&
        r.status !== REMINDER_STATUS.COMPLETED &&
        r.status !== REMINDER_STATUS.DISABLED
      );
    });
  },

  getRemindersByStatus: (status) => {
    return get().reminders.filter((r) => getReminderStatus(r) === status);
  },
}));

export default useRemindersStore;
