import {
  RECURRENCE_FREQUENCY,
  getRecurrenceRule,
  parseWalkTime,
  formatFrequency,
  buildEventNotes,
  combineDateAndTime,
  buildBookingCalendarDetails,
  buildTelehealthCalendarDetails,
  buildTransportCalendarDetails,
  buildEventCalendarDetails,
} from "./calendarFormat";
import { ROUTINE_FREQUENCY } from "@/data/routinesData";

// Ticket 2.79: pure, expo-free calendar mapping/formatting helpers extracted from
// calendarIntegration.js so the recurrence/time/notes logic is unit-testable in CI
// (expo-calendar's native calls can't run headless). These assertions pin the exact
// mapping the native createEventAsync receives — change the mapping and they go red.

describe("getRecurrenceRule", () => {
  it("DAILY → daily, interval 1", () => {
    expect(getRecurrenceRule({ frequency: ROUTINE_FREQUENCY.DAILY })).toEqual({
      frequency: RECURRENCE_FREQUENCY.DAILY,
      interval: 1,
    });
  });

  it("WEEKLY with days → weekly + daysOfTheWeek (0 = Sunday preserved)", () => {
    expect(
      getRecurrenceRule({ frequency: ROUTINE_FREQUENCY.WEEKLY, days: [1, 3, 5] }),
    ).toEqual({
      frequency: RECURRENCE_FREQUENCY.WEEKLY,
      interval: 1,
      daysOfTheWeek: [
        { dayOfTheWeek: 1 },
        { dayOfTheWeek: 3 },
        { dayOfTheWeek: 5 },
      ],
    });
  });

  it("WEEKLY with no days → null (not enough to recur)", () => {
    expect(
      getRecurrenceRule({ frequency: ROUTINE_FREQUENCY.WEEKLY, days: [] }),
    ).toBeNull();
  });

  it("MONTHLY with preferredDay → monthly + daysOfTheMonth", () => {
    expect(
      getRecurrenceRule({ frequency: ROUTINE_FREQUENCY.MONTHLY, preferredDay: 15 }),
    ).toEqual({
      frequency: RECURRENCE_FREQUENCY.MONTHLY,
      interval: 1,
      daysOfTheMonth: [15],
    });
  });

  it("MONTHLY without preferredDay → null", () => {
    expect(
      getRecurrenceRule({ frequency: ROUTINE_FREQUENCY.MONTHLY }),
    ).toBeNull();
  });

  it("unknown / one-time frequency → null", () => {
    expect(getRecurrenceRule({ frequency: ROUTINE_FREQUENCY.ONCE })).toBeNull();
    expect(getRecurrenceRule(null)).toBeNull();
  });
});

describe("parseWalkTime", () => {
  it("parses HH:mm onto today's date with seconds/ms zeroed", () => {
    const d = parseWalkTime("08:30");
    expect(d.getHours()).toBe(8);
    expect(d.getMinutes()).toBe(30);
    expect(d.getSeconds()).toBe(0);
    expect(d.getMilliseconds()).toBe(0);
    const now = new Date();
    expect(d.getFullYear()).toBe(now.getFullYear());
    expect(d.getMonth()).toBe(now.getMonth());
    expect(d.getDate()).toBe(now.getDate());
  });
});

describe("formatFrequency", () => {
  it("daily", () => {
    expect(formatFrequency({ frequency: ROUTINE_FREQUENCY.DAILY })).toBe("daily");
  });
  it("weekly with days lists the day names", () => {
    expect(
      formatFrequency({ frequency: ROUTINE_FREQUENCY.WEEKLY, days: [1, 3] }),
    ).toBe("every Mon, Wed");
  });
  it("monthly with preferred day", () => {
    expect(
      formatFrequency({ frequency: ROUTINE_FREQUENCY.MONTHLY, preferredDay: 9 }),
    ).toBe("monthly on day 9");
  });
  it("falls back to 'one time'", () => {
    expect(formatFrequency({ frequency: ROUTINE_FREQUENCY.ONCE })).toBe("one time");
  });
});

describe("buildEventNotes", () => {
  it("walk → the fixed privacy-preserving note", () => {
    expect(buildEventNotes("walk")).toBe("Dog walk scheduled in PawPi");
  });

  it("vet → multi-line summary with only the provided fields", () => {
    const notes = buildEventNotes("vet", {
      petName: "Rex",
      title: "Annual Checkup",
      reasonForVisit: "Vaccines",
      veterinarian: "Dr. Smith",
      notes: "Bring records",
    });
    expect(notes).toContain("Vet appointment for Rex");
    expect(notes).toContain("Appointment: Annual Checkup");
    expect(notes).toContain("Reason: Vaccines");
    expect(notes).toContain("Veterinarian: Dr. Smith");
    expect(notes).toContain("Notes: Bring records");
    expect(notes).toContain("Managed by PawPi");
  });

  it("vet → defaults the pet name and omits absent fields", () => {
    const notes = buildEventNotes("vet", {});
    expect(notes).toContain("Vet appointment for Your pet");
    expect(notes).not.toContain("Appointment:");
    expect(notes).not.toContain("Reason:");
    expect(notes).toContain("Managed by PawPi");
  });

  it("unknown kind → empty string", () => {
    expect(buildEventNotes("nope")).toBe("");
  });
});

