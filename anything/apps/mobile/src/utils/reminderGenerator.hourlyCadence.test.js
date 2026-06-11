import {
  generateRemindersFromRoutine,
  generateOverdueInstances,
} from "./reminderGenerator";
import {
  generateNotificationFromReminder,
  shouldCreateNotification,
} from "./notificationGenerator";
import { ROUTINE_TYPES, ROUTINE_FREQUENCY } from "../data/routinesData";

// P1b-3 — the intra-day HOURLY cadence ("every N hours"): a routine that fires
// one independent instance every `intervalHours` hours from its start anchor,
// the FIRST cadence with multiple occurrences per day. Two behaviours differ
// from the once-per-day cadences and are pinned here:
//   1. instance ids carry the occurrence time (`_HHMM`) so same-day siblings
//      stay distinct, while non-hourly ids stay byte-for-byte unchanged; and
//   2. overdue backfill is capped to TODAY only, never the 30-day lookback.
//
// Time is pinned (same clock as the month-cadence / once / overdue suites) so
// day math is deterministic.

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

function hourlyWellnessRoutine(overrides = {}, itemOverrides = {}) {
  return makeRoutine({
    type: ROUTINE_TYPES.WELLNESS_CHECK,
    createdAt: "2026-01-01T00:00:00.000Z",
    wellnessCheckItems: [
      {
        checkType: "general",
        frequency: ROUTINE_FREQUENCY.HOURLY,
        intervalHours: 4,
        preferredDay: 2, // weekday — must be IGNORED by an intra-day cadence
        preferredTime: "08:00",
        ...itemOverrides,
      },
    ],
    ...overrides,
  });
}

describe("forward generator — HOURLY interval cadence", () => {
  it("emits one instance every intervalHours from the start anchor", () => {
    // Anchor today 08:00, interval 4h. NOW is 08:00, horizon ends +1 day
    // (2026-06-11 08:00). Occurrences roll across midnight as a flat series.
    const routine = hourlyWellnessRoutine({ startDate: "2026-06-10" });

    const reminders = generateRemindersFromRoutine(routine, 1);

    expect(reminders.map((r) => r.scheduledAt)).toEqual([
      at(2026, 6, 10, 8),
      at(2026, 6, 10, 12),
      at(2026, 6, 10, 16),
      at(2026, 6, 10, 20),
      at(2026, 6, 11, 0),
      at(2026, 6, 11, 4),
      at(2026, 6, 11, 8),
    ]);
    expect(reminders.every((r) => r.status === "upcoming")).toBe(true);
  });

  it("honours a different interval (every 6 hours)", () => {
    const routine = hourlyWellnessRoutine(
      { startDate: "2026-06-10" },
      { intervalHours: 6 },
    );

    const reminders = generateRemindersFromRoutine(routine, 1);

    expect(reminders.map((r) => r.scheduledAt)).toEqual([
      at(2026, 6, 10, 8),
      at(2026, 6, 10, 14),
      at(2026, 6, 10, 20),
      at(2026, 6, 11, 2),
      at(2026, 6, 11, 8),
    ]);
  });

  it("falls back to a 4h default when intervalHours is absent", () => {
    const routine = hourlyWellnessRoutine(
      { startDate: "2026-06-10" },
      { intervalHours: undefined },
    );

    const reminders = generateRemindersFromRoutine(routine, 1);

    // Identical spacing to the explicit interval=4 case.
    expect(reminders.map((r) => r.scheduledAt)).toEqual([
      at(2026, 6, 10, 8),
      at(2026, 6, 10, 12),
      at(2026, 6, 10, 16),
      at(2026, 6, 10, 20),
      at(2026, 6, 11, 0),
      at(2026, 6, 11, 4),
      at(2026, 6, 11, 8),
    ]);
  });

  it("anchors on the start time-of-day, not the generation clock", () => {
    // Start 09:30 with NOW at 08:00 — first occurrence is 09:30, then +4h.
    const routine = hourlyWellnessRoutine(
      { startDate: "2026-06-10" },
      { preferredTime: "09:30" },
    );

    const reminders = generateRemindersFromRoutine(routine, 0); // ends NOW (08:00)
    // Horizon ends at 08:00 today, before the 09:30 anchor → nothing yet.
    expect(reminders).toEqual([]);

    const dayAhead = generateRemindersFromRoutine(routine, 1);
    expect(dayAhead[0].scheduledAt).toBe(at(2026, 6, 10, 9, 30));
    expect(dayAhead[1].scheduledAt).toBe(at(2026, 6, 10, 13, 30));
  });
});

describe("HOURLY — intra-day id uniqueness + non-hourly id stability", () => {
  it("gives each same-day sibling a distinct, time-bearing id", () => {
    const routine = hourlyWellnessRoutine({ startDate: "2026-06-10" });

    const reminders = generateRemindersFromRoutine(routine, 1);

    expect(allIdsUnique(reminders)).toBe(true);
    // Time-bearing form: `..._<dateStr>_<HHMM>`.
    expect(reminders[0].id).toBe(
      `reminder_100_general_0_${idDate(2026, 6, 10)}_0800`,
    );
    expect(reminders[1].id).toBe(
      `reminder_100_general_0_${idDate(2026, 6, 10)}_1200`,
    );
    // The midnight roll-over occurrence carries the next day's date segment.
    expect(reminders[4].id).toBe(
      `reminder_100_general_0_${idDate(2026, 6, 11)}_0000`,
    );
  });

  it("leaves a daily instance id byte-for-byte identical to before", () => {
    // The same wellness routine on a DAILY cadence keeps the locked date-only
    // id, so existing reminder_dismissals keys still match.
    const routine = hourlyWellnessRoutine(
      { startDate: "2026-06-10" },
      { frequency: ROUTINE_FREQUENCY.DAILY, preferredTime: "09:00" },
    );

    const [first] = generateRemindersFromRoutine(routine, 1);

    expect(first.id).toBe(`reminder_100_general_0_${idDate(2026, 6, 10)}`);
    expect(first.id).not.toMatch(/_\d{4}$/); // no time suffix
  });
});

