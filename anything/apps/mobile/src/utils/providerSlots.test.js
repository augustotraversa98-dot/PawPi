// Pure helpers for the OSDE-style slot picker (PR-2). No RN, no network.
import {
  isSlotCapability,
  SLOT_CAPABILITIES,
  IN_PERSON_SLOT_CAPABILITIES,
  slotZonedParts,
  monthRange,
  buildMonthMatrix,
} from "./providerSlots";

describe("isSlotCapability", () => {
  test("vet/groomer/trainer/telehealth are slot-based; daycare/sitter/walker are not", () => {
    for (const c of ["vet", "groomer", "trainer", "telehealth"]) {
      expect(isSlotCapability(c)).toBe(true);
    }
    for (const c of ["daycare", "sitter", "walker", "shop", undefined]) {
      expect(isSlotCapability(c)).toBe(false);
    }
    expect(SLOT_CAPABILITIES).toContain("telehealth");
    expect(IN_PERSON_SLOT_CAPABILITIES).not.toContain("telehealth");
  });
});

describe("slotZonedParts", () => {
  test("maps an absolute-UTC instant to provider-local date + time (Buenos Aires, -3h)", () => {
    // 12:00Z = 09:00 in Buenos Aires (inverse of PR-1's composition).
    expect(
      slotZonedParts("2026-06-15T12:00:00.000Z", "America/Argentina/Buenos_Aires"),
    ).toEqual({ date: "2026-06-15", time: "09:00" });
  });

  test("is identity in UTC", () => {
    expect(slotZonedParts("2026-06-15T09:30:00.000Z", "UTC")).toEqual({
      date: "2026-06-15",
      time: "09:30",
    });
  });
});

describe("monthRange", () => {
  test("spans a whole 30-day month (June, month index 5)", () => {
    expect(monthRange(2026, 5)).toEqual({ from: "2026-06-01", to: "2026-06-30" });
  });

  test("handles February (non-leap 2026 → 28 days)", () => {
    expect(monthRange(2026, 1)).toEqual({ from: "2026-02-01", to: "2026-02-28" });
  });
});

describe("buildMonthMatrix", () => {
  test("June 2026 starts on a Monday (no leading padding) and covers all 30 days", () => {
    const weeks = buildMonthMatrix(2026, 5);
    expect(weeks[0][0]).toBe("2026-06-01"); // Mon, first column
    const days = weeks.flat().filter(Boolean);
    expect(days).toHaveLength(30);
    expect(days[days.length - 1]).toBe("2026-06-30");
    // Every week is exactly 7 cells (Mon-first grid).
    expect(weeks.every((w) => w.length === 7)).toBe(true);
  });
});
