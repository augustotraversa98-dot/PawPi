import { describe, it, expect } from "vitest";
import { hoursToRows, rowsToHours, hoursSummary, WEEKDAYS } from "./hours";

describe("hoursToRows", () => {
  it("seeds every weekday, filling stored days and blanking the rest", () => {
    const rows = hoursToRows({ mon: { open: "09:00", close: "17:00" } });
    expect(rows.mon).toEqual({ open: "09:00", close: "17:00" });
    expect(rows.tue).toEqual({ open: "", close: "" });
    expect(Object.keys(rows)).toHaveLength(WEEKDAYS.length);
  });

  it("returns all-blank rows for null", () => {
    const rows = hoursToRows(null);
    expect(rows.mon).toEqual({ open: "", close: "" });
  });
});

describe("rowsToHours", () => {
  it("keeps only days with something set", () => {
    const rows = hoursToRows(null);
    rows.mon = { open: "09:00", close: "17:00" };
    rows.sat = { open: "10:00", close: "" };
    expect(rowsToHours(rows)).toEqual({
      mon: { open: "09:00", close: "17:00" },
      sat: { open: "10:00" },
    });
  });

  it("returns undefined when nothing is filled (never blocks save)", () => {
    expect(rowsToHours(hoursToRows(null))).toBeUndefined();
  });

  it("round-trips through hoursToRows", () => {
    const original = { mon: { open: "09:00", close: "17:00" } };
    expect(rowsToHours(hoursToRows(original))).toEqual(original);
  });
});

describe("hoursSummary", () => {
  it("summarizes set days in weekday order", () => {
    expect(
      hoursSummary({
        sat: { open: "10:00", close: "14:00" },
        mon: { open: "09:00", close: "17:00" },
      }),
    ).toBe("Mon 09:00–17:00 · Sat 10:00–14:00");
  });

  it("returns an empty string for empty/invalid hours", () => {
    expect(hoursSummary(null)).toBe("");
    expect(hoursSummary({})).toBe("");
  });
});