describe("overdue generator — HOURLY capped to TODAY", () => {
  it("emits only today's past occurrences, never prior days", () => {
    // Anchor several days old; the series lands at 00/04/08/12/16/20 each day.
    const routine = hourlyWellnessRoutine({
      startDate: "2026-06-05",
      createdAt: "2026-05-01T00:00:00.000Z",
    });

    // 30-day lookback is requested, but HOURLY ignores it and caps to today.
    const reminders = generateOverdueInstances(routine, { lookbackDays: 30 });

    // Today is 2026-06-10, NOW 08:00. Past-today occurrences: 00:00, 04:00.
    expect(reminders.map((r) => r.scheduledAt)).toEqual([
      at(2026, 6, 10, 0),
      at(2026, 6, 10, 4),
    ]);
    expect(reminders.every((r) => r.status === "overdue")).toBe(true);
    // Zero occurrences from 06-05..06-09 despite a 5-day-old anchor: every
    // emitted instance is on or after the start of today and before NOW.
    const startOfToday = new Date(2026, 5, 10, 0, 0, 0).getTime();
    expect(
      reminders.every((r) => {
        const t = new Date(r.scheduledAt).getTime();
        return t >= startOfToday && t < NOW.getTime();
      }),
    ).toBe(true);
  });

  it("clamps to createdAt — a routine created now backfills nothing", () => {
    const routine = hourlyWellnessRoutine({
      startDate: "2026-06-05",
      createdAt: NOW.toISOString(), // created right now
    });

    expect(generateOverdueInstances(routine, { lookbackDays: 30 })).toEqual([]);
  });

  it("forward and overdue partition the series with no overlap", () => {
    const routine = hourlyWellnessRoutine({
      startDate: "2026-06-05",
      createdAt: "2026-05-01T00:00:00.000Z",
    });

    const forward = generateRemindersFromRoutine(routine, 1);
    const overdue = generateOverdueInstances(routine, { lookbackDays: 30 });

    const forwardIds = new Set(forward.map((r) => r.id));
    const overlap = overdue.filter((r) => forwardIds.has(r.id));
    expect(overlap).toEqual([]);
    // Forward starts at the first occurrence >= NOW (08:00 today).
    expect(forward[0].scheduledAt).toBe(at(2026, 6, 10, 8));
  });
});

describe("HOURLY — sibling independence", () => {
  it("dismissing one occurrence leaves its siblings intact", () => {
    const routine = hourlyWellnessRoutine({ startDate: "2026-06-10" });

    const reminders = generateRemindersFromRoutine(routine, 1);
    expect(reminders.length).toBeGreaterThan(2);

    // Reconciliation keys dismissals on the (distinct) instance id; dismissing
    // the noon occurrence must not remove any other.
    const dismissed = new Set([
      `reminder_100_general_0_${idDate(2026, 6, 10)}_1200`,
    ]);
    const surviving = reminders.filter((r) => !dismissed.has(r.id));

    expect(surviving.length).toBe(reminders.length - 1);
    expect(surviving.some((r) => r.scheduledAt === at(2026, 6, 10, 12))).toBe(
      false,
    );
    // The 08:00 and 16:00 siblings remain.
    expect(surviving.some((r) => r.scheduledAt === at(2026, 6, 10, 8))).toBe(
      true,
    );
    expect(surviving.some((r) => r.scheduledAt === at(2026, 6, 10, 16))).toBe(
      true,
    );
  });
});

describe("HOURLY — notification layer (instance-driven, no rescheduling)", () => {
  it("each occurrence fires its own notification off nextTriggerAt", () => {
    const reminders = generateRemindersFromRoutine(
      hourlyWellnessRoutine({ startDate: "2026-06-10" }),
      1,
    );
    const noon = reminders.find((r) => r.scheduledAt === at(2026, 6, 10, 12));

    // Advance to the noon occurrence — the notification layer keys off
    // nextTriggerAt, no per-cadence rescheduling needed.
    jest.setSystemTime(new Date(2026, 5, 10, 12, 5, 0));

    expect(shouldCreateNotification(noon, [])).toBe(true);
    const notification = generateNotificationFromReminder(noon);
    expect(notification).not.toBeNull();
    expect(notification.reminderId).toBe(noon.id);
    expect(notification.type).toBe("wellness_check");
  });

  it("siblings produce distinct notification ids", () => {
    const reminders = generateRemindersFromRoutine(
      hourlyWellnessRoutine({ startDate: "2026-06-10" }),
      1,
    );

    // Past the whole day so every occurrence is due/overdue.
    jest.setSystemTime(new Date(2026, 5, 12, 8, 0, 0));

    const notifications = reminders
      .map((r) => generateNotificationFromReminder(r))
      .filter(Boolean);
    expect(notifications.length).toBe(reminders.length);
    expect(new Set(notifications.map((n) => n.id)).size).toBe(
      notifications.length,
    );
  });
});
