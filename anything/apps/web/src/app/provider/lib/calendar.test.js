import { describe, it, expect } from "vitest";
import {
  ymd,
  addDays,
  startOfWeek,
  viewDays,
  rangeForView,
  hourLabel,
  dayHeader,
  zonedMinutes,
  durationMinutes,
  gridHours,
  layoutDay,
  PX_PER_MIN,
  MIN_BLOCK_PX,
} from "./calendar";

// Pure grid math for the bookings calendar (ticket 2.24; Phase 3 proportional layout).
// Navigation math (ymd/startOfWeek/viewDays) is local-Date based; the placement helpers
// (zonedMinutes/durationMinutes/gridHours/layoutDay) take absolute instants + a provider
// zone, so they're asserted with explicit UTC/BA zones (tz-stable on any runner).

// Wed 2026-06-17 (local). Its Monday is 2026-06-15.
const WED = new Date(2026, 5, 17, 9, 0);

describe("ymd / addDays", () => {
  it("formats a local YYYY-MM-DD and advances days", () => {
    expect(ymd(WED)).toBe("2026-06-17");
    expect(ymd(addDays(WED, 1))).toBe("2026-06-18");
    expect(ymd(addDays(WED, -2))).toBe("2026-06-15");
  });
});

describe("startOfWeek (Monday)", () => {
  it("snaps any weekday back to its Monday at 00:00", () => {
    expect(ymd(startOfWeek(WED))).toBe("2026-06-15");
    const mon = startOfWeek(WED);
    expect(mon.getHours()).toBe(0);
    expect(mon.getMinutes()).toBe(0);
    // A Sunday belongs to the SAME week's Monday (not the next).
    const sun = new Date(2026, 5, 21, 23, 0); // Sun 2026-06-21
    expect(ymd(startOfWeek(sun))).toBe("2026-06-15");
  });
});

describe("viewDays / rangeForView", () => {
  it("week → 7 Monday-first columns; day → 1", () => {
    const week = viewDays("week", WED);
    expect(week).toHaveLength(7);
    expect(ymd(week[0])).toBe("2026-06-15"); // Mon
    expect(ymd(week[6])).toBe("2026-06-21"); // Sun
    const day = viewDays("day", WED);
    expect(day).toHaveLength(1);
    expect(ymd(day[0])).toBe("2026-06-17");
  });

  it("rangeForView spans [first day 00:00, day-after-last 00:00)", () => {
    const { from, to } = rangeForView("week", WED);
    expect(ymd(new Date(from))).toBe("2026-06-15");
    expect(ymd(new Date(to))).toBe("2026-06-22"); // exclusive upper bound
    const day = rangeForView("day", WED);
    expect(ymd(new Date(day.from))).toBe("2026-06-17");
    expect(ymd(new Date(day.to))).toBe("2026-06-18");
  });
});

describe("zonedMinutes", () => {
  it("gives the wall-clock date + minutes in the given zone (DST-safe via Intl)", () => {
    // 15:00 UTC in Buenos Aires (−03) is 12:00 → 720 minutes, same calendar date.
    expect(
      zonedMinutes("2026-06-16T15:00:00.000Z", "America/Argentina/Buenos_Aires"),
    ).toEqual({ date: "2026-06-16", minutes: 720 });
    // Same instant read in UTC is 15:00 → 900 minutes.
    expect(zonedMinutes("2026-06-16T15:00:00.000Z", "UTC")).toEqual({
      date: "2026-06-16",
      minutes: 900,
    });
  });

  it("returns null for an unparseable instant", () => {
    expect(zonedMinutes("nope", "UTC")).toBeNull();
  });
});

describe("durationMinutes", () => {
  it("is the absolute elapsed start→end in minutes", () => {
    expect(
      durationMinutes({
        start_at: "2026-06-16T12:00:00.000Z",
        end_at: "2026-06-16T13:00:00.000Z",
      }),
    ).toBe(60);
  });

  it("defaults to 30 when the end is missing or not after the start", () => {
    expect(durationMinutes({ start_at: "2026-06-16T12:00:00.000Z" })).toBe(30);
    expect(
      durationMinutes({
        start_at: "2026-06-16T12:00:00.000Z",
        end_at: "2026-06-16T12:00:00.000Z",
      }),
    ).toBe(30);
  });
});

