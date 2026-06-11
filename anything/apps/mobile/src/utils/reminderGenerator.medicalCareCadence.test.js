import {
  generateRemindersFromRoutine,
  generateOverdueInstances,
} from "./reminderGenerator";
import { ROUTINE_TYPES, ROUTINE_FREQUENCY } from "../data/routinesData";

// P1b — medical-care DATE-BASED items (vaccine / heartworm / flea_tick /
// deworming / other) routed through the shared calendar-cadence layer so the
// medical needs they exist for actually fire: yearly vaccines, monthly heartworm
// and flea/tick, every-3/6-month and weekly/biweekly/weekday cadences, forward
// AND overdue. The dose-course items (medication/supplement) and the HOURLY
// cadence are separate commits and are untouched here.
//
// Two invariants under test throughout:
//   1. The no-cadence (absent frequency) and explicit ONCE paths stay
//      BYTE-FOR-BYTE — their id is a durable dismissal key (see "id stability").
//   2. Recurring occurrences are phase-anchored on nextDue and parsed as LOCAL
//      dates, so day-of-month / weekday are stable across timezones.
//
// Clock pinned to the same instant as the month/once/overdue suites.

const NOW = new Date(2026, 5, 10, 8, 0, 0); // Wed 2026-06-10 08:00 local

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(NOW);
});

afterEach(() => {
  jest.useRealTimers();
});

