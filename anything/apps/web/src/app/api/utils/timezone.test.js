import { describe, it, expect } from "vitest";
import { DEFAULT_TIMEZONE, isValidTimeZone, resolveTimezone, localHourMinute } from "./timezone";

describe("timezone helpers", () => {
  it("accepts real IANA zones", () => {
    for (const tz of ["America/Argentina/Buenos_Aires", "America/Buenos_Aires", "Europe/Madrid", "UTC", "Asia/Kolkata", "America/Port-au-Prince"]) {
      expect(isValidTimeZone(tz), tz).toBe(true);
    }
  });
  it("rejects junk, injection attempts, offsets and over-long input", () => {
    for (const tz of ["", " ", "Mars/Olympus", "../etc/passwd", "UTC; DROP TABLE x", "GMT+3 ", "a".repeat(80), null, undefined, 5, "America//Lima"]) {
      expect(isValidTimeZone(tz), String(tz)).toBe(false);
    }
  });
  it("falls back to America/Buenos_Aires for anything unusable", () => {
    expect(DEFAULT_TIMEZONE).toBe("America/Buenos_Aires");
    expect(resolveTimezone(null)).toBe(DEFAULT_TIMEZONE);
    expect(resolveTimezone("nope")).toBe(DEFAULT_TIMEZONE);
    expect(resolveTimezone("Europe/Madrid")).toBe("Europe/Madrid");
  });
  it("computes the local hour in the owner's zone (and the fallback zone)", () => {
    const d = new Date("2026-10-05T23:30:00Z");
    expect(localHourMinute(d, "UTC")).toEqual({ hour: 23, minute: 30 });
    expect(localHourMinute(d, "Asia/Kolkata")).toEqual({ hour: 5, minute: 0 }); // UTC+5:30 -> 05:00
    expect(localHourMinute(d, "America/Buenos_Aires")).toEqual({ hour: 20, minute: 30 }); // UTC-3
    expect(localHourMinute(d, "bogus")).toEqual({ hour: 20, minute: 30 }); // falls back to Buenos Aires
    expect(localHourMinute(new Date("2026-10-05T03:00:00Z"), "UTC").hour).toBe(3);
    expect(localHourMinute(new Date("2026-10-05T00:10:00Z"), "UTC").hour).toBe(0); // midnight is 0, never 24
  });
});
