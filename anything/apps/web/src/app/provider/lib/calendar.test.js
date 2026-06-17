import { describe, it, expect } from "vitest";
import {
  ymd,
  addDays,
  startOfWeek,
  viewDays,
  rangeForView,
  bookingDayKey,
  bookingHour,
  hourRange,
  indexByCell,
  hourLabel,
  dayHeader,
} from "./calendar";

// Pure grid math for the bookings calendar (ticket 2.24). All local-time based —
// the bookings are built from local Dates so getHours()/ymd are timezone-stable here.

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

describe("booking placement", () => {
  const booking = (id, d) => ({ id, start_at: d.toISOString() });

  it("derives the local day key + hour", () => {
    const b = booking(1, new Date(2026, 5, 16, 14, 0));
    expect(bookingDayKey(b)).toBe("2026-06-16");
    expect(bookingHour(b)).toBe(14);
    expect(bookingDayKey({})).toBeNull();
  });

  it("indexByCell buckets bookings by day|hour", () => {
    const a = booking(1, new Date(2026, 5, 16, 14, 0));
    const b = booking(2, new Date(2026, 5, 16, 14, 30)); // same cell as a
    const c = booking(3, new Date(2026, 5, 17, 9, 0));
    const map = indexByCell([a, b, c]);
    expect(map.get("2026-06-16|14").map((x) => x.id)).toEqual([1, 2]);
    expect(map.get("2026-06-17|9").map((x) => x.id)).toEqual([3]);
    expect(map.get("2026-06-18|10")).toBeUndefined();
  });

  it("hourRange covers business hours and widens to include outliers", () => {
    expect(hourRange([])).toEqual([
      7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
    ]);
    const early = booking(1, new Date(2026, 5, 16, 6, 0));
    expect(hourRange([early])[0]).toBe(6); // widened down to 6
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
