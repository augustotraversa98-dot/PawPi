import {
  generateRemindersFromRoutine,
  generateOverdueInstances,
} from "./reminderGenerator";
import { ROUTINE_TYPES, ROUTINE_FREQUENCY } from "../data/routinesData";

// Multi-day WEEKLY / BIWEEKLY — an item may fire on several weekdays via an
// explicit days[] (Mon=0), e.g. "every Wed and Fri". Purely additive and gated
// on a non-empty days[]: WITHOUT days[] the locked single-preferredDay path is
// preserved BYTE-FOR-BYTE (the id-stability block pins this). Biweekly "on"
// weeks are anchored on the schedule's startDate.

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
const at = (y, m, d, hh = 9, mm = 0) =>
  new Date(y, m - 1, d, hh, mm, 0).toISOString();
const idDate = (y, m, d) => new Date(y, m - 1, d).toISOString().split("T")[0];
const allIdsUnique = (rs) => new Set(rs.map((r) => r.id)).size === rs.length;

describe("multi-day WEEKLY — forward", () => {
  it("fires on every selected weekday, every week", () => {
    const routine = wellnessRoutine({
      checkType: "general",
      frequency: ROUTINE_FREQUENCY.WEEKLY,
      days: [2, 4], // Wed, Fri
      preferredDay: 6, // must be ignored once days[] is present
      preferredTime: "09:00",
    });

    const reminders = generateRemindersFromRoutine(routine, 14); // 06-10..06-24
    expect(reminders.map((r) => r.scheduledAt)).toEqual([
      at(2026, 6, 10), // Wed (today, 09:00 > 08:00 now)
      at(2026, 6, 12), // Fri
      at(2026, 6, 17), // Wed
      at(2026, 6, 19), // Fri
      at(2026, 6, 24), // Wed
    ]);
    expect(reminders.every((r) => [2, 4].includes(monday0(r.scheduledAt)))).toBe(
      true,
    );
    expect(allIdsUnique(reminders)).toBe(true);
    // Ids stay date-only (no _HHMM); one cadence-day = one instance.
    expect(reminders[0].id).toBe(`reminder_100_general_0_${idDate(2026, 6, 10)}`);
  });
});

describe("multi-day BIWEEKLY — forward (parity anchored on startDate)", () => {
  it("fires selected weekdays in on-weeks only; startDate week is 'on'", () => {
    const routine = wellnessRoutine({
      checkType: "general",
      frequency: ROUTINE_FREQUENCY.BIWEEKLY,
      days: [2, 4], // Wed, Fri
      startDate: "2026-06-10", // this week → on
      preferredTime: "09:00",
    });

    const reminders = generateRemindersFromRoutine(routine, 28); // 06-10..07-08
    expect(reminders.map((r) => r.scheduledAt)).toEqual([
      at(2026, 6, 10), // on-week
      at(2026, 6, 12),
      // 06-15..06-21 off — skipped
      at(2026, 6, 24), // on-week
      at(2026, 6, 26),
      // 06-29..07-05 off — skipped
      at(2026, 7, 8), // on-week (07-10 Fri is past the 28-day horizon)
    ]);
  });

  it("startDate in the other parity flips which weeks are 'on'", () => {
    const routine = wellnessRoutine({
      checkType: "general",
      frequency: ROUTINE_FREQUENCY.BIWEEKLY,
      days: [2, 4], // Wed, Fri
      startDate: "2026-06-03", // previous week → 'this week' (06-08..) is OFF
      preferredTime: "09:00",
    });

    const reminders = generateRemindersFromRoutine(routine, 21); // 06-10..07-01
    expect(reminders.map((r) => r.scheduledAt)).toEqual([
      // 06-08..06-14 off — NO 06-10/06-12 (proves anchor is startDate, not now)
      at(2026, 6, 17), // on-week
      at(2026, 6, 19),
      // 06-22..06-28 off
      at(2026, 7, 1), // on-week
    ]);
  });
});

