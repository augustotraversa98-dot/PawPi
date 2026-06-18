// Today's Progress on REAL logged data (ticket 2.66): counts the active pet's
// logs for the LOCAL day against the day's routine targets — never hardcoded.

import { buildTodayProgress } from "./todayProgress";

const TODAY = "2026-06-18";
// Build a timestamp on a given local day (noon, so the local date is stable).
const at = (y, m, d) => new Date(y, m - 1, d, 12, 0, 0).toISOString();
const today = at(2026, 6, 18);
const yesterday = at(2026, 6, 17);

const feedingRoutine = { type: "feeding", isActive: true, meals: [{}, {}, {}] };
const walkRoutine = { type: "walk", isActive: true, times: ["08:00", "18:00"] };

describe("buildTodayProgress", () => {
  it("is empty (no fake numbers) when nothing is logged today", () => {
    const r = buildTodayProgress({
      routines: [feedingRoutine, walkRoutine],
      foodLogs: [{ logged_at: yesterday }], // only an old log
      todayStr: TODAY,
    });
    expect(r.isEmpty).toBe(true);
    expect(r.chips).toEqual([]);
  });

  it("shows meals as done/target against the feeding routine", () => {
    const r = buildTodayProgress({
      routines: [feedingRoutine],
      foodLogs: [{ logged_at: today }, { logged_at: today }, { logged_at: yesterday }],
      todayStr: TODAY,
    });
    const feeding = r.chips.find((c) => c.key === "feeding");
    expect(feeding.label).toBe("2/3 meals"); // only today's two count
  });

  it("shows a plain done count when there is no feeding target", () => {
    const r = buildTodayProgress({
      routines: [],
      foodLogs: [{ logged_at: today }],
      todayStr: TODAY,
    });
    expect(r.chips.find((c) => c.key === "feeding").label).toBe("1 meal logged");
  });

  it("counts walks for today against the walk routine target", () => {
    const r = buildTodayProgress({
      routines: [walkRoutine],
      walkLogs: [{ start_time: today }],
      todayStr: TODAY,
    });
    expect(r.chips.find((c) => c.key === "walk").label).toBe("1/2 walks");
  });

  it("renders the medication chip from real given_at logs", () => {
    const one = buildTodayProgress({
      medicalLogs: [{ given_at: today }],
      todayStr: TODAY,
    });
    expect(one.chips.find((c) => c.key === "medication").label).toBe(
      "Medication given",
    );
    const many = buildTodayProgress({
      medicalLogs: [{ given_at: today }, { given_at: today }],
      todayStr: TODAY,
    });
    expect(many.chips.find((c) => c.key === "medication").label).toBe(
      "2 doses given",
    );
  });

  it("ignores inactive/deleted routines when computing targets", () => {
    const r = buildTodayProgress({
      routines: [
        { type: "feeding", isActive: false, meals: [{}, {}] },
        { type: "feeding", isActive: true, deletedAt: "2026-06-01", meals: [{}] },
      ],
      foodLogs: [{ logged_at: today }],
      todayStr: TODAY,
    });
    // No active feeding routine → falls back to the plain done count.
    expect(r.chips.find((c) => c.key === "feeding").label).toBe("1 meal logged");
  });

  it("contains no hardcoded sample counts", () => {
    const r = buildTodayProgress({
      foodLogs: [{ logged_at: today }],
      walkLogs: [{ start_time: today }],
      todayStr: TODAY,
    });
    const labels = r.chips.map((c) => c.label);
    // The old hardcoded chips were exactly these — they must never reappear.
    expect(labels).not.toContain("Fed 2 times");
    expect(labels).not.toContain("1 walk");
    // The real walk chip is derived from the log count.
    expect(labels).toContain("1 walk done");
  });
});
