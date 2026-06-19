import {
  RECURRENCE_FREQUENCY,
  getRecurrenceRule,
  parseWalkTime,
  formatFrequency,
  buildEventNotes,
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
    expect(buildEventNotes("walk")).toBe("Dog walk scheduled in Social Pet");
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
    expect(notes).toContain("Managed by Social Pet");
  });

  it("vet → defaults the pet name and omits absent fields", () => {
    const notes = buildEventNotes("vet", {});
    expect(notes).toContain("Vet appointment for Your pet");
    expect(notes).not.toContain("Appointment:");
    expect(notes).not.toContain("Reason:");
    expect(notes).toContain("Managed by Social Pet");
  });

  it("unknown kind → empty string", () => {
    expect(buildEventNotes("nope")).toBe("");
  });
});
