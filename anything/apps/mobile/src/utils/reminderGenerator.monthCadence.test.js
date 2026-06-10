import {
  generateRemindersFromRoutine,
  generateOverdueInstances,
} from "./reminderGenerator";
import {
  generateNotificationFromReminder,
  shouldCreateNotification,
} from "./notificationGenerator";
import { ROUTINE_TYPES, ROUTINE_FREQUENCY } from "../data/routinesData";

// P1b-1 — month-multiple cadences (MONTHLY / EVERY_3_MONTHS / EVERY_6_MONTHS /
// YEARLY) are DATE-ANCHORED: instances fire on the day-of-month of the
// routine's true start date, stepping +1/+3/+6/+12 calendar months from that
// start — not from the generation clock, and not weekday-anchored. Month
// overflow clamps to the last day of the target month.
//
// Time is pinned (same clock as the overdue suite) so day math is deterministic.

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

const allIdsUnique = (reminders) =>
  new Set(reminders.map((r) => r.id)).size === reminders.length;

function monthlyWellnessRoutine(overrides = {}) {
  return makeRoutine({
    type: ROUTINE_TYPES.WELLNESS_CHECK,
    // Fri 2026-05-08 — day-of-month 8, deliberately NOT the preferredDay weekday.
    startDate: "2026-05-08",
    wellnessCheckItems: [
      {
        checkType: "general",
        frequency: ROUTINE_FREQUENCY.MONTHLY,
        preferredDay: 2, // Wednesday — must be IGNORED by month cadences
        preferredTime: "09:00",
      },
    ],
    ...overrides,
  });
}

