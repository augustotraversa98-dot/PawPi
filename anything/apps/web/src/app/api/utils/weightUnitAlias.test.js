import { describe, it, expect } from "vitest";
import { normalizeWeightUnit, withNormalizedWeightUnit } from "./weightUnitAlias";

describe("weight unit read alias", () => {
  it("maps legacy lb to lbs and leaves other units alone", () => {
    expect(normalizeWeightUnit("lb")).toBe("lbs");
    expect(normalizeWeightUnit("lbs")).toBe("lbs");
    expect(normalizeWeightUnit("kg")).toBe("kg");
    expect(normalizeWeightUnit(null)).toBeNull();
  });

  it("normalises rows without touching weight values or other fields", () => {
    const rows = [
      { id: 1, weight: 50, weight_unit: "lb" },
      { id: 2, weight: 18, weight_unit: "kg" },
    ];
    expect(withNormalizedWeightUnit(rows)).toEqual([
      { id: 1, weight: 50, weight_unit: "lbs" },
      { id: 2, weight: 18, weight_unit: "kg" },
    ]);
    expect(rows[0].weight_unit).toBe("lb"); // input not mutated
    expect(withNormalizedWeightUnit({ id: 3 })).toEqual({ id: 3 });
  });
});
