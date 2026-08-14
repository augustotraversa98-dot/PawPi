// E9 — the positive-only decision must NEVER emit a negative comparison. In particular the cohort win
// (`cohort_top`) is unreachable unless the pet is above median in a dense/qualifying cohort.
import { describe, it, expect } from "vitest";
import { decideInsight } from "./logic";

describe("decideInsight — positive only", () => {
  it("a below-median pet in a dense cohort NEVER gets cohort_top", () => {
    const r = decideInsight({
      thisWeek: 0,
      lastWeek: 0,
      prior3Max: 0,
      cohort: { qualifies: true, above_median: false, percentile: 10, breed: "Lab" },
    });
    expect(r.kind).not.toBe("cohort_top");
    expect(r.kind).toBe("gentle_nudge");
  });

  it("an above-median pet in a dense cohort gets the positive cohort win", () => {
    const r = decideInsight({
      thisWeek: 5,
      lastWeek: 1,
      prior3Max: 2,
      cohort: { qualifies: true, above_median: true, percentile: 90, breed: "Lab" },
    });
    expect(r.kind).toBe("cohort_top");
    expect(r.params).toMatchObject({ percentile: 90, breed: "Lab" });
  });

  it("no cohort → personal history (best month / more than last / nudge)", () => {
    expect(decideInsight({ thisWeek: 3, lastWeek: 1, prior3Max: 2, cohort: null }).kind).toBe("best_month");
    expect(decideInsight({ thisWeek: 2, lastWeek: 1, prior3Max: 5, cohort: null }).kind).toBe("more_than_last");
    expect(decideInsight({ thisWeek: 1, lastWeek: 3, prior3Max: 5, cohort: null }).kind).toBe("keep_going");
    expect(decideInsight({ thisWeek: 0, lastWeek: 0, prior3Max: 0, cohort: null }).kind).toBe("gentle_nudge");
  });

  it("a sparse (non-qualifying) cohort is ignored", () => {
    const r = decideInsight({
      thisWeek: 5,
      lastWeek: 1,
      prior3Max: 2,
      cohort: { qualifies: false, size: 1 },
    });
    expect(r.kind).toBe("best_month"); // personal, not cohort
  });
});
