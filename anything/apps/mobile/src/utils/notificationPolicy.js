// notificationPolicy — the pure decision layer for the E5 notification rewrite
// (docs/pet-owner-engagement.md, unit E5).
//
// The whole system is rebuilt around WANTED triggers only. This module answers, with no
// side effects, the questions the schedulers ask:
//   • which categories exist, and is a category enabled for this user?
//   • should the one positive end-of-day "streak-save" fire right now?
//   • are we within the global frequency cap for today?
//   • what local hour should we send at (the owner's usual open hour, else evening)?
//
// Guardrails baked in (never as copy — that lives in engagementNotifications):
//   • The streak-save fires ONLY when the ring is exactly one segment from closing AND the
//     streak is genuinely at risk (streak>0, not already closed, not a rest/paused day) AND
//     it hasn't already been sent today. Never a guilt nudge, never a "you neglected Rex".
//   • Rest/vacation days and paused days are NEVER at risk — they can't trigger a streak-save.

// The four wanted categories. Everything else (chore/guilt reminders) is removed.
export const NOTIF_CATEGORIES = {
  SOCIAL: "social", // paw / bark / new follow / a friend posted
  MILESTONE: "milestone", // gotcha/birthday day + the 3-day countdown
  STREAK: "streak", // the single positive end-of-day streak-save
  CARE: "care", // the user's OWN care reminders (feeding/meds/etc.), positively framed
};

export const ALL_CATEGORIES = Object.values(NOTIF_CATEGORIES);

// Categories that a scheduler actually reads today, i.e. whose Settings toggle is REAL:
//   • STREAK — shouldSendStreakSave (the end-of-day streak-save nudge)
//   • CARE   — shouldArmReminderSetupNudge (the first-reminder setup tip) + the user's own reminders
// SOCIAL and MILESTONE gate nothing (their copy builders have no caller and no server scheduler exists), so
// Settings does NOT show them (notifications v2, docs/notifications-v2-design.md: no fake controls). Their
// stored values are kept and the constants stay, so the toggles can return the day a scheduler is wired.
export const SCHEDULED_CATEGORIES = [NOTIF_CATEGORIES.STREAK, NOTIF_CATEGORIES.CARE];

// Defaults: everything on, a gentle daily cap, evening send fallback.
export const DEFAULT_PREFS = {
  social: true,
  milestone: true,
  streak: true,
  care: true,
  frequencyCap: 4, // max engagement notifications per local day
  sendHour: null, // null ⇒ derive per-user (usual open hour), fall back to EVENING_HOUR
};

export const EVENING_HOUR = 19; // 7pm local — the fallback + the streak-save slot

/**
 * How many of the ring's three segments are still open?
 * @param {{walkDone?:boolean, momentDone?:boolean, careDone?:boolean}} seg
 * @returns {number} 0..3
 */
export function countRemainingSegments(seg = {}) {
  const done =
    (seg.walkDone ? 1 : 0) + (seg.momentDone ? 1 : 0) + (seg.careDone ? 1 : 0);
  return 3 - done;
}

/**
 * Is a category enabled? Unknown categories default to enabled (fail-open for display),
 * but a category explicitly set to false is suppressed.
 * @param {object} prefs
 * @param {string} category
 */
export function isCategoryEnabled(prefs, category) {
  const p = prefs || DEFAULT_PREFS;
  return p[category] !== false;
}

/**
 * The core at-risk test for the single positive streak-save notification.
 *
 * Fires ONLY when ALL are true:
 *   • the streak category is enabled
 *   • the streak is > 0 (there is something to save)
 *   • the ring is NOT already closed today
 *   • exactly ONE segment remains (the "one more thing to finish Rex's day" moment)
 *   • today is NOT a rest day and NOT within a pause (those are excused, never at risk)
 *   • it hasn't already been sent today (once/day)
 *
 * @param {object} state
 * @param {boolean} state.walkDone
 * @param {boolean} state.momentDone
 * @param {boolean} state.careDone
 * @param {boolean} state.ringClosed
 * @param {boolean} [state.restDay]
 * @param {boolean} [state.paused]
 * @param {number}  state.streakCount
 * @param {boolean} [state.alreadySentToday]
 * @param {object}  [prefs]
 * @returns {boolean}
 */
