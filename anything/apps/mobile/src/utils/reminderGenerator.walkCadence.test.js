import { generateRemindersFromRoutine } from "./reminderGenerator";
import { ROUTINE_TYPES, ROUTINE_FREQUENCY } from "../data/routinesData";

// P1b — walks gain the recurring cadences they previously lacked: weekly /
// biweekly / month-multiple / once / hourly. The day-pattern cadences (daily /
// weekdays / weekends / custom) are preserved. Walk has no overdue path
// (transient/today-only) — forward only.

const NOW = new Date(2026, 5, 10, 8, 0, 0); // Wed 2026-06-10 08:00 local

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(NOW);
});

afterEach(() => {
  jest.useRealTimers();
});

function walkRoutine(walks, overrides = {}) {
  return {
    id: "100",
    petId: "42",
    isActive: true,
    notificationEnabled: true,
    type: ROUTINE_TYPES.WALK,
    createdAt: "2026-01-01T00:00:00.000Z",
    walks,
    ...overrides,
  };
}

const monday0 = (iso) => (new Date(iso).getDay() + 6) % 7;
const idDate = (y, m, d) => new Date(y, m - 1, d).toISOString().split("T")[0];
const allIdsUnique = (rs) => new Set(rs.map((r) => r.id)).size === rs.length;

describe("walk — day-pattern cadences preserved", () => {
  it("DAILY fires every day with the stable date+index id", () => {
    const routine = walkRoutine([
      { name: "Morning Walk", time: "09:00", frequency: ROUTINE_FREQUENCY.DAILY },
    ]);

    const reminders = generateRemindersFromRoutine(routine, 2);
    expect(reminders.map((r) => r.scheduledAt)).toEqual([
      new Date(2026, 5, 10, 9, 0, 0).toISOString(),
      new Date(2026, 5, 11, 9, 0, 0).toISOString(),
      new Date(2026, 5, 12, 9, 0, 0).toISOString(),
    ]);
    expect(reminders[0].id).toBe(`reminder_100_${idDate(2026, 6, 10)}_0`);
    expect(reminders.every((r) => r.type === "walk")).toBe(true);
  });

  it("two walks stay independent with distinct per-index ids", () => {
    const routine = walkRoutine([
      { name: "Morning Walk", time: "07:30", frequency: ROUTINE_FREQUENCY.DAILY },
      { name: "Evening Walk", time: "19:00", frequency: ROUTINE_FREQUENCY.DAILY },
    ]);

    const reminders = generateRemindersFromRoutine(routine, 1);
    expect(new Set(reminders.map((r) => r.title))).toEqual(
      new Set(["Morning Walk", "Evening Walk"]),
    );
    expect(allIdsUnique(reminders)).toBe(true);
  });
});

describe("walk — new recurring cadences", () => {
  it("WEEKLY fires on the preferred weekday", () => {
    const routine = walkRoutine([
      {
        name: "Long Walk",
        time: "09:00",
        frequency: ROUTINE_FREQUENCY.WEEKLY,
        preferredDay: 2, // Wednesday
      },
    ]);

    const reminders = generateRemindersFromRoutine(routine, 13); // ends 06-23
    expect(reminders.map((r) => r.scheduledAt)).toEqual([
      new Date(2026, 5, 10, 9, 0, 0).toISOString(),
      new Date(2026, 5, 17, 9, 0, 0).toISOString(),
    ]);
    expect(reminders.every((r) => monday0(r.scheduledAt) === 2)).toBe(true);
  });

  it("BIWEEKLY steps two weeks at a time", () => {
    const routine = walkRoutine([
      {
        name: "Long Walk",
        time: "09:00",
        frequency: ROUTINE_FREQUENCY.BIWEEKLY,
        preferredDay: 2,
      },
    ]);

    const reminders = generateRemindersFromRoutine(routine, 21); // ends 07-01
    expect(reminders.map((r) => r.scheduledAt)).toEqual([
      new Date(2026, 5, 10, 9, 0, 0).toISOString(),
      new Date(2026, 5, 24, 9, 0, 0).toISOString(),
    ]);
  });

  it("MONTHLY fires on the anchored day-of-month", () => {
    const routine = walkRoutine([
      {
        name: "Hike",
        time: "09:00",
        frequency: ROUTINE_FREQUENCY.MONTHLY,
        startDate: "2026-06-15",
      },
    ]);

    const reminders = generateRemindersFromRoutine(routine, 60);
    expect(reminders.map((r) => r.scheduledAt)).toEqual([
      new Date(2026, 5, 15, 9, 0, 0).toISOString(),
      new Date(2026, 6, 15, 9, 0, 0).toISOString(),
    ]);
  });

  it("ONCE fires exactly one occurrence", () => {
    const routine = walkRoutine([
      {
        name: "Vet Walk",
        time: "09:00",
        frequency: ROUTINE_FREQUENCY.ONCE,
        startDate: "2026-06-20",
      },
    ]);

    const reminders = generateRemindersFromRoutine(routine, 3650);
    expect(reminders.map((r) => r.scheduledAt)).toEqual([
      new Date(2026, 5, 20, 9, 0, 0).toISOString(),
    ]);
  });

  it("HOURLY steps an interval series with _HHMM ids", () => {
    const routine = walkRoutine([
      {
        name: "Potty Walk",
        time: "08:00",
        frequency: ROUTINE_FREQUENCY.HOURLY,
        intervalHours: 8,
        startDate: "2026-06-10",
      },
    ]);

    const reminders = generateRemindersFromRoutine(routine, 1);
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
