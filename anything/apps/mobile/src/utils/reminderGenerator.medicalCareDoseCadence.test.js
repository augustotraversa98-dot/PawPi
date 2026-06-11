import {
  generateRemindersFromRoutine,
  generateOverdueInstances,
} from "./reminderGenerator";
import { ROUTINE_TYPES, ROUTINE_FREQUENCY } from "../data/routinesData";

// P1b — medical-care DOSE-COURSE items (medication / supplement, one or more
// times per day) gated by the shared calendar cadence. Previously these fired
// every day of the course window with no cadence; now item.frequency selects the
// dose days (weekly/biweekly/month-multiple/weekday/weekend/custom), while the
// multiple-times-per-day + course start/end semantics are preserved.
//
// Invariant: absent-frequency and explicit DAILY keep the legacy every-day walk
// BYTE-FOR-BYTE — the `..._<date>_<timeIdx>` id is a durable dismissal key.
//
// Clock pinned to the shared instant.

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

function doseRoutine(item, overrides = {}) {
  return makeRoutine({
    type: ROUTINE_TYPES.MEDICAL_CARE,
    medicalCareItems: [item],
    ...overrides,
  });
}

// Dose-course ids derive their date segment from the cadence DAY (local midnight,
// not the dose time) — computed the same way the generator does so it is tz-robust.
const dayId = (y, m, d) => new Date(y, m - 1, d).toISOString().split("T")[0];
const at = (y, m, d, hh, mm = 0) =>
  new Date(y, m - 1, d, hh, mm, 0, 0).toISOString();
const monday0 = (iso) => (new Date(iso).getDay() + 6) % 7;
const allIdsUnique = (rs) => new Set(rs.map((r) => r.id)).size === rs.length;

describe("dose-course — id stability (back-compat & DAILY)", () => {
  it("an item with NO frequency keeps the legacy every-day ids byte-for-byte", () => {
    const routine = doseRoutine({
      id: "med1",
      type: "medication",
      name: "Rimadyl",
      times: ["08:00", "20:00"],
      startDate: "2026-06-10",
    });

    const reminders = generateRemindersFromRoutine(routine, 3); // 06-10..06-13

    // Two doses/day for four days, today's 08:00 included (== now).
    expect(reminders).toHaveLength(8);
    expect(reminders[0].id).toBe(`reminder_100_med1_${dayId(2026, 6, 10)}_0`);
    expect(reminders[0].scheduledAt).toBe(at(2026, 6, 10, 8));
    expect(reminders[1].id).toBe(`reminder_100_med1_${dayId(2026, 6, 10)}_1`);
    expect(reminders[1].scheduledAt).toBe(at(2026, 6, 10, 20));
    expect(allIdsUnique(reminders)).toBe(true);
  });

  it("frequency: DAILY produces output IDENTICAL to no-frequency", () => {
    const base = doseRoutine({
      id: "med1",
      type: "medication",
      times: ["08:00", "20:00"],
      startDate: "2026-06-10",
    });
    const daily = doseRoutine({
      id: "med1",
      type: "medication",
      times: ["08:00", "20:00"],
      startDate: "2026-06-10",
      frequency: ROUTINE_FREQUENCY.DAILY,
    });

    const a = generateRemindersFromRoutine(base, 5);
    const b = generateRemindersFromRoutine(daily, 5);
    expect(b.map((r) => r.id)).toEqual(a.map((r) => r.id));
    expect(b.map((r) => r.scheduledAt)).toEqual(a.map((r) => r.scheduledAt));
  });
});

