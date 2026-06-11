// Heads-up reminders — pure selection of "early" (lead-time) reminders that should
// surface as a distinct, NON-actionable HEADS-UP card in Health → Today during
// their early window, BEFORE their real event time.
//
// Background: an "Early reminder" lead-time (ScheduleBlock, e.g. "1 day before")
// fires an early OS push (#51/#55) but the stored INSTANCE stays pinned at the
// event time — id / scheduledAt / nextTriggerAt are unchanged (see notifications.js).
// So in-app there was no early artifact at all beyond the 6h Next Up horizon. This
// module reads the same lead-time back off the source routine and emits a heads-up
// for the WHOLE early window [earlyTime, eventTime).
//
// DEFINITIONS (mirroring the ticket):
//   eventTime = reminder.scheduledAt ?? reminder.nextTriggerAt
//   leadMs    = resolveLeadTimeMs(resolveReminderTiming(reminder, routine))
//   earlyTime = eventTime − leadMs
// A reminder is an ACTIVE HEADS-UP when:  leadMs > 0  AND  earlyTime <= now < eventTime.
//
// Excluded (never a heads-up): completed/disabled, actively snoozed, real-dismissed
// (the normal reminder_dismissals key), and early-dismissed (the heads-up-namespaced
// `${instanceKey}::early` key — "Close"/acknowledge). Once now >= eventTime the
// instance leaves heads-up and resumes normal sectioning (Overdue / Due Soon / Next Up)
// at its true time — exactly one home at any moment.
//
// Pure (no React, no fetch) so the window/exclusion rules can be unit-tested directly,
// mirroring reminderResolution.js / reminderSections.js.

import { resolveReminderTiming, resolveLeadTimeMs } from "./notifications";
import { instanceKey } from "./reminderResolution";

// The dismissal-key namespace for acknowledging a heads-up. Distinct from the real
// instanceKey so "Close" durably hides ONLY the heads-up and leaves the real
// instance's normal dismissal/surfacing untouched (it still surfaces at its event
// time). Stored in the same reminder_dismissals table — no migration needed.
export function earlyDismissalKey(reminder) {
  const key = instanceKey(reminder);
  return key == null ? null : `${key}::early`;
}

/**
 * Select the active heads-up list from the upcoming reminder instances.
 *
 * @param {Object} args
 * @param {Array}  args.reminders       upcoming store instances (pet-scoped by caller)
 * @param {Array}  args.routines        active pet's routines (for the lead-time lookup)
 * @param {Array}  args.vetReminders    DB-backed vet reminders (own their offset → never early)
 * @param {Date|number} args.now        reactive clock
 * @param {Set}    args.earlyDismissedKeys  `${id}::early` keys already acknowledged
 * @param {Set}    args.dismissedKeys   real dismissal keys (instance ids)
 * @param {Object} args.snoozes         instance-id → snoozedUntil ISO
 * @returns {Array} heads-up items, each the reminder plus an `eventTime` for the due label
 */
