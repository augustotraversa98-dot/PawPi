import {
  newPhotoSchedule,
  photoScheduleFromEntry,
  photoScheduleEntry,
} from "./PhotoCheckRoutineModal";
import {
  scheduleFromItem,
  usesDayChips,
} from "./ScheduleBlock";
import { generateRemindersFromRoutine } from "@/utils/reminderGenerator";
import { ROUTINE_TYPES, ROUTINE_FREQUENCY } from "@/data/routinesData";

// PhotoCheck adopts the shared ScheduleBlock (PR: photocheck-scheduleblock).
// These tests pin the same contract the wellness modal pins: (a) every cadence
// selectable in ScheduleBlock produces a photoCheckSchedule entry the generator
// fires ≥1 reminder for, and (b) a stored entry round-trips through
// load (photoScheduleFromEntry) → edit → save (photoScheduleEntry) unchanged.

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

// Build a photo routine carrying one ScheduleBlock-emitted entry for "paws".
function photoFromSchedule(schedule) {
  return {
    id: "100",
    petId: "42",
    isActive: true,
    notificationEnabled: true,
    type: ROUTINE_TYPES.PHOTO_CHECK,
    createdAt: "2026-01-01T00:00:00.000Z",
    photoCheckSchedule: [
      photoScheduleEntry("paws", {
        ...schedule,
        reminderEnabled: true,
        timeSensitive: false,
        notes: "",
      }),
    ],
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
      const routine = photoFromSchedule(emit(frequency));
      // __DEV__ is true under jest-expo, so assertCadenceHonored runs here.
      const horizon = frequency === ROUTINE_FREQUENCY.YEARLY ? 400 : 14;
      let reminders;
      expect(() => {
        reminders = generateRemindersFromRoutine(routine, horizon);
      }).not.toThrow();
      expect(reminders.length).toBeGreaterThanOrEqual(1);
      expect(reminders.every((r) => r.type === "photo_check")).toBe(true);
    },
  );

  it("HOURLY emits several same-day occurrences with distinct ids", () => {
    const routine = photoFromSchedule({
      ...emit(ROUTINE_FREQUENCY.HOURLY),
      preferredTime: "08:00",
      intervalHours: 4,
    });
    const reminders = generateRemindersFromRoutine(routine, 1);
    // 08:00, 12:00, 16:00, 20:00 today (+ 00:00 tomorrow within the 1-day horizon).
    expect(reminders.length).toBeGreaterThanOrEqual(4);
    expect(new Set(reminders.map((r) => r.id)).size).toBe(reminders.length);
  });

  it("ONCE + early reminder fires exactly once, on the picked date+time", () => {
    const routine = photoFromSchedule({
      ...emit(ROUTINE_FREQUENCY.ONCE),
      reminderTiming: "1h", // early reminder does not move the instance
    });
    const reminders = generateRemindersFromRoutine(routine, 60);
    expect(reminders).toHaveLength(1);
    expect(reminders[0].scheduledAt).toBe(
      new Date(2026, 5, 10, 9, 0, 0).toISOString(),
    );
  });

  it("multi-day WEEKLY fires on each selected weekday", () => {
    const routine = photoFromSchedule({
      ...emit(ROUTINE_FREQUENCY.WEEKLY),
      days: [0, 2, 4], // Mon, Wed, Fri
    });
    const reminders = generateRemindersFromRoutine(routine, 7);
    expect(
      reminders.every((r) =>
        [0, 2, 4].includes((new Date(r.scheduledAt).getDay() + 6) % 7),
      ),
    ).toBe(true);
    expect(reminders.length).toBeGreaterThanOrEqual(3);
  });
});

describe("stored entry round-trips through load → edit → save unchanged", () => {
  it("a fully-populated entry survives photoScheduleFromEntry → photoScheduleEntry", () => {
    const stored = {
      bodyArea: "ears",
      frequency: ROUTINE_FREQUENCY.BIWEEKLY,
      preferredDay: 2,
      preferredTime: "07:30",
      startDate: "2026-06-10",
      days: [2, 4],
      intervalHours: 6,
      reminderTiming: "1h",
      reminderEnabled: false,
      timeSensitive: true,
      notes: "Check for redness",
    };

    const loaded = photoScheduleFromEntry(stored);
    const resaved = photoScheduleEntry(stored.bodyArea, loaded);
    expect(resaved).toEqual(stored);
  });

  it("a pre-redesign entry (no ScheduleBlock fields) loads with safe defaults", () => {
    const legacy = {
      bodyArea: "paws",
      frequency: ROUTINE_FREQUENCY.WEEKLY,
      preferredDay: 6,
      preferredTime: "10:00",
      reminderEnabled: true,
      timeSensitive: false,
      notes: "",
    };

    const loaded = photoScheduleFromEntry(legacy);
    // Back-compat defaults from scheduleFromItem.
    expect(loaded.startDate).toBe("");
    expect(loaded.days).toEqual([]);
    expect(loaded.intervalHours).toBe(4);
    expect(loaded.reminderTiming).toBe("on_time");

    // Saving an untouched legacy entry persists empty startDate as null so the
    // generator still anchors on routine.createdAt.
    const resaved = photoScheduleEntry(legacy.bodyArea, loaded);
    expect(resaved.startDate).toBeNull();
    expect(resaved.days).toEqual([]);
  });

  it("newPhotoSchedule seeds today + the area's recommended cadence", () => {
    const s = newPhotoSchedule(ROUTINE_FREQUENCY.MONTHLY);
    expect(s.frequency).toBe(ROUTINE_FREQUENCY.MONTHLY);
    expect(s.startDate).toBe(TODAY);
    expect(s.reminderEnabled).toBe(true);
    expect(s.timeSensitive).toBe(false);

    // No defaultFreq → ScheduleBlock's weekly default with a non-empty day.
    const dflt = newPhotoSchedule();
    expect(dflt.frequency).toBe(ROUTINE_FREQUENCY.WEEKLY);
    expect(dflt.days).toEqual([6]);
    // scheduleFromItem keeps it coherent for ScheduleBlock's value prop.
    expect(scheduleFromItem(dflt).frequency).toBe(ROUTINE_FREQUENCY.WEEKLY);
  });
});
