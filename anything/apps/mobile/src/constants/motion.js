// Motion tokens (ticket 2.77 — Liquid Glass foundation).
// A small, shared set of spring presets + durations for ADDITIVE motion only.
//
// ⚠️ HARD RULE — content visibility must NEVER depend on an animation completing.
// We deliberately do NOT ship opacity/translate "entrance" builders (FadeIn,
// FadeInDown, SlideInDown, …). A reanimated `entering` animation starts the view
// at opacity 0 and only reveals it when the worklet runs; if worklets aren't
// active for any reason, delayed items stay stranded at opacity 0 and the content
// is invisible. This bit the Feed (later posts vanished until Reduce Motion was
// on). The safe motion primitives below only ANIMATE state that is already
// visible at rest (e.g. a press scale), so they can never hide content. For
// list/screen reveals prefer the platform's native transitions (RN <Modal>
// animationType, the navigator's screen animation) which don't gate visibility.

// withSpring() configs. Keep the set SMALL and reuse — consistency reads as
// "polished"; a different curve per component reads as noise.
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

// Standard timing durations (ms) for non-spring tweens.
export const DURATIONS = { instant: 0, fast: 140, base: 240, slow: 360 };

// Scale targets for press feedback.
export const SCALE = { pressed: 0.96, pressedStrong: 0.92 };

// Pure Reduce-Motion selector: pick the `reduced` variant when the user has
// minimized motion, otherwise the `full` variant. Used by motion primitives
// (e.g. PressableScale) to swap a movement for a non-moving fallback. It must
// only ever choose between two ALREADY-VISIBLE states — never gate visibility.
export function selectByMotion(reduceMotion, full, reduced) {
  return reduceMotion ? reduced : full;
}
