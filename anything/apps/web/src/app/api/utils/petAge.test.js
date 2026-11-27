// A pet's age (utils/petAge.js): the shared vectors, what a response carries, and what an edit writes.
import { describe, expect, it } from "vitest";
import vectors from "../../../../test/fixtures/petAgeVectors.json";
import {
  computePetAge,
  estimateColumnsOf,
  estimateFor,
  planAgeUpdate,
  presentPet,
  presentPublicPet,
  toDateString,
  todayForAge,
} from "./petAge";

const TODAY = "2027-11-15";

describe("computePetAge — shared vectors", () => {
  it.each(vectors.cases.map((c) => [c.name, c]))("%s", (_name, c) => {
    expect(computePetAge(c.pet, c.today)).toEqual(c.expected);
  });

  it("reads database DATE values (midnight UTC) as their calendar date", () => {
    expect(computePetAge({ birthday: new Date("2024-07-15T00:00:00Z") }, "2026-07-15")).toEqual({
      years: 2,
      months: 0,
      approximate: false,
    });
  });
});

describe("dates", () => {
  it("never shifts a calendar date and rejects what is not one", () => {
    expect(toDateString("2024-03-01")).toBe("2024-03-01");
    expect(toDateString("2024-03-01T00:00:00.000Z")).toBe("2024-03-01");
    expect(toDateString(new Date("2024-03-01T00:00:00Z"))).toBe("2024-03-01");
    for (const bad of [null, undefined, "", "2023-02-29", "03/01/2024", "1970-01-01", new Date("x"), 0]) {
      expect(toDateString(bad)).toBeNull();
    }
  });

  it("takes today from Buenos Aires", () => {
    expect(todayForAge(new Date("2026-11-27T02:30:00Z"))).toBe("2026-11-26");
    expect(todayForAge(new Date("2026-11-27T03:30:00Z"))).toBe("2026-11-27");
  });
});

// A row from a database with 0156 (the columns exist) and one from a database without them.
const estimated = (extra = {}) => ({
  id: 1,
  birthday: null,
  age_years: 2,
  age_months: 0,
  age_estimate_months: 24,
  age_estimated_on: "2026-11-15",
  ...extra,
});
const legacy = (extra = {}) => ({
  ...estimated({ age_estimate_months: null, age_estimated_on: null }),
  ...extra,
});
const noColumns = (extra = {}) => ({ id: 1, birthday: null, age_years: 2, age_months: 0, ...extra });

describe("presentPet", () => {
  it("puts the computed age in age_years / age_months and keeps the estimate", () => {
    expect(presentPet(estimated(), TODAY)).toEqual(estimated({ age_years: 3 }));
  });

  it("computes a birthday pet's age and hides an estimate it does not use", () => {
    expect(presentPet(estimated({ birthday: "2022-11-15" }), TODAY)).toMatchObject({
      age_years: 5,
      age_months: 0,
      age_estimate_months: null,
      age_estimated_on: null,
    });
  });

  it("hides an estimate that no longer matches the stored age", () => {
    expect(presentPet(estimated({ age_years: 9 }), TODAY)).toMatchObject({
      age_years: 9,
      age_estimate_months: null,
    });
  });

  it("returns a pet with only a stored age as it is, with or without the columns", () => {
    expect(presentPet(legacy(), TODAY)).toEqual(legacy());
    expect(presentPet(noColumns(), TODAY)).toEqual(noColumns());
    expect(presentPet(noColumns({ age_years: null, age_months: 18 }), TODAY)).toEqual(
      noColumns({ age_years: null, age_months: 18 }),
    );
  });

  it("gives others the computed age without the date it was given", () => {
    expect(presentPublicPet(estimated(), TODAY)).toEqual({
      id: 1,
      birthday: null,
      age_years: 3,
      age_months: 0,
      age_is_estimate: true,
    });
    expect(presentPublicPet(legacy(), TODAY)).toEqual({ id: 1, birthday: null, age_years: 2, age_months: 0 });
  });

  it("reads the estimate columns of a JSON row only when they exist", () => {
    expect(estimateColumnsOf({ id: 1 })).toEqual({});
    expect(estimateColumnsOf(undefined)).toEqual({});
    expect(estimateColumnsOf(estimated())).toEqual({ age_estimate_months: 24, age_estimated_on: "2026-11-15" });
  });
});