describe("forward generator — month-multiple cadences", () => {
  it("MONTHLY anchors on the start date's day-of-month, not its weekday", () => {
    // Anchor Fri 05-08, preferredDay = Wednesday. Day-of-month anchoring gives
    // the 8th of every month: Jul 8 2026 is a Wednesday but Aug 8 is a
    // SATURDAY — a weekday-anchored monthly could never emit both.
    const reminders = generateRemindersFromRoutine(
      monthlyWellnessRoutine(),
      60, // window ends 2026-08-09
    );

    expect(reminders.map((r) => r.scheduledAt)).toEqual([
      at(2026, 7, 8),
      at(2026, 8, 8),
    ]);
    expect(new Date(reminders[1].scheduledAt).getDay()).toBe(6); // Saturday
    expect(reminders.map((r) => r.id)).toEqual([
      `reminder_100_general_0_${idDate(2026, 7, 8)}`,
      `reminder_100_general_0_${idDate(2026, 8, 8)}`,
    ]);
  });

  it("EVERY_3_MONTHS steps +3 months from the true start, not from now", () => {
    const routine = monthlyWellnessRoutine({ startDate: "2026-01-15" });
    routine.wellnessCheckItems[0].frequency = ROUTINE_FREQUENCY.EVERY_3_MONTHS;

    const reminders = generateRemindersFromRoutine(routine, 240); // ends 2027-02-05

    // Anchor Jan 15 → Apr 15 (past) → Jul 15, Oct 15, Jan 15. The first
    // emitted instance is Jul 15 — NOT ~3 months from the Jun 10 clock.
    expect(reminders.map((r) => r.scheduledAt)).toEqual([
      at(2026, 7, 15),
      at(2026, 10, 15),
      at(2027, 1, 15),
    ]);
  });

  it("EVERY_6_MONTHS steps +6 months from the true start", () => {
    const routine = monthlyWellnessRoutine({ startDate: "2026-03-20" });
    routine.wellnessCheckItems[0].frequency = ROUTINE_FREQUENCY.EVERY_6_MONTHS;

    const reminders = generateRemindersFromRoutine(routine, 365);

    expect(reminders.map((r) => r.scheduledAt)).toEqual([
      at(2026, 9, 20),
      at(2027, 3, 20),
    ]);
  });

  it("YEARLY steps +12 months from the true start", () => {
    const routine = monthlyWellnessRoutine({ startDate: "2025-08-04" });
    routine.wellnessCheckItems[0].frequency = ROUTINE_FREQUENCY.YEARLY;

    const reminders = generateRemindersFromRoutine(routine, 500);

    expect(reminders.map((r) => r.scheduledAt)).toEqual([
      at(2026, 8, 4),
      at(2027, 8, 4),
    ]);
  });

  it("clamps month overflow to the last day of the target month (31st anchor)", () => {
    const routine = monthlyWellnessRoutine({ startDate: "2026-01-31" });

    // Jan 31 → Feb 28 → Mar 31 → Apr 30 → May 31 → Jun 30 → Jul 31 …
    const reminders = generateRemindersFromRoutine(routine, 60); // ends 2026-08-09

    expect(reminders.map((r) => r.scheduledAt)).toEqual([
      at(2026, 6, 30),
      at(2026, 7, 31),
    ]);
  });

  it("clamps a Feb 29 leap-day anchor to Feb 28 in non-leap years (yearly)", () => {
    const routine = monthlyWellnessRoutine({ startDate: "2024-02-29" });
    routine.wellnessCheckItems[0].frequency = ROUTINE_FREQUENCY.YEARLY;

    const reminders = generateRemindersFromRoutine(routine, 300); // ends 2027-04-06

    expect(reminders.map((r) => r.scheduledAt)).toEqual([at(2027, 2, 28)]);
  });

  it("photo check: quarterly anchored on the schedule's own startDate", () => {
    const routine = makeRoutine({
      type: ROUTINE_TYPES.PHOTO_CHECK,
      photoCheckSchedule: [
        {
          bodyArea: "teeth",
          frequency: ROUTINE_FREQUENCY.EVERY_3_MONTHS,
          startDate: "2026-05-08",
          preferredDay: 2, // ignored for month cadences
          preferredTime: "10:00",
        },
      ],
    });

    const reminders = generateRemindersFromRoutine(routine, 60);

    // Anchor May 8 → Aug 8 is the only occurrence in the window.
    expect(reminders.map((r) => r.scheduledAt)).toEqual([at(2026, 8, 8, 10)]);
    expect(reminders[0].id).toBe(`reminder_100_teeth_${idDate(2026, 8, 8)}`);
  });

  it("general check: MONTHLY anchored on routine startDate", () => {
    const routine = makeRoutine({
      type: ROUTINE_TYPES.GENERAL_CHECK,
      frequency: ROUTINE_FREQUENCY.MONTHLY,
      startDate: "2026-04-12",
      preferredDay: 2,
      times: ["20:00"],
    });

    const reminders = generateRemindersFromRoutine(routine, 40); // ends 2026-07-20

    expect(reminders.map((r) => r.scheduledAt)).toEqual([
      at(2026, 6, 12, 20),
      at(2026, 7, 12, 20),
    ]);
  });

  it("weight check: EVERY_6_MONTHS anchored on routine startDate", () => {
    const routine = makeRoutine({
      type: ROUTINE_TYPES.WEIGHT_CHECK,
      frequency: ROUTINE_FREQUENCY.EVERY_6_MONTHS,
      startDate: "2026-01-05",
      preferredDay: 2,
      times: ["09:00"],
    });

    const reminders = generateRemindersFromRoutine(routine, 60);

    expect(reminders.map((r) => r.scheduledAt)).toEqual([at(2026, 7, 5)]);
  });

  it("falls back to createdAt as the anchor when no startDate exists", () => {
    const routine = monthlyWellnessRoutine({
      startDate: undefined,
      createdAt: new Date(2026, 3, 22, 14, 30).toISOString(), // Apr 22
    });

    const reminders = generateRemindersFromRoutine(routine, 45); // ends 2026-07-25

    expect(reminders.map((r) => r.scheduledAt)).toEqual([
      at(2026, 6, 22),
      at(2026, 7, 22),
    ]);
  });
});

