// Legacy alias: the Wellness-check weight entry used to save "lb" while every other
// entry point saves "lbs". Rows saved as "lb" are never rewritten — map on read so
// they display, toggle and re-save as "lbs". Other units (kg) and empty pass through.
export function normalizeWeightUnit(unit) {
  if (typeof unit !== "string") return unit;
  const u = unit.trim().toLowerCase();
  return u === "lb" || u === "lbs" ? "lbs" : unit;
}
