// Today-screen sectioning — pure selection of the "Snoozed" list, the "Due Soon"
// countdown list and the "Next Up" list from the combined reminder set (store
// reminders + vet).
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
// An actively snoozed instance is homed exclusively in Snoozed — it outranks
// every other section, including Overdue, so a snoozed item whose scheduled time
// passes mid-snooze stays in Snoozed (the Overdue selector skips it via the same
// `snoozes` map) instead of surfacing in two places. When the snooze elapses the
// instance falls back through the normal boundary: Overdue if its scheduled time
// passed, Due Soon / Next Up otherwise.
//
// `snoozes` is the instance-id-keyed map from the reminders store (id →
// snoozedUntil ISO); it exists because some reminders (vet appointments) never
// live in the store, so a field on the reminder object can't hold their snooze.
// The per-reminder snoozedUntil field is still honored as a fallback.
//
// `headsUpIds` (active early-reminder heads-up instances, headsUpReminders.js)
// are homed exclusively in the "Upcoming" heads-up section while their early
// window is open, so they are excluded here — a heads-up instance is future
// (now < eventTime) and would otherwise land in Due Soon / Next Up. Once its
// event time arrives it is no longer a heads-up and sections normally.
//
// `dismissedKeys` (durable skips from reminder_dismissals) excludes an instance
// from EVERY section — same rule the Overdue selector applies — so a transient
// instance skipped from Snoozed can't reappear in Due Soon when its snooze ends.
//
// `earlyDismissedKeys` (the `${id}::early` acknowledgements from reminder_dismissals)
// hides a FUTURE instance from every pre-event section once its heads-up was Closed:
// the early reminder was the LEAD time, not the event distance, so the true event can
// still be inside the 6h Next Up window. The user already acknowledged it, so it must
// not fall back into Due Soon / Next Up. This applies ONLY while the instance is
// future — a past-due instance is NOT skipped here, so persistent types still home in
// the Overdue section at/after their event time (the `::early` key is partitioned out
// of `dismissedKeys` and never reaches the Overdue selector).
//
// `now` is injected (the caller passes the same reactive clock that drives the
// Overdue list) so all sections agree on which side of "now" an instance is on,
// and so pull-to-refresh can reclassify by advancing that clock.

import { PERSISTENT_TYPES, isPastDue } from "./reminderResolution";

// Future horizon for the "Due Soon" countdown cards.
export const DUE_SOON_WINDOW_MS = 60 * 60 * 1000;
// Future horizon for the "Next Up" list.
export const NEXT_UP_WINDOW_MS = 6 * 60 * 60 * 1000;

export function sectionTodayReminders({
  reminders = [],
  overdueIds = new Set(),
  headsUpIds = new Set(),
  now = new Date(),
  snoozes = {},
  dismissedKeys = new Set(),
  earlyDismissedKeys = new Set(),
}) {
  const nowMs = now instanceof Date ? now.getTime() : new Date(now).getTime();
  const dueSoon = [];
  const nextUp = [];
  const snoozed = [];

  for (const reminder of reminders) {
    if (!reminder) continue;
    if (reminder.status === "completed" || reminder.status === "disabled") {
      continue;
    }
    if (dismissedKeys.has(reminder.id)) continue; // durably skipped — gone

    const snoozedUntil = snoozes[reminder.id] ?? reminder.snoozedUntil;
    if (snoozedUntil && new Date(snoozedUntil).getTime() > nowMs) {
      // Snoozed outranks Overdue — checked before the overdueIds exclusion so
      // the instance has exactly one home while the snooze is active.
      snoozed.push(
        reminder.snoozedUntil === snoozedUntil
          ? reminder
          : { ...reminder, snoozedUntil },
      );
      continue;
    }

    if (overdueIds.has(reminder.id)) continue; // homed in Overdue
    if (headsUpIds.has(reminder.id)) continue; // homed in the heads-up section

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
    // FUTURE branch: an early-dismissed (heads-up Closed) instance stays hidden
    // from Due Soon / Next Up until its event time. Only future instances reach
    // here, so this never suppresses an Overdue home.
    if (earlyDismissedKeys.has(`${reminder.id}::early`)) continue;
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
  // Soonest-to-return first.
  snoozed.sort((a, b) => new Date(a.snoozedUntil) - new Date(b.snoozedUntil));

  return { dueSoon, nextUp, snoozed };
}
