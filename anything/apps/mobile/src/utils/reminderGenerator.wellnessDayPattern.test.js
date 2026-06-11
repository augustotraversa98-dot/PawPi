import {
  generateRemindersFromRoutine,
  generateOverdueInstances,
} from "./reminderGenerator";
import { ROUTINE_TYPES, ROUTINE_FREQUENCY } from "../data/routinesData";

// P1b — weekday / weekend / custom day-pattern cadences for wellness checks.
// Previously wellness honored daily / weekly / biweekly / month-multiple / once /
// hourly but silently dropped the day-pattern cadences; now they match by a
// weekday set (Mon=0), forward AND overdue. Ids stay date-only and byte-for-byte
// with the other once-per-day cadences.

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

function wellnessRoutine(item, overrides = {}) {
  return makeRoutine({
    type: ROUTINE_TYPES.WELLNESS_CHECK,
    wellnessCheckItems: [item],
    ...overrides,
  });
}

const monday0 = (iso) => (new Date(iso).getDay() + 6) % 7;
const idDate = (y, m, d) => new Date(y, m - 1, d).toISOString().split("T")[0];
const allIdsUnique = (rs) => new Set(rs.map((r) => r.id)).size === rs.length;

describe("wellness day-patterns — forward", () => {
  it("WEEKDAYS fires Mon–Fri only", () => {
    const routine = wellnessRoutine({
      checkType: "general",
      frequency: ROUTINE_FREQUENCY.WEEKDAYS,
      preferredTime: "09:00",
      preferredDay: 6, // must be ignored by a day-pattern cadence
    });

    // 06-10..06-17: weekdays are 10,11,12,15,16,17; 13(Sat)/14(Sun) dropped.
    const reminders = generateRemindersFromRoutine(routine, 7);
    expect(reminders).toHaveLength(6);
    expect(reminders.every((r) => monday0(r.scheduledAt) <= 4)).toBe(true);
    // Date-only id (no _HHMM), derived like the generator.
    expect(reminders[0].id).toBe(`reminder_100_general_0_${idDate(2026, 6, 10)}`);
    expect(allIdsUnique(reminders)).toBe(true);
  });

  it("WEEKENDS fires Sat–Sun only", () => {
    const routine = wellnessRoutine({
      checkType: "general",
      frequency: ROUTINE_FREQUENCY.WEEKENDS,
      preferredTime: "09:00",
    });

    const reminders = generateRemindersFromRoutine(routine, 7); // 06-13, 06-14
    expect(reminders.map((r) => monday0(r.scheduledAt))).toEqual([5, 6]);
  });

  it("CUSTOM fires only on the selected weekdays", () => {
    const routine = wellnessRoutine({
      checkType: "general",
      frequency: ROUTINE_FREQUENCY.CUSTOM,
      days: [0, 2, 4], // Mon, Wed, Fri
      preferredTime: "09:00",
    });

    const reminders = generateRemindersFromRoutine(routine, 7);
    expect(reminders.every((r) => [0, 2, 4].includes(monday0(r.scheduledAt)))).toBe(
      true,
    );
    // Wed 06-10, Fri 06-12, Mon 06-15, Wed 06-17.
    expect(reminders).toHaveLength(4);
  });
});

describe("wellness day-patterns — overdue", () => {
  it("WEEKDAYS enumerates missed weekdays in the window", () => {
    const routine = wellnessRoutine({
      checkType: "general",
      frequency: ROUTINE_FREQUENCY.WEEKDAYS,
      preferredTime: "09:00",
    });

    // lookback 5 → window 06-05. Past weekdays: 06-05(Fri), 06-08(Mon), 06-09(Tue);
    // 06-06/07 weekend, 06-10 09:00 still ahead of 08:00 NOW.
    const reminders = generateOverdueInstances(routine, { lookbackDays: 5 });
    expect(reminders.map((r) => r.scheduledAt)).toEqual([
      new Date(2026, 5, 5, 9, 0, 0).toISOString(),
      new Date(2026, 5, 8, 9, 0, 0).toISOString(),
      new Date(2026, 5, 9, 9, 0, 0).toISOString(),
    ]);
    expect(reminders.every((r) => r.status === "overdue")).toBe(true);
    expect(allIdsUnique(reminders)).toBe(true);
  });

  it("CUSTOM overdue matches the selected weekdays only", () => {
    const routine = wellnessRoutine({
      checkType: "general",
      frequency: ROUTINE_FREQUENCY.CUSTOM,
      days: [2], // Wed only
      preferredTime: "09:00",
    });

    // Past Wednesdays within 14 days of 06-10: 05-27, 06-03 (06-10 09:00 future).
    const reminders = generateOverdueInstances(routine, { lookbackDays: 14 });
    expect(reminders.map((r) => r.scheduledAt)).toEqual([
      new Date(2026, 4, 27, 9, 0, 0).toISOString(),
      new Date(2026, 5, 3, 9, 0, 0).toISOString(),
    ]);
  });

  it("forward and overdue never emit the same day-pattern occurrence", () => {
    const routine = wellnessRoutine({
      checkType: "general",
      frequency: ROUTINE_FREQUENCY.WEEKDAYS,
      preferredTime: "09:00",
    });
    const future = generateRemindersFromRoutine(routine, 14);
    const overdue = generateOverdueInstances(routine, { lookbackDays: 14 });
    const futureIds = new Set(future.map((r) => r.id));
    expect(overdue.every((r) => !futureIds.has(r.id))).toBe(true);
  });
});
