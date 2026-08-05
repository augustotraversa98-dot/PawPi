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

  // The Open-now filter (ServicesDiscovery) keeps a provider when deriveOpenNow(hours) !== false
  // — i.e. keeps provably-open AND unknown, drops only provably-closed. This proves that exact
  // predicate over a mixed list, INCLUDING an overnight range and a multi-range day.
  test("open-now filter keeps open + unknown, drops provably-closed (overnight + multi-range)", () => {
    const providers = [
      { id: "open-simple", hours_json: { wed: "09:00-17:00" } }, // open at 10:30 → keep
      { id: "unknown-missing", hours_json: { mon: "09:00-17:00" } }, // no wed entry → unknown → keep
      { id: "unknown-unparseable", hours_json: { wed: "sometimes" } }, // unknown → keep
      { id: "no-hours", hours_json: null }, // unknown → keep
      { id: "closed-explicit", hours_json: { wed: "closed" } }, // closed → drop
      { id: "closed-outside", hours_json: { wed: "18:00-22:00" } }, // 10:30 outside → drop
      { id: "overnight-open", hours_json: { wed: "06:00-02:00" } }, // 10:30 inside overnight → keep
      { id: "multi-range-gap", hours_json: { wed: ["09:00-10:00", "18:00-22:00"] } }, // 10:30 in gap → drop
    ];

    const kept = providers
      .filter((p) => deriveOpenNow(p.hours_json, WED_1030) !== false)
      .map((p) => p.id);

    expect(kept).toEqual([
      "open-simple",
      "unknown-missing",
      "unknown-unparseable",
      "no-hours",
      "overnight-open",
    ]);
  });

  // Previous-day overnight SPILLOVER: a range that spans midnight keeps the provider open into
  // the early hours of the NEXT day, evaluated under that next day's date.
  describe("previous-day overnight spillover", () => {
    // 2026-08-04 is a Tuesday; the overnight range is keyed under Monday.
    const TUE_0500 = new Date(2026, 7, 4, 5, 0);
    const TUE_0700 = new Date(2026, 7, 4, 7, 0);

    test("Mon 22:00–06:00 → OPEN at Tue 05:00, CLOSED at Tue 07:00 (Tue explicitly closed)", () => {
      const h = { mon: "22:00-06:00", tue: "closed" };
      expect(deriveOpenNow(h, TUE_0500)).toBe(true); // still inside Monday's overnight shift
      expect(deriveOpenNow(h, TUE_0700)).toBe(false); // past 06:00, Tue itself is closed
    });

    test("spillover proves OPEN even when today is unknown; contract preserved otherwise", () => {
      const h = { mon: "22:00-06:00" }; // no Tuesday entry at all
      expect(deriveOpenNow(h, TUE_0500)).toBe(true); // spillover beats an unknown today
      expect(deriveOpenNow(h, TUE_0700)).toBeNull(); // no spillover + missing Tue → unknown (null)
    });

    test("a normal (non-overnight) previous-day range does NOT spill", () => {
      const h = { mon: "09:00-17:00", tue: "closed" };
      expect(deriveOpenNow(h, TUE_0500)).toBe(false); // Mon range never crosses midnight
    });

    test("a normal same-day range is unaffected by the spillover check", () => {
      const TUE_1030 = new Date(2026, 7, 4, 10, 30);
      expect(deriveOpenNow({ tue: "09:00-17:00" }, TUE_1030)).toBe(true);
      expect(deriveOpenNow({ tue: "09:00-17:00" }, TUE_0700)).toBe(false);
    });

    test("week boundary wraps: Sat 23:00–05:00 → OPEN at Sun 03:00", () => {
      // 2026-08-09 is a Sunday; its previous weekday is Saturday.
      const SUN_0300 = new Date(2026, 7, 9, 3, 0);
      expect(deriveOpenNow({ sat: "23:00-05:00", sun: "closed" }, SUN_0300)).toBe(true);
    });

    test("unparseable today with no covering spillover still → unknown (null)", () => {
      expect(deriveOpenNow({ mon: "22:00-06:00", tue: "bogus" }, TUE_0700)).toBeNull();
    });

    test("open-now filter keeps a spillover-open provider (!== false)", () => {
      const providers = [
        { id: "spillover-open", hours_json: { mon: "22:00-06:00", tue: "closed" } }, // Tue 05:00 → open
        { id: "closed", hours_json: { tue: "closed" } }, // → drop
        { id: "unknown", hours_json: { wed: "09:00-17:00" } }, // no Tue → unknown → keep
      ];
      const kept = providers
        .filter((p) => deriveOpenNow(p.hours_json, TUE_0500) !== false)
        .map((p) => p.id);
      expect(kept).toEqual(["spillover-open", "unknown"]);
    });
  });
});
