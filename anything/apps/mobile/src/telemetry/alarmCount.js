// reminder_alarms {count}: how many local notifications this phone has pending. A number and nothing else (no ids, no
// titles, no pet). iOS keeps only 64, and the app budgets the soonest ~48 reminders, so real numbers tell whether that
// is enough. At most once an hour, a little after the app comes to the front so the reminders have been re-armed first.

import { track } from './track';

export const ALARM_COUNT_DELAY_MS = 20 * 1000;
export const ALARM_COUNT_MIN_GAP_MS = 60 * 60 * 1000;

let lastReportAt = null;

export function resetAlarmCountMemory() {
  lastReportAt = null;
}

/** Count what is pending and report it (throttled). Resolves to the count sent, or null. Never throws. */
export async function reportPendingAlarms(now = Date.now()) {
  try {
    if (lastReportAt != null && now - lastReportAt < ALARM_COUNT_MIN_GAP_MS) return null;
    // Required lazily: telemetry is set up at the root, before the notification layer is needed.
    const Notifications = require('expo-notifications');
    const pending = await Notifications.getAllScheduledNotificationsAsync();
    if (!Array.isArray(pending)) return null;
    lastReportAt = now;
    const count = Math.min(pending.length, 999);
    track('reminder_alarms', { count: String(count) });
    return count;
  } catch {
    return null;
  }
}

/** Report in a little while. Returns the cancel function. */
export function scheduleAlarmCountReport(delayMs = ALARM_COUNT_DELAY_MS) {
  const timer = setTimeout(() => void reportPendingAlarms(), delayMs);
  return () => clearTimeout(timer);
}
