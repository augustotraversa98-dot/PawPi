// Reminder resolution — pure logic for "is this scheduled instance already done?"
//
// The Today screen surfaces past-due ("Overdue") instances for the PERSISTENT
// reminder types and must hide any that are already resolved — either logged in a
// DB source, or skipped/dismissed. This module is pure (no React, no fetch) so the
// matching rules can be unit-tested directly; the hook layer feeds it the rows it
// fetched. It mirrors how wellnessLog.js keeps its routing/validation pure.
//
// Resolution sources per type (see supabase/SCHEMA_NOTES.md + ARCHITECTURE.md):
//   - wellness check (non-weight) → health_wellness_logs, matched EXACTLY on
//     routine_id + wellness_check_item_index + values_json.scheduledDate.
//   - wellness "weight" sub-type → health_weight_logs has NO routine/item/date
//     linkage (known gap). Heuristic: a weight log dated ON OR AFTER the instance's
//     scheduledDate satisfies it. A log dated BEFORE does NOT (so yesterday's weigh-in
//     never suppresses today's check). Limitation: with multiple weight checks in one
//     window a single weigh-in clears every earlier one. Linkage columns deferred.
//   - photo check → health_photo_checks, same date heuristic per body_area (no linkage).
//   - medical care → health_medical_care_logs, matched on routine_id +
//     medical_care_item_id + given_at EQUALLING the instance's scheduledAt timestamp.
//     The log flow writes givenAt = the acted instance's scheduledAt
//     (buildMedicalCareLogPayload), so the timestamp IS the instance identity. Exact
//     match per instance — never per day: a morning "given" log must not resolve the
//     same item's evening dose (day-level matching hid every later same-day instance,
//     the bug behind "overdue never appears"). No same-day fallback, deliberately.
//   - vet appointment → resolution is the appointment's status, already filtered out
//     upstream by useVetAppointmentReminders (it only returns scheduled/missed). Not
//     reconciled here.

import { toDateStr } from "./wellnessLog";
import {
  generateOverdueInstances,
  isRoutineDeleted,
} from "./reminderGenerator";

// Reminder types whose overdue instances persist across days / survive restart.
export const PERSISTENT_TYPES = new Set([
  "wellness_check",
  "medical_care",
  "photo_check",
  "vet_appointment",
]);

// Stable identity for a scheduled instance. The generator ids are already
// deterministic per (routine, item, date), so they double as the dismissal key.
export function instanceKey(reminder) {
  return reminder?.id ?? null;
}

// THE classification boundary for Today's sections: an instance whose scheduled
// time has been reached (scheduledAt <= now) is overdue; a strictly-future one is
// upcoming/"due soon". Every section derivation — Overdue selection below, the
// Due Soon / Next Up sectioning in reminderSections.js — goes through this one
// predicate, so an instance can never sit on both sides of the boundary.
export function isPastDue(reminder, now = new Date()) {
  const t = new Date(
    reminder?.scheduledAt ?? reminder?.nextTriggerAt,
  ).getTime();
  const nowMs = now instanceof Date ? now.getTime() : new Date(now).getTime();
  return !Number.isNaN(t) && !Number.isNaN(nowMs) && t <= nowMs;
}

// Build the lookup index from fetched DB rows. Snake_case fields come straight from
// the API (SELECT *). Dates are reduced to local YYYY-MM-DD via toDateStr so they
// compare lexicographically.
export function buildResolutionIndex({
  wellnessLogs = [],
  weightLogs = [],
  medicalLogs = [],
  photoChecks = [],
} = {}) {
  const wellnessKeys = new Set();
  for (const log of wellnessLogs) {
    const scheduledDate = log?.values_json?.scheduledDate;
    if (
      log?.routine_id == null ||
      log?.wellness_check_item_index == null ||
      !scheduledDate
    ) {
      continue;
    }
    wellnessKeys.add(
      `${log.routine_id}:${log.wellness_check_item_index}:${scheduledDate}`,
    );
  }

  let maxWeightDate = null;
  for (const log of weightLogs) {
    const d = toDateStr(log?.logged_at);
    if (d && (maxWeightDate == null || d > maxWeightDate)) maxWeightDate = d;
  }

  const maxPhotoDateByArea = new Map();
  for (const pc of photoChecks) {
    const d = toDateStr(pc?.created_at);
    if (!d || !pc?.body_area) continue;
    const cur = maxPhotoDateByArea.get(pc.body_area);
    if (cur == null || d > cur) maxPhotoDateByArea.set(pc.body_area, d);
  }

  // Keyed on the exact given_at timestamp (epoch ms, so "+00:00" vs "Z" ISO
  // variants compare equal) — one log resolves exactly one scheduled instance.
  const medicalKeys = new Set();
  for (const log of medicalLogs) {
    const t = new Date(log?.given_at ?? NaN).getTime();
    if (
      log?.routine_id == null ||
      log?.medical_care_item_id == null ||
      Number.isNaN(t)
    ) {
      continue;
    }
    medicalKeys.add(`${log.routine_id}:${log.medical_care_item_id}:${t}`);
  }

  return { wellnessKeys, maxWeightDate, maxPhotoDateByArea, medicalKeys };
}