export function buildHeadsUpReminders({
  reminders = [],
  routines = [],
  vetReminders = [],
  now = new Date(),
  earlyDismissedKeys = new Set(),
  dismissedKeys = new Set(),
  snoozes = {},
} = {}) {
  const nowMs = now instanceof Date ? now.getTime() : new Date(now).getTime();
  if (Number.isNaN(nowMs)) return [];

  // routineId → routine for resolveReminderTiming (it reads the item-level
  // reminderTiming off the source routine). A reminder whose routine isn't in this
  // list resolves to no timing ⇒ leadMs 0 ⇒ skipped, which also pet-scopes for free.
  const routineById = new Map(
    (routines || []).filter(Boolean).map((r) => [String(r.id), r]),
  );

  const seen = new Set();
  const headsUp = [];

  // TEMPORARY diagnostic (remove with the heads-up card fix) — __DEV__-only, no
  // behavior change. Tag: [headsup-debug]. Tracks why a heads-up candidate is or
  // isn't surfaced. See ticket/early-reminder-headsup.
  if (__DEV__) {
    const iso = (ms) =>
      Number.isFinite(ms) ? new Date(ms).toISOString() : String(ms);
    console.log("[headsup-debug] ENTRY", {
      nowMs: iso(nowMs),
      remindersLength: (reminders || []).length,
      photoChecks: (reminders || [])
        .filter((r) => r?.type === "photo_check")
        .map((r) => ({ id: r.id, type: r.type })),
      routinesLength: (routines || []).length,
      earlyDismissedKeys: Array.from(earlyDismissedKeys || []),
      dismissedKeys: Array.from(dismissedKeys || []),
      snoozeKeys: Object.keys(snoozes || {}),
    });
  }

  for (const reminder of [...(reminders || []), ...(vetReminders || [])]) {
    if (!reminder) continue;

    const key = instanceKey(reminder);
    if (key == null || seen.has(key)) continue; // dedupe by id

    // TEMPORARY diagnostic ([headsup-debug]) — log one line per candidate with the
    // resolved timing and the guard it hits, mirroring the real guard order below.
    // __DEV__-only, computes its own throwaway values; no behavior change.
    if (__DEV__) {
      const iso = (ms) =>
        Number.isFinite(ms) ? new Date(ms).toISOString() : String(ms);
      const dbgRoutine = routineById.get(String(reminder.routineId));
      const dbgTiming = resolveReminderTiming(reminder, dbgRoutine);
      const dbgLeadMs = resolveLeadTimeMs(dbgTiming);
      const dbgEventTime = reminder.scheduledAt ?? reminder.nextTriggerAt;
      const dbgEventMs = new Date(dbgEventTime).getTime();
      const dbgEarlyMs = dbgEventMs - dbgLeadMs;
      const dbgSnoozedUntil = snoozes[key] ?? reminder.snoozedUntil;
      let decision;
      if (reminder.status === "completed" || reminder.status === "disabled") {
        decision = "skip: status";
      } else if (dismissedKeys.has(key)) {
        decision = "skip: dismissed";
      } else if (earlyDismissedKeys.has(`${key}::early`)) {
        decision = `skip: early-dismissed (${key}::early)`;
      } else if (dbgSnoozedUntil && new Date(dbgSnoozedUntil).getTime() > nowMs) {
        decision = "skip: snoozed";
      } else if (!(dbgLeadMs > 0)) {
        decision = "skip: leadMs<=0";
      } else if (Number.isNaN(dbgEventMs)) {
        decision = "skip: after-event";
      } else if (nowMs < dbgEarlyMs) {
        decision = "skip: before-early-window";
      } else if (nowMs >= dbgEventMs) {
        decision = "skip: after-event";
      } else {
        decision = "INCLUDED";
      }
      console.log("[headsup-debug] candidate", {
        id: key,
        type: reminder.type,
        routineId: reminder.routineId,
        foundRoutine: dbgRoutine != null,
        reminderTiming: dbgTiming,
        leadMs: dbgLeadMs,
        eventTime: iso(dbgEventMs),
        earlyMs: iso(dbgEarlyMs),
        nowMs: iso(nowMs),
        decision,
      });
    }

    if (reminder.status === "completed" || reminder.status === "disabled") {
      continue;
    }
    if (dismissedKeys.has(key)) continue; // real dismissal — gone everywhere
    if (earlyDismissedKeys.has(`${key}::early`)) continue; // heads-up acknowledged

    // Actively snoozed → homed in Snoozed; never also a heads-up.
    const snoozedUntil = snoozes[key] ?? reminder.snoozedUntil;
    if (snoozedUntil && new Date(snoozedUntil).getTime() > nowMs) continue;

    const routine = routineById.get(String(reminder.routineId));
    const leadMs = resolveLeadTimeMs(resolveReminderTiming(reminder, routine));
    if (!(leadMs > 0)) continue; // no early window → never a heads-up

    const eventTime = reminder.scheduledAt ?? reminder.nextTriggerAt;
    const eventMs = new Date(eventTime).getTime();
    if (Number.isNaN(eventMs)) continue;

    const earlyMs = eventMs - leadMs;
    // Active heads-up window: earlyTime <= now < eventTime. Before the early time it
    // hasn't started; at/after the event it resumes normal sectioning.
    if (nowMs < earlyMs || nowMs >= eventMs) continue;

    seen.add(key);
    // Carry eventTime explicitly as the due-label source for the card.
    headsUp.push({ ...reminder, eventTime });
  }

  // Soonest event first.
  headsUp.sort(
    (a, b) => new Date(a.eventTime).getTime() - new Date(b.eventTime).getTime(),
  );
  return headsUp;
}
