// getDisplayAge — the single source of truth for a pet's displayed age
// (Dog Profile, Dog Social Profile, Vet Record). Model (docs/roadmap.md):
// a known birthday always wins and is calculated live; age_years/age_months
// is only shown, marked approximate, when there's no birthday.

import { getDisplayAge } from "./petAge";

const NOW = new Date(2026, 6, 15); // 15 July 2026 (local)

describe("getDisplayAge — birthday known (calculated, exact)", () => {
  it("computes full years + months", () => {
    // Born 15 Jan 2024 -> exactly 2 years, 6 months as of 15 Jul 2026.
    expect(getDisplayAge({ birthday: "2024-01-15" }, NOW)).toBe(
      "2 years, 6 months",
    );
  });

  it("rounds down when the day-of-month hasn't been reached yet this month", () => {
    // Born 20 Jan 2024 -> the 15th hasn't reached the 20th yet, so one month short.
    expect(getDisplayAge({ birthday: "2024-01-20" }, NOW)).toBe(
      "2 years, 5 months",
    );
  });

  it("singularizes 1 year / 1 month", () => {
    expect(getDisplayAge({ birthday: "2025-06-15" }, NOW)).toBe("1 year, 1 month");
  });

  it("omits a zero part", () => {
    expect(getDisplayAge({ birthday: "2024-07-15" }, NOW)).toBe("2 years");
    expect(getDisplayAge({ birthday: "2026-04-15" }, NOW)).toBe("3 months");
  });

  it("reads 'Under 1 month' for a birthday within the current month", () => {
    expect(getDisplayAge({ birthday: "2026-07-10" }, NOW)).toBe("Under 1 month");
  });

  it("never goes negative for a future birthday (bad/legacy data)", () => {
    expect(getDisplayAge({ birthday: "2030-01-01" }, NOW)).toBe("Under 1 month");
  });

  it("ignores a stored age_years/age_months estimate once a birthday exists", () => {
    expect(
      getDisplayAge({ birthday: "2024-07-15", age_years: 99, age_months: 11 }, NOW),
    ).toBe("2 years");
  });

  it("accepts legacy MM/DD/YYYY and ISO-datetime birthday strings", () => {
    expect(getDisplayAge({ birthday: "01/15/2024" }, NOW)).toBe("2 years, 6 months");
    expect(getDisplayAge({ birthday: "2024-01-15T00:00:00.000Z" }, NOW)).toBe(
      "2 years, 6 months",
    );
  });
});

describe("getDisplayAge — no birthday, estimated age (approximate)", () => {
  it("marks a years+months estimate with a leading ~", () => {
    expect(getDisplayAge({ age_years: 2, age_months: 3 })).toBe("~2 years, 3 months");
  });

  it("marks a years-only estimate", () => {
    expect(getDisplayAge({ age_years: 5, age_months: 0 })).toBe("~5 years");
  });

  it("marks a months-only estimate", () => {
    expect(getDisplayAge({ age_years: 0, age_months: 4 })).toBe("~4 months");
  });

  it("singularizes an estimate of exactly 1 year / 1 month", () => {
    expect(getDisplayAge({ age_years: 1, age_months: 1 })).toBe("~1 year, 1 month");
  });

  it("treats a null/blank birthday the same as a missing one", () => {
    expect(getDisplayAge({ birthday: null, age_years: 3, age_months: 0 })).toBe(
      "~3 years",
    );
    expect(getDisplayAge({ birthday: "", age_years: 3, age_months: 0 })).toBe(
      "~3 years",
    );
  });

  it("accepts string-typed age_years/age_months (as they arrive from a text input)", () => {
    expect(getDisplayAge({ age_years: "2", age_months: "3" })).toBe(
      "~2 years, 3 months",
    );
  });
});

describe("getDisplayAge — nothing known", () => {
  it("returns null when there's no birthday and no estimate", () => {
    expect(getDisplayAge({})).toBeNull();
    expect(getDisplayAge({ age_years: 0, age_months: 0 })).toBeNull();
    expect(getDisplayAge({ age_years: null, age_months: null })).toBeNull();
  });

  it("returns null for a missing/undefined pet", () => {
    expect(getDisplayAge(null)).toBeNull();
    expect(getDisplayAge(undefined)).toBeNull();
  });
});