function makeRoutine(overrides) {
  return {
    id: "100",
    petId: "42",
    isActive: true,
    notificationEnabled: true,
    times: [],
    days: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function medicalRoutine(item, overrides = {}) {
  return makeRoutine({
    type: ROUTINE_TYPES.MEDICAL_CARE,
    medicalCareItems: [item],
    ...overrides,
  });
}

// The id's date segment for a RECURRING occurrence, derived exactly like the
// generator: toISOString of the trigger datetime (date-based items fire at 09:00
// local), so the assertion matches the generator's own derivation in any tz.
const idAt = (y, m, d) =>
  new Date(y, m - 1, d, 9, 0, 0).toISOString().split("T")[0];
// The legacy date segment for the BACK-COMPAT / ONCE path, which parses nextDue
// as a UTC instant (kept verbatim for dismissal-key stability).
const legacyIdDate = (s) => new Date(s).toISOString().split("T")[0];

const allIdsUnique = (rs) => new Set(rs.map((r) => r.id)).size === rs.length;
// Local weekday Mon=0, computed the same way the generator does.
const monday0 = (iso) => (new Date(iso).getDay() + 6) % 7;

describe("medical-care date-based — id stability (back-compat & ONCE)", () => {
  it("an item with NO frequency keeps the legacy single-occurrence id byte-for-byte", () => {
    const routine = medicalRoutine({
      id: "vac1",
      type: "vaccine",
      name: "Rabies",
      nextDue: "2026-06-20",
    });

    const reminders = generateRemindersFromRoutine(routine, 30);

    expect(reminders).toHaveLength(1);
    expect(reminders[0].id).toBe(
      `reminder_100_vac1_${legacyIdDate("2026-06-20")}`,
    );
    // No intra-day or extra suffix sneaks onto the non-hourly id.
    expect(reminders[0].id.split("_")).toHaveLength(4);
  });

  it("frequency: ONCE produces the IDENTICAL id and scheduledAt as no-frequency", () => {
    const base = medicalRoutine({
      id: "vac1",
      type: "vaccine",
      name: "Rabies",
      nextDue: "2026-06-20",
    });
    const once = medicalRoutine({
      id: "vac1",
      type: "vaccine",
      name: "Rabies",
      nextDue: "2026-06-20",
      frequency: ROUTINE_FREQUENCY.ONCE,
    });

    const a = generateRemindersFromRoutine(base, 30);
    const b = generateRemindersFromRoutine(once, 30);

    expect(b.map((r) => r.id)).toEqual(a.map((r) => r.id));
    expect(b.map((r) => r.scheduledAt)).toEqual(a.map((r) => r.scheduledAt));
  });

  it("the vaccine reminder-timing offset still applies on the ONCE path", () => {
    const routine = medicalRoutine({
      id: "vac1",
      type: "vaccine",
      name: "Rabies",
      nextDue: "2026-06-20",
      reminderTiming: "1w", // remind 7 days before due
    });

    const [r] = generateRemindersFromRoutine(routine, 30);
    // Trigger is the due date minus 7 days, at 09:00, with the legacy date id.
    expect(new Date(r.scheduledAt).getHours()).toBe(9);
    expect(r.id).toBe(`reminder_100_vac1_${legacyIdDate("2026-06-13")}`);
  });
});

describe("medical-care date-based — forward recurring cadences", () => {
  it("monthly heartworm fires on the nextDue day-of-month every month", () => {
    const routine = medicalRoutine({
      id: "hw1",
      type: "heartworm",
      name: "Heartgard",
      nextDue: "2026-06-15",
      frequency: ROUTINE_FREQUENCY.MONTHLY,
    });

    // 90-day horizon from 06-10 → ends 2026-09-08: 06-15, 07-15, 08-15.
    const reminders = generateRemindersFromRoutine(routine, 90);

    expect(reminders.map((r) => r.scheduledAt)).toEqual([
      new Date(2026, 5, 15, 9, 0, 0).toISOString(),
      new Date(2026, 6, 15, 9, 0, 0).toISOString(),
      new Date(2026, 7, 15, 9, 0, 0).toISOString(),
    ]);
    expect(reminders.map((r) => r.id)).toEqual([
      `reminder_100_hw1_${idAt(2026, 6, 15)}`,
      `reminder_100_hw1_${idAt(2026, 7, 15)}`,
      `reminder_100_hw1_${idAt(2026, 8, 15)}`,
    ]);
    expect(allIdsUnique(reminders)).toBe(true);
  });

  it("yearly vaccine fires once within the horizon", () => {
    const routine = medicalRoutine({
      id: "rab",
      type: "vaccine",
      name: "Rabies",
      nextDue: "2026-06-20",
      frequency: ROUTINE_FREQUENCY.YEARLY,
    });

    const reminders = generateRemindersFromRoutine(routine, 30); // ends 07-10
    expect(reminders.map((r) => r.scheduledAt)).toEqual([
      new Date(2026, 5, 20, 9, 0, 0).toISOString(),
    ]);
  });

  it("every-3-months and every-6-months step by their interval", () => {
    const q = generateRemindersFromRoutine(
      medicalRoutine({
        id: "ft",
        type: "flea_tick",
        name: "Bravecto",
        nextDue: "2026-06-15",
        frequency: ROUTINE_FREQUENCY.EVERY_3_MONTHS,
      }),
      200, // ends ~2026-12-27 → 06-15, 09-15, 12-15
    );
    expect(q.map((r) => r.scheduledAt)).toEqual([
      new Date(2026, 5, 15, 9, 0, 0).toISOString(),
      new Date(2026, 8, 15, 9, 0, 0).toISOString(),
      new Date(2026, 11, 15, 9, 0, 0).toISOString(),
    ]);

    const semi = generateRemindersFromRoutine(
      medicalRoutine({
        id: "ft",
        type: "flea_tick",
        name: "Bravecto",
        nextDue: "2026-06-15",
        frequency: ROUTINE_FREQUENCY.EVERY_6_MONTHS,
      }),
      200,
    );
    expect(semi.map((r) => r.scheduledAt)).toEqual([
      new Date(2026, 5, 15, 9, 0, 0).toISOString(),
      new Date(2026, 11, 15, 9, 0, 0).toISOString(),
    ]);
  });

  it("weekly cadence holds the nextDue weekday", () => {
    const routine = medicalRoutine({
      id: "dw",
      type: "deworming",
      name: "Drontal",
      nextDue: "2026-06-12", // Friday
      frequency: ROUTINE_FREQUENCY.WEEKLY,
    });

    const reminders = generateRemindersFromRoutine(routine, 14); // ends 06-24
    expect(reminders.map((r) => r.scheduledAt)).toEqual([
      new Date(2026, 5, 12, 9, 0, 0).toISOString(),
      new Date(2026, 5, 19, 9, 0, 0).toISOString(),
    ]);
    expect(reminders.every((r) => monday0(r.scheduledAt) === 4)).toBe(true);
  });

  it("weekday / weekend / custom day-patterns match by weekday", () => {
    const weekdays = generateRemindersFromRoutine(
      medicalRoutine({
        id: "o1",
        type: "other",
        name: "Eye drops",
        nextDue: "2026-06-10",
        frequency: ROUTINE_FREQUENCY.WEEKDAYS,
      }),
      6, // 06-10..06-16
    );
    // No Saturday(5)/Sunday(6) in the emitted set.
    expect(weekdays.every((r) => monday0(r.scheduledAt) <= 4)).toBe(true);
    expect(weekdays.length).toBeGreaterThan(0);

    const custom = generateRemindersFromRoutine(
      medicalRoutine({
        id: "o2",
        type: "other",
        name: "Ear clean",
        nextDue: "2026-06-10",
        frequency: ROUTINE_FREQUENCY.CUSTOM,
        days: [0, 2], // Mon, Wed
      }),
      14,
    );
    expect(custom.every((r) => [0, 2].includes(monday0(r.scheduledAt)))).toBe(
      true,
    );
    expect(custom.length).toBeGreaterThan(0);
  });

  it("applies the vaccine offset to every recurring occurrence and widens the horizon to catch it", () => {
    const routine = medicalRoutine({
      id: "rab",
      type: "vaccine",
      name: "Rabies",
      // Due just BEYOND the 14-day horizon (ends 06-24); the -7d reminder pulls
      // the trigger (06-19) back into range.
      nextDue: "2026-06-26",
      frequency: ROUTINE_FREQUENCY.YEARLY,
      reminderTiming: "1w",
    });

    const reminders = generateRemindersFromRoutine(routine, 14);
    expect(reminders.map((r) => r.scheduledAt)).toEqual([
      new Date(2026, 5, 19, 9, 0, 0).toISOString(),
    ]);
    expect(reminders[0].id).toBe(`reminder_100_rab_${idAt(2026, 6, 19)}`);
  });

  it("disabled / inactive items emit nothing", () => {
    expect(
      generateRemindersFromRoutine(
        medicalRoutine({
          id: "x",
          type: "heartworm",
          nextDue: "2026-06-15",
          frequency: ROUTINE_FREQUENCY.MONTHLY,
          active: false,
        }),
        90,
      ),
    ).toEqual([]);
    expect(
      generateRemindersFromRoutine(
        medicalRoutine({
          id: "x",
          type: "heartworm",
          nextDue: "2026-06-15",
          frequency: ROUTINE_FREQUENCY.MONTHLY,
          reminderEnabled: false,
        }),
        90,
      ),
    ).toEqual([]);
  });
});

describe("medical-care date-based — overdue recurring cadences", () => {
  it("surfaces past monthly occurrences even when nextDue is in the future", () => {
    const routine = medicalRoutine(
      {
        id: "hw1",
        type: "heartworm",
        name: "Heartgard",
        nextDue: "2026-07-15", // next dose is in the future…
        frequency: ROUTINE_FREQUENCY.MONTHLY,
      },
      { createdAt: "2026-01-01T00:00:00.000Z" },
    );

    // 30-day window opens 2026-05-11. The only past occurrence is 06-15? No —
    // 06-15 is the future side of 05-15→06-15→07-15; the past, in-window dose is
    // 06-15 > now? 06-15 is after 06-10, so the in-window PAST dose is 06-15's
    // predecessor: 05-15.
    const reminders = generateOverdueInstances(routine, { lookbackDays: 30 });

    expect(reminders.map((r) => r.scheduledAt)).toEqual([
      new Date(2026, 4, 15, 9, 0, 0).toISOString(),
    ]);
    expect(reminders[0].status).toBe("overdue");
    expect(reminders[0].id).toBe(`reminder_100_hw1_${idAt(2026, 5, 15)}`);
  });

  it("enumerates multiple missed weekly doses in the window", () => {
    const routine = medicalRoutine(
      {
        id: "dw",
        type: "deworming",
        nextDue: "2026-06-12", // Friday
        frequency: ROUTINE_FREQUENCY.WEEKLY,
      },
      { createdAt: "2026-01-01T00:00:00.000Z" },
    );

    // Past Fridays within 30 days of 06-10: 05-15, 05-22, 05-29, 06-05.
    const reminders = generateOverdueInstances(routine, { lookbackDays: 30 });
    expect(reminders.map((r) => r.scheduledAt)).toEqual([
      new Date(2026, 4, 15, 9, 0, 0).toISOString(),
      new Date(2026, 4, 22, 9, 0, 0).toISOString(),
      new Date(2026, 4, 29, 9, 0, 0).toISOString(),
      new Date(2026, 5, 5, 9, 0, 0).toISOString(),
    ]);
    expect(reminders.every((r) => new Date(r.scheduledAt) < NOW)).toBe(true);
    expect(allIdsUnique(reminders)).toBe(true);
  });

  it("clamps to createdAt — a routine created now backfills nothing", () => {
    const routine = medicalRoutine(
      {
        id: "hw1",
        type: "heartworm",
        nextDue: "2026-07-15",
        frequency: ROUTINE_FREQUENCY.MONTHLY,
      },
      { createdAt: NOW.toISOString() },
    );
    expect(generateOverdueInstances(routine, { lookbackDays: 30 })).toEqual([]);
  });

  it("clamps to a later item.startDate", () => {
    const startDate = new Date(2026, 5, 1).toISOString(); // 06-01
    const routine = medicalRoutine(
      {
        id: "dw",
        type: "deworming",
        nextDue: "2026-06-12", // Friday
        frequency: ROUTINE_FREQUENCY.WEEKLY,
        startDate,
      },
      { createdAt: "2026-01-01T00:00:00.000Z" },
    );

    const reminders = generateOverdueInstances(routine, { lookbackDays: 30 });
    // Only 06-05 falls on/after 06-01 and before now; 05-x are clamped out.
    expect(reminders.map((r) => r.scheduledAt)).toEqual([
      new Date(2026, 5, 5, 9, 0, 0).toISOString(),
    ]);
  });

  it("forward and overdue never emit the same occurrence twice", () => {
    const routine = medicalRoutine(
      {
        id: "hw1",
        type: "heartworm",
        nextDue: "2026-06-15",
        frequency: ROUTINE_FREQUENCY.MONTHLY,
      },
      { createdAt: "2026-01-01T00:00:00.000Z" },
    );
    const future = generateRemindersFromRoutine(routine, 120);
    const overdue = generateOverdueInstances(routine, { lookbackDays: 30 });
    const futureIds = new Set(future.map((r) => r.id));
    expect(overdue.every((r) => !futureIds.has(r.id))).toBe(true);
  });
});
