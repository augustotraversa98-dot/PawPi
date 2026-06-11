import {
  defaultSchedule,
  scheduleFromItem,
  applyFrequencyChange,
  applyDaysChange,
  usesDayChips,
  isDateAnchored,
  INTERVAL_PRESETS,
  EARLY_REMINDER_OPTIONS,
} from "./ScheduleBlock";
import { generateRemindersFromRoutine } from "@/utils/reminderGenerator";
import { ROUTINE_TYPES, ROUTINE_FREQUENCY } from "@/data/routinesData";

// ScheduleBlock's emitted object is the contract seam: its fields must map 1:1
// onto exactly what reminderGenerator.js reads per cadence, or we recreate the
// silent-no-fire bug at the UI. These tests pin (a) the pure mapping helpers and
// (b) that the emitted object round-trips through the generator to ≥1 reminder
// for EVERY cadence on the reference type (wellness), with the dev-guard never
// tripping.

const NOW = new Date(2026, 5, 10, 8, 0, 0); // Wed 2026-06-10 08:00 local
const TODAY = "2026-06-10";
const TODAY_DOW = (NOW.getDay() + 6) % 7; // Wed → 2

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(NOW);
});

afterEach(() => {
  jest.useRealTimers();
});

describe("pure mapping helpers", () => {
  it("scheduleFromItem fills safe defaults and preserves set fields", () => {
    expect(scheduleFromItem({})).toEqual({
      frequency: ROUTINE_FREQUENCY.WEEKLY,
      preferredTime: "09:00",
      startDate: "",
      preferredDay: 6,
      days: [],
      intervalHours: 4,
      reminderTiming: "on_time",
    });

    const item = {
      frequency: ROUTINE_FREQUENCY.HOURLY,
      preferredTime: "07:30",
      startDate: "2026-06-10",
      preferredDay: 2,
      days: [2, 4],
      intervalHours: 6,
      reminderTiming: "1h",
    };
    expect(scheduleFromItem(item)).toEqual(item);
  });

  it("scheduleFromItem canonicalizes a legacy date and tolerates a missing one", () => {
    expect(scheduleFromItem({ startDate: "06/10/2026" }).startDate).toBe(
      "2026-06-10",
    );
    expect(scheduleFromItem({ startDate: null }).startDate).toBe("");
  });

  it("defaultSchedule seeds a non-empty weekly day selection", () => {
    const s = defaultSchedule(NOW);
    expect(s.frequency).toBe(ROUTINE_FREQUENCY.WEEKLY);
    expect(s.startDate).toBe(TODAY);
    expect(s.days).toEqual([6]);
  });

  it("applyFrequencyChange seeds day chips when entering a day-chip cadence", () => {
    const base = scheduleFromItem({ preferredDay: 3 }); // days: []
    expect(applyFrequencyChange(base, ROUTINE_FREQUENCY.WEEKLY).days).toEqual([3]);
    expect(applyFrequencyChange(base, ROUTINE_FREQUENCY.CUSTOM).days).toEqual([3]);
    // Non-day-chip cadences leave days untouched (stay empty).
    expect(applyFrequencyChange(base, ROUTINE_FREQUENCY.MONTHLY).days).toEqual([]);
    expect(applyFrequencyChange(base, ROUTINE_FREQUENCY.HOURLY).days).toEqual([]);
  });

  it("applyFrequencyChange keeps an existing multi-day selection", () => {
    const base = scheduleFromItem({
      frequency: ROUTINE_FREQUENCY.WEEKLY,
      days: [0, 4],
    });
    expect(applyFrequencyChange(base, ROUTINE_FREQUENCY.BIWEEKLY).days).toEqual([
      0, 4,
    ]);
  });

  it("applyDaysChange tracks preferredDay to days[0]", () => {
    const base = scheduleFromItem({ preferredDay: 6 });
    expect(applyDaysChange(base, [1, 3]).preferredDay).toBe(1);
    // Emptying the selection retains the last preferredDay (legacy fallback).
    expect(applyDaysChange(base, []).preferredDay).toBe(6);
  });

  it("usesDayChips / isDateAnchored partition the cadences correctly", () => {
    expect(usesDayChips(ROUTINE_FREQUENCY.WEEKLY)).toBe(true);
    expect(usesDayChips(ROUTINE_FREQUENCY.BIWEEKLY)).toBe(true);
    expect(usesDayChips(ROUTINE_FREQUENCY.CUSTOM)).toBe(true);
    expect(usesDayChips(ROUTINE_FREQUENCY.MONTHLY)).toBe(false);
    expect(isDateAnchored(ROUTINE_FREQUENCY.MONTHLY)).toBe(true);
    expect(isDateAnchored(ROUTINE_FREQUENCY.EVERY_3_MONTHS)).toBe(true);
    expect(isDateAnchored(ROUTINE_FREQUENCY.YEARLY)).toBe(true);
    expect(isDateAnchored(ROUTINE_FREQUENCY.ONCE)).toBe(true);
    expect(isDateAnchored(ROUTINE_FREQUENCY.WEEKLY)).toBe(false);
  });

  it("exposes the documented interval and lead-time vocabularies", () => {
    expect(INTERVAL_PRESETS).toEqual([2, 4, 6, 8, 12]);
    expect(EARLY_REMINDER_OPTIONS.map((o) => o.value)).toContain("on_time");
    expect(EARLY_REMINDER_OPTIONS.map((o) => o.value)).toContain("1w");
  });
});

