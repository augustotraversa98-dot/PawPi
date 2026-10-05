import { describe, it, expect } from "vitest";
import { DEFAULT_QUIET_HOURS, normalizeQuietSettings, hourInWindow, isInQuietHours } from "./quietHours";

describe("hourInWindow", () => {
  it("handles a window that wraps midnight (22 → 8)", () => {
    const inside = [22, 23, 0, 1, 2, 3, 4, 5, 6, 7];
    for (let h = 0; h < 24; h++) expect(hourInWindow(h, 22, 8), `hour ${h}`).toBe(inside.includes(h));
  });
  it("handles a same-day window (13 → 15)", () => {
    for (let h = 0; h < 24; h++) expect(hourInWindow(h, 13, 15), `hour ${h}`).toBe(h === 13 || h === 14);
  });
  it("start === end is an EMPTY window (nothing is quiet)", () => {
    for (let h = 0; h < 24; h++) expect(hourInWindow(h, 9, 9)).toBe(false);
  });
  it("the end hour itself is NOT quiet (08:00 may ring) and the start hour is", () => {
    expect(hourInWindow(8, 22, 8)).toBe(false);
    expect(hourInWindow(22, 22, 8)).toBe(true);
  });
});

describe("normalizeQuietSettings", () => {
  it("defaults to enabled 22:00-08:00 for nothing / junk", () => {
    expect(DEFAULT_QUIET_HOURS).toEqual({ enabled: true, start: 22, end: 8 });
    expect(normalizeQuietSettings(null)).toEqual(DEFAULT_QUIET_HOURS);
    expect(normalizeQuietSettings({ quiet_start: 99, quiet_end: -1, quiet_hours_enabled: "yes" })).toEqual(DEFAULT_QUIET_HOURS);
  });
  it("reads DB-shaped and API-shaped rows", () => {
    expect(normalizeQuietSettings({ quiet_hours_enabled: false, quiet_start: 23, quiet_end: 7 })).toEqual({ enabled: false, start: 23, end: 7 });
    expect(normalizeQuietSettings({ enabled: true, start: 21, end: 6 })).toEqual({ enabled: true, start: 21, end: 6 });
    expect(normalizeQuietSettings({ quiet_start: "21", quiet_end: "6" })).toMatchObject({ start: 21, end: 6 });
  });
});

describe("isInQuietHours (owner-local)", () => {
  const s = { enabled: true, start: 22, end: 8 };
  it("uses the owner's zone: 01:30Z is 22:30 in Buenos Aires (quiet) but 10:30 in Tokyo (not)", () => {
    const now = new Date("2026-10-06T01:30:00Z");
    expect(isInQuietHours(s, "America/Buenos_Aires", now)).toBe(true);
    expect(isInQuietHours(s, "Asia/Tokyo", now)).toBe(false);
  });
  it("no / bad zone → America/Buenos_Aires", () => {
    const now = new Date("2026-10-06T01:30:00Z");
    expect(isInQuietHours(s, null, now)).toBe(true);
    expect(isInQuietHours(s, "Not/AZone", now)).toBe(true);
  });
  it("disabled → never quiet", () => {
    expect(isInQuietHours({ ...s, enabled: false }, "America/Buenos_Aires", new Date("2026-10-06T03:00:00Z"))).toBe(false);
  });
  it("boundary: exactly 22:00 local is quiet, exactly 08:00 local is not", () => {
    expect(isInQuietHours(s, "UTC", new Date("2026-10-05T22:00:00Z"))).toBe(true);
    expect(isInQuietHours(s, "UTC", new Date("2026-10-05T08:00:00Z"))).toBe(false);
    expect(isInQuietHours(s, "UTC", new Date("2026-10-05T07:59:00Z"))).toBe(true);
  });
  it("is DST-correct (uses the zone rules on that date)", () => {
    // New York is UTC-4 in October (EDT) and UTC-5 in January (EST)
    expect(isInQuietHours(s, "America/New_York", new Date("2026-10-06T02:30:00Z"))).toBe(true); // 22:30 EDT
    expect(isInQuietHours(s, "America/New_York", new Date("2026-01-06T02:30:00Z"))).toBe(false); // 21:30 EST: the same UTC time is NOT quiet
    expect(isInQuietHours(s, "America/New_York", new Date("2026-01-06T03:30:00Z"))).toBe(true); // 22:30 EST
  });
});
