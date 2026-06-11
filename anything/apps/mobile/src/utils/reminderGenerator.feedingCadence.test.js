import { generateRemindersFromRoutine } from "./reminderGenerator";
import { ROUTINE_TYPES, ROUTINE_FREQUENCY } from "../data/routinesData";

// P1b — feeding meals gain the recurring cadences they previously lacked:
// weekly / biweekly / month-multiple / once / hourly. The existing day-pattern
// cadences (daily / weekdays / weekends / custom) are preserved byte-for-byte.
// Feeding has no overdue path (transient/today-only) — forward only.

const NOW = new Date(2026, 5, 10, 8, 0, 0); // Wed 2026-06-10 08:00 local

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(NOW);
});

afterEach(() => {
  jest.useRealTimers();
});

function feedingRoutine(meal, overrides = {}) {
  return {
    id: "100",
    petId: "42",
    isActive: true,
    notificationEnabled: true,
    type: ROUTINE_TYPES.FEEDING,
    createdAt: "2026-01-01T00:00:00.000Z",
    meals: [meal],
    ...overrides,
  };
}

const monday0 = (iso) => (new Date(iso).getDay() + 6) % 7;
const idDate = (y, m, d) => new Date(y, m - 1, d).toISOString().split("T")[0];
const allIdsUnique = (rs) => new Set(rs.map((r) => r.id)).size === rs.length;

describe("feeding — day-pattern cadences preserved (byte-for-byte)", () => {
  it("DAILY fires every day with the stable date-only id", () => {
    const routine = feedingRoutine({
      id: "m1",
      name: "Breakfast",
      time: "09:00",
      frequency: ROUTINE_FREQUENCY.DAILY,
    });

    const reminders = generateRemindersFromRoutine(routine, 2); // 06-10..06-12
    expect(reminders.map((r) => r.scheduledAt)).toEqual([
      new Date(2026, 5, 10, 9, 0, 0).toISOString(),
      new Date(2026, 5, 11, 9, 0, 0).toISOString(),
      new Date(2026, 5, 12, 9, 0, 0).toISOString(),
    ]);
    expect(reminders[0].id).toBe(`reminder_100_m1_${idDate(2026, 6, 10)}`);
    expect(reminders.every((r) => r.type === "feeding")).toBe(true);
  });

  it("CUSTOM still matches only selected weekdays", () => {
    const routine = feedingRoutine({
      id: "m1",
      name: "Lunch",
      time: "12:00",
      frequency: ROUTINE_FREQUENCY.CUSTOM,
      days: [0, 2, 4],
    });

    const reminders = generateRemindersFromRoutine(routine, 7);
    expect(reminders.every((r) => [0, 2, 4].includes(monday0(r.scheduledAt)))).toBe(
      true,
    );
  });
});

describe("feeding — new recurring cadences", () => {
  it("WEEKLY fires on the preferred weekday", () => {
    const routine = feedingRoutine({
      id: "m1",
      name: "Breakfast",
      time: "09:00",
      frequency: ROUTINE_FREQUENCY.WEEKLY,
      preferredDay: 2, // Wednesday
    });

    const reminders = generateRemindersFromRoutine(routine, 13); // ends 06-23
    expect(reminders.map((r) => r.scheduledAt)).toEqual([
      new Date(2026, 5, 10, 9, 0, 0).toISOString(),
      new Date(2026, 5, 17, 9, 0, 0).toISOString(),
    ]);
    expect(reminders.every((r) => monday0(r.scheduledAt) === 2)).toBe(true);
  });

  it("BIWEEKLY steps two weeks at a time", () => {
    const routine = feedingRoutine({
      id: "m1",
      time: "09:00",
      frequency: ROUTINE_FREQUENCY.BIWEEKLY,
      preferredDay: 2,
    });

    const reminders = generateRemindersFromRoutine(routine, 21); // ends 07-01
    expect(reminders.map((r) => r.scheduledAt)).toEqual([
      new Date(2026, 5, 10, 9, 0, 0).toISOString(),
      new Date(2026, 5, 24, 9, 0, 0).toISOString(),
    ]);
  });

  it("MONTHLY fires on the anchored day-of-month", () => {
    const routine = feedingRoutine({
      id: "m1",
      time: "09:00",
      frequency: ROUTINE_FREQUENCY.MONTHLY,
      startDate: "2026-06-15",
    });

    const reminders = generateRemindersFromRoutine(routine, 60);
    expect(reminders.map((r) => r.scheduledAt)).toEqual([
      new Date(2026, 5, 15, 9, 0, 0).toISOString(),
      new Date(2026, 6, 15, 9, 0, 0).toISOString(),
    ]);
  });

  it("ONCE fires exactly one occurrence", () => {
    const routine = feedingRoutine({
      id: "m1",
      time: "09:00",
      frequency: ROUTINE_FREQUENCY.ONCE,
      startDate: "2026-06-20",
    });

    const reminders = generateRemindersFromRoutine(routine, 3650);
    expect(reminders.map((r) => r.scheduledAt)).toEqual([
      new Date(2026, 5, 20, 9, 0, 0).toISOString(),
    ]);
  });

  it("HOURLY steps an interval series with _HHMM ids", () => {
    const routine = feedingRoutine({
      id: "m1",
      time: "08:00",
      frequency: ROUTINE_FREQUENCY.HOURLY,
      intervalHours: 8,
      startDate: "2026-06-10",
    });

    const reminders = generateRemindersFromRoutine(routine, 1); // ends 06-11 08:00
    expect(reminders.map((r) => r.scheduledAt)).toEqual([
      new Date(2026, 5, 10, 8, 0, 0).toISOString(),
      new Date(2026, 5, 10, 16, 0, 0).toISOString(),
      new Date(2026, 5, 11, 0, 0, 0).toISOString(),
      new Date(2026, 5, 11, 8, 0, 0).toISOString(),
    ]);
    expect(reminders.every((r) => /_\d{4}$/.test(r.id))).toBe(true);
    expect(allIdsUnique(reminders)).toBe(true);
  });
});
