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
import { isNotificationPermissionGranted } from "./notifications";
import {
  NOTIF_CATEGORIES,
  shouldSendStreakSave,
  isWithinDailyCap,
  resolvePersonalizedSendHour,
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