// ===== 2.80 surface detail builders =====

const MINUTES = (a, b) => Math.round((b.getTime() - a.getTime()) / 60000);

describe("combineDateAndTime", () => {
  it("builds a local Date from date + HH:MM", () => {
    const d = combineDateAndTime("2026-07-01", "09:30");
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(6);
    expect(d.getDate()).toBe(1);
    expect(d.getHours()).toBe(9);
    expect(d.getMinutes()).toBe(30);
  });
  it("tolerates HH:MM:SS", () => {
    const d = combineDateAndTime("2026-07-01", "23:15:45");
    expect(d.getHours()).toBe(23);
    expect(d.getSeconds()).toBe(45);
  });
});

describe("buildBookingCalendarDetails", () => {
  it("uses date+time with a 30-min default window", () => {
    const det = buildBookingCalendarDetails(
      {
        title: "Grooming",
        appointment_date: "2026-07-01",
        appointment_time: "10:00",
        provider_name: "PawCare",
        reason_for_visit: "Full groom",
      },
      "Rex",
    );
    expect(det.summary).toBe("Grooming");
    expect(det.location).toBe("PawCare");
    expect(MINUTES(det.startDate, det.endDate)).toBe(30);
    expect(det.notes).toContain("Full groom");
    expect(det.notes).toContain("Managed by PawPi");
  });

  it("prefers an explicit start_at/end_at slot", () => {
    const det = buildBookingCalendarDetails({
      title: "Walk",
      start_at: "2026-07-01T09:00:00Z",
      end_at: "2026-07-01T10:00:00Z",
    });
    expect(MINUTES(det.startDate, det.endDate)).toBe(60);
  });

  it("falls back to a generic summary using the pet name", () => {
    const det = buildBookingCalendarDetails(
      { appointment_date: "2026-07-01", appointment_time: "10:00" },
      "Lola",
    );
    expect(det.summary).toBe("Appointment for Lola");
  });
});

describe("buildTelehealthCalendarDetails", () => {
  it("notes a video consult and has no location", () => {
    const det = buildTelehealthCalendarDetails(
      { appointment_date: "2026-07-01", appointment_time: "14:00", provider_name: "TeleVet" },
      "Rex",
    );
    expect(det.summary).toBe("Telehealth consult for Rex");
    expect(det.location).toBe("");
    expect(det.notes).toContain("Video consult");
    expect(det.notes).toContain("Provider: TeleVet");
    expect(MINUTES(det.startDate, det.endDate)).toBe(30);
  });
});

describe("buildTransportCalendarDetails", () => {
  it("maps scheduled_at + pickup/dropoff with a 60-min default", () => {
    const det = buildTransportCalendarDetails({
      scheduled_at: "2026-07-01T08:00:00Z",
      pickup_address: "1 Main St",
      dropoff_address: "Vet Clinic",
      provider_name: "PetTaxi",
    });
    expect(det.summary).toBe("Pet transport — PetTaxi");
    expect(det.location).toBe("1 Main St");
    expect(det.notes).toContain("Pickup: 1 Main St");
    expect(det.notes).toContain("Dropoff: Vet Clinic");
    expect(MINUTES(det.startDate, det.endDate)).toBe(60);
  });
});

describe("buildEventCalendarDetails", () => {
  it("maps starts_at/ends_at + location_name", () => {
    const det = buildEventCalendarDetails({
      title: "Puppy Social",
      starts_at: "2026-08-01T15:00:00Z",
      ends_at: "2026-08-01T17:00:00Z",
      location_name: "Central Park",
      description: "Bring water",
    });
    expect(det.summary).toBe("Puppy Social");
    expect(det.location).toBe("Central Park");
    expect(det.notes).toBe("Bring water");
    expect(MINUTES(det.startDate, det.endDate)).toBe(120);
  });

  it("defaults to a 60-min window and address fallback when no end/location_name", () => {
    const det = buildEventCalendarDetails({
      title: "Meetup",
      starts_at: "2026-08-01T15:00:00Z",
      address: "42 Park Ave",
    });
    expect(det.location).toBe("42 Park Ave");
    expect(MINUTES(det.startDate, det.endDate)).toBe(60);
  });
});
