import { describe, it, expect } from "vitest";
import { hoursToRows, rowsToHours, hoursSummary, WEEKDAYS } from "./hours";

const open = (...ranges) => ({
  status: "hours",
  ranges: ranges.map(([from, to]) => ({ open: from, close: to })),
});
const BLANK = open(["", ""]);

// A directory listing as the loader stores it: split day, single range, closed, all day, past midnight.
const IMPORTED = {
  mon: [
    { open: "10:00", close: "13:00" },
    { open: "16:00", close: "20:00" },
  ],
  tue: { open: "09:00", close: "18:00" },
  wed: "closed",
  thu: { open: "00:00", close: "24:00" },
  fri: { open: "10:00", close: "00:00" },
};

describe("hoursToRows", () => {
  it("seeds every weekday, filling stored days and blanking the rest", () => {
    const rows = hoursToRows({ mon: { open: "09:00", close: "17:00" } });
    expect(rows.mon).toEqual(open(["09:00", "17:00"]));
    expect(rows.tue).toEqual(BLANK);
    expect(Object.keys(rows)).toHaveLength(WEEKDAYS.length);
  });

  it("returns all-blank rows for null", () => {
    expect(hoursToRows(null).mon).toEqual(BLANK);
  });

  it("shows every shape an imported listing has", () => {
    const rows = hoursToRows(IMPORTED);
    expect(rows.mon).toEqual(open(["10:00", "13:00"], ["16:00", "20:00"]));
    expect(rows.tue).toEqual(open(["09:00", "18:00"]));
    expect(rows.wed.status).toBe("closed");
    expect(rows.thu.status).toBe("allDay");
    expect(rows.fri).toEqual(open(["10:00", "00:00"]));
    expect(rows.sat).toEqual(BLANK);
  });

  it('reads "HH:MM-HH:MM" strings, and a closing time of 24:00 as midnight', () => {
    expect(hoursToRows({ mon: ["9-13", "16:00-24:00"] }).mon).toEqual(
      open(["09:00", "13:00"], ["16:00", "00:00"]),
    );
  });
});

describe("rowsToHours", () => {
  it("keeps only days with something set", () => {
    const rows = hoursToRows(null);
    rows.mon = open(["09:00", "17:00"]);
    rows.sat = open(["10:00", ""]);
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

  it("saves an imported listing unchanged when nothing is edited", () => {
    expect(rowsToHours(hoursToRows(IMPORTED))).toEqual(IMPORTED);
  });

  it("drops an empty extra range", () => {
    const rows = hoursToRows({ mon: { open: "09:00", close: "17:00" } });
    rows.mon.ranges.push({ open: "", close: "" });
    expect(rowsToHours(rows)).toEqual({ mon: { open: "09:00", close: "17:00" } });
  });

  it("keeps a value the editor cannot show", () => {
    const original = { mon: "by appointment", tue: { open: "09:00", close: "17:00" } };
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

  it("summarizes split, closed and all-day days in either language", () => {
    expect(hoursSummary(IMPORTED)).toBe(
      "Mon 10:00–13:00, 16:00–20:00 · Tue 09:00–18:00 · Wed closed · Thu 24 hours · Fri 10:00–00:00",
    );
    expect(hoursSummary({ wed: "closed", thu: { open: "00:00", close: "24:00" } }, "es")).toBe(
      "Mié cerrado · Jue 24 horas",
    );
  });

  it("returns an empty string for empty/invalid hours", () => {
    expect(hoursSummary(null)).toBe("");
    expect(hoursSummary({})).toBe("");
  });
});
