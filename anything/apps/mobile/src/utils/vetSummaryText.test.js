import { summaryToText } from "./vetSummaryText";

const summary = {
  pet: { name: "Rex", breed: "Lab" },
  range: { from: "2026-06-01", to: "2026-06-18" },
  food: { count: 6, lowAppetiteCount: 2 },
  poo: { count: 5, abnormalCount: 1 },
  pee: { count: 4, concernCount: 0 },
  vomit: { episodes: 2 },
  weight: { series: [{ weight: 50, unit: "lbs" }, { weight: 46, unit: "lbs" }] },
  walks: { count: 3, totalMinutes: 90 },
  photoChecks: { count: 4 },
  meds: [{ name: "Apoquel", dose: "16mg", given: 6, total: 7 }],
  generalChecks: { count: 2, areasChanged: ["ears", "paws"] },
  conditions: [{ condition: "Arthritis" }],
  allergies: [{ allergen: "Chicken" }],
};

it("renders a clean, non-diagnostic text block with the disclaimer", () => {
  const flags = [{ title: "Weight is trending down", detail: "about 8%" }];
  const text = summaryToText(summary, flags, ["Is the weight loss a concern?", ""]);
  expect(text).toContain("PawPi Vet Summary — Rex");
  expect(text).toContain("Period: 2026-06-01 → 2026-06-18");
  expect(text).toContain("Worth discussing with your vet:");
  expect(text).toContain("Weight is trending down — about 8%");
  expect(text).toContain("Weight: 50lbs → 46lbs");
  expect(text).toContain("Quick checks: 2 (changed: Ears, Paws)");
  expect(text).toContain("Apoquel (16mg): 6/7 doses given");
  expect(text).toContain("Arthritis");
  expect(text).toContain("Allergy: Chicken");
  expect(text).toContain("Is the weight loss a concern?");
  expect(text).toMatch(/does not diagnose/);
});

it("is empty-safe", () => {
  expect(summaryToText(null)).toBe("");
  const text = summaryToText({ pet: { name: "X" }, range: { from: "a", to: "b" } }, [], []);
  expect(text).toContain("PawPi Vet Summary — X");
});
