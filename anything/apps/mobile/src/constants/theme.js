// Design-system barrel (ticket 2.77 — Liquid Glass foundation).
// One import for the whole token set. Existing code that imports COLORS from
// "@/constants/colors" keeps working unchanged; new/restyled code can do:
//   import { COLORS, SPACING, RADIUS, TYPE, ELEVATION, MATERIALS, SPRINGS } from "@/constants/theme";
// The palette (COLORS / TAG_COLORS) is re-exported as-is — this redesign changes
// form/material/motion only, never the hues.

export { COLORS, TAG_COLORS } from "./colors";
export { SPACING, RADII, RADIUS } from "./spacing";
export { TYPE, WEIGHT } from "./typography";
export { ELEVATION, MATERIALS, BLUR } from "./elevation";
export {
  SPRINGS,
  DURATIONS,
  SCALE,
  selectByMotion,
  listEntering,
  listExiting,
  sheetEntering,
  sheetExiting,
  screenEntering,
} from "./motion";
