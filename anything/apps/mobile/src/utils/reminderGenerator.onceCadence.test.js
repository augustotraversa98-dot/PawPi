import {
  generateRemindersFromRoutine,
  generateOverdueInstances,
} from "./reminderGenerator";
import {
  generateNotificationFromReminder,
  shouldCreateNotification,
} from "./notificationGenerator";
import { ROUTINE_TYPES, ROUTINE_FREQUENCY } from "../data/routinesData";

// P1b-2 — the non-repeating ONCE cadence (iOS "Never"): a routine that fires
// EXACTLY ONE instance at its scheduled date+time and never recurs. It rides
// the same anchored date-set machinery as the month-multiple family, so the
// forward and overdue paths enumerate one identical occurrence.
//
// Time is pinned (same clock as the month-cadence / overdue suites) so day math
// is deterministic.

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
    ...overrides,
  };
}

// Local datetime → the exact ISO string the generator emits for that slot.
const at = (y, m, d, hh = 9, mm = 0) =>
  new Date(y, m - 1, d, hh, mm, 0, 0).toISOString();

// The id's date segment, derived exactly like the generator (toISOString of
// LOCAL midnight) so assertions stay timezone-robust.
const idDate = (y, m, d) => new Date(y, m - 1, d).toISOString().split("T")[0];

function onceWellnessRoutine(overrides = {}) {
  return makeRoutine({
    type: ROUTINE_TYPES.WELLNESS_CHECK,
    createdAt: "2026-01-01T00:00:00.000Z",
    wellnessCheckItems: [
      {
        checkType: "general",
        frequency: ROUTINE_FREQUENCY.ONCE,
        preferredDay: 2, // Wednesday — must be IGNORED by a ONCE cadence
        preferredTime: "09:00",
      },
    ],
    ...overrides,
  });
}

describe("forward generator — ONCE cadence", () => {
  it("emits EXACTLY ONE instance at the scheduled date, ignoring weekday", () => {
    // Anchor Sat 2026-06-20 (day-of-month 20); preferredDay = Wednesday.
    const routine = onceWellnessRoutine({ startDate: "2026-06-20" });

    const reminders = generateRemindersFromRoutine(routine, 30); // ends 2026-07-10

    expect(reminders.map((r) => r.scheduledAt)).toEqual([at(2026, 6, 20)]);
    expect(reminders[0].id).toBe(
      `reminder_100_general_0_${idDate(2026, 6, 20)}`,
    );
    expect(reminders[0].status).toBe("upcoming");
  });

  it("never emits a second occurrence across a very long horizon", () => {
    const routine = onceWellnessRoutine({ startDate: "2026-06-20" });

    // Ten years of horizon — a recurring cadence would emit dozens of slots.
    const reminders = generateRemindersFromRoutine(routine, 3650);

    expect(reminders.map((r) => r.scheduledAt)).toEqual([at(2026, 6, 20)]);
  });

  it("schedules today when the occurrence is today and the time hasn't passed", () => {
    const routine = onceWellnessRoutine({
      startDate: "2026-06-10", // today (NOW is 08:00, before 09:00)
    });

    const reminders = generateRemindersFromRoutine(routine, 14);

    expect(reminders.map((r) => r.scheduledAt)).toEqual([at(2026, 6, 10)]);
  });

  it("emits nothing from the forward path when the occurrence is already past", () => {
    const routine = onceWellnessRoutine({ startDate: "2026-06-05" });

    expect(generateRemindersFromRoutine(routine, 30)).toEqual([]);
  });

  it("general check honours ONCE on the routine-level startDate", () => {
    const routine = makeRoutine({
      type: ROUTINE_TYPES.GENERAL_CHECK,
      frequency: ROUTINE_FREQUENCY.ONCE,
      startDate: "2026-06-18",
      preferredDay: 2,
      times: ["20:00"],
    });

    const reminders = generateRemindersFromRoutine(routine, 30);

    expect(reminders.map((r) => r.scheduledAt)).toEqual([at(2026, 6, 18, 20)]);
    expect(reminders[0].id).toBe(`reminder_100_${idDate(2026, 6, 18)}`);
  });

  it("weight check honours ONCE on the routine-level startDate", () => {
    const routine = makeRoutine({
      type: ROUTINE_TYPES.WEIGHT_CHECK,
      frequency: ROUTINE_FREQUENCY.ONCE,
      startDate: "2026-06-22",
      preferredDay: 2,
      times: ["09:00"],
    });

    const reminders = generateRemindersFromRoutine(routine, 30);

    expect(reminders.map((r) => r.scheduledAt)).toEqual([at(2026, 6, 22)]);
  });

  it("photo check honours ONCE on the schedule's own startDate", () => {
    const routine = makeRoutine({
      type: ROUTINE_TYPES.PHOTO_CHECK,
      photoCheckSchedule: [
        {
          bodyArea: "teeth",
          frequency: ROUTINE_FREQUENCY.ONCE,
          startDate: "2026-06-17",
          preferredDay: 2,
          preferredTime: "10:00",
        },
      ],
    });

    const reminders = generateRemindersFromRoutine(routine, 30);

    expect(reminders.map((r) => r.scheduledAt)).toEqual([at(2026, 6, 17, 10)]);
    expect(reminders[0].id).toBe(`reminder_100_teeth_${idDate(2026, 6, 17)}`);
  });
});

