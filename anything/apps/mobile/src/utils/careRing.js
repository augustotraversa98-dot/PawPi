// Care Ring — pure, framework-free helpers (unit E1, docs/pet-owner-engagement.md).
//
// The ring is a visualization over three daily segments (Walk · Moment · Care). These helpers turn a
// ring-state object (as returned by GET /api/pets/[id]/care-ring) into the small decisions the UI
// needs — completed count, whether the ring is closed, and WHICH copy key to show. The copy rule is a
// guardrail encoded in code: celebrate the dog, never shame the owner. A rest/paused day is NEVER a
// miss, so it gets its own gentle key rather than a "you didn't finish" one.

export const RING_SEGMENTS = ["walk", "moment", "care"];

// Geometry for an SVG ring drawn as three equal arcs with a small gap between them.
export const RING_GAP_DEG = 14; // gap between segments
export const SEGMENT_SWEEP_DEG = (360 - RING_GAP_DEG * RING_SEGMENTS.length) / RING_SEGMENTS.length;

/** Normalize a raw ring-state (any shape) into booleans the UI can trust. */
export function normalizeRing(state) {
  const s = state || {};
  return {
    walk_done: !!s.walk_done,
    moment_done: !!s.moment_done,
    care_done: !!s.care_done,
    ring_closed: s.ring_closed != null ? !!s.ring_closed : !!(s.walk_done && s.moment_done && s.care_done),
    rest_day: !!s.rest_day,
    paused: !!s.paused,
    paused_until: s.paused_until ?? null,
    day: s.day ?? null,
  };
}

export function segmentDone(state, segment) {
  const s = normalizeRing(state);
  return segment === "walk" ? s.walk_done : segment === "moment" ? s.moment_done : s.care_done;
}

export function completedCount(state) {
  const s = normalizeRing(state);
  return [s.walk_done, s.moment_done, s.care_done].filter(Boolean).length;
}

export function ringClosed(state) {
  return normalizeRing(state).ring_closed;
}

/** A rest day or an active pause: the ring/streak is intentionally on hold, never a "miss". */
export function isRestOrPaused(state) {
  const s = normalizeRing(state);
  return s.rest_day || s.paused;
}

/**
 * The copy key for the ring's current state. Drives celebrate-not-shame messaging:
 *   - "rest":     rest/paused day — gentle, no pressure
 *   - "complete": all three closed — celebration
 *   - "empty":    nothing done yet — invitation, not a scold
 *   - "partial":  one/two done — "one more thing to finish Rex's day", never "you neglected"
 */
export function ringStatusKey(state) {
  if (isRestOrPaused(state)) return "rest";
  if (ringClosed(state)) return "complete";
  return completedCount(state) === 0 ? "empty" : "partial";
}

/** The next unfinished segment (for a single "finish the ring" nudge). Null when closed/rest. */
export function nextOpenSegment(state) {
  if (isRestOrPaused(state) || ringClosed(state)) return null;
  const s = normalizeRing(state);
  if (!s.walk_done) return "walk";
  if (!s.moment_done) return "moment";
  if (!s.care_done) return "care";
  return null;
}
