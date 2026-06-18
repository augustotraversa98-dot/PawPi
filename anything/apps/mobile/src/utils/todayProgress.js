import { ROUTINE_TYPES } from "@/data/routinesData";
import { getLocalPostDateString } from "@/utils/dateUtils";

// "Today's Progress" derived from REAL logged completions (ticket 2.66) — never
// hardcoded. Counts the active pet's logs whose LOCAL day matches `todayStr`,
// against the day's targets from the active routines. Pure + deterministic so it
// can be unit-tested and so the counts always match what the Today list records.

// Count logs whose timestamp falls on the given local day.
function countOnDay(logs, tsField, todayStr) {
  if (!Array.isArray(logs)) return 0;
  return logs.reduce((n, log) => {
    const ts = log?.[tsField];
    if (!ts) return n;
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return n;
    return getLocalPostDateString(d) === todayStr ? n + 1 : n;
  }, 0);
}

const isActive = (r) => r && r.isActive !== false && !r.deletedAt;

// How many feeding times are scheduled per day (the meals/times the routine holds).
function feedingTarget(routines) {
  return (routines || [])
    .filter((r) => isActive(r) && r.type === ROUTINE_TYPES.FEEDING)
    .reduce((n, r) => n + (r.meals?.length || r.times?.length || 0), 0);
}

// How many walks are scheduled per day.
function walkTarget(routines) {
  return (routines || [])
    .filter((r) => isActive(r) && r.type === ROUTINE_TYPES.WALK)
    .reduce((n, r) => n + (r.walks?.length || r.times?.length || 0), 0);
}

/**
 * Build the Today's-Progress chips from real data for the active pet + local day.
 *
 * @returns {{ chips: Array<{key,emoji,label}>, isEmpty: boolean }}
 *   isEmpty is true when NOTHING has been logged today (render an empty state,
 *   never fake numbers).
 */
export function buildTodayProgress({
  routines = [],
  foodLogs = [],
  walkLogs = [],
  medicalLogs = [],
  todayStr = getLocalPostDateString(),
} = {}) {
  const fed = countOnDay(foodLogs, "logged_at", todayStr);
  const walked = countOnDay(walkLogs, "start_time", todayStr);
  const med = countOnDay(medicalLogs, "given_at", todayStr);

  // Nothing logged yet → empty/encouraging state, no chips, no fake counts.
  if (fed + walked + med === 0) {
    return { chips: [], isEmpty: true };
  }

  const mealTarget = feedingTarget(routines);
  const walksScheduled = walkTarget(routines);
  const chips = [];

  if (mealTarget > 0) {
    chips.push({ key: "feeding", emoji: "🍽️", label: `${fed}/${mealTarget} meals` });
  } else if (fed > 0) {
    chips.push({
      key: "feeding",
      emoji: "🍽️",
      label: `${fed} meal${fed === 1 ? "" : "s"} logged`,
    });
  }

  if (walksScheduled > 0) {
    chips.push({ key: "walk", emoji: "🚶", label: `${walked}/${walksScheduled} walks` });
  } else if (walked > 0) {
    chips.push({
      key: "walk",
      emoji: "🚶",
      label: `${walked} walk${walked === 1 ? "" : "s"} done`,
    });
  }

  if (med > 0) {
    chips.push({
      key: "medication",
      emoji: "💊",
      label: med === 1 ? "Medication given" : `${med} doses given`,
    });
  }

  return { chips, isEmpty: chips.length === 0 };
}
