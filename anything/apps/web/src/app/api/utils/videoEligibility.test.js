import { describe, it, expect, afterEach } from "vitest";
import { isVideoEligible, getRolloutPct } from "./videoEligibility";

// Daily video-moment eligibility — pure, DB-free. These pin the four properties
// the feature relies on: determinism, distribution ≈ VIDEO_ROLLOUT_PCT, the answer
// rotating by date, and the 0/100 edges.

const ORIGINAL_PCT = process.env.VIDEO_ROLLOUT_PCT;
afterEach(() => {
  if (ORIGINAL_PCT === undefined) delete process.env.VIDEO_ROLLOUT_PCT;
  else process.env.VIDEO_ROLLOUT_PCT = ORIGINAL_PCT;
});

describe("isVideoEligible — deterministic per (user, day)", () => {
  it("returns the SAME answer for the same (userId, date) across calls", () => {
    const a = isVideoEligible(42, "2026-06-28", 50);
    const b = isVideoEligible(42, "2026-06-28", 50);
    expect(a).toBe(b);
  });

  it("can change the answer across dates for the same user", () => {
    // Sweep a year for user 42 at 50% — both outcomes must appear, proving the
    // date is actually part of the hash (not ignored).
    const answers = new Set();
    for (let d = 1; d <= 28; d++) {
      const day = String(d).padStart(2, "0");
      answers.add(isVideoEligible(42, `2026-06-${day}`, 50));
    }
    expect(answers).toEqual(new Set([true, false]));
  });
});

describe("isVideoEligible — rollout edges", () => {
  it("0% => nobody is ever eligible", () => {
    for (let u = 0; u < 200; u++) {
      expect(isVideoEligible(u, "2026-06-28", 0)).toBe(false);
    }
  });

  it("100% => everybody is eligible", () => {
    for (let u = 0; u < 200; u++) {
      expect(isVideoEligible(u, "2026-06-28", 100)).toBe(true);
    }
  });
});

describe("isVideoEligible — distribution tracks the rollout percent", () => {
  it("~pct of a population is eligible (within tolerance)", () => {
    const N = 5000;
    const pct = 30;
    let eligible = 0;
    for (let u = 0; u < N; u++) {
      if (isVideoEligible(u, "2026-06-28", pct)) eligible++;
    }
    const share = (eligible / N) * 100;
    // Uniform hash → empirical share lands near pct. Wide band keeps it non-flaky.
    expect(share).toBeGreaterThan(pct - 5);
    expect(share).toBeLessThan(pct + 5);
  });
});

describe("getRolloutPct — env parsing with a safe default", () => {
  it("defaults to 10 when unset", () => {
    delete process.env.VIDEO_ROLLOUT_PCT;
    expect(getRolloutPct()).toBe(10);
  });

  it("defaults to 10 when non-numeric or out of range", () => {
    for (const bad of ["abc", "-5", "150", ""]) {
      process.env.VIDEO_ROLLOUT_PCT = bad;
      expect(getRolloutPct()).toBe(10);
    }
  });

  it("uses a valid integer 0–100", () => {
    for (const ok of ["0", "25", "100"]) {
      process.env.VIDEO_ROLLOUT_PCT = ok;
      expect(getRolloutPct()).toBe(Number(ok));
    }
  });

  it("isVideoEligible reads the env default when no pct arg is given", () => {
    process.env.VIDEO_ROLLOUT_PCT = "0";
    expect(isVideoEligible(123, "2026-06-28")).toBe(false);
    process.env.VIDEO_ROLLOUT_PCT = "100";
    expect(isVideoEligible(123, "2026-06-28")).toBe(true);
  });
});