describe("planAgeUpdate", () => {
  const cleared = { age_years: null, age_months: null, age_estimate_months: null, age_estimated_on: null };
  const newEstimate = (years, months) => ({
    age_years: years,
    age_months: months,
    ...estimateFor({ age_years: years, age_months: months }, TODAY),
  });

  it("writes nothing when neither birthday nor age is sent", () => {
    expect(planAgeUpdate(estimated(), {}, TODAY)).toEqual({});
  });

  it("an older app sending back the computed age changes nothing", () => {
    for (const input of [
      { birthday: null, age_years: 3, age_months: 0 },
      { birthday: null, age_years: 3, age_months: null },
      { age_years: "3", age_months: "0" },
      { age_years: 3 },
    ]) {
      const writes = planAgeUpdate(estimated(), input, TODAY);
      expect(writes).not.toHaveProperty("age_years");
      expect(writes).not.toHaveProperty("age_estimated_on");
    }
  });

  it("recognises the value shown a few days earlier, across a month change", () => {
    // Shown as 2y 11m until the 14th, 3y from the 15th.
    const input = { birthday: null, age_years: 2, age_months: 11 };
    expect(planAgeUpdate(estimated(), input, "2027-11-17")).toEqual({ birthday: null });
    // Weeks later it is a real change.
    expect(planAgeUpdate(estimated(), input, "2027-11-30")).toMatchObject({
      age_years: 2,
      age_months: 11,
      age_estimate_months: 35,
      age_estimated_on: "2027-11-30",
    });
  });

  it("a real change wins and is a new estimate given today", () => {
    expect(planAgeUpdate(estimated(), { birthday: null, age_years: 5, age_months: 6 }, TODAY)).toEqual({
      birthday: null,
      ...newEstimate(5, 6),
    });
    // The value originally entered, a year later, is a change too.
    expect(planAgeUpdate(estimated(), { age_years: 2, age_months: 0 }, TODAY)).toEqual(newEstimate(2, 0));
  });

  it("clearing both age fields clears the estimate", () => {
    expect(planAgeUpdate(estimated(), { age_years: null, age_months: null }, TODAY)).toEqual(cleared);
  });

  it("a pet with only a stored age stays that way unless the age changes", () => {
    expect(planAgeUpdate(legacy(), { birthday: null, age_years: 2, age_months: null }, TODAY)).toEqual({
      birthday: null,
    });
    expect(planAgeUpdate(legacy(), { age_years: 4, age_months: 0 }, TODAY)).toEqual(newEstimate(4, 0));
  });

  it("an age of zero for a pet with no age is a new estimate", () => {
    const row = legacy({ age_years: null, age_months: null });
    expect(planAgeUpdate(row, { age_years: 0, age_months: 0 }, TODAY)).toEqual(newEstimate(0, 0));
    expect(planAgeUpdate(row, { age_years: null, age_months: null }, TODAY)).toEqual({});
  });

  it("a new birthday clears the age and the estimate", () => {
    expect(planAgeUpdate(estimated(), { birthday: "2022-01-01", age_years: 3 }, TODAY)).toEqual({
      birthday: "2022-01-01",
      ...cleared,
    });
  });

  it("while a birthday stays, a sent age is ignored", () => {
    const row = legacy({ birthday: new Date("2022-01-01T00:00:00Z") });
    expect(planAgeUpdate(row, { birthday: "2022-01-01", age_years: 9 }, TODAY)).toEqual({
      birthday: "2022-01-01",
    });
    expect(planAgeUpdate(row, { age_years: 9 }, TODAY)).toEqual({});
  });

  it("removing the birthday without an age leaves no age behind", () => {
    const row = legacy({ birthday: "2022-01-01" });
    expect(planAgeUpdate(row, { birthday: null }, TODAY)).toEqual({ birthday: null, ...cleared });
    expect(planAgeUpdate(row, { birthday: "" }, TODAY)).toEqual({ birthday: null, ...cleared });
  });

  it("removing the birthday and keeping the shown age makes it an estimate from today", () => {
    const row = legacy({ birthday: "2022-11-15", age_years: null, age_months: null });
    expect(planAgeUpdate(row, { birthday: null, age_years: 5, age_months: 0 }, TODAY)).toEqual({
      birthday: null,
      ...newEstimate(5, 0),
    });
  });

  it("stores no estimate for an age out of range", () => {
    expect(planAgeUpdate(legacy(), { age_years: 500, age_months: 0 }, TODAY)).toEqual({
      age_years: 500,
      age_months: 0,
      age_estimate_months: null,
      age_estimated_on: null,
    });
  });

  it("on a database without the columns the sent values are written as they are", () => {
    expect(planAgeUpdate(noColumns(), { birthday: null, age_years: 7, age_months: 1 }, TODAY)).toEqual({
      birthday: null,
      age_years: 7,
      age_months: 1,
    });
    expect(planAgeUpdate(noColumns(), { birthday: "2022-01-01" }, TODAY)).toEqual({ birthday: "2022-01-01" });
  });
});
