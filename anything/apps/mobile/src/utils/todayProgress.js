// Today's Progress — pure derivation of the daily completed/total summary on
// Health → Today. ONE counting path, fed by the SAME sources the reminder
// sections use (the pet-scoped instance set, buildResolutionIndex output, the
// durable dismissal keys, the reactive clock), so the numbers can never drift
// from the lists. No React, no fetch.
//
// Semantics (PR decisions):
//   - dismissed (skipped) instances leave the DENOMINATOR — "dismissed means
//     gone", same rule as every section. Skip one of two meds → "Meds 1/1".
//   - snoozed counts as scheduled-but-not-done (a snooze is not a resolution
//     signal anywhere in the pipeline, so this falls out naturally).
//   - feeding/walk have no per-instance log linkage yet (food logs carry no
//     routine/meal reference — known PR #41 gap), so their done-count is
//     today's log COUNT capped at the scheduled total: a manual food log
//     counts toward Meals.
//   - vet appointments count from the raw /api/vet-appointments rows (the
//     reminder hook filters completed ones out before mapping, which is
//     exactly what a done-count needs to see). Cancelled drops out of the
//     denominator like a dismissal; completed and missed stay in it.
//   - overdueCount is a passthrough of the reconciled Overdue list the section
//     renders — consistency with the section header by construction.

import { toDateStr } from "./wellnessLog";
import { isInstanceResolved } from "./reminderResolution";
import { generateRemindersFromRoutine } from "./reminderGenerator";

// Display order. Only categories with items today are emitted.
export const PROGRESS_CATEGORIES = [
  { key: "meals", label: "Meals", emoji: "🍽️" },
  { key: "walks", label: "Walks", emoji: "🚶" },
  { key: "meds", label: "Meds", emoji: "💊" },
  { key: "wellness", label: "Wellness", emoji: "❤️" },
  { key: "photos", label: "Photo checks", emoji: "📸" },
  { key: "vet", label: "Vet", emoji: "🩺" },
];

// Reminder type → progress category. vet_appointment instances are deliberately
// absent: the vet category counts the raw appointment rows instead (see above).
const TYPE_TO_CATEGORY = {
  feeding: "meals",
  walk: "walks",
  medical_care: "meds",
  medication: "meds",
  preventive: "meds",
  vaccine: "meds",
  wellness_check: "wellness",
  general_check: "wellness",
  weight_check: "wellness",
  photo_check: "photos",
};

const dateOnly = (value) => {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    return value.slice(0, 10);
  }
  return toDateStr(value);
};

export function buildTodayProgress({
  instances = [],
  routines = [],
  petId = null,
  index,
  dismissedKeys = new Set(),
  foodLogs = [],
  walkLogs = [],
  vetAppointments = [],
  overdue = [],
  now = new Date(),
}) {
  const nowDate = now instanceof Date ? now : new Date(now);
  const today = toDateStr(nowDate);

  // The store generator only emits FUTURE instances, so `instances` (the same
  // store+vet set the sections read) is missing any of today's times that had
  // already passed when the store was (re)built — opening the app at 6 PM must
  // still show "Meals 1/3", not "1/1". Re-derive today's FULL schedule from the
  // routines with the locked generator pinned to local midnight; the
  // deterministic ids dedupe the overlap. Store copies are iterated FIRST so an
  // instance completed in-session keeps its completed status.
  const activePetId = petId != null ? String(petId) : null;
  const matchesPet = (r) =>
    activePetId == null || String(r?.petId) === activePetId;
  const startOfToday = new Date(nowDate);
  startOfToday.setHours(0, 0, 0, 0);
  const todaySchedule = (routines || [])
    .filter((r) => r && r.isActive && matchesPet(r))
    .flatMap((r) => generateRemindersFromRoutine(r, 1, startOfToday));
  const all = [...instances, ...todaySchedule];
  const counts = new Map(); // category key → { done, total }
  const bump = (key, done) => {
    const c = counts.get(key) ?? { done: 0, total: 0 };
    c.total += 1;
    if (done) c.done += 1;
    counts.set(key, c);
  };

  const seen = new Set();
  for (const r of all) {
    if (!r || r.id == null || seen.has(r.id)) continue;
    seen.add(r.id);
    const category = TYPE_TO_CATEGORY[r.type];
    if (!category) continue;
    if (r.status === "disabled") continue;
    if (dismissedKeys.has(r.id)) continue; // skipped → out of the denominator
    if (toDateStr(r.scheduledAt ?? r.nextTriggerAt) !== today) continue;

    if (category === "meals" || category === "walks") {
      // Scheduled count only — completion comes from today's logs below.
      bump(category, false);
    } else {
      // Per-instance: a DB log resolves it (the durable signal); the store's
      // completed status covers the moment between save and refetch.
      bump(category, r.status === "completed" || isInstanceResolved(r, index));
    }
  }

  const countToday = (rows, field) =>
    rows.reduce((n, row) => (toDateStr(row?.[field]) === today ? n + 1 : n), 0);
  const meals = counts.get("meals");
  if (meals) meals.done = Math.min(countToday(foodLogs, "logged_at"), meals.total);
  const walks = counts.get("walks");
  if (walks) walks.done = Math.min(countToday(walkLogs, "start_time"), walks.total);

  for (const apt of vetAppointments) {
    if (!apt || apt.status === "cancelled") continue;
    if (dateOnly(apt.appointment_date) !== today) continue;
    bump("vet", apt.status === "completed");
  }

  const categories = PROGRESS_CATEGORIES.filter(
    (c) => (counts.get(c.key)?.total ?? 0) > 0,
  ).map((c) => ({ ...c, ...counts.get(c.key) }));

  return { categories, overdueCount: overdue.length };
}
