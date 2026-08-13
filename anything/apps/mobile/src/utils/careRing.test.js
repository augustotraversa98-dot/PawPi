// Care Ring pure helpers (unit E1) — the derivation-to-copy logic + the rest/pause exemption.
// The copy-key rule is a guardrail: celebrate the dog, never shame the owner, and a rest/paused day
// is never a "miss".

import {
  normalizeRing,
  completedCount,
  ringClosed,
  isRestOrPaused,
  ringStatusKey,
  nextOpenSegment,
  segmentDone,
  streakCount,
  streakIsSafe,
  canRepairStreak,
  RING_SEGMENTS,
  SEGMENT_SWEEP_DEG,
} from "./careRing";

describe("careRing — segment derivation", () => {
  it("counts completed segments and derives ring_closed when all three are done", () => {
    expect(completedCount({ walk_done: true, moment_done: false, care_done: false })).toBe(1);
    expect(completedCount({ walk_done: true, moment_done: true, care_done: true })).toBe(3);
    expect(ringClosed({ walk_done: true, moment_done: true, care_done: true })).toBe(true);
    expect(ringClosed({ walk_done: true, moment_done: true, care_done: false })).toBe(false);
  });

  it("trusts an explicit ring_closed but falls back to deriving it", () => {
    expect(ringClosed({ walk_done: true, moment_done: true, care_done: true, ring_closed: false })).toBe(false);
    expect(normalizeRing(undefined)).toMatchObject({ walk_done: false, ring_closed: false, rest_day: false, paused: false });
  });

  it("segmentDone reads the right flag per segment", () => {
    const s = { walk_done: false, moment_done: true, care_done: false };
    expect(segmentDone(s, "walk")).toBe(false);
    expect(segmentDone(s, "moment")).toBe(true);
    expect(segmentDone(s, "care")).toBe(false);
  });

  it("nextOpenSegment points at the first unfinished segment (walk→moment→care)", () => {
    expect(nextOpenSegment({ walk_done: false })).toBe("walk");
    expect(nextOpenSegment({ walk_done: true, moment_done: false })).toBe("moment");
    expect(nextOpenSegment({ walk_done: true, moment_done: true, care_done: false })).toBe("care");
    expect(nextOpenSegment({ walk_done: true, moment_done: true, care_done: true })).toBeNull();
  });
});

describe("careRing — status copy key (celebrate, never shame)", () => {
  it("empty day => invitation, not a scold", () => {
    expect(ringStatusKey({})).toBe("empty");
  });
  it("partial day => 'one more thing', never blame", () => {
    expect(ringStatusKey({ walk_done: true })).toBe("partial");
    expect(ringStatusKey({ walk_done: true, moment_done: true })).toBe("partial");
  });
  it("all three => celebration", () => {
    expect(ringStatusKey({ walk_done: true, moment_done: true, care_done: true })).toBe("complete");
  });
});

describe("careRing — rest / pause is never a miss", () => {
  it("a rest day is flagged as rest/paused and gets the gentle 'rest' key even if incomplete", () => {
    const rest = { walk_done: false, moment_done: false, care_done: false, rest_day: true };
    expect(isRestOrPaused(rest)).toBe(true);
    expect(ringStatusKey(rest)).toBe("rest");
    // and nextOpenSegment is suppressed so no nudge fires on a rest day
    expect(nextOpenSegment(rest)).toBeNull();
  });

  it("a paused day is treated the same as a rest day", () => {
    const paused = { walk_done: true, paused: true };
    expect(isRestOrPaused(paused)).toBe(true);
    expect(ringStatusKey(paused)).toBe("rest");
    expect(nextOpenSegment(paused)).toBeNull();
  });

  it("rest wins over complete (a completed rest day still reads as restful, no pressure)", () => {
    expect(ringStatusKey({ walk_done: true, moment_done: true, care_done: true, rest_day: true })).toBe("rest");
  });
});

describe("careRing — streak display (E2)", () => {
  it("streakCount reads the ring response's streak, 0 when absent (no fake number)", () => {
    expect(streakCount(undefined)).toBe(0);
    expect(streakCount({})).toBe(0);
    expect(streakCount({ streak: { current_count: 12 } })).toBe(12);
  });

  it("streakIsSafe when the ring closed (or it's a rest/pause day) AND the streak is live", () => {
    expect(streakIsSafe({ walk_done: true, moment_done: true, care_done: true, streak: { current_count: 3 } })).toBe(true);
    // rest day with a live streak is still 'safe'
    expect(streakIsSafe({ rest_day: true, streak: { current_count: 3 } })).toBe(true);
    // closed but no streak yet → not shown
    expect(streakIsSafe({ walk_done: true, moment_done: true, care_done: true, streak: { current_count: 0 } })).toBe(false);
    // not closed → not safe
    expect(streakIsSafe({ walk_done: true, streak: { current_count: 3 } })).toBe(false);
  });

  it("canRepairStreak only when the backend flags a repairable reset", () => {
    expect(canRepairStreak({ streak: { repair_available: true } })).toBe(true);
    expect(canRepairStreak({ streak: { repair_available: false } })).toBe(false);
    expect(canRepairStreak({})).toBe(false);
  });
});

describe("careRing — geometry", () => {
  it("three equal arcs leave room for the gaps", () => {
    expect(RING_SEGMENTS).toHaveLength(3);
    expect(SEGMENT_SWEEP_DEG).toBeGreaterThan(0);
    expect(SEGMENT_SWEEP_DEG * 3).toBeLessThan(360);
  });
});
