// engagementNotifications — localized copy + scheduling for the E5 wanted triggers.
//
// Every string here is POSITIVE and celebrates the dog; none shames the owner. The copy is
// pulled from i18n (engageNotif.* in the locale files, EN+ES), so a no-guilt grep test can
// scan the source-of-truth JSON directly.
//
// Two schedulers:
//   • scheduleStreakSaveNotification — the single positive end-of-day nudge. The DECISION to
//     schedule (policy + prefs + cap) is made by the caller via maybeScheduleStreakSave; this
//     just books the local notification for the owner's usual/evening hour today.
//   • The milestone-countdown + dormant copy builders are consumed by their own surfaces.

import * as Notifications from "expo-notifications";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  isNotificationPermissionGranted,
  getNotificationPermissionGranted,
  getScheduledNotifications,
} from "./notifications";
import {
  NOTIF_CATEGORIES,
  shouldSendStreakSave,
  shouldArmReminderSetupNudge,
  isWithinDailyCap,
  resolvePersonalizedSendHour,
  clampToDaytimeHour,
  REMINDER_NUDGE_DAY_OFFSETS,
  EVENING_HOUR,
} from "./notificationPolicy";
import {
  getNotificationPrefs,
  getSentLog,
  getAppOpenHours,
  recordSent,
} from "./notificationPreferences";
import { getLocalPostDateString } from "./dateUtils";

const STREAK_SAVE_SENT_KEY_PREFIX = "pawpi.streakSaveSent."; // + YYYY-MM-DD

// ── Localized copy builders (all positive) ─────────────────────────────────────

/** Streak-save: "One more thing to finish {name}'s day — your {n}-day streak is safe 🔥" */
export function buildStreakSaveContent(t, { petName, streakCount } = {}) {
  const name = petName || t("engageNotif.petFallback");
  return {
    title: t("engageNotif.streakSaveTitle", { name }),
    body: t("engageNotif.streakSaveBody", { name, count: streakCount }),
  };
}

/** Milestone 3-day countdown heads-up. kind: 'birthday' | 'gotcha'. */
export function buildMilestoneCountdownContent(t, { petName, kind, days } = {}) {
  const name = petName || t("engageNotif.petFallback");
  const key = kind === "gotcha" ? "engageNotif.countdownGotcha" : "engageNotif.countdownBirthday";
  return {
    title: t(key, { name }),
    body: t("engageNotif.countdownBody", { name, count: days }),
  };
}

/** Milestone day itself. */
export function buildMilestoneDayContent(t, { petName, kind } = {}) {
  const name = petName || t("engageNotif.petFallback");
  const key = kind === "gotcha" ? "engageNotif.milestoneGotcha" : "engageNotif.milestoneBirthday";
  return { title: t(key, { name }), body: t("engageNotif.milestoneBody", { name }) };
}

/** A friend posted (social). */
export function buildFriendPostedContent(t, { friendPetName } = {}) {
  const name = friendPetName || t("engageNotif.friendFallback");
  return { title: t("engageNotif.friendPostedTitle", { name }), body: t("engageNotif.friendPostedBody", { name }) };
}

/**
 * Warm dormant re-engagement. Tied to a friend's REAL activity when available ("Bella misses
 * Rex"), never guilt ("you haven't opened in 5 days").
 */
export function buildDormantContent(t, { petName, friendPetName } = {}) {
  const name = petName || t("engageNotif.petFallback");
  if (friendPetName) {
    return {
      title: t("engageNotif.dormantFriendTitle", { friend: friendPetName, name }),
      body: t("engageNotif.dormantFriendBody", { friend: friendPetName, name }),
    };
  }
  return { title: t("engageNotif.dormantTitle", { name }), body: t("engageNotif.dormantBody", { name }) };
}

// ── Streak-save scheduler ──────────────────────────────────────────────────────

/**
 * Book the local streak-save notification for `hour` today (owner-local). If that hour has
 * already passed, fire a couple of minutes out so the evening nudge still lands today.
 * Returns the scheduled id or null.
 */
export async function scheduleStreakSaveNotification({ content, hour, now = new Date() } = {}) {
  try {
    const permissions = await Notifications.getPermissionsAsync();
    if (!isNotificationPermissionGranted(permissions)) return null;

    const trigger = new Date(now);
    trigger.setHours(hour ?? EVENING_HOUR, 0, 0, 0);
    if (trigger.getTime() <= now.getTime()) {
      // The usual hour already passed today — nudge shortly, still today.
      trigger.setTime(now.getTime() + 2 * 60 * 1000);
    }

    return await Notifications.scheduleNotificationAsync({
      content: {
        title: content?.title || "PawPi",
        body: content?.body,
        sound: true,
        data: { category: NOTIF_CATEGORIES.STREAK },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: trigger,
        channelId: "default",
      },
    });
  } catch (error) {
    console.error("[engagementNotifications] streak-save schedule failed:", error?.message);
    return null;
  }
}