describe("gridHours", () => {
  it("defaults to 7..20 and widens (in the provider zone) to fit outliers", () => {
    expect(gridHours([], "UTC")).toEqual({ startHour: 7, endHour: 20 });
    const early = { start_at: "2026-06-16T06:15:00.000Z", end_at: "2026-06-16T06:45:00.000Z" };
    const late = { start_at: "2026-06-16T20:30:00.000Z", end_at: "2026-06-16T21:30:00.000Z" };
    expect(gridHours([early, late], "UTC")).toEqual({ startHour: 6, endHour: 22 });
  });
});

describe("layoutDay (proportional blocks + overlap lanes)", () => {
  const gridStartMin = 9 * 60;
  const at = (id, startISO, endISO) => ({ id, start_at: startISO, end_at: endISO });

  it("sizes height by duration — a 60-min block is ~2× a 30-min block", () => {
    const items = layoutDay(
      [
        at(1, "2026-06-16T09:00:00.000Z", "2026-06-16T09:30:00.000Z"), // 30 min
        at(2, "2026-06-16T10:00:00.000Z", "2026-06-16T11:00:00.000Z"), // 60 min
      ],
      gridStartMin,
      "UTC",
    );
    const h30 = items.find((i) => i.booking.id === 1).height;
    const h60 = items.find((i) => i.booking.id === 2).height;
    expect(h30).toBe(30 * PX_PER_MIN);
    expect(h60).toBe(60 * PX_PER_MIN);
    expect(h60).toBeCloseTo(2 * h30, 5);
  });

  it("positions top by start time (later start → larger top)", () => {
    const items = layoutDay(
      [
        at(1, "2026-06-16T09:00:00.000Z", "2026-06-16T09:30:00.000Z"),
        at(2, "2026-06-16T10:30:00.000Z", "2026-06-16T11:00:00.000Z"),
      ],
      gridStartMin,
      "UTC",
    );
    const a = items.find((i) => i.booking.id === 1);
    const b = items.find((i) => i.booking.id === 2);
    expect(a.top).toBe(0); // 09:00 = grid start
    expect(b.top).toBe(90 * PX_PER_MIN); // 10:30 is 90 min after 09:00
    expect(b.top).toBeGreaterThan(a.top);
  });

  it("tiles overlapping bookings into equal side-by-side lanes; isolated stays full width", () => {
    const items = layoutDay(
      [
        at(1, "2026-06-16T09:00:00.000Z", "2026-06-16T10:00:00.000Z"), // overlaps 2
        at(2, "2026-06-16T09:30:00.000Z", "2026-06-16T10:30:00.000Z"), // overlaps 1
        at(3, "2026-06-16T11:00:00.000Z", "2026-06-16T11:30:00.000Z"), // alone
      ],
      gridStartMin,
      "UTC",
    );
    const b1 = items.find((i) => i.booking.id === 1);
    const b2 = items.find((i) => i.booking.id === 2);
    const b3 = items.find((i) => i.booking.id === 3);
    // The two overlappers share a 2-lane cluster in distinct lanes (neither hidden).
    expect(b1.laneCount).toBe(2);
    expect(b2.laneCount).toBe(2);
    expect(new Set([b1.lane, b2.lane])).toEqual(new Set([0, 1]));
    // The isolated booking is full width.
    expect(b3.laneCount).toBe(1);
    expect(b3.lane).toBe(0);
  });

  it("clamps a tiny sub-slot block to the minimum height and keeps its time label", () => {
    const items = layoutDay(
      [at(1, "2026-06-16T09:00:00.000Z", "2026-06-16T09:05:00.000Z")], // 5 min
      gridStartMin,
      "UTC",
    );
    expect(items[0].height).toBe(MIN_BLOCK_PX); // 5*PX_PER_MIN < MIN_BLOCK_PX
    expect(items[0].timeLabel).toBe("09:00–09:05");
  });
});

describe("labels", () => {
  it("hourLabel is 12-hour with AM/PM", () => {
    expect(hourLabel(0)).toBe("12 AM");
    expect(hourLabel(9)).toBe("9 AM");
    expect(hourLabel(12)).toBe("12 PM");
    expect(hourLabel(18)).toBe("6 PM");
  });

  it("dayHeader is weekday + date", () => {
    expect(dayHeader(WED)).toBe("Wed 17");
    expect(dayHeader(new Date(2026, 5, 15))).toBe("Mon 15");
  });
});
