import { describe, it, expect } from "vitest";
import {
  weekdayMon0,
  timeToMinutes,
  generateSlotsForDate,
  slotsOverlap,
  subtractTaken,
  isSlotBookable,
} from "./availability";

// Pure slot-generation helpers for generalized booking (2.4). No DB.

describe("weekdayMon0", () => {
  it("maps a Monday to 0 and Sunday to 6", () => {
    expect(weekdayMon0(new Date("2026-06-15T00:00:00Z"))).toBe(0); // Mon
    expect(weekdayMon0(new Date("2026-06-21T00:00:00Z"))).toBe(6); // Sun
  });
});

describe("timeToMinutes", () => {
  it("parses HH:MM and HH:MM:SS", () => {
    expect(timeToMinutes("09:30")).toBe(570);
    expect(timeToMinutes("13:00:00")).toBe(780);
  });
});

describe("generateSlotsForDate", () => {
  const windows = [
    { weekday: 0, start_time: "09:00", end_time: "11:00", slot_minutes: 60 }, // Mon
  ];

  it("generates back-to-back slots in the provider zone (default BA, UTC-3)", () => {
    // 2026-06-15 is a Monday. 09:00 Buenos Aires = 12:00 UTC (offset -3h).
    const slots = generateSlotsForDate("2026-06-15", windows);
    expect(slots).toEqual([
      { start: "2026-06-15T12:00:00.000Z", end: "2026-06-15T13:00:00.000Z" },
      { start: "2026-06-15T13:00:00.000Z", end: "2026-06-15T14:00:00.000Z" },
    ]);
  });

  it("applies the -3h Buenos Aires offset to every slot boundary", () => {
    // 09:00–11:00 BA @ 30 min → 09:00/09:30/10:00/10:30 local = 12:00/12:30/13:00/13:30 UTC.
    const w = [{ weekday: 0, start_time: "09:00", end_time: "11:00", slot_minutes: 30 }];
    const slots = generateSlotsForDate("2026-06-15", w);
    expect(slots.map((s) => s.start)).toEqual([
      "2026-06-15T12:00:00.000Z",
      "2026-06-15T12:30:00.000Z",
      "2026-06-15T13:00:00.000Z",
      "2026-06-15T13:30:00.000Z",
    ]);
  });

  it("composes in an explicitly-passed zone (UTC → no shift)", () => {
    const slots = generateSlotsForDate("2026-06-15", windows, "UTC");
    expect(slots).toEqual([
      { start: "2026-06-15T09:00:00.000Z", end: "2026-06-15T10:00:00.000Z" },
      { start: "2026-06-15T10:00:00.000Z", end: "2026-06-15T11:00:00.000Z" },
    ]);
  });

  it("returns nothing for a non-matching weekday", () => {
    // 2026-06-16 is a Tuesday — the Monday window does not apply.
    expect(generateSlotsForDate("2026-06-16", windows)).toEqual([]);
  });

  it("drops a trailing partial slot that does not fit", () => {
    const w = [{ weekday: 0, start_time: "09:00", end_time: "10:30", slot_minutes: 60 }];
    const slots = generateSlotsForDate("2026-06-15", w);
    expect(slots).toHaveLength(1); // 9–10 only; 10–11 would exceed 10:30
  });
});

describe("slotsOverlap / subtractTaken", () => {
  const a = { start: "2026-06-15T09:00:00.000Z", end: "2026-06-15T10:00:00.000Z" };
  const b = { start: "2026-06-15T09:30:00.000Z", end: "2026-06-15T10:30:00.000Z" };
  const c = { start: "2026-06-15T10:00:00.000Z", end: "2026-06-15T11:00:00.000Z" };

  it("detects overlap and treats touching boundaries as non-overlapping", () => {
    expect(slotsOverlap(a, b)).toBe(true);
    expect(slotsOverlap(a, c)).toBe(false); // a ends exactly where c starts
  });

  it("removes only the candidates overlapping a taken range", () => {
    // taken d = 09:00–09:30 overlaps a but not c (c starts at 10:00).
    const d = { start: "2026-06-15T09:00:00.000Z", end: "2026-06-15T09:30:00.000Z" };
    expect(subtractTaken([a, c], [d])).toEqual([c]); // a dropped; c free
    // b (09:30–10:30) overlaps BOTH a and c → nothing free.
    expect(subtractTaken([a, c], [b])).toEqual([]);
  });
});

describe("isSlotBookable", () => {
  const windows = [
    { weekday: 0, start_time: "09:00", end_time: "11:00", slot_minutes: 60 },
  ];
  // 09:00–10:00 Buenos Aires = 12:00–13:00 UTC (the first open slot for the Mon window).
  const reqSlot = {
    start: "2026-06-15T12:00:00.000Z",
    end: "2026-06-15T13:00:00.000Z",
  };

  it("accepts a slot that matches an open generated slot", () => {
    expect(isSlotBookable(reqSlot, windows, [])).toBe(true);
  });

  it("rejects a slot that overlaps a taken slot", () => {
    expect(isSlotBookable(reqSlot, windows, [reqSlot])).toBe(false);
  });

  it("rejects a slot outside any window", () => {
    // 15:00–16:00 UTC = 12:00–13:00 BA — past the 11:00 BA window end.
    const outside = {
      start: "2026-06-15T15:00:00.000Z",
      end: "2026-06-15T16:00:00.000Z",
    };
    expect(isSlotBookable(outside, windows, [])).toBe(false);
  });

  it("rejects an inverted slot", () => {
    expect(
      isSlotBookable({ start: reqSlot.end, end: reqSlot.start }, windows, []),
    ).toBe(false);
  });
});
