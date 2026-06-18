import {
  hasEnoughData,
  weightChangePct,
  detectHealthFlags,
  buildRecap,
} from "./healthInsights";

const base = (over = {}) => ({
  pet: { name: "Rex" },
  food: { count: 0, lowAppetiteCount: 0, recent: [] },
  poo: { count: 0, abnormalCount: 0 },
  pee: { count: 0, concernCount: 0 },
  vomit: { episodes: 0, events: [] },
  weight: { series: [] },
  meds: [],
  photoChecks: { count: 0, byArea: {} },
  walks: { count: 0 },
  wellness: { count: 0 },
  ...over,
});

describe("hasEnoughData", () => {
  it("is false on thin/empty data", () => {
    expect(hasEnoughData(base())).toBe(false);
    expect(hasEnoughData(null)).toBe(false);
  });
  it("is true once there are >=5 logs", () => {
    expect(hasEnoughData(base({ food: { count: 5 } }))).toBe(true);
  });
});

describe("weightChangePct", () => {
  it("computes first→last percent", () => {
    expect(weightChangePct([{ weight: 50 }, { weight: 45 }])).toBeCloseTo(-10);
    expect(weightChangePct([{ weight: 40 }, { weight: 44 }])).toBeCloseTo(10);
  });
  it("is null for <2 points", () => {
    expect(weightChangePct([{ weight: 50 }])).toBeNull();
    expect(weightChangePct([])).toBeNull();
  });
});

describe("detectHealthFlags", () => {
  it("returns nothing on thin data (no invented findings)", () => {
    expect(detectHealthFlags(base())).toEqual([]);
  });

  it("flags a >=5% weight loss", () => {
    const s = base({
      food: { count: 6 },
      weight: { series: [{ weight: 50 }, { weight: 46 }] }, // -8%
    });
    expect(detectHealthFlags(s).some((f) => f.key === "weight-loss")).toBe(true);
  });

  it("flags repeated vomiting, abnormal stool, urinary, appetite", () => {
    const s = base({
      food: { count: 6, lowAppetiteCount: 3 },
      poo: { count: 6, abnormalCount: 3 },
      pee: { count: 4, concernCount: 2 },
      vomit: { episodes: 3, events: [{}, {}, {}] },
    });
    const keys = detectHealthFlags(s).map((f) => f.key);
    expect(keys).toEqual(expect.arrayContaining(["vomiting", "stool", "urinary", "appetite"]));
  });

  it("flags a missed medication with adherence %", () => {
    const s = base({
      food: { count: 6 },
      meds: [{ name: "Apoquel", given: 5, missed: 2, total: 7 }],
    });
    const med = detectHealthFlags(s).find((f) => f.key === "med-Apoquel");
    expect(med).toBeTruthy();
    expect(med.detail).toMatch(/71% adherence/);
  });

  it("does not flag a stable pet with full logs", () => {
    const s = base({
      food: { count: 10, lowAppetiteCount: 0 },
      poo: { count: 8, abnormalCount: 0 },
      weight: { series: [{ weight: 50 }, { weight: 50 }] },
      meds: [{ name: "X", given: 7, missed: 0, total: 7 }],
    });
    expect(detectHealthFlags(s)).toEqual([]);
  });
});

describe("buildRecap", () => {
  it("is empty-safe + non-diagnostic when data is thin", () => {
    expect(buildRecap(base(), [])).toMatch(/isn't quite enough/);
  });
  it("gives a reassuring baseline when nothing flags", () => {
    expect(buildRecap(base({ food: { count: 6 } }), [])).toMatch(/Nothing notable/);
  });
  it("summarizes flags with non-diagnostic framing", () => {
    const flags = [{ title: "Weight is trending down" }];
    const recap = buildRecap(base({ food: { count: 6 } }), flags);
    expect(recap).toMatch(/worth mentioning/);
    expect(recap).toMatch(/not a diagnosis/);
  });
});
