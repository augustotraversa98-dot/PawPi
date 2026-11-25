// Snoozes are keyed by reminder instance id (`reminder_<routineId>_<item>_<date>…`, remindersStore.snoozes). A snoozed
// instance is usually in the PAST, so the forward generator no longer produces it, yet its re-armed alert is wanted. Both
// the sweep and the alarm budget need to recognise it.

/** Pure: the snooze ids that are still running and belong to one of these routines (active, with notifications on). */
export function liveSnoozedIds(snoozes, routines, now = Date.now()) {
  const live = (routines || []).filter(
    (r) => r && r.isActive && r.notificationEnabled !== false && !r.deletedAt,
  );
  if (live.length === 0) return [];
  return Object.entries(snoozes || {})
    .filter(([, until]) => until && new Date(until).getTime() > now)
    .map(([id]) => id)
    .filter((id) => live.some((r) => id.startsWith(`reminder_${r.id}_`)));
}
