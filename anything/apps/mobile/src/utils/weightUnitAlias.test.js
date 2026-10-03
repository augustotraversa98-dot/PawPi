import { normalizeWeightUnit } from "./weightUnitAlias";

describe("normalizeWeightUnit (legacy lb → lbs read alias)", () => {
  test.each([["lb"], ["LB"], [" lb "], ["lbs"], ["Lbs"]])("%j → lbs", (u) => {
    expect(normalizeWeightUnit(u)).toBe("lbs");
  });
  test("kg and empty values pass through untouched", () => {
    expect(normalizeWeightUnit("kg")).toBe("kg");
    expect(normalizeWeightUnit(null)).toBeNull();
    expect(normalizeWeightUnit(undefined)).toBeUndefined();
    expect(normalizeWeightUnit("")).toBe("");
  });
});
