// Date-input hardening (1969 bug). Every empty-ish / broken value must read as "no date",
// never as 1 Jan 1970 / 31 Dec 1969, never as an Invalid Date, and never throw.
// Shared body: run from canonicalDateTime.hardening.test.js (main suite, pinned to Europe/Rome) and
// canonicalDateTime.hardening.test.tz-negative.js (America/Argentina/Buenos_Aires, UTC-3 = the repro zone).

jest.mock("i18next", () => ({ __esModule: true, default: { language: "en" } }));

import i18n from "i18next";
import {
  isValidDate,
  isEpochArtifact,
  parseDateValue,
  toValidDate,
  toCanonicalDate,
  toCanonicalTime,
  canonicalizeDateValue,
  formatDisplayDate,
  initialPickerDate,
  initialPickerTime,
  normalizePickerBound,
  pickedDateToCanonical,
  combineDateTimeToISO,
} from "./canonicalDateTime";
import { formatLocalDate, formatLocalTime, formatLocalDateTime } from "./localeDateTime";
import { formatDate } from "../data/medicationData";

export function defineHardeningTests() {
  const EMPTY_LIKE = [null, undefined, "", "   ", 0, NaN, new Date(NaN), new Date("garbage"), {}, [], true];

  describe("empty-ish values are 'no date'", () => {
    it.each(EMPTY_LIKE.map((v) => [String(v instanceof Date ? "Invalid Date" : typeof v === "object" ? JSON.stringify(v) : v), v]))(
      "%s",
      (_label, v) => {
        expect(parseDateValue(v)).toBeNull();
        expect(toValidDate(v)).toBeNull();
        expect(canonicalizeDateValue(v)).toBe("");
        expect(formatDisplayDate(v)).toBe("");
        expect(formatDate(v)).toBe("");
        expect(formatLocalDate(v)).toBe("");
        expect(formatLocalTime(v)).toBe("");
        expect(formatLocalDateTime(v)).toBe("");
      },
    );

    it("the picker always opens on a valid date (today) for them", () => {
      const now = new Date(2026, 10, 23, 10, 0);
      for (const v of EMPTY_LIKE) {
        const d = initialPickerDate(v, now);
        expect(isValidDate(d)).toBe(true);
        expect(toCanonicalDate(d)).toBe("2026-11-23");
      }
    });

    it("falls back to a real 'now' even if the caller passes a broken now", () => {
      expect(isValidDate(initialPickerDate("", new Date(NaN)))).toBe(true);
      expect(isValidDate(initialPickerTime("", new Date(NaN)))).toBe(true);
    });
  });

  describe("epoch artifacts (the 1969 symptom)", () => {
    it("1969-12-31 / 1970-01-01 read as empty, in any form", () => {
      for (const v of ["1969-12-31", "1970-01-01", "1970-01-01T00:00:00.000Z", "12/31/1969", new Date(1969, 11, 31), new Date(1970, 0, 1)]) {
        expect(parseDateValue(v)).toBeNull();
        expect(formatDisplayDate(v)).toBe("");
      }
    });

    it("timestamp 0 never formats as a date, whatever the zone", () => {
      expect(isEpochArtifact(new Date(0))).toBe(true);
      expect(toValidDate(new Date(0))).toBeNull();
      expect(formatLocalDate(new Date(0))).toBe("");
      expect(formatLocalDateTime(0)).toBe("");
    });

    it("neighbouring real dates are untouched", () => {
      expect(canonicalizeDateValue("1969-12-30")).toBe("1969-12-30");
      expect(canonicalizeDateValue("1970-01-02")).toBe("1970-01-02");
    });
  });

  describe("pickedDateToCanonical (what a native picker callback may commit)", () => {
    it("commits a normal pick", () => {
      expect(pickedDateToCanonical({ type: "set" }, new Date(2026, 11, 5, 14, 30))).toBe("2026-12-05");
    });

    it("commits a far-future pick", () => {
      expect(pickedDateToCanonical({ type: "set" }, new Date(2031, 5, 1))).toBe("2031-06-01");
    });

    it("ignores dismiss, missing, invalid and epoch picks", () => {
      expect(pickedDateToCanonical({ type: "dismissed" }, new Date(2026, 11, 5))).toBeNull();
      expect(pickedDateToCanonical({ type: "set" }, undefined)).toBeNull();
      expect(pickedDateToCanonical({ type: "set" }, null)).toBeNull();
      expect(pickedDateToCanonical({ type: "set" }, new Date(NaN))).toBeNull();
      expect(pickedDateToCanonical({ type: "set" }, new Date(0))).toBeNull();
      expect(pickedDateToCanonical(undefined, "2026-12-05")).toBeNull(); // not a Date
      expect(pickedDateToCanonical(undefined, undefined)).toBeNull();
    });
  });

  describe("no time-zone shift (UTC-3 boundary)", () => {
    it("a picked local date keeps its calendar day, even at the edges of the day", () => {
      expect(pickedDateToCanonical({ type: "set" }, new Date(2026, 10, 30, 0, 0, 0))).toBe("2026-11-30");
      expect(pickedDateToCanonical({ type: "set" }, new Date(2026, 10, 30, 23, 59, 59))).toBe("2026-11-30");
      expect(pickedDateToCanonical({ type: "set" }, new Date(2026, 11, 1, 0, 0, 0))).toBe("2026-12-01");
    });

    it("a stored canonical date round-trips unchanged through parse -> picker -> canonical", () => {
      for (const v of ["2026-11-30", "2026-12-01", "2027-01-01", "2026-03-01"]) {
        const opened = initialPickerDate(v);
        expect(toCanonicalDate(opened)).toBe(v);
        expect(pickedDateToCanonical({ type: "set" }, opened)).toBe(v);
      }
    });

    it("an ISO datetime from the API keeps the date part", () => {
      expect(canonicalizeDateValue("2026-11-30T00:00:00.000Z")).toBe("2026-11-30");
    });

    it("date-only strings through the formatters do not shift a day", () => {
      expect(formatLocalDate("2026-11-30", { timeZone: undefined, day: "numeric", month: "numeric", year: "numeric" })).toMatch(/30/);
    });
  });

  describe("min / max bounds", () => {
    it("normalizePickerBound only returns valid, day-snapped dates", () => {
      expect(normalizePickerBound(null)).toBeUndefined();
      expect(normalizePickerBound(new Date(NaN))).toBeUndefined();
      expect(normalizePickerBound("garbage")).toBeUndefined();
      const start = normalizePickerBound(new Date(2026, 10, 23, 15, 45), "start");
      const end = normalizePickerBound(new Date(2026, 10, 23, 15, 45), "end");
      expect(start.getHours()).toBe(0);
      expect(end.getHours()).toBe(23);
      expect(toCanonicalDate(end)).toBe("2026-11-23");
    });

    it("clamps the opening date into the bounds", () => {
      const now = new Date(2026, 10, 23, 10, 0);
      expect(toCanonicalDate(initialPickerDate("2030-01-01", now, { maximumDate: now }))).toBe("2026-11-23");
      expect(toCanonicalDate(initialPickerDate("2020-01-01", now, { minimumDate: new Date(2025, 0, 1) }))).toBe("2025-01-01");
    });

    it("ignores broken bounds", () => {
      const now = new Date(2026, 10, 23, 10, 0);
      expect(toCanonicalDate(initialPickerDate("", now, { minimumDate: new Date(NaN), maximumDate: "x" }))).toBe("2026-11-23");
    });
  });

  describe("formatters never throw", () => {
    it("toCanonicalDate / toCanonicalTime on an Invalid Date", () => {
      expect(toCanonicalDate(new Date(NaN))).toBe("");
      expect(toCanonicalDate(undefined)).toBe("");
      expect(toCanonicalTime(new Date(NaN))).toBe("");
    });

    it("combineDateTimeToISO returns null instead of throwing", () => {
      for (const [d, t] of [["", "10:00"], ["2026-12-01", ""], [null, null], ["garbage", "10:00"], ["2026-12-01", "25:99"], [undefined, "10:00"]]) {
        expect(() => combineDateTimeToISO(d, t)).not.toThrow();
        expect(combineDateTimeToISO(d, t)).toBeNull();
      }
      const iso = combineDateTimeToISO("2026-12-01", "09:30");
      const back = new Date(iso);
      expect([back.getFullYear(), back.getMonth(), back.getDate(), back.getHours(), back.getMinutes()]).toEqual([2026, 11, 1, 9, 30]);
    });
  });

  describe("EN + ES display", () => {
    afterEach(() => {
      i18n.language = "en";
    });

    it("formats the same canonical value in both languages", () => {
      i18n.language = "en";
      expect(formatDisplayDate("2026-11-30")).toBe("30 November 2026");
      i18n.language = "es-AR";
      expect(formatDisplayDate("2026-11-30")).toBe("30 de noviembre de 2026");
    });
  });

}
