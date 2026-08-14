// E15 — life-stage detection is conservative + size-aware, and an owner override always wins.
import { describe, it, expect } from "vitest";
import { detectLifeStage, effectiveLifeStage, ringGoalsForStage, ageInYears } from "./logic";

describe("detectLifeStage", () => {
  it("under a year → puppy", () => {
    expect(detectLifeStage({ birthday: "2026-02-01", today: "2026-08-14" })).toBe("puppy");
  });

  it("a small dog stays adult longer (senior at 11)", () => {
    expect(detectLifeStage({ ageYears: 9, weight: 6, weightUnit: "kg" })).toBe("adult");
    expect(detectLifeStage({ ageYears: 11, weight: 6, weightUnit: "kg" })).toBe("senior");
  });

  it("a giant dog becomes senior earlier (at 6)", () => {
    expect(detectLifeStage({ ageYears: 6, weight: 50, weightUnit: "kg" })).toBe("senior");
    expect(detectLifeStage({ ageYears: 5, weight: 50, weightUnit: "kg" })).toBe("adult");
  });

  it("a large dog in pounds is converted (senior at 7)", () => {
    // 60 lb ≈ 27 kg → large bucket → senior at 7.
    expect(detectLifeStage({ ageYears: 7, weight: 60, weightUnit: "lb" })).toBe("senior");
  });

  it("unknown age → conservative 'adult' (never a blind guess)", () => {
    expect(detectLifeStage({})).toBe("adult");
  });

  it("unknown size → medium-ish default (senior at 9)", () => {
    expect(detectLifeStage({ ageYears: 9 })).toBe("senior");
    expect(detectLifeStage({ ageYears: 8 })).toBe("adult");
  });
});

describe("effectiveLifeStage", () => {
  it("a valid override wins over detection", () => {
    expect(effectiveLifeStage("puppy", "senior")).toBe("puppy");
  });
  it("an invalid/absent override falls back to detected", () => {
    expect(effectiveLifeStage(null, "senior")).toBe("senior");
    expect(effectiveLifeStage("bogus", "adult")).toBe("adult");
  });
});

describe("ringGoalsForStage", () => {
  it("always returns exactly the three unchanged segments", () => {
    for (const s of ["puppy", "adult", "senior", "weird"]) {
      expect(ringGoalsForStage(s).segments).toEqual(["walk", "moment", "care"]);
    }
  });
  it("maps to a per-stage copy key", () => {
    expect(ringGoalsForStage("senior").copy_key).toBe("lifeStage.senior");
  });
});

describe("ageInYears", () => {
  it("prefers birthday", () => {
    expect(Math.round(ageInYears({ birthday: "2020-08-14", today: "2026-08-14" }))).toBe(6);
  });
  it("falls back to age_years + months", () => {
    expect(ageInYears({ ageYears: 2, ageMonths: 6 })).toBe(2.5);
  });
});