describe("overdue generator — month-multiple cadences", () => {
  it("emits the missed monthly occurrence inside the lookback window only", () => {
    const routine = monthlyWellnessRoutine({
      startDate: "2026-03-08",
      createdAt: "2026-03-01T00:00:00.000Z",
    });

    // Past occurrences: Mar 8, Apr 8, May 8, Jun 8. With a 30-day lookback
    // (window opens May 11) only Jun 8 survives.
    const reminders = generateOverdueInstances(routine, { lookbackDays: 30 });

    expect(reminders.map((r) => r.scheduledAt)).toEqual([at(2026, 6, 8)]);
    expect(reminders[0].id).toBe(
      `reminder_100_general_0_${idDate(2026, 6, 8)}`,
    );
    expect(reminders[0].status).toBe("overdue");
  });

  it("clamps to createdAt — a routine created now backfills nothing", () => {
    const routine = monthlyWellnessRoutine({
      startDate: "2026-01-31",
      createdAt: NOW.toISOString(),
    });

    expect(generateOverdueInstances(routine, { lookbackDays: 30 })).toEqual([]);
  });

  it("applies the month-overflow clamp to past instances too", () => {
    const routine = monthlyWellnessRoutine({
      startDate: "2026-01-31",
      createdAt: "2026-01-31T00:00:00.000Z",
    });

    const reminders = generateOverdueInstances(routine, { lookbackDays: 150 });

    expect(reminders.map((r) => r.scheduledAt)).toEqual([
      at(2026, 1, 31),
      at(2026, 2, 28), // Feb clamped — 2026 is not a leap year
      at(2026, 3, 31),
      at(2026, 4, 30),
      at(2026, 5, 31),
    ]);
    expect(allIdsUnique(reminders)).toBe(true);
  });

  it("photo check: quarterly overdue from the schedule anchor", () => {
    const routine = makeRoutine({
      type: ROUTINE_TYPES.PHOTO_CHECK,
      createdAt: "2026-01-01T00:00:00.000Z",
      photoCheckSchedule: [
        {
          bodyArea: "teeth",
          frequency: ROUTINE_FREQUENCY.EVERY_3_MONTHS,
          startDate: "2026-03-05",
          preferredDay: 2,
          preferredTime: "10:00",
        },
      ],
    });

    // Occurrences Mar 5, Jun 5 — only Jun 5 is inside the 30-day window.
    const reminders = generateOverdueInstances(routine, { lookbackDays: 30 });

    expect(reminders.map((r) => r.scheduledAt)).toEqual([at(2026, 6, 5, 10)]);
    expect(reminders[0].relatedBodyArea).toBe("teeth");
  });

  it("overdue and forward enumerate one schedule — disjoint ids, no duplicates", () => {
    const routine = monthlyWellnessRoutine({
      createdAt: "2026-01-01T00:00:00.000Z",
    });

    // Anchor May 8: overdue gets May 8 + Jun 8 (60-day window), forward gets
    // Jul 8 + Aug 8 (60-day horizon). Same day-of-month phase on both sides.
    const overdue = generateOverdueInstances(routine, { lookbackDays: 60 });
    const future = generateRemindersFromRoutine(routine, 60);

    expect(overdue.map((r) => r.scheduledAt)).toEqual([
      at(2026, 5, 8),
      at(2026, 6, 8),
    ]);
    expect(future.map((r) => r.scheduledAt)).toEqual([
      at(2026, 7, 8),
      at(2026, 8, 8),
    ]);
    expect(allIdsUnique([...overdue, ...future])).toBe(true);
  });
});

describe("notification layer — month-cadence instances fire", () => {
  it("a due month-cadence instance produces a notification", () => {
    const [reminder] = generateRemindersFromRoutine(
      monthlyWellnessRoutine(),
      60,
    );

    // Advance the clock to the instance's fire time (Jul 8 09:00) — the
    // notification layer keys off the generated nextTriggerAt, so next-fire
    // for these cadences is exactly what the generator emitted.
    jest.setSystemTime(new Date(2026, 6, 8, 9, 5, 0));

    expect(shouldCreateNotification(reminder, [])).toBe(true);
    const notification = generateNotificationFromReminder(reminder);
    expect(notification).not.toBeNull();
    expect(notification.reminderId).toBe(reminder.id);
    expect(notification.type).toBe("wellness_check");
  });

  it("an overdue month-cadence instance produces a notification", () => {
    const routine = monthlyWellnessRoutine({
      startDate: "2026-03-08",
      createdAt: "2026-03-01T00:00:00.000Z",
    });
    const [reminder] = generateOverdueInstances(routine, { lookbackDays: 30 });

    expect(shouldCreateNotification(reminder, [])).toBe(true);
    const notification = generateNotificationFromReminder(reminder);
    expect(notification).not.toBeNull();
    expect(notification.reminderId).toBe(reminder.id);
  });
});
