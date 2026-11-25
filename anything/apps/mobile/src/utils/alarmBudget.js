// The alarm budget (PR5b Phase 1C). iOS keeps only 64 pending local notifications per app and silently drops the rest.
// So instead of arming 14 days of every dog's schedule, the phone arms the SOONEST routine reminders across ALL dogs,
// and tops them up every time the app comes to the front (store/remindersStore.syncAlarms).
//
// Never evicted: a running snooze, and everything that is not a routine reminder (the daily "come back" nudge, consult
// and setup nudges). Room is left for them.

export const IOS_PENDING_LIMIT = 64;
export const ROUTINE_ALARM_BUDGET = 48;

const isRoutineAlarm = (n) => typeof n?.identifier === "string" && n.identifier.startsWith("reminder_");

/**
 * Pure: which reminders should have an alarm, and which pending alarms must make room.
 *
 * @param {object} args
 * @param {Array<{id: string, fireAt: number, snoozed?: boolean}>} args.candidates reminders that may ring (this phone
 *   knows them, they are not done/off, and their alert time is still ahead).
 * @param {Array<{identifier: string}>} args.pending what the OS has pending now.
 * @param {Set<string>} args.knownIds every reminder id this phone currently holds. A pending routine alarm that is NOT
 *   in here belongs to a dog not read yet this launch (or to an earlier snooze): it is left alone and counted.
 * @param {Set<string>} [args.snoozedIds] running snooze ids (protected, also when unknown).
 * @returns {{ arm: Array, cancel: string[] }} `arm` soonest first; `cancel` = pending identifiers to drop.
 */
export function selectAlarmsToArm({ candidates = [], pending = [], knownIds = new Set(), snoozedIds = new Set() } = {}) {
  const snoozed = candidates.filter((c) => c.snoozed);
  const regular = candidates
    .filter((c) => !c.snoozed)
    .sort((a, b) => a.fireAt - b.fireAt || String(a.id).localeCompare(String(b.id)));

  let others = 0; // not routine reminders: never touched
  let unknownRoutine = 0; // routine alarms we know nothing about: kept, and they use up the routine budget
  let unknownSnoozed = 0;
  for (const n of pending) {
    if (!isRoutineAlarm(n)) others += 1;
    else if (!knownIds.has(n.identifier)) {
      if (snoozedIds.has(n.identifier)) unknownSnoozed += 1;
      else unknownRoutine += 1;
    }
  }

  const slots = Math.max(
    0,
    Math.min(
      ROUTINE_ALARM_BUDGET - unknownRoutine,
      IOS_PENDING_LIMIT - others - unknownRoutine - unknownSnoozed - snoozed.length,
    ),
  );
  const arm = [...snoozed, ...regular.slice(0, slots)].sort(
    (a, b) => a.fireAt - b.fireAt || String(a.id).localeCompare(String(b.id)),
  );
  const armed = new Set(arm.map((c) => c.id));
  const cancel = pending
    .filter((n) => isRoutineAlarm(n) && knownIds.has(n.identifier) && !armed.has(n.identifier))
    .map((n) => n.identifier);
  return { arm, cancel };
}
