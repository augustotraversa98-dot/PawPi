import { describe, it, expect } from "vitest";
import {
  parseCanonicalDateParam,
  parseCanonicalTimeParam,
  dbDateToParts,
  dbTimeToParts,
  minutesBetweenWallClock,
  addMinutesToWallClock,
  formatWallClockDate,
  formatWallClockTime,
} from "./localWallClock";

describe("parseCanonicalDateParam", () => {
  it("parses a valid YYYY-MM-DD", () => {
    expect(parseCanonicalDateParam("2026-08-01")).toEqual({ year: 2026, month: 8, day: 1 });
  });
  it.each([null, undefined, "", "not-a-date", "2026-13-40", "2026-02-30", "2026/08/01"])(
    "rejects %s",
    (bad) => {
      expect(parseCanonicalDateParam(bad)).toBeNull();
    },
  );
});

describe("parseCanonicalTimeParam", () => {
  it("parses a valid HH:MM", () => {
    expect(parseCanonicalTimeParam("09:05")).toEqual({ hour: 9, minute: 5 });
  });
  it.each([null, undefined, "", "9:05", "25:00", "10:60", "not-a-time"])(
    "rejects %s",
    (bad) => {
      expect(parseCanonicalTimeParam(bad)).toBeNull();
    },
  );
});

describe("dbDateToParts", () => {
  it("decomposes a Date instance via UTC getters (porsager's date parsing)", () => {
    // postgres.js parses the `date` OID via `new Date("2026-08-01")`, which JS
    // treats as UTC midnight — must be read back with getUTC*, never local getters.
    expect(dbDateToParts(new Date("2026-08-01"))).toEqual({ year: 2026, month: 8, day: 1 });
  });
  it("accepts a plain YYYY-MM-DD string directly", () => {
    expect(dbDateToParts("2026-08-01")).toEqual({ year: 2026, month: 8, day: 1 });
  });
  it("returns null for null/unparseable", () => {
    expect(dbDateToParts(null)).toBeNull();
    expect(dbDateToParts("garbage")).toBeNull();
  });
});

describe("dbTimeToParts", () => {
  it("parses HH:MM:SS", () => {
    expect(dbTimeToParts("10:15:00")).toEqual({ hour: 10, minute: 15 });
  });
  it("parses HH:MM", () => {
    expect(dbTimeToParts("10:15")).toEqual({ hour: 10, minute: 15 });
  });
  it("returns null for non-strings/unparseable", () => {
    expect(dbTimeToParts(null)).toBeNull();
    expect(dbTimeToParts("garbage")).toBeNull();
  });
});

describe("minutesBetweenWallClock", () => {
  it("returns positive minutes when `to` is later", () => {
    const from = { year: 2026, month: 8, day: 1, hour: 10, minute: 10 };
    const to = { year: 2026, month: 8, day: 1, hour: 10, minute: 15 };
    expect(minutesBetweenWallClock(from, to)).toBe(5);
  });
  it("returns negative minutes when `to` is earlier", () => {
    const from = { year: 2026, month: 8, day: 1, hour: 10, minute: 15 };
    const to = { year: 2026, month: 8, day: 1, hour: 10, minute: 10 };
    expect(minutesBetweenWallClock(from, to)).toBe(-5);
  });
  it("handles a day rollover correctly", () => {
    const from = { year: 2026, month: 7, day: 31, hour: 23, minute: 58 };
    const to = { year: 2026, month: 8, day: 1, hour: 0, minute: 2 };
    expect(minutesBetweenWallClock(from, to)).toBe(4);
  });
});

describe("addMinutesToWallClock / format helpers", () => {
  it("shifts backwards across an hour boundary", () => {
    const result = addMinutesToWallClock(
      { year: 2026, month: 8, day: 1, hour: 10, minute: 2 },
      -5,
    );
    expect(result).toEqual({ year: 2026, month: 8, day: 1, hour: 9, minute: 57 });
    expect(formatWallClockDate(result)).toBe("2026-08-01");
    expect(formatWallClockTime(result)).toBe("09:57");
  });
});