describe("dose-course — forward recurring cadences", () => {
  it("weekly medication fires only on the course-start weekday, keeping every daily time", () => {
    const routine = doseRoutine({
      id: "med1",
      type: "medication",
      name: "Rimadyl",
      times: ["08:00", "20:00"],
      startDate: "2026-06-08", // Monday → weekly phase
      frequency: ROUTINE_FREQUENCY.WEEKLY,
    });

    const reminders = generateRemindersFromRoutine(routine, 14); // ends 06-24

    // Mondays after now in range: 06-15, 06-22 — two doses each.
    expect(reminders.map((r) => r.scheduledAt)).toEqual([
      at(2026, 6, 15, 8),
      at(2026, 6, 15, 20),
      at(2026, 6, 22, 8),
      at(2026, 6, 22, 20),
    ]);
    expect(reminders.every((r) => monday0(r.scheduledAt) === 0)).toBe(true);
    expect(reminders[0].id).toBe(`reminder_100_med1_${dayId(2026, 6, 15)}_0`);
    expect(allIdsUnique(reminders)).toBe(true);
  });

  it("monthly supplement fires on the course-start day-of-month", () => {
    const routine = doseRoutine({
      id: "sup1",
      type: "supplement",
      name: "Omega-3",
      times: ["09:00"],
      startDate: "2026-05-20", // day-of-month 20
      frequency: ROUTINE_FREQUENCY.MONTHLY,
    });

    const reminders = generateRemindersFromRoutine(routine, 60); // ends 08-09
    expect(reminders.map((r) => r.scheduledAt)).toEqual([
      at(2026, 6, 20, 9),
      at(2026, 7, 20, 9),
    ]);
  });

  it("weekday cadence skips weekends", () => {
    const routine = doseRoutine({
      id: "med1",
      type: "medication",
      times: ["09:00"],
      startDate: "2026-06-10",
      frequency: ROUTINE_FREQUENCY.WEEKDAYS,
    });

    const reminders = generateRemindersFromRoutine(routine, 7); // 06-10..06-17
    expect(reminders.every((r) => monday0(r.scheduledAt) <= 4)).toBe(true);
    // 06-13 (Sat) and 06-14 (Sun) are absent.
    expect(reminders.map((r) => r.scheduledAt)).not.toContain(at(2026, 6, 13, 9));
    expect(reminders.map((r) => r.scheduledAt)).not.toContain(at(2026, 6, 14, 9));
  });

  it("respects the course end date under a recurring cadence", () => {
    const routine = doseRoutine({
      id: "med1",
      type: "medication",
      times: ["09:00"],
      startDate: "2026-06-08", // Monday
      endDate: "2026-06-16", // course ends before the next Monday (06-22)
      frequency: ROUTINE_FREQUENCY.WEEKLY,
    });

    const reminders = generateRemindersFromRoutine(routine, 30);
    expect(reminders.map((r) => r.scheduledAt)).toEqual([at(2026, 6, 15, 9)]);
  });
});

describe("dose-course — overdue recurring cadences", () => {
  it("legacy DAILY overdue ids are unchanged byte-for-byte", () => {
    const routine = doseRoutine({
      id: "med1",
      type: "medication",
      times: ["08:00"],
    });

    // lookback 3 → 06-07, 06-08, 06-09 at 08:00 (today's 08:00 == now, excluded).
    const reminders = generateOverdueInstances(routine, { lookbackDays: 3 });
    expect(reminders.map((r) => r.id)).toEqual([
      `reminder_100_med1_${dayId(2026, 6, 7)}_0`,
      `reminder_100_med1_${dayId(2026, 6, 8)}_0`,
      `reminder_100_med1_${dayId(2026, 6, 9)}_0`,
    ]);
    expect(reminders.every((r) => r.status === "overdue")).toBe(true);
  });

  it("enumerates missed weekly doses across the window", () => {
    const routine = doseRoutine(
      {
        id: "med1",
        type: "medication",
        times: ["09:00"],
        startDate: "2026-04-06", // Monday, well before the window
        frequency: ROUTINE_FREQUENCY.WEEKLY,
      },
      { createdAt: "2026-01-01T00:00:00.000Z" },
    );

    // Past Mondays within 30 days of 06-10: 05-11, 05-18, 05-25, 06-01, 06-08.
    const reminders = generateOverdueInstances(routine, { lookbackDays: 30 });
    expect(reminders.map((r) => r.scheduledAt)).toEqual([
      at(2026, 5, 11, 9),
      at(2026, 5, 18, 9),
      at(2026, 5, 25, 9),
      at(2026, 6, 1, 9),
      at(2026, 6, 8, 9),
    ]);
    expect(reminders.every((r) => new Date(r.scheduledAt) < NOW)).toBe(true);
    expect(allIdsUnique(reminders)).toBe(true);
  });

  it("clamps a recurring course to a later item.startDate", () => {
    const routine = doseRoutine(
      {
        id: "med1",
        type: "medication",
        times: ["09:00"],
        startDate: "2026-06-01", // Monday; course only starts here
        frequency: ROUTINE_FREQUENCY.WEEKLY,
      },
      { createdAt: "2026-01-01T00:00:00.000Z" },
    );

    const reminders = generateOverdueInstances(routine, { lookbackDays: 30 });
    // Only 06-01 and 06-08 fall on/after the start and before now.
    expect(reminders.map((r) => r.scheduledAt)).toEqual([
      at(2026, 6, 1, 9),
      at(2026, 6, 8, 9),
    ]);
  });

  it("forward and overdue never emit the same dose twice", () => {
    const routine = doseRoutine(
      {
        id: "med1",
        type: "medication",
        times: ["09:00"],
        startDate: "2026-04-06",
        frequency: ROUTINE_FREQUENCY.WEEKLY,
      },
      { createdAt: "2026-01-01T00:00:00.000Z" },
    );
    const future = generateRemindersFromRoutine(routine, 30);
    const overdue = generateOverdueInstances(routine, { lookbackDays: 30 });
    const futureIds = new Set(future.map((r) => r.id));
    expect(overdue.every((r) => !futureIds.has(r.id))).toBe(true);
  });
});
