// E11 — the digest state classifier must be HONEST: a quiet week degrades to a gentle state and a
// truly empty week to a soft nudge, but neither invents a number (the route feeds real counts only).
import { describe, it, expect } from "vitest";
import { decideDigestState, upcomingMilestone } from "./logic";

describe("decideDigestState", () => {
  it("a healthy week is rich", () => {
    expect(decideDigestState({ walks: 5, ringDays: 4, careActions: 6, moments: 3 })).toBe("rich");
  });

  it("nothing logged and no streak → empty (soft forward nudge)", () => {
    expect(decideDigestState({ walks: 0, ringDays: 0, careActions: 0, moments: 0, hasStreak: false })).toBe("empty");
  });

  it("a thin week with a live streak → quiet, never empty", () => {
    expect(decideDigestState({ walks: 0, ringDays: 0, careActions: 0, moments: 0, hasStreak: true })).toBe("quiet");
  });

  it("a single walk with nothing else → quiet", () => {
    expect(decideDigestState({ walks: 1, ringDays: 0, careActions: 0, moments: 0 })).toBe("quiet");
  });

  it("a closed ring day lifts the week out of quiet", () => {
    expect(decideDigestState({ walks: 1, ringDays: 1, careActions: 0, moments: 0 })).toBe("rich");
  });

  it("a posted moment lifts the week out of quiet", () => {
    expect(decideDigestState({ walks: 0, ringDays: 0, careActions: 2, moments: 1 })).toBe("rich");
  });
});

describe("upcomingMilestone", () => {
  it("a birthday within the window is returned with days-until", () => {
    const m = upcomingMilestone({ birthday: "2020-08-18", adoptionDate: null, today: "2026-08-14", windowDays: 7 });
    expect(m).toEqual({ kind: "birthday", in_days: 4 });
  });

  it("gotcha day today reads in_days 0", () => {
    const m = upcomingMilestone({ birthday: null, adoptionDate: "2019-08-14", today: "2026-08-14" });
    expect(m).toEqual({ kind: "gotcha", in_days: 0 });
  });

  it("the SOONER of two events wins", () => {
    const m = upcomingMilestone({ birthday: "2020-08-19", adoptionDate: "2019-08-16", today: "2026-08-14", windowDays: 7 });
    expect(m).toEqual({ kind: "gotcha", in_days: 2 });
  });

  it("an event beyond the window returns null", () => {
    expect(upcomingMilestone({ birthday: "2020-09-30", adoptionDate: null, today: "2026-08-14", windowDays: 7 })).toBeNull();
  });

  it("no dates → null", () => {
    expect(upcomingMilestone({ birthday: null, adoptionDate: null, today: "2026-08-14" })).toBeNull();
  });

  it("wraps across the year boundary", () => {
    const m = upcomingMilestone({ birthday: "2020-01-02", adoptionDate: null, today: "2026-12-30", windowDays: 7 });
    expect(m).toEqual({ kind: "birthday", in_days: 3 });
  });
});
