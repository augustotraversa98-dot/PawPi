// notificationPreferences — persisted, per-category notification settings (E5).
//
// Backs the Settings → Notifications toggles and the frequency cap. Everything lives in
// AsyncStorage (no server round-trip, no migration): the toggles gate LOCAL notifications
// and the in-app category filters, and the cap is enforced client-side against a per-day
// send log. Also records a lightweight app-open-hour history so the schedulers can send at
// the owner's usual time instead of a fixed hour.

import AsyncStorage from "@react-native-async-storage/async-storage";
import { DEFAULT_PREFS, ALL_CATEGORIES } from "./notificationPolicy";

const PREFS_KEY = "pawpi.notifPrefs.v1";
const SENTLOG_KEY = "pawpi.notifSentLog.v1";
const OPENHOURS_KEY = "pawpi.notifOpenHours.v1";
const OPEN_HOURS_MAX = 30; // keep the last ~30 opens for the "usual hour" estimate

/**
 * Load the merged preferences (defaults ← stored). Never throws.
 * @returns {Promise<object>}
 */
export async function getNotificationPrefs() {
  try {
    const raw = await AsyncStorage.getItem(PREFS_KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_PREFS, ...(parsed && typeof parsed === "object" ? parsed : {}) };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

/**
 * Merge-and-persist a partial preferences patch. Returns the merged result.
 * @param {object} patch
 * @returns {Promise<object>}
 */
export async function setNotificationPrefs(patch) {
  const current = await getNotificationPrefs();
  const next = { ...current, ...(patch || {}) };
  try {
    await AsyncStorage.setItem(PREFS_KEY, JSON.stringify(next));
  } catch {
    // best-effort; the in-memory value is still returned
  }
  return next;
}

/**
 * Toggle a single category on/off and persist.
 * @param {string} category one of ALL_CATEGORIES
 * @param {boolean} enabled
 */
export async function setCategoryEnabled(category, enabled) {
  if (!ALL_CATEGORIES.includes(category)) return getNotificationPrefs();
  return setNotificationPrefs({ [category]: !!enabled });
}

// ── Frequency-cap send log (per local day) ─────────────────────────────────────
async function readSentLog() {
  try {
    const raw = await AsyncStorage.getItem(SENTLOG_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * The whole per-day send log ({ 'YYYY-MM-DD': count }), pruned to the given day only so it
 * never grows unbounded. Pass today's local day key.
 */
export async function getSentLog(todayKey) {
  const log = await readSentLog();
  if (todayKey && log[todayKey] != null) return { [todayKey]: log[todayKey] };
  return {};
}

/**
 * Record that one engagement notification was sent on `dayKey`; prunes older days.
 */
export async function recordSent(dayKey) {
  if (!dayKey) return;
  const log = await readSentLog();
  const count = (log[dayKey] || 0) + 1;
  try {
    await AsyncStorage.setItem(SENTLOG_KEY, JSON.stringify({ [dayKey]: count }));
  } catch {
    /* best-effort */
  }
}

// ── App-open-hour history (for personalized send time) ─────────────────────────
/**
 * Record the local hour of an app open (0..23). Keeps a bounded rolling window.
 */
export async function recordAppOpenHour(hour) {
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return;
  let hours = [];
  try {
    const raw = await AsyncStorage.getItem(OPENHOURS_KEY);
    hours = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(hours)) hours = [];
  } catch {
    hours = [];
  }
  hours.push(hour);
  if (hours.length > OPEN_HOURS_MAX) hours = hours.slice(hours.length - OPEN_HOURS_MAX);
  try {
    await AsyncStorage.setItem(OPENHOURS_KEY, JSON.stringify(hours));
  } catch {
    /* best-effort */
  }
}

/**
 * The recorded app-open hours (for resolvePersonalizedSendHour).
 * @returns {Promise<number[]>}
 */
export async function getAppOpenHours() {
  try {
    const raw = await AsyncStorage.getItem(OPENHOURS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
