import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getReminderStatus, REMINDER_STATUS } from "@/data/remindersData";
import useSocialPetStore from "./socialPetStore";
import useRoutinesStore from "./routinesStore";
import { isPetLost } from "./petAccessStore";
import { isDogMuted, whenReminderMutesReady } from "./reminderMuteStore";
import { getSessionEpoch } from "@/utils/auth/sessionEpoch";
import {
  scheduleReminderNotification,
  cancelNotification,
  resolveReminderTiming,
  resolveLeadTimeMs,
  getScheduledNotifications,
  reminderAlertKey,
} from "@/utils/notifications";
import { selectAlarmsToArm } from "@/utils/alarmBudget";

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

// One alarm pass at a time. A request made while one is running gets ONE follow-up pass (it sees the latest store).
let alarmRun = null;
let alarmNext = null;

function requestAlarmPass(pass) {
  if (!alarmRun) {
    alarmRun = pass().finally(() => {
      alarmRun = null;
    });
    return alarmRun;
  }
  if (!alarmNext) {
    const again = () => {
      alarmNext = null;
      return requestAlarmPass(pass);
    };
    alarmNext = alarmRun.then(again, again);
  }
  return alarmNext;
}

const isQuiet = (r) =>
  r.status === REMINDER_STATUS.COMPLETED || r.status === REMINDER_STATUS.DISABLED;

// Should this stored reminder ring, and if so when and how? null = it must not have an alarm.
function alarmFor(reminder, snoozes, now) {
  if (!reminder?.notificationEnabled || isQuiet(reminder) || isPetLost(reminder.petId)) return null;
  if (isDogMuted(reminder.petId)) return null; // "Remind me about this dog" is off
  // A running snooze is the alert: at the snoozed time, with no early heads-up.
  const snoozedUntil = snoozes[reminder.id];
  const snoozed = new Date(snoozedUntil ?? 0).getTime() > now;
  const { reminderTiming, ...instance } = reminder;
  const target = snoozed ? { ...instance, nextTriggerAt: snoozedUntil } : instance;
  const timing = snoozed ? null : reminderTiming ?? null;
  const fireAt = new Date(target.nextTriggerAt).getTime() - resolveLeadTimeMs(timing);
  if (!(fireAt > now)) return null;
  return { id: reminder.id, fireAt, snoozed, target, timing };
}