/**
 * The end-to-end guarded entry point the Care Ring calls once it knows today's state. Applies,
 * in order: category toggle → at-risk policy → once-per-day → global frequency cap. Only if ALL
 * pass does it schedule and record the send. Returns the scheduled id or null.
 *
 * @param {object} args
 * @param {function} args.t i18n translator
 * @param {object} args.ring { walkDone, momentDone, careDone, ringClosed, restDay, paused }
 * @param {number} args.streakCount
 * @param {string} args.petName
 * @param {Date}   [args.now]
 */
export async function maybeScheduleStreakSave({ t, ring = {}, streakCount, petName, now = new Date() }) {
  const prefs = await getNotificationPrefs();
  const dayKey = getLocalPostDateString(now);

  const alreadySentToday = await streakSaveSentToday(dayKey);
  const state = {
    walkDone: !!ring.walkDone,
    momentDone: !!ring.momentDone,
    careDone: !!ring.careDone,
    ringClosed: !!ring.ringClosed,
    restDay: !!ring.restDay,
    paused: !!ring.paused,
    streakCount,
    alreadySentToday,
  };
  if (!shouldSendStreakSave(state, prefs)) return null;

  const sentLog = await getSentLog(dayKey);
  if (!isWithinDailyCap(sentLog, dayKey, prefs.frequencyCap)) return null;

  const openHours = await getAppOpenHours();
  const hour = resolvePersonalizedSendHour(openHours, prefs);
  const content = buildStreakSaveContent(t, { petName, streakCount });
  const id = await scheduleStreakSaveNotification({ content, hour, now });
  if (id) {
    await markStreakSaveSent(dayKey);
    await recordSent(dayKey);
  }
  return id;
}

// once-per-day guard for the streak-save specifically
async function streakSaveSentToday(dayKey) {
  try {
    const v = await AsyncStorage.getItem(STREAK_SAVE_SENT_KEY_PREFIX + dayKey);
    return v === "1";
  } catch {
    return false;
  }
}

async function markStreakSaveSent(dayKey) {
  try {
    await AsyncStorage.setItem(STREAK_SAVE_SENT_KEY_PREFIX + dayKey, "1");
  } catch {
    /* best-effort */
  }
}

// ── First-reminder setup nudge (local) ─────────────────────────────────────────
//
// An owner with a pet but no routine/reminder gets at most TWO gentle local nudges — tomorrow and
// three days later, in the daytime, at their usual hour — asking if they'd like a hand setting one
// up. They are armed ONCE per pet and cancelled the moment a reminder exists. Local on purpose: no
// server scheduler, no timezone dependency, nothing to clean up server-side (docs/notifications-audit.md §5).
//
// State per pet (AsyncStorage `pawpi.reminderNudge.v1.<petId>`):
//   { slots: [{ id, at }], done: boolean }   `at` = ISO time the OS was asked to fire it.
// "Armed" = the record exists; `done` also stops any future arming (a reminder now exists, or both
// slots have passed). Every slot still in the future but missing from the OS pending list (cancelled,
// e.g. by the logout cleanup) is re-armed at the same time, so the nudge survives a re-login.
// The state key is a plain account key: the owner logout paths clear it with the rest of the account's
// storage.

const REMINDER_NUDGE_KEY_PREFIX = "pawpi.reminderNudge.v1.";
export const REMINDER_NUDGE_DATA = { category: NOTIF_CATEGORIES.CARE, nudge: "reminder_setup" };

/** Localized copy. step 0 = the first nudge, 1 = the follow-up. Positive, no guilt, no health claims. */
export function buildReminderSetupContent(t, { petName, step = 0 } = {}) {
  const name = petName || t("engageNotif.petFallback");
  const n = step === 1 ? "2" : "1";
  return {
    title: t(`engageNotif.reminderSetupTitle${n}`, { name }),
    body: t(`engageNotif.reminderSetupBody${n}`, { name }),
  };
}

