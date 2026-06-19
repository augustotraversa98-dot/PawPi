import { describe, it, expect } from "vitest";
import {
  escapeIcsText,
  formatIcsUtc,
  formatFloatingDateTime,
  buildBookingIcs,
  buildEventIcs,
} from "./ics";

// Ticket 2.79 (+ 2.80 events): the pure .ics builders. These pin RFC 5545 essentials —
// escaping of comma/semicolon/backslash/newline, CRLF line endings, stable per-row UID,
// floating booking times vs UTC event times — DB-free.

describe("escapeIcsText", () => {
  it("escapes backslash, comma, semicolon and newline", () => {
    expect(escapeIcsText("a, b; c\\d\ne")).toBe("a\\, b\\; c\\\\d\\ne");
  });
  it("treats null/undefined as empty", () => {
    expect(escapeIcsText(null)).toBe("");
    expect(escapeIcsText(undefined)).toBe("");
  });
  it("normalizes CRLF/CR to a single escaped newline", () => {
    expect(escapeIcsText("a\r\nb\rc")).toBe("a\\nb\\nc");
  });
});

describe("formatIcsUtc", () => {
  it("formats a Date as YYYYMMDDTHHMMSSZ in UTC", () => {
    expect(formatIcsUtc(new Date("2026-07-01T09:05:00Z"))).toBe("20260701T090500Z");
  });
});

describe("formatFloatingDateTime", () => {
  it("formats date + time as a floating local stamp (no Z)", () => {
    expect(formatFloatingDateTime("2026-07-01", "09:00")).toBe("20260701T090000");
  });
  it("adds a minute offset, rolling the hour", () => {
    expect(formatFloatingDateTime("2026-07-01", "09:45", 30)).toBe("20260701T101500");
  });
  it("accepts HH:MM:SS and defaults missing time to midnight", () => {
    expect(formatFloatingDateTime("2026-07-01", "23:30:15")).toBe("20260701T233015");
    expect(formatFloatingDateTime("2026-07-01", null)).toBe("20260701T000000");
  });
});

describe("buildBookingIcs", () => {
  const ROW = {
    id: 42,
    title: "Annual Checkup",
    appointment_date: "2026-07-01",
    appointment_time: "10:00:00",
    clinic: "PawCare Clinic",
    veterinarian: "Dr. Smith",
    reason_for_visit: "Vaccines, booster",
    notes: "Bring records",
  };

  it("produces a single valid VEVENT inside a VCALENDAR", () => {
    const ics = buildBookingIcs(ROW);
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics).toContain("VERSION:2.0");
    expect(ics).toContain("BEGIN:VEVENT");
    expect(ics).toContain("END:VEVENT");
    expect(ics.trimEnd().endsWith("END:VCALENDAR")).toBe(true);
    // exactly one event
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(1);
  });

  it("uses a stable per-booking UID", () => {
    expect(buildBookingIcs(ROW)).toContain("UID:booking-42@pawpi");
  });

  it("maps date+time to a 30-min floating window by default", () => {
    const ics = buildBookingIcs(ROW);
    expect(ics).toContain("DTSTART:20260701T100000");
    expect(ics).toContain("DTEND:20260701T103000");
  });

  it("honors a custom duration", () => {
    expect(buildBookingIcs(ROW, { durationMinutes: 60 })).toContain(
      "DTEND:20260701T110000",
    );
  });

  it("escapes special characters in summary/location/description", () => {
    const ics = buildBookingIcs(ROW);
    expect(ics).toContain("SUMMARY:Annual Checkup");
    expect(ics).toContain("LOCATION:PawCare Clinic");
    // commas in the reason are escaped per RFC 5545
    expect(ics).toContain("Vaccines\\, booster");
  });

  it("uses CRLF line endings throughout", () => {
    const ics = buildBookingIcs(ROW);
    expect(ics.includes("\r\n")).toBe(true);
    // no bare LF that isn't part of a CRLF
    expect(/[^\r]\n/.test(ics)).toBe(false);
  });

  it("omits LOCATION/DESCRIPTION when empty", () => {
    const ics = buildBookingIcs({
      id: 1,
      title: "Quick visit",
      appointment_date: "2026-07-01",
      appointment_time: "08:00",
    });
    expect(ics).not.toContain("LOCATION:");
    expect(ics).not.toContain("DESCRIPTION:");
  });
});

describe("buildEventIcs", () => {
  const ROW = {
    id: 7,
    title: "Puppy Social",
    starts_at: "2026-08-01T15:00:00Z",
    ends_at: "2026-08-01T17:00:00Z",
    location_name: "Central Park",
    description: "Bring water; meet at the gate",
  };

  it("emits UTC DTSTART/DTEND and a stable event UID", () => {
    const ics = buildEventIcs(ROW);
    expect(ics).toContain("UID:event-7@pawpi");
    expect(ics).toContain("DTSTART:20260801T150000Z");
    expect(ics).toContain("DTEND:20260801T170000Z");
    expect(ics).toContain("SUMMARY:Puppy Social");
    expect(ics).toContain("LOCATION:Central Park");
    expect(ics).toContain("Bring water\\; meet at the gate");
  });

  it("defaults to a 60-min window when ends_at is absent", () => {
    const ics = buildEventIcs({ id: 8, title: "Meetup", starts_at: "2026-08-01T15:00:00Z" });
    expect(ics).toContain("DTSTART:20260801T150000Z");
    expect(ics).toContain("DTEND:20260801T160000Z");
  });
});
