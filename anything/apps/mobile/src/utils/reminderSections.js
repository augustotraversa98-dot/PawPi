// Today-screen sectioning — pure selection of the "Due Soon" countdown list and
// the "Next Up" list from the combined reminder set (store reminders + vet).
//
// The classification boundary is isPastDue (reminderResolution.js): an instance
// with scheduledAt <= now is overdue, scheduledAt > now is upcoming. Past
// instances of the PERSISTENT types are homed exclusively in the Overdue section
// (buildOverdueReminders) and are never emitted here — including when the Overdue
// list dropped them as resolved or dismissed, because resolved/dismissed means
// gone, not "due soon". Transient types (feeding/walk) have no Overdue home yet
// (today-only overdue handling is a planned follow-up PR), so a past-due
// transient instance keeps its current countdown-card home until then.
//
// `now` is injected (the caller passes the same reactive clock that drives the
// Overdue list) so all three sections agree on which side of "now" an instance
// is on, and so pull-to-refresh can reclassify by advancing that clock.

import { PERSISTENT_TYPES, isPastDue } from "./reminderResolution";

// Future horizon for the "Due Soon" countdown cards.
export const DUE_SOON_WINDOW_MS = 60 * 60 * 1000;
// Future horizon for the "Next Up" list.
export const NEXT_UP_WINDOW_MS = 6 * 60 * 60 * 1000;

export function sectionTodayReminders({
  reminders = [],
  overdueIds = new Set(),
  now = new Date(),
}) {
  const nowMs = now instanceof Date ? now.getTime() : new Date(now).getTime();
  const dueSoon = [];
  const nextUp = [];

  for (const reminder of reminders) {
    if (!reminder) continue;
    if (overdueIds.has(reminder.id)) continue; // homed in Overdue
    if (reminder.status === "completed" || reminder.status === "disabled") {
      continue;
    }
    if (
      reminder.snoozedUntil &&
      new Date(reminder.snoozedUntil).getTime() > nowMs
    ) {
      continue;
    }

    const t = new Date(
      reminder.scheduledAt ?? reminder.nextTriggerAt,
    ).getTime();
    if (Number.isNaN(t)) continue;

    if (isPastDue(reminder, nowMs)) {
      // Past the boundary → overdue, never "due soon". Persistent types live in
      // the Overdue section only; transient ones keep their countdown card.
      if (!PERSISTENT_TYPES.has(reminder.type) && reminder.timeSensitive) {
        dueSoon.push(reminder);
      }
      continue;
    }
    if (reminder.timeSensitive && t - nowMs <= DUE_SOON_WINDOW_MS) {
      dueSoon.push(reminder);
      continue; // exactly one section — never also in Next Up
    }
    if (t - nowMs <= NEXT_UP_WINDOW_MS) {
      nextUp.push(reminder);
    }
  }

  const byTime = (a, b) =>
    new Date(a.scheduledAt ?? a.nextTriggerAt) -
    new Date(b.scheduledAt ?? b.nextTriggerAt);
  dueSoon.sort(byTime);
  nextUp.sort(byTime);

  return { dueSoon, nextUp };
}
