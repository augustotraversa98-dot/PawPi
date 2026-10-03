// Legacy alias: the mobile Wellness-check weight entry used to save "lb" while every other
// entry point saves "lbs". Rows saved as "lb" are never rewritten — map on read so
// they display, toggle and re-save as "lbs". Other units (kg) and empty pass through.
export function normalizeWeightUnit(unit) {
  if (typeof unit !== "string") return unit;
  const u = unit.trim().toLowerCase();
  return u === "lb" || u === "lbs" ? "lbs" : unit;
}

// Normalise the weight_unit on a row (or a list of rows) read from the DB.
export function withNormalizedWeightUnit(rowOrRows) {
  if (Array.isArray(rowOrRows)) return rowOrRows.map(withNormalizedWeightUnit);
  if (rowOrRows && typeof rowOrRows === "object" && "weight_unit" in rowOrRows) {
    return { ...rowOrRows, weight_unit: normalizeWeightUnit(rowOrRows.weight_unit) };
  }
  return rowOrRows;
}