// Build a wellness routine carrying one ScheduleBlock-emitted item.
function wellnessFromSchedule(schedule) {
  return {
    id: "100",
    petId: "42",
    isActive: true,
    notificationEnabled: true,
    type: ROUTINE_TYPES.WELLNESS_CHECK,
    createdAt: "2026-01-01T00:00:00.000Z",
    wellnessCheckItems: [{ checkType: "general", reminderEnabled: true, ...schedule }],
  };
}

// A ScheduleBlock object as the UI would emit it for a given frequency: today's
// date, 09:00 (after the 08:00 NOW), day chips on today's weekday.
function emit(frequency) {
  return {
    frequency,
    preferredTime: "09:00",
    startDate: TODAY,
    preferredDay: TODAY_DOW,
    days: usesDayChips(frequency) ? [TODAY_DOW] : [],
    intervalHours: 4,
    reminderTiming: "on_time",
  };
}

describe("emitted schedule round-trips through the generator (dev-guard on)", () => {
  const ALL_CADENCES = [
    ROUTINE_FREQUENCY.HOURLY,
    ROUTINE_FREQUENCY.DAILY,
    ROUTINE_FREQUENCY.WEEKLY,
    ROUTINE_FREQUENCY.BIWEEKLY,
    ROUTINE_FREQUENCY.MONTHLY,
    ROUTINE_FREQUENCY.EVERY_3_MONTHS,
    ROUTINE_FREQUENCY.EVERY_6_MONTHS,
    ROUTINE_FREQUENCY.YEARLY,
    ROUTINE_FREQUENCY.CUSTOM,
    ROUTINE_FREQUENCY.WEEKDAYS, // not in the picker, but a valid generator cadence
    ROUTINE_FREQUENCY.ONCE,
  ];

  it.each(ALL_CADENCES)(
    "%s produces at least one reminder and never trips the guard",
    (frequency) => {
      const routine = wellnessFromSchedule(emit(frequency));
      // __DEV__ is true under jest-expo, so assertCadenceHonored runs here.
      const horizon = frequency === ROUTINE_FREQUENCY.YEARLY ? 400 : 14;
      let reminders;
      expect(() => {
        reminders = generateRemindersFromRoutine(routine, horizon);
      }).not.toThrow();
      expect(reminders.length).toBeGreaterThanOrEqual(1);
      expect(reminders.every((r) => r.type === "wellness_check")).toBe(true);
    },
  );

  it("HOURLY emits several same-day occurrences with distinct ids", () => {
    const routine = wellnessFromSchedule({
      ...emit(ROUTINE_FREQUENCY.HOURLY),
      preferredTime: "08:00",
      intervalHours: 4,
    });
    const reminders = generateRemindersFromRoutine(routine, 1);
    // 08:00, 12:00, 16:00, 20:00 today (+ 00:00 tomorrow within the 1-day horizon).
    expect(reminders.length).toBeGreaterThanOrEqual(4);
    expect(new Set(reminders.map((r) => r.id)).size).toBe(reminders.length);
  });

  it("ONCE fires exactly once, on the picked date+time", () => {
    const routine = wellnessFromSchedule(emit(ROUTINE_FREQUENCY.ONCE));
    const reminders = generateRemindersFromRoutine(routine, 60);
    expect(reminders).toHaveLength(1);
    expect(reminders[0].scheduledAt).toBe(
      new Date(2026, 5, 10, 9, 0, 0).toISOString(),
    );
  });

  it("MONTHLY anchors on the picked date's day-of-month", () => {
    const routine = wellnessFromSchedule({
      ...emit(ROUTINE_FREQUENCY.MONTHLY),
      startDate: "2026-06-10",
    });
    const reminders = generateRemindersFromRoutine(routine, 40);
    // 06-10 then 07-10, both on the 10th.
    expect(reminders.map((r) => r.scheduledAt)).toEqual([
      new Date(2026, 5, 10, 9, 0, 0).toISOString(),
      new Date(2026, 6, 10, 9, 0, 0).toISOString(),
    ]);
  });
});
