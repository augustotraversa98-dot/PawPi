// E9 — the positive-only activity-insight decision (server-authoritative, pure).
//
// Returns a { kind, params } and can NEVER return a negative comparison. The cohort branch is only
// reachable when the pet is above median in a qualifying (dense) cohort; below median we fall through
// to personal progress or a gentle forward nudge. Keeping this pure makes the guarantee unit-testable.
//
// Preference order: qualifying cohort win → personal "best month" → "more than last week" →
// "keep it going" → gentle forward nudge.
export function decideInsight({ thisWeek, lastWeek, prior3Max, cohort }) {
  if (cohort && cohort.qualifies && cohort.above_median && cohort.percentile >= 50) {
    return { kind: "cohort_top", params: { percentile: cohort.percentile, breed: cohort.breed } };
  }
  if (thisWeek > 0 && thisWeek >= prior3Max && prior3Max > 0) {
    return { kind: "best_month", params: { walks: thisWeek } };
  }
  if (thisWeek > lastWeek) {
    return { kind: "more_than_last", params: { diff: thisWeek - lastWeek } };
  }
  if (thisWeek > 0) {
    return { kind: "keep_going", params: { walks: thisWeek } };
  }
  return { kind: "gentle_nudge", params: {} };
}