describe("overdue generator — ONCE cadence", () => {
  it("emits EXACTLY ONE overdue instance when the occurrence is past and in-window", () => {
    const routine = onceWellnessRoutine({
      startDate: "2026-06-05",
      createdAt: "2026-05-01T00:00:00.000Z",
    });

    const reminders = generateOverdueInstances(routine, { lookbackDays: 30 });

    expect(reminders.map((r) => r.scheduledAt)).toEqual([at(2026, 6, 5)]);
    expect(reminders[0].id).toBe(`reminder_100_general_0_${idDate(2026, 6, 5)}`);
    expect(reminders[0].status).toBe("overdue");
  });

  it("clamps to createdAt — a routine created now backfills no overdue instance", () => {
    const routine = onceWellnessRoutine({
      startDate: "2026-06-05", // past
      createdAt: NOW.toISOString(), // but created right now
    });

    expect(generateOverdueInstances(routine, { lookbackDays: 30 })).toEqual([]);
  });

  it("emits nothing when the single occurrence is older than the lookback window", () => {
    const routine = onceWellnessRoutine({
      startDate: "2026-04-01", // ~70 days before NOW
      createdAt: "2026-03-01T00:00:00.000Z",
    });

    // 30-day window opens 2026-05-11, so the Apr 1 occurrence ages out.
    expect(generateOverdueInstances(routine, { lookbackDays: 30 })).toEqual([]);
    // ...and the forward path never re-emits a past occurrence either.
    expect(generateRemindersFromRoutine(routine, 30)).toEqual([]);
  });

  it("photo check: a past ONCE schedule emits one overdue instance", () => {
    const routine = makeRoutine({
      type: ROUTINE_TYPES.PHOTO_CHECK,
      createdAt: "2026-05-01T00:00:00.000Z",
      photoCheckSchedule: [
        {
          bodyArea: "teeth",
          frequency: ROUTINE_FREQUENCY.ONCE,
          startDate: "2026-06-04",
          preferredDay: 2,
          preferredTime: "10:00",
        },
      ],
    });

    const reminders = generateOverdueInstances(routine, { lookbackDays: 30 });

    expect(reminders.map((r) => r.scheduledAt)).toEqual([at(2026, 6, 4, 10)]);
    expect(reminders[0].relatedBodyArea).toBe("teeth");
    expect(reminders[0].status).toBe("overdue");
  });
});

describe("ONCE — resolve/dismiss removes it for good", () => {
  it("yields a stable id and disappears permanently once dismissed", () => {
    const routine = onceWellnessRoutine({
      startDate: "2026-06-05",
      createdAt: "2026-05-01T00:00:00.000Z",
    });

    // Same deterministic id no matter when (within the window) generation runs.
    const firstRun = generateOverdueInstances(routine, {
      lookbackDays: 30,
      now: NOW,
    });
    const laterRun = generateOverdueInstances(routine, {
      lookbackDays: 30,
      now: new Date(2026, 5, 12, 8, 0, 0), // Fri 2026-06-12, still in-window
    });

    expect(firstRun).toHaveLength(1);
    expect(laterRun.map((r) => r.id)).toEqual(firstRun.map((r) => r.id));

    // The reconciliation layer keys dismissals on this id; once dismissed the
    // single instance filters out and nothing else takes its place.
    const dismissed = new Set(firstRun.map((r) => r.id));
    const survivingLater = laterRun.filter((r) => !dismissed.has(r.id));
    expect(survivingLater).toEqual([]);

    // And once the lone occurrence ages past the window it never re-emits —
    // there is no second occurrence waiting to appear.
    const beyondWindow = generateOverdueInstances(routine, {
      lookbackDays: 30,
      now: new Date(2026, 6, 10, 8, 0, 0), // Fri 2026-07-10
    });
    expect(beyondWindow).toEqual([]);
  });

  it("a ONCE occurrence is emitted by exactly one path, never both", () => {
    const pastRoutine = onceWellnessRoutine({
      startDate: "2026-06-05",
      createdAt: "2026-05-01T00:00:00.000Z",
    });
    expect(generateRemindersFromRoutine(pastRoutine, 30)).toEqual([]);
    expect(generateOverdueInstances(pastRoutine, { lookbackDays: 30 })).toHaveLength(1);

    const futureRoutine = onceWellnessRoutine({ startDate: "2026-06-20" });
    expect(generateRemindersFromRoutine(futureRoutine, 30)).toHaveLength(1);
    expect(generateOverdueInstances(futureRoutine, { lookbackDays: 30 })).toEqual([]);
  });
});

describe("ONCE — notification layer (no rescheduling after fire)", () => {
  it("a future ONCE instance produces a single notification", () => {
    const [reminder] = generateRemindersFromRoutine(
      onceWellnessRoutine({ startDate: "2026-06-20" }),
      30,
    );

    // Advance to the fire time — the notification layer keys off nextTriggerAt.
    jest.setSystemTime(new Date(2026, 5, 20, 9, 5, 0));

    expect(shouldCreateNotification(reminder, [])).toBe(true);
    const notification = generateNotificationFromReminder(reminder);
    expect(notification).not.toBeNull();
    expect(notification.reminderId).toBe(reminder.id);
    expect(notification.type).toBe("wellness_check");
  });

  it("nothing reschedules after the occurrence has fired", () => {
    const routine = onceWellnessRoutine({ startDate: "2026-06-20" });

    // Re-generate with the clock past the fired occurrence: no future instance,
    // and (the routine being created in the future relative to the window) no
    // overdue instance lingers beyond a single lookback either.
    jest.setSystemTime(new Date(2026, 6, 25, 8, 0, 0)); // 2026-07-25
    expect(generateRemindersFromRoutine(routine, 30)).toEqual([]);
  });
});
