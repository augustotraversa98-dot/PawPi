import {
  parseDateValue,
  toCanonicalDate,
  canonicalizeDateValue,
  formatDisplayDate,
  initialPickerDate,
  parseTimeValue,
  toCanonicalTime,
  formatDisplayTime,
  initialPickerTime,
} from "./canonicalDateTime";

describe("parseDateValue", () => {
  it("parses canonical YYYY-MM-DD as a local date", () => {
    const d = parseDateValue("2025-04-21");
    expect(d.getFullYear()).toBe(2025);
    expect(d.getMonth()).toBe(3);
    expect(d.getDate()).toBe(21);
  });

  it("parses legacy MM/DD/YYYY", () => {
    const d = parseDateValue("04/21/2025");
    expect(toCanonicalDate(d)).toBe("2025-04-21");
  });

  it("parses single-digit legacy MM/DD/YYYY", () => {
    expect(toCanonicalDate(parseDateValue("4/3/2025"))).toBe("2025-04-03");
  });

  it("parses ISO datetime strings (JSON-serialized date columns)", () => {
    expect(toCanonicalDate(parseDateValue("2025-04-21T00:00:00.000Z"))).toBe(
      "2025-04-21",
    );
  });

  it("accepts Date instances", () => {
    expect(toCanonicalDate(parseDateValue(new Date(2025, 3, 21, 15, 30)))).toBe(
      "2025-04-21",
    );
  });

  it("rejects empty, garbage, and impossible dates", () => {
    expect(parseDateValue("")).toBeNull();
    expect(parseDateValue(null)).toBeNull();
    expect(parseDateValue("tomorrow")).toBeNull();
    expect(parseDateValue("2025-02-30")).toBeNull();
    expect(parseDateValue("13/01/2025")).toBeNull();
  });
});

describe("toCanonicalDate", () => {
  it("emits zero-padded YYYY-MM-DD", () => {
    expect(toCanonicalDate(new Date(2025, 0, 5))).toBe("2025-01-05");
  });
});

describe("formatDisplayDate", () => {
  it('formats canonical values as "21 April 2025"', () => {
    expect(formatDisplayDate("2025-04-21")).toBe("21 April 2025");
  });

  it("formats legacy MM/DD/YYYY values the same way", () => {
    expect(formatDisplayDate("04/21/2025")).toBe("21 April 2025");
  });

  it("never shows a leading zero on the day", () => {
    expect(formatDisplayDate("2026-01-05")).toBe("5 January 2026");
  });

  it("returns empty string for empty/unparseable values", () => {
    expect(formatDisplayDate("")).toBe("");
    expect(formatDisplayDate("not a date")).toBe("");
  });
});

describe("canonicalizeDateValue", () => {
  it("normalizes legacy and ISO values to YYYY-MM-DD", () => {
    expect(canonicalizeDateValue("04/21/2025")).toBe("2025-04-21");
    expect(canonicalizeDateValue("2025-04-21T00:00:00.000Z")).toBe(
      "2025-04-21",
    );
    expect(canonicalizeDateValue("2025-04-21")).toBe("2025-04-21");
  });

  it("returns empty string for empty/unparseable values", () => {
    expect(canonicalizeDateValue("")).toBe("");
    expect(canonicalizeDateValue(null)).toBe("");
    expect(canonicalizeDateValue("soon")).toBe("");
  });
});

describe("initialPickerDate", () => {
  const now = new Date(2026, 5, 10);

  it("opens on the current value when set", () => {
    expect(toCanonicalDate(initialPickerDate("2025-04-21", now))).toBe(
      "2025-04-21",
    );
  });

  it("opens on today when empty", () => {
    expect(initialPickerDate("", now)).toBe(now);
    expect(initialPickerDate(undefined, now)).toBe(now);
  });
});

describe("parseTimeValue", () => {
  it("parses canonical HH:MM", () => {
    expect(parseTimeValue("08:05")).toEqual({ hours: 8, minutes: 5 });
    expect(parseTimeValue("23:59")).toEqual({ hours: 23, minutes: 59 });
  });

  it("parses single-digit hours", () => {
    expect(parseTimeValue("8:05")).toEqual({ hours: 8, minutes: 5 });
  });

  it("parses HH:MM:SS (Postgres time columns)", () => {
    expect(parseTimeValue("20:00:00")).toEqual({ hours: 20, minutes: 0 });
  });

  it("rejects out-of-range and garbage values", () => {
    expect(parseTimeValue("24:00")).toBeNull();
    expect(parseTimeValue("12:60")).toBeNull();
    expect(parseTimeValue("noon")).toBeNull();
    expect(parseTimeValue("")).toBeNull();
    expect(parseTimeValue(null)).toBeNull();
  });
});

describe("toCanonicalTime", () => {
  it("emits zero-padded 24h HH:MM from a Date", () => {
    expect(toCanonicalTime(new Date(2026, 0, 1, 8, 5))).toBe("08:05");
    expect(toCanonicalTime(new Date(2026, 0, 1, 20, 0))).toBe("20:00");
  });

  it("emits HH:MM from {hours, minutes}", () => {
    expect(toCanonicalTime({ hours: 0, minutes: 30 })).toBe("00:30");
  });
});

describe("formatDisplayTime", () => {
  it("formats 12h with AM/PM", () => {
    expect(formatDisplayTime("20:00", true)).toBe("8:00 PM");
    expect(formatDisplayTime("08:05", true)).toBe("8:05 AM");
    expect(formatDisplayTime("00:30", true)).toBe("12:30 AM");
    expect(formatDisplayTime("12:00", true)).toBe("12:00 PM");
  });

  it("formats 24h as HH:MM", () => {
    expect(formatDisplayTime("20:00", false)).toBe("20:00");
    expect(formatDisplayTime("8:05", false)).toBe("08:05");
  });

  it("tolerates legacy HH:MM:SS values (drops the seconds)", () => {
    expect(formatDisplayTime("20:00:00", true)).toBe("8:00 PM");
    // The exact Postgres `time`-column shape that leaked seconds into the UI.
    expect(formatDisplayTime("22:59:00", false)).toBe("22:59");
    expect(formatDisplayTime("22:59:00", true)).toBe("10:59 PM");
  });

  it("returns empty string for empty/unparseable values", () => {
    expect(formatDisplayTime("", true)).toBe("");
    expect(formatDisplayTime("later", true)).toBe("");
  });
});

describe("initialPickerTime", () => {
  const now = new Date(2026, 5, 10, 9, 41);

  it("opens on the current value when set", () => {
    const d = initialPickerTime("20:30", now);
    expect(d.getHours()).toBe(20);
    expect(d.getMinutes()).toBe(30);
  });

  it("opens on now when empty", () => {
    expect(initialPickerTime("", now)).toBe(now);
    expect(initialPickerTime(undefined, now)).toBe(now);
  });
});
