import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getReminderStatus, REMINDER_STATUS } from "@/data/remindersData";
import useSocialPetStore from "./socialPetStore";
import useRoutinesStore from "./routinesStore";
import { isPetLost } from "./petAccessStore";
import { getSessionEpoch } from "@/utils/auth/sessionEpoch";
import {
  scheduleReminderNotification,
  cancelNotification,
  resolveReminderTiming,
  resolveLeadTimeMs,
  getScheduledNotifications,
} from "@/utils/notifications";

// The OS notification id for a reminder. Notifications are now scheduled with the reminder's own
// (deterministic) id, so `reminder.id` is a valid cancel handle even after an app restart, when the
// in-memory `scheduledNotificationId` is gone (flow audit F1-01).
const notificationIdOf = (r) => r?.scheduledNotificationId || r?.id || null;

// Would re-reading the routine change what this reminder's alert says or when it fires?
const sameAlert = (a, b) =>
  a.scheduledAt === b.scheduledAt &&
  a.title === b.title &&
  a.description === b.description &&
  a.notificationEnabled === b.notificationEnabled &&
  a.timeSensitive === b.timeSensitive &&
  (a.reminderTiming ?? null) === (b.reminderTiming ?? null) &&
  a.status !== REMINDER_STATUS.DISABLED; // paused earlier, active again now