export function shouldSendStreakSave(state = {}, prefs = DEFAULT_PREFS) {
  if (!isCategoryEnabled(prefs, NOTIF_CATEGORIES.STREAK)) return false;
  if (state.alreadySentToday) return false;
  if (state.restDay || state.paused) return false;
  if (!(Number(state.streakCount) > 0)) return false;
  if (state.ringClosed) return false;
  return countRemainingSegments(state) === 1;
}

/**
 * Global frequency cap: have we already sent `cap` engagement notifications on `dayKey`?
 * `sentLog` is a map of { [YYYY-MM-DD]: count }.
 * @returns {boolean} true when there is room to send another
 */
export function isWithinDailyCap(sentLog, dayKey, cap = DEFAULT_PREFS.frequencyCap) {
  const used = (sentLog && sentLog[dayKey]) || 0;
  return used < Math.max(0, cap);
}

/**
 * Personalized send hour: the owner's most common app-open hour, else the evening fallback.
 * `openHours` is an array of local hour numbers (0..23) collected from recent app opens.
 * An explicit prefs.sendHour always wins.
 * @param {number[]} openHours
 * @param {object} [prefs]
 * @returns {number} 0..23
 */
export function resolvePersonalizedSendHour(openHours, prefs = DEFAULT_PREFS) {
  if (prefs && Number.isInteger(prefs.sendHour)) {
    return clampHour(prefs.sendHour);
  }
  if (!Array.isArray(openHours) || openHours.length === 0) return EVENING_HOUR;
  const counts = new Map();
  for (const h of openHours) {
    if (!Number.isInteger(h) || h < 0 || h > 23) continue;
    counts.set(h, (counts.get(h) || 0) + 1);
  }
  if (counts.size === 0) return EVENING_HOUR;
  let best = EVENING_HOUR;
  let bestN = -1;
  for (const [h, n] of counts) {
    if (n > bestN) {
      best = h;
      bestN = n;
    }
  }
  return best;
}

function clampHour(h) {
  if (!Number.isInteger(h)) return EVENING_HOUR;
  return Math.min(23, Math.max(0, h));
}

// ── First-reminder setup nudge ─────────────────────────────────────────────────
// For an owner who has a pet but NO routine/reminder yet. A local, positive "want a hand setting
// one up?" — never a guilt message — armed once per pet and cancelled the moment a reminder
// exists. Decision logic only; the scheduling lives in engagementNotifications.

// Days after the nudge is armed that each (at most two) notification lands. Day 1 = tomorrow.
export const REMINDER_NUDGE_DAY_OFFSETS = [1, 4];

// Never at night: the learned open hour is clamped into this daytime window for THIS nudge
// (quiet hours do not exist yet — see docs/notifications-audit.md).
export const NUDGE_EARLIEST_HOUR = 9;
export const NUDGE_LATEST_HOUR = 20;

/** Clamp an hour into the daytime window a setup nudge may land in. */
export function clampToDaytimeHour(hour) {
  if (!Number.isInteger(hour)) return EVENING_HOUR;
  return Math.min(NUDGE_LATEST_HOUR, Math.max(NUDGE_EARLIEST_HOUR, hour));
}

/**
 * Should the first-reminder nudge be armed for this pet right now?
 *
 * True ONLY when ALL hold:
 *   • the `care` category is enabled (the user's own care reminders toggle)
 *   • there is an active pet
 *   • we KNOW there is no reminder yet (`hasReminder === false` — never while it is still loading,
 *     never when the read failed, so a loading state can't trigger a nudge)
 *   • OS notification permission is granted
 *   • it has not already been armed / finished for this pet (once per pet, ever)
 *
 * @param {object} state
 * @param {boolean} [state.hasPet]
 * @param {boolean|undefined} state.hasReminder
 * @param {boolean} [state.permissionGranted]
 * @param {boolean} [state.alreadyArmed]
 * @param {object} [prefs]
 */
export function shouldArmReminderSetupNudge(state = {}, prefs = DEFAULT_PREFS) {
  if (!isCategoryEnabled(prefs, NOTIF_CATEGORIES.CARE)) return false;
  if (!state.hasPet) return false;
  if (state.hasReminder !== false) return false;
  if (!state.permissionGranted) return false;
  if (state.alreadyArmed) return false;
  return true;
}