describe("multi-day WEEKLY — overdue", () => {
  it("enumerates every past selected weekday in the lookback window", () => {
    const routine = wellnessRoutine({
      checkType: "general",
      frequency: ROUTINE_FREQUENCY.WEEKLY,
      days: [2, 4], // Wed, Fri
      preferredTime: "09:00",
    });

    // window 05-27 (lookback 14). Past Wed/Fri before NOW (06-10 08:00):
    // 06-10 09:00 is still ahead of NOW, so today is excluded.
    const reminders = generateOverdueInstances(routine, { lookbackDays: 14 });
    expect(reminders.map((r) => r.scheduledAt)).toEqual([
      at(2026, 5, 27), // Wed
      at(2026, 5, 29), // Fri
      at(2026, 6, 3), // Wed
      at(2026, 6, 5), // Fri
    ]);
    expect(reminders.every((r) => r.status === "overdue")).toBe(true);
    expect(allIdsUnique(reminders)).toBe(true);
  });

  it("forward and overdue never emit the same multi-day occurrence", () => {
    const item = {
      checkType: "general",
      frequency: ROUTINE_FREQUENCY.WEEKLY,
      days: [2, 4],
      preferredTime: "09:00",
    };
    const future = generateRemindersFromRoutine(wellnessRoutine(item), 14);
    const overdue = generateOverdueInstances(wellnessRoutine(item), {
      lookbackDays: 14,
    });
    const futureIds = new Set(future.map((r) => r.id));
    expect(overdue.every((r) => !futureIds.has(r.id))).toBe(true);
  });
});

describe("feeding — multi-day weekly meal", () => {
  it("a 'Dinner only Wed & Fri' weekly meal fires on both days", () => {
    const routine = makeRoutine({
      type: ROUTINE_TYPES.FEEDING,
      meals: [
        {
          id: "dinner",
          name: "Dinner",
          time: "18:00",
          frequency: ROUTINE_FREQUENCY.WEEKLY,
          days: [2, 4], // Wed, Fri
          reminderEnabled: true,
        },
      ],
    });

    const reminders = generateRemindersFromRoutine(routine, 14);
    expect(reminders.map((r) => r.scheduledAt)).toEqual([
      at(2026, 6, 10, 18, 0),
      at(2026, 6, 12, 18, 0),
      at(2026, 6, 17, 18, 0),
      at(2026, 6, 19, 18, 0),
      at(2026, 6, 24, 18, 0),
    ]);
    expect(reminders[0].id).toBe(`reminder_100_dinner_${idDate(2026, 6, 10)}`);
  });
});

// =========================================================================
// ID-STABILITY / BACK-COMPAT — without a non-empty days[], weekly & biweekly
// keep the locked single-preferredDay behaviour byte-for-byte: same dates,
// same date-only ids, same now-anchored biweekly phase. This is the contract
// that protects every stored routine (none of which carry a multi-day days[]).
// =========================================================================
describe("back-compat — single preferredDay (no days[])", () => {
  it("WEEKLY without days[] fires one weekday/week with the legacy id", () => {
    const routine = wellnessRoutine({
      checkType: "general",
      frequency: ROUTINE_FREQUENCY.WEEKLY,
      preferredDay: 2, // Wed
      preferredTime: "09:00",
    });

    const reminders = generateRemindersFromRoutine(routine, 14);
    expect(reminders.map((r) => r.id)).toEqual([
      `reminder_100_general_0_${idDate(2026, 6, 10)}`,
      `reminder_100_general_0_${idDate(2026, 6, 17)}`,
      `reminder_100_general_0_${idDate(2026, 6, 24)}`,
    ]);
  });

  it("days: undefined and days: [] produce IDENTICAL output", () => {
    const base = {
      checkType: "general",
      frequency: ROUTINE_FREQUENCY.WEEKLY,
      preferredDay: 2,
      preferredTime: "09:00",
    };
    const undefDays = generateRemindersFromRoutine(wellnessRoutine(base), 21);
    const emptyDays = generateRemindersFromRoutine(
      wellnessRoutine({ ...base, days: [] }),
      21,
    );
    expect(emptyDays.map((r) => r.id)).toEqual(undefDays.map((r) => r.id));
    expect(emptyDays.map((r) => r.scheduledAt)).toEqual(
      undefDays.map((r) => r.scheduledAt),
    );
  });

  it("BIWEEKLY without days[] keeps the legacy now-anchored +14 phase", () => {
    const routine = wellnessRoutine({
      checkType: "general",
      frequency: ROUTINE_FREQUENCY.BIWEEKLY,
      preferredDay: 2, // Wed
      preferredTime: "09:00",
      startDate: "2026-06-03", // ignored by the legacy path (proves no regression)
    });

    const reminders = generateRemindersFromRoutine(routine, 28);
    // First Wed >= now is 06-10, then +14: 06-24, 07-08 — independent of startDate.
    expect(reminders.map((r) => r.scheduledAt)).toEqual([
      at(2026, 6, 10),
      at(2026, 6, 24),
      at(2026, 7, 8),
    ]);
  });
});
