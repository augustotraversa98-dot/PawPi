import {
  generateRemindersFromRoutine,
  generateOverdueInstances,
} from "./reminderGenerator";
import { ROUTINE_TYPES, ROUTINE_FREQUENCY } from "../data/routinesData";

// P1b — weekday / weekend / custom day-pattern cadences for photo checks, forward
// AND overdue. Ids stay date-only and byte-for-byte with the other once-per-day
// cadences. (Daily / weekly / biweekly / month-multiple / once / hourly are
// already covered and untouched.)

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

function photoRoutine(schedule, overrides = {}) {
  return makeRoutine({
    type: ROUTINE_TYPES.PHOTO_CHECK,
    photoCheckSchedule: [schedule],
    ...overrides,
  });
}

const monday0 = (iso) => (new Date(iso).getDay() + 6) % 7;
const idDate = (y, m, d) => new Date(y, m - 1, d).toISOString().split("T")[0];
const allIdsUnique = (rs) => new Set(rs.map((r) => r.id)).size === rs.length;

describe("photo day-patterns — forward", () => {
  it("WEEKDAYS fires Mon–Fri only", () => {
    const routine = photoRoutine({
      bodyArea: "paws",
      frequency: ROUTINE_FREQUENCY.WEEKDAYS,
      preferredTime: "10:00",
      preferredDay: 6, // ignored by a day-pattern cadence
    });

    const reminders = generateRemindersFromRoutine(routine, 7); // 06-10..06-17
    expect(reminders).toHaveLength(6);
    expect(reminders.every((r) => monday0(r.scheduledAt) <= 4)).toBe(true);
    expect(reminders[0].id).toBe(`reminder_100_paws_${idDate(2026, 6, 10)}`);
    expect(allIdsUnique(reminders)).toBe(true);
  });

  it("WEEKENDS fires Sat–Sun only", () => {
    const routine = photoRoutine({
      bodyArea: "paws",
      frequency: ROUTINE_FREQUENCY.WEEKENDS,
      preferredTime: "10:00",
    });

    const reminders = generateRemindersFromRoutine(routine, 7);
    expect(reminders.map((r) => monday0(r.scheduledAt))).toEqual([5, 6]);
  });

  it("CUSTOM fires only on the selected weekdays", () => {
    const routine = photoRoutine({
      bodyArea: "paws",
      frequency: ROUTINE_FREQUENCY.CUSTOM,
      days: [0, 2, 4], // Mon, Wed, Fri
      preferredTime: "10:00",
    });

    const reminders = generateRemindersFromRoutine(routine, 7);
    expect(reminders.every((r) => [0, 2, 4].includes(monday0(r.scheduledAt)))).toBe(
      true,
    );
    expect(reminders).toHaveLength(4); // Wed 10, Fri 12, Mon 15, Wed 17
  });
});

describe("photo day-patterns — overdue", () => {
  it("WEEKDAYS enumerates missed weekdays in the window", () => {
    const routine = photoRoutine({
      bodyArea: "paws",
      frequency: ROUTINE_FREQUENCY.WEEKDAYS,
      preferredTime: "10:00",
    });

    // lookback 5 → window 06-05. Past weekdays: 06-05, 06-08, 06-09; today's 10:00
    // is still ahead of NOW.
    const reminders = generateOverdueInstances(routine, { lookbackDays: 5 });
    expect(reminders.map((r) => r.scheduledAt)).toEqual([
      new Date(2026, 5, 5, 10, 0, 0).toISOString(),
      new Date(2026, 5, 8, 10, 0, 0).toISOString(),
      new Date(2026, 5, 9, 10, 0, 0).toISOString(),
    ]);
    expect(reminders.every((r) => r.status === "overdue")).toBe(true);
    expect(allIdsUnique(reminders)).toBe(true);
  });

  it("CUSTOM overdue matches the selected weekdays only", () => {
    const routine = photoRoutine({
      bodyArea: "paws",
      frequency: ROUTINE_FREQUENCY.CUSTOM,
      days: [2], // Wed only
      preferredTime: "10:00",
    });

    const reminders = generateOverdueInstances(routine, { lookbackDays: 14 });
    expect(reminders.map((r) => r.scheduledAt)).toEqual([
      new Date(2026, 4, 27, 10, 0, 0).toISOString(),
      new Date(2026, 5, 3, 10, 0, 0).toISOString(),
    ]);
  });

  it("forward and overdue never emit the same day-pattern occurrence", () => {
    const routine = photoRoutine({
      bodyArea: "paws",
      frequency: ROUTINE_FREQUENCY.WEEKDAYS,
      preferredTime: "10:00",
    });
    const future = generateRemindersFromRoutine(routine, 14);
    const overdue = generateOverdueInstances(routine, { lookbackDays: 14 });
    const futureIds = new Set(future.map((r) => r.id));
    expect(overdue.every((r) => !futureIds.has(r.id))).toBe(true);
  });
});