const useRemindersStore = create(
  persist(
    (set, get) => ({
  // State - start with empty array, will be populated from routines
  reminders: [],

  // Active snoozes keyed by instance id (id → snoozedUntil ISO). This map — not
  // the per-reminder snoozedUntil field — is the read path for Today's
  // sectioning, because some reminders never live in this store (vet
  // appointments come from React Query) yet still need a working snooze.
  // (AUDIT A-25) PERSISTED (only this slice) so a snooze survives an app restart
  // — previously a restart resurrected every snoozed reminder into Today.
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
    // Check for duplicates — id-based de-dup keeps refetch/sync from
    // double-scheduling the (early) notification.
    const existing = get().reminders.find((r) => r.id === reminder.id);
    if (existing) return;

    // Resolve the early-reminder lead-time off the source routine (the instance
    // doesn't carry it), then let scheduleReminderNotification fire the OS alert
    // at (event − leadTime). The stored instance stays pinned to the event time.
    const routine = useRoutinesStore
      .getState()
      .routines.find((r) => r.id === reminder.routineId);
    const reminderTiming = resolveReminderTiming(reminder, routine);

    // Schedule notification if enabled
    let scheduledNotificationId = null;
    if (
      reminder.notificationEnabled &&
      reminder.status !== REMINDER_STATUS.DISABLED
    ) {
      scheduledNotificationId = await scheduleReminderNotification(
        reminder,
        reminderTiming,
      );
    }

    const newReminder = {
      ...reminder,
      reminderTiming: reminderTiming ?? null,
      scheduledNotificationId,
    };

    set((state) => ({
      reminders: [...state.reminders, newReminder],
    }));

    return newReminder;
  },

  // Bring ONE dog's reminders in line with a fresh read of its routines (routinesStore.loadRoutines: launch, pet
  // select, app foreground, a newly shared dog, pull-to-refresh), then arm the alarms that are missing or changed.
  //   • new instances are added; edited ones (time, text, early reminder) replace the old ones;
  //   • instances that are no longer generated are dropped (routine deleted / paused / re-timed, possibly on another
  //     phone), except past ones of a still-active routine, which Today may still be asking about;
  //   • what is personal to this phone survives: "done" stays done, a snooze keeps its time.
  // (AUDIT A-17) The store is committed ONCE per load, not once per reminder.
  syncPetReminders: async (petId, generated, routines) => {
    // Identity this load is for (see utils/auth/sessionEpoch).
    const epoch = getSessionEpoch();
    if (isPetLost(petId)) return;
    const pid = petId == null ? null : String(petId);
    const routineById = new Map((routines || []).map((r) => [String(r.id), r]));
    const liveRoutine = (id) => {
      const r = routineById.get(String(id));
      return !!r && r.isActive && !r.deletedAt;
    };

    const fresh = new Map();
    for (const g of generated) {
      if (fresh.has(g.id) || isPetLost(g.petId)) continue;
      const reminderTiming = resolveReminderTiming(g, routineById.get(String(g.routineId))) ?? null;
      fresh.set(g.id, { ...g, reminderTiming });
    }

    const now = Date.now();
    const { reminders: before, snoozes } = get();
    const isSnoozed = (r) => new Date(snoozes[r.id] ?? 0).getTime() > now;
    const changed = new Set(); // ids whose alarm must be (re)armed even if one is pending
    const dropped = [];
    const next = [];
    for (const old of before) {
      const replacement = fresh.get(old.id);
      fresh.delete(old.id);
      if (!replacement && (pid == null || String(old.petId) !== pid)) {
        next.push(old); // another dog
      } else if (old.status === REMINDER_STATUS.COMPLETED) {
        next.push(old);
      } else if (replacement) {
        if (sameAlert(old, replacement)) {
          next.push(old);
        } else {
          changed.add(old.id);
          next.push(
            old.status === REMINDER_STATUS.SNOOZED
              ? {
                  ...replacement,
                  status: old.status,
                  snoozedUntil: old.snoozedUntil,
                  nextTriggerAt: old.nextTriggerAt,
                }
              : replacement,
          );
        }
      } else if (
        old.routineId == null ||
        (liveRoutine(old.routineId) && (new Date(old.scheduledAt).getTime() < now || isSnoozed(old)))
      ) {
        next.push(old);
      } else {
        dropped.push(old);
      }
    }
    // New to this launch: arm even if an alarm with this id is pending (it may carry an older time or text).
    for (const added of fresh.values()) {
      changed.add(added.id);
      next.push(added);
    }

    if (next.length !== before.length || next.some((r, i) => r !== before[i])) {
      set({ reminders: next });
    }
    for (const reminder of dropped) await cancelNotification(notificationIdOf(reminder));
    if (epoch !== getSessionEpoch()) return;

    const snoozedHere = next
      .filter((r) => pid != null && String(r.petId) === pid && isSnoozed(r))
      .map((r) => r.id);
    try {
      await get().armReminders(
        [...new Set([...generated.map((g) => g.id), ...snoozedHere])],
        changed,
        epoch,
      );
    } catch (error) {
      // Arming is housekeeping: it must never turn a successful routines load into an error state.
      console.warn("[remindersStore] arming reminders failed:", error?.message);
    }
  },

  // Schedule the OS alarm of each of these stored reminders that has none pending (or whose alert changed).
  armReminders: async (ids, changed, epoch) => {
    let pending;
    try {
      pending = new Set(((await getScheduledNotifications()) ?? []).map((n) => n.identifier));
    } catch {
      pending = new Set();
    }
    const scheduled = new Map();
    const undo = async () => {
      for (const notificationId of scheduled.values()) await cancelNotification(notificationId);
    };
    // The user may log out / switch account, or lose the dog, while we await the OS: never leave that alert armed.
    for (const id of ids) {
      if (epoch !== getSessionEpoch()) return undo();
      const reminder = get().reminders.find((r) => r.id === id);
      if (!reminder || !reminder.notificationEnabled || isPetLost(reminder.petId)) continue;
      if (
        reminder.status === REMINDER_STATUS.COMPLETED ||
        reminder.status === REMINDER_STATUS.DISABLED
      ) {
        continue;
      }
      if (pending.has(id) && !changed.has(id)) continue;

      // A running snooze is the alert to re-arm: at the snoozed time, with no early heads-up.
      const snoozedUntil = get().snoozes[id];
      const snoozed = new Date(snoozedUntil ?? 0).getTime() > Date.now();
      const target = snoozed ? { ...reminder, nextTriggerAt: snoozedUntil } : reminder;
      const timing = snoozed ? null : reminder.reminderTiming ?? null;
      const fireAt = new Date(target.nextTriggerAt).getTime() - resolveLeadTimeMs(timing);
      if (!(fireAt > Date.now())) continue;

      const notificationId = await scheduleReminderNotification(target, timing);
      if (!notificationId) continue;
      scheduled.set(id, notificationId);
      const current = get().reminders.find((r) => r.id === id);
      if (epoch !== getSessionEpoch()) return undo();
      // Done (or the dog lost) while the OS was scheduling: take the alert back.
      if (!current || current.status === REMINDER_STATUS.COMPLETED || isPetLost(current.petId)) {
        await cancelNotification(notificationId);
        scheduled.delete(id);
      }
    }
    if (scheduled.size === 0 || epoch !== getSessionEpoch()) return undefined;
    set((state) => ({
      reminders: state.reminders.map((r) =>
        scheduled.has(r.id) && r.scheduledNotificationId !== scheduled.get(r.id)
          ? { ...r, scheduledNotificationId: scheduled.get(r.id) }
          : r,
      ),
    }));
    return undefined;
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
      await cancelNotification(notificationIdOf(reminder));
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
      await cancelNotification(notificationIdOf(reminder));
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
      await cancelNotification(notificationIdOf(currentReminder));
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
    if (reminder) {
      await cancelNotification(notificationIdOf(reminder));
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

    // Done (or skipped) means the pending alert must not ring later (F1-07). Fire-and-forget:
    // cancelNotification never throws, and this action stays synchronous for its callers.
    cancelNotification(notificationIdOf(reminder));

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
      await cancelNotification(notificationIdOf(reminder));
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
      feeding: { actionLabel: actionLabel("logFood") },
      water: { actionLabel: actionLabel("logWater") },
      walk: { actionLabel: actionLabel("startWalk") },
      medication: { actionLabel: actionLabel("markGiven") },
      preventive: { actionLabel: actionLabel("markDone") },
      vaccine: { actionLabel: actionLabel("markDone") },
      vet_appointment: { actionLabel: actionLabel("viewDetails") },
      general_check: { actionLabel: actionLabel("startCheck") },
      weight_check: { actionLabel: actionLabel("logWeight") },
      photo_check: { actionLabel: actionLabel("takePhoto") },
    };

    const typeConfig = config[reminder.type] || { actionLabel: actionLabel("done") };

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
    }),
    {
      name: "pawpi:reminderSnoozes",
      storage: createJSONStorage(() => AsyncStorage),
      // (AUDIT A-25) Persist ONLY the snoozes map — `reminders` are re-derived
      // from routines on every load and must not be frozen to disk.
      partialize: (state) => ({ snoozes: state.snoozes }),
      // Drop snoozes whose `until` is already in the past on rehydrate, so the
      // map doesn't grow without bound across restarts.
      merge: (persisted, current) => {
        const now = Date.now();
        const snoozes = {};
        for (const [id, until] of Object.entries(persisted?.snoozes ?? {})) {
          if (until && new Date(until).getTime() > now) snoozes[id] = until;
        }
        return { ...current, snoozes };
      },
    },
  ),
);

export default useRemindersStore;
