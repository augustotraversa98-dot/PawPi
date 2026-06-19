// Motion tokens (ticket 2.77 — Liquid Glass foundation).
// A small, shared set of spring presets + durations, plus reanimated layout-
// animation BUILDERS for the standard transitions (sheet/list/screen). Every
// builder takes `reduceMotion` and degrades to a plain fade (or nothing) so the
// Reduce-Motion accessibility setting is honored everywhere by construction.

import {
  FadeIn,
  FadeOut,
  FadeInDown,
  SlideInDown,
  SlideOutDown,
} from "react-native-reanimated";

// withSpring() configs. Keep the set SMALL and reuse — consistency reads as
// "polished", a different curve per component reads as noise.
export const SPRINGS = {
  // Snappy, near-critically-damped — for press/scale feedback.
  press: { mass: 0.6, damping: 18, stiffness: 320 },
  // Standard UI movement — cards, toggles, small reveals.
  gentle: { mass: 0.9, damping: 22, stiffness: 220 },
  // Larger, smoother — sheet/screen-level movement.
  smooth: { mass: 1, damping: 26, stiffness: 170 },
  // A touch of overshoot for delight — use sparingly (e.g. the paw pop).
  bouncy: { mass: 0.8, damping: 12, stiffness: 260 },
};

// Standard timing durations (ms) + easing names for non-spring tweens / fades.
export const DURATIONS = { instant: 0, fast: 140, base: 240, slow: 360 };

// Scale targets for press feedback.
export const SCALE = { pressed: 0.96, pressedStrong: 0.92 };

// Pure Reduce-Motion selector: pick the `reduced` (fade/none) variant when the
// user has minimized motion, otherwise the `full` (movement) variant. Every
// builder below routes its decision through this so the behavior is consistent
// and unit-testable in one place.
export function selectByMotion(reduceMotion, full, reduced) {
  return reduceMotion ? reduced : full;
}

// ── Layout-animation builders ───────────────────────────────────────────────
// These return reanimated animation descriptors for `entering`/`exiting` props.
// When Reduce Motion is on they collapse to a quick fade (movement removed), per
// the iOS accessibility guideline ("prefer cross-fades over motion").

export function listEntering(reduceMotion, index = 0) {
  // Staggered, spring-driven rise. Delay is capped so long lists don't crawl.
  const delay = Math.min(index * 35, 240);
  return selectByMotion(
    reduceMotion,
    FadeInDown.springify().mass(0.9).damping(22).stiffness(220).delay(delay),
    FadeIn.duration(DURATIONS.fast),
  );
}

export function listExiting(reduceMotion) {
  return FadeOut.duration(reduceMotion ? DURATIONS.fast : DURATIONS.base);
}

export function sheetEntering(reduceMotion) {
  return selectByMotion(
    reduceMotion,
    SlideInDown.springify().mass(1).damping(26).stiffness(170),
    FadeIn.duration(DURATIONS.base),
  );
}

export function sheetExiting(reduceMotion) {
  return selectByMotion(
    reduceMotion,
    SlideOutDown.duration(DURATIONS.base),
    FadeOut.duration(DURATIONS.fast),
  );
}

export function screenEntering(reduceMotion) {
  return FadeIn.duration(reduceMotion ? DURATIONS.base : DURATIONS.slow);
}