// Arm the soonest reminders across all dogs (utils/alarmBudget) and take away the ones that must not ring.
async function runAlarmPass(set, get) {
  // The identity this pass works for: if it changes while we await the OS, undo what we armed.
  const epoch = getSessionEpoch();
  await whenReminderMutesReady(); // nothing is armed before the person's choices are known
  let pending;
  try {
    pending = (await getScheduledNotifications()) ?? [];
  } catch {
    pending = [];
  }
  if (epoch !== getSessionEpoch()) return;

  const now = Date.now();
  const { reminders, snoozes } = get();
  const done = new Set(Object.values(get().resolvedByPet).flat());
  const candidates = reminders
    .filter((r) => !done.has(r.id)) // someone in the household already logged it
    .map((r) => alarmFor(r, snoozes, now))
    .filter(Boolean);
  // A switched-off dog loses every alert tagged with it, also those of a dog not read yet and its nudges. A snoozed
  // past instance the household has logged goes too (it is not among the stored reminders after a relaunch).
  const muted = new Set(
    pending
      .filter((n) => isDogMuted(n.content?.data?.petId) || done.has(n.identifier))
      .map((n) => n.identifier),
  );
  const { arm, cancel } = selectAlarmsToArm({
    candidates,
    pending: pending.filter((n) => !muted.has(n.identifier)),
    knownIds: new Set(reminders.map((r) => r.id)),
    snoozedIds: new Set(
      Object.keys(snoozes).filter((id) => new Date(snoozes[id]).getTime() > now),
    ),
  });

  // Cancel first, so the phone is never over its limit while the new ones go in.
  for (const id of [...muted, ...cancel]) await cancelNotification(id);

  const pendingById = new Map(pending.map((n) => [n.identifier, n]));
  const armed = new Map();
  const undo = async () => {
    for (const notificationId of armed.values()) await cancelNotification(notificationId);
  };
  for (const candidate of arm) {
    if (epoch !== getSessionEpoch()) return undo();
    // The store may have moved while we were scheduling the previous one.
    const reminder = get().reminders.find((r) => r.id === candidate.id);
    if (Object.values(get().resolvedByPet).some((ids) => ids.includes(candidate.id))) continue;
    const alarm = reminder && alarmFor(reminder, get().snoozes, Date.now());
    if (!alarm) continue;
    const existing = pendingById.get(alarm.id);
    if (existing && existing.content?.data?.alertKey === reminderAlertKey(alarm.target, alarm.timing)) {
      continue; // already armed exactly like this
    }
    const notificationId = await scheduleReminderNotification(alarm.target, alarm.timing);
    if (!notificationId) continue;
    armed.set(alarm.id, notificationId);
    if (epoch !== getSessionEpoch()) return undo();
    // Done, or the dog lost, while the OS was scheduling: take the alert back.
    const current = get().reminders.find((r) => r.id === alarm.id);
    if (!current || isQuiet(current) || isPetLost(current.petId)) {
      await cancelNotification(notificationId);
      armed.delete(alarm.id);
    }
  }
  if (armed.size === 0 || epoch !== getSessionEpoch()) return undefined;
  set((state) => ({
    reminders: state.reminders.map((r) =>
      armed.has(r.id) && r.scheduledNotificationId !== armed.get(r.id)
        ? { ...r, scheduledNotificationId: armed.get(r.id) }
        : r,
    ),
  }));
  return undefined;
}

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

  // Instances the household has already logged (utils/householdResolution), per dog: { [petId]: [reminderId] }. They
  // arm no alarm on this phone. In memory only; the Today list derives the same from the logs on its own.
  resolvedByPet: {},

  setResolved: async (petId, resolvedIds, { merge = false } = {}) => {
    const key = String(petId);
    const before = get().resolvedByPet[key] ?? [];
    // `merge`: some log read failed, so keep what was already known to be done.
    const next = [...new Set(merge ? [...before, ...resolvedIds] : resolvedIds)].sort();
    if (next.join() === before.join()) return;
    set((state) => ({ resolvedByPet: { ...state.resolvedByPet, [key]: next } }));
    await get().syncAlarms();
  },

  // Actions
  addReminder: async (reminder) => {
    const newReminder = { ...reminder };

    set((state) => ({
      reminders: [...state.reminders, newReminder],
    }));

    // Create in-app notification
    get().createReminderNotification(newReminder);
    await get().syncAlarms();

    return newReminder;
  },

  // Add reminder from routine (without notification creation)
  addReminderFromRoutine: async (reminder) => {
    const [added] = await get().addRemindersFromRoutine([reminder]);
    return added;
  },

  // Add a routine's generated instances (after create / edit / re-enable) in ONE commit, then arm.
  addRemindersFromRoutine: async (list) => {
    // Check for duplicates — id-based de-dup keeps refetch/sync from
    // double-scheduling the (early) notification.
    const seen = new Set(get().reminders.map((r) => r.id));
    const added = [];
    for (const reminder of list) {
      if (seen.has(reminder.id)) continue;
      seen.add(reminder.id);
      // Resolve the early-reminder lead-time off the source routine (the instance
      // doesn't carry it); the alarm fires at (event − leadTime). The stored
      // instance stays pinned to the event time.
      const routine = useRoutinesStore
        .getState()
        .routines.find((r) => r.id === reminder.routineId);
      added.push({
        ...reminder,
        reminderTiming: resolveReminderTiming(reminder, routine) ?? null,
      });
    }
    if (added.length === 0) return added;

    set((state) => ({
      reminders: [...state.reminders, ...added],
    }));
    await get().syncAlarms();

    return added;
  },

  // THE arming path: bring the OS alarms in line with the store (all dogs, soonest first, within the budget). Safe to
  // call as often as wanted; concurrent calls share a pass. Never throws.
  syncAlarms: () =>
    requestAlarmPass(() =>
      runAlarmPass(set, get).catch((error) => {
        // Arming is housekeeping: it must never turn a successful load or save into an error.
        console.warn("[remindersStore] arming reminders failed:", error?.message);
      }),
    ),

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
    for (const added of fresh.values()) next.push(added);

    if (next.length !== before.length || next.some((r, i) => r !== before[i])) {
      set({ reminders: next });
    }
    for (const reminder of dropped) await cancelNotification(notificationIdOf(reminder));
    if (epoch !== getSessionEpoch()) return;
    await get().syncAlarms();
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
    get().syncAlarms(); // the freed slots go to the next reminders
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

    // If time changed, the old alert is wrong: drop it, the pass below arms the new one.
    if (
      updates.nextTriggerAt &&
      updates.nextTriggerAt !== currentReminder.nextTriggerAt
    ) {
      await cancelNotification(notificationIdOf(currentReminder));
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
    await get().syncAlarms();
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

    set((state) => ({
      reminders: state.reminders.map((reminder) =>
        reminder.id === id
          ? {
              ...reminder,
              snoozedUntil: snoozeUntil.toISOString(),
              nextTriggerAt: snoozeUntil.toISOString(),
              status: REMINDER_STATUS.SNOOZED,
              scheduledNotificationId: null,
              updatedAt: new Date().toISOString(),
            }
          : reminder,
      ),
    }));
    await get().syncAlarms(); // a snooze is never evicted by the budget
  },

  rescheduleReminder: async (id, newDateTime) => {
    const reminder = get().reminders.find((r) => r.id === id);
    if (!reminder) return;

    // Cancel old notification
    if (reminder.scheduledNotificationId) {
      await cancelNotification(reminder.scheduledNotificationId);
    }

    set((state) => ({
      reminders: state.reminders.map((reminder) =>
        reminder.id === id
          ? {
              ...reminder,
              nextTriggerAt: newDateTime,
              scheduledNotificationId: null,
              updatedAt: new Date().toISOString(),
            }
          : reminder,
      ),
    }));
    await get().syncAlarms();
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
    await get().syncAlarms();
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