// Is this scheduled instance already logged in a DB source?
export function isInstanceResolved(reminder, index) {
  if (!reminder || !index) return false;
  const scheduledDate = toDateStr(reminder.scheduledAt ?? reminder.nextTriggerAt);
  if (!scheduledDate) return false;

  switch (reminder.type) {
    case "wellness_check": {
      // Weight is logged to health_weight_logs (no linkage) → date heuristic.
      if (reminder.checkType === "weight") {
        return index.maxWeightDate != null && index.maxWeightDate >= scheduledDate;
      }
      return index.wellnessKeys.has(
        `${reminder.routineId}:${reminder.wellnessCheckItemIndex}:${scheduledDate}`,
      );
    }
    case "photo_check": {
      const max = index.maxPhotoDateByArea.get(reminder.relatedBodyArea);
      return max != null && max >= scheduledDate;
    }
    case "medical_care": {
      const t = new Date(
        reminder.scheduledAt ?? reminder.nextTriggerAt,
      ).getTime();
      return (
        !Number.isNaN(t) &&
        index.medicalKeys.has(
          `${reminder.routineId}:${reminder.medicalCareItemId}:${t}`,
        )
      );
    }
    default:
      // vet_appointment is resolved upstream by status; other types not reconciled.
      return false;
  }
}

// Select the Overdue list: persistent-type instances scheduled in the past that are
// neither resolved (logged) nor dismissed (skipped) nor actively snoozed. `now` is
// injectable for tests. `dismissedKeys` is a Set of instance keys (reminder ids);
// `snoozes` is the store's instance-id-keyed snooze map (id → snoozedUntil ISO) —
// an actively snoozed instance is homed in the Snoozed section instead, and falls
// back here once the snooze elapses (if still past due and unresolved).
export function selectOverdueReminders({
  reminders = [],
  index,
  dismissedKeys = new Set(),
  now = new Date(),
  snoozes = {},
}) {
  const nowMs = now instanceof Date ? now.getTime() : new Date(now).getTime();
  const seen = new Set();
  const overdue = [];

  for (const reminder of reminders) {
    if (!reminder || !PERSISTENT_TYPES.has(reminder.type)) continue;

    const key = instanceKey(reminder);
    if (key == null || seen.has(key)) continue; // dedupe by id

    if (!isPastDue(reminder, now)) continue; // past only — the shared boundary

    if (reminder.status === "completed" || reminder.status === "disabled") {
      continue;
    }
    if (dismissedKeys.has(key)) continue;
    const snoozedUntil = snoozes[key] ?? reminder.snoozedUntil;
    if (snoozedUntil && new Date(snoozedUntil).getTime() > nowMs) continue;
    if (isInstanceResolved(reminder, index)) continue;

    seen.add(key);
    overdue.push(reminder);
  }

  // Most recently due first.
  overdue.sort(
    (a, b) =>
      new Date(b.scheduledAt ?? b.nextTriggerAt) -
      new Date(a.scheduledAt ?? a.nextTriggerAt),
  );
  return overdue;
}

// Build the Overdue list DETERMINISTICALLY from the routines + vet reminders alone —
// NOT from the mutable in-memory reminders store. A missed instance is re-derived
// from its routine on every call (generateOverdueInstances), so unrelated store
// activity (a future-reminder regeneration, a status flip, a notification sync) can
// never remove it; it persists until a DB log resolves it or it is dismissed. `now`
// is injected so the caller can make it reactive (tick) and tests can pin it.
export function buildOverdueReminders({
  routines = [],
  vetReminders = [],
  index,
  dismissedKeys = new Set(),
  now = new Date(),
  lookbackDays = 30,
  petId = null,
  snoozes = {},
}) {
  const nowDate = now instanceof Date ? now : new Date(now);
  const activePetId = petId != null ? String(petId) : null;
  const matchesPet = (r) =>
    activePetId == null || String(r?.petId) === activePetId;

  const generated = (routines || [])
    .filter((r) => r && r.isActive && !isRoutineDeleted(r) && matchesPet(r))
    .flatMap((r) =>
      generateOverdueInstances(r, { lookbackDays, now: nowDate }),
    );

  const candidates = [...generated, ...(vetReminders || [])].filter(matchesPet);

  return selectOverdueReminders({
    reminders: candidates,
    index,
    dismissedKeys,
    now: nowDate,
    snoozes,
  });
}
