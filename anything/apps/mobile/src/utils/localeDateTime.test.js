// AUDIT A-34 — locale-aware Argentine formatting (dd/MM, 24h) instead of en-US/12h.
import i18n from "@/i18n";
import {
  currentDateLocale,
  formatLocalTime,
  formatLocalDate,
  formatLocalDateTime,
} from "./localeDateTime";

const D = new Date("2026-03-05T15:07:00");

afterEach(() => {
  i18n.language = "en";
});

describe("localeDateTime (AUDIT A-34)", () => {
  it("picks es-AR for Spanish and en-GB for English", () => {
    i18n.language = "es";
    expect(currentDateLocale()).toBe("es-AR");
    i18n.language = "en";
    expect(currentDateLocale()).toBe("en-GB");
  });

  it("formats time as 24-hour (never AM/PM)", () => {
    i18n.language = "en";
    const t = formatLocalTime(D);
    expect(t).toMatch(/^15[:.]07$/);
    expect(t).not.toMatch(/AM|PM/i);
  });

  it("formats dates day-first (dd/MM order)", () => {
    i18n.language = "en";
    // Default: 05 Mar 2026 (day before month).
    const d = formatLocalDate(D);
    expect(d).toMatch(/05/);
    // Numeric day+month keeps day first (05/03).
    const numeric = formatLocalDate(D, { day: "2-digit", month: "2-digit", year: undefined });
    expect(numeric.indexOf("05")).toBeLessThan(numeric.indexOf("03"));
  });

  it("date-time uses 24h", () => {
    i18n.language = "en";
    expect(formatLocalDateTime(D)).not.toMatch(/AM|PM/i);
  });

  it("accepts strings and Dates", () => {
    expect(() => formatLocalTime("2026-03-05T15:07:00")).not.toThrow();
  });
});