async function readNudgeState(petId) {
  try {
    const raw = await AsyncStorage.getItem(REMINDER_NUDGE_KEY_PREFIX + petId);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

async function writeNudgeState(petId, state) {
  try {
    await AsyncStorage.setItem(REMINDER_NUDGE_KEY_PREFIX + petId, JSON.stringify(state));
  } catch {
    /* best-effort */
  }
}

function nudgeTime(now, dayOffset, hour) {
  const at = new Date(now);
  at.setDate(at.getDate() + dayOffset);
  at.setHours(hour, 0, 0, 0);
  return at;
}

async function scheduleNudgeAt({ content, at, petId }) {
  return Notifications.scheduleNotificationAsync({
    content: {
      title: content.title,
      body: content.body,
      sound: true,
      data: { ...REMINDER_NUDGE_DATA, petId },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: at,
      channelId: "default",
    },
  });
}

/** Cancel this pet's pending setup nudges and mark the pet done (a reminder now exists). */
export async function cancelReminderSetupNudges(petId) {
  if (petId == null) return;
  const state = await readNudgeState(petId);
  if (!state || state.done) return;
  for (const slot of state.slots ?? []) {
    try {
      await Notifications.cancelScheduledNotificationAsync(slot.id);
    } catch {
      /* already fired or gone */
    }
  }
  await writeNudgeState(petId, { slots: [], done: true });
}

/**
 * The guarded entry point, called whenever the Feed's activation state is known. It:
 *   • cancels the pet's pending nudges as soon as a reminder exists (`hasReminder === true`),
 *   • arms them once when there is no reminder (policy: care toggle, pet, permission, once per pet),
 *   • re-arms a future slot the OS no longer has.
 * Does nothing while `hasReminder` is unknown (loading / failed read). Returns the ids it scheduled.
 *
 * @param {object} args
 * @param {function} args.t i18n translator
 * @param {number|string} args.petId the ACTIVE pet (state and copy are per pet)
 * @param {string} [args.petName]
 * @param {boolean|undefined} args.hasReminder true / false / undefined (unknown)
 * @param {boolean} [args.permissionGranted] defaults to reading the OS permission
 * @param {Date} [args.now]
 */
export async function maybeArmReminderSetupNudge({
  t,
  petId,
  petName,
  hasReminder,
  permissionGranted,
  now = new Date(),
}) {
  try {
    if (petId == null) return [];
    if (hasReminder === true) {
      await cancelReminderSetupNudges(petId);
      return [];
    }
    if (hasReminder !== false) return [];

    const state = await readNudgeState(petId);
    if (state?.done) return [];

    const prefs = await getNotificationPrefs();
    const granted = permissionGranted ?? (await getNotificationPermissionGranted());

    if (!state) {
      if (
        !shouldArmReminderSetupNudge({ hasPet: true, hasReminder, permissionGranted: granted, alreadyArmed: false }, prefs)
      ) {
        return [];
      }
      const hour = clampToDaytimeHour(resolvePersonalizedSendHour(await getAppOpenHours(), prefs));
      const slots = [];
      for (let i = 0; i < REMINDER_NUDGE_DAY_OFFSETS.length; i += 1) {
        const at = nudgeTime(now, REMINDER_NUDGE_DAY_OFFSETS[i], hour);
        const id = await scheduleNudgeAt({
          content: buildReminderSetupContent(t, { petName, step: i }),
          at,
          petId,
        });
        if (id) slots.push({ id, at: at.toISOString() });
      }
      await writeNudgeState(petId, { slots, done: slots.length === 0 });
      return slots.map((s) => s.id);
    }

    // Already armed: keep the future slots alive, finish when both have passed. A category the user
    // has since switched off, or a revoked permission, simply leaves them un-re-armed.
    if (!shouldArmReminderSetupNudge({ hasPet: true, hasReminder, permissionGranted: granted, alreadyArmed: false }, prefs)) {
      return [];
    }
    const pending = new Set(((await getScheduledNotifications()) ?? []).map((n) => n.identifier));
    const nextSlots = [];
    const rearmed = [];
    for (let i = 0; i < (state.slots ?? []).length; i += 1) {
      const slot = state.slots[i];
      const at = new Date(slot.at);
      if (at.getTime() <= now.getTime()) continue; // already fired (or expired): finished
      if (pending.has(slot.id)) {
        nextSlots.push(slot);
        continue;
      }
      const id = await scheduleNudgeAt({
        content: buildReminderSetupContent(t, { petName, step: i }),
        at,
        petId,
      });
      if (id) {
        nextSlots.push({ id, at: slot.at });
        rearmed.push(id);
      }
    }
    await writeNudgeState(petId, { slots: nextSlots, done: nextSlots.length === 0 });
    return rearmed;
  } catch (error) {
    console.error("[engagementNotifications] reminder-setup nudge failed:", error?.message);
    return [];
  }
}
