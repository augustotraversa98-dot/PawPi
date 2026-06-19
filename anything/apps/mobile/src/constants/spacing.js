// Spacing + radii tokens (ticket 2.77 — iOS 27 "Liquid Glass" foundation).
// A 4pt spacing scale and softer/larger corner radii give the app the airier,
// less-boxy feel of iOS 27. Pure data — no colors here (see colors.js for hues,
// which this redesign keeps untouched).

// 4pt base spacing scale. Use these instead of magic numbers when restyling.
export const SPACING = {
  none: 0,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  huge: 40,
};

// Softer, larger corner radii (the iOS 27 look). `pill` is for fully-rounded
// chips/bars; `round` for circular avatars (callers still pass size/2 when exact).
export const RADII = {
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 28,
  pill: 999,
};

// Semantic radii — name the role so screens stay consistent as they roll out.
export const RADIUS = {
  control: RADII.md, // buttons, inputs, small controls
  card: RADII.xl, // content cards
  sheet: RADII.xxl, // sheets / large surfaces
  chip: RADII.pill, // tags, pills
  bar: RADII.xxl, // the floating tab bar
};
