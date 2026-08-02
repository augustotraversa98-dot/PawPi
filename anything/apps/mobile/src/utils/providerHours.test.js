import { deriveOpenNow } from "./providerHours";

// Wednesday 2026-08-05, 10:30 local.
const WED_1030 = new Date(2026, 7, 5, 10, 30);
// Wednesday 2026-08-05, 20:00 local.
const WED_2000 = new Date(2026, 7, 5, 20, 0);

describe("deriveOpenNow", () => {
  test("null / non-object hours → unknown (null), never hides", () => {
    expect(deriveOpenNow(null, WED_1030)).toBeNull();
    expect(deriveOpenNow(undefined, WED_1030)).toBeNull();
    expect(deriveOpenNow("9-5", WED_1030)).toBeNull();
    expect(deriveOpenNow([], WED_1030)).toBeNull();
  });

  test("string range, 3-letter day key → open inside, closed outside", () => {
    const h = { wed: "09:00-17:00" };
    expect(deriveOpenNow(h, WED_1030)).toBe(true);
    expect(deriveOpenNow(h, WED_2000)).toBe(false);
  });

  test("short H-H form and full day name both parse", () => {
    expect(deriveOpenNow({ wed: "9-17" }, WED_1030)).toBe(true);
    expect(deriveOpenNow({ wednesday: "9-17" }, WED_1030)).toBe(true);
  });

  test("keys are case-insensitive", () => {
    expect(deriveOpenNow({ WED: "09:00-17:00" }, WED_1030)).toBe(true);
  });

  test("object {open,close} form", () => {
    expect(deriveOpenNow({ wed: { open: "09:00", close: "17:00" } }, WED_1030)).toBe(true);
    expect(deriveOpenNow({ wed: { open: "09:00", close: "17:00" } }, WED_2000)).toBe(false);
  });

  test("multiple ranges (split shift) — open in the evening window", () => {
    const h = { wed: ["09:00-13:00", "18:00-22:00"] };
    expect(deriveOpenNow(h, WED_1030)).toBe(true); // morning
    expect(deriveOpenNow(h, new Date(2026, 7, 5, 14, 0))).toBe(false); // gap
    expect(deriveOpenNow(h, WED_2000)).toBe(true); // evening
  });

  test("overnight range spanning midnight", () => {
    const h = { wed: "20:00-02:00" };
    expect(deriveOpenNow(h, WED_2000)).toBe(true); // 20:00
    expect(deriveOpenNow(h, new Date(2026, 7, 5, 1, 0))).toBe(true); // 01:00
    expect(deriveOpenNow(h, WED_1030)).toBe(false); // 10:30
  });

  test('explicit "closed" / null / false for the day → closed', () => {
    expect(deriveOpenNow({ wed: "closed" }, WED_1030)).toBe(false);
    expect(deriveOpenNow({ wed: null }, WED_1030)).toBe(false);
    expect(deriveOpenNow({ wed: false }, WED_1030)).toBe(false);
  });

  test("missing today's day → unknown (null)", () => {
    expect(deriveOpenNow({ mon: "09:00-17:00" }, WED_1030)).toBeNull();
  });

  test("present but unparseable value → unknown (null), never hides", () => {
    expect(deriveOpenNow({ wed: "sometimes" }, WED_1030)).toBeNull();
    expect(deriveOpenNow({ wed: 12345 }, WED_1030)).toBeNull();
    expect(deriveOpenNow({ wed: ["09:00-13:00", "bogus"] }, WED_1030)).toBeNull();
  });
});
