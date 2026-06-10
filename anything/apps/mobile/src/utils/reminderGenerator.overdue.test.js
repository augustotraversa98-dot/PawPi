import {
  generateOverdueInstances,
  generateRemindersFromRoutine,
} from "./reminderGenerator";
import { ROUTINE_TYPES, ROUTINE_FREQUENCY } from "../data/routinesData";

// Phase A — pure-function tests for generateOverdueInstances, the ADDITIVE sibling
// of generateRemindersFromRoutine. It enumerates PAST scheduled instances within a
// bounded lookback window, for the persistent types only (wellness / medical care /
// photo check). The locked future-only generator + its tests are untouched.
//
// Time is pinned so the day-of-week math and the past-window filter are deterministic.

const NOW = new Date(2026, 5, 10, 8, 0, 0); // Wed 2026-06-10 08:00 local

beforeAll(() => {
  jest.useFakeTimers();
  jest.setSystemTime(NOW);
});

afterAll(() => {
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

const allIdsUnique = (reminders) =>
  new Set(reminders.map((r) => r.id)).size === reminders.length;

describe("generateOverdueInstances — gating", () => {
  it("returns [] for an inactive routine", () => {
    const routine = makeRoutine({
      type: ROUTINE_TYPES.WELLNESS_CHECK,
      isActive: false,
      wellnessCheckItems: [{ checkType: "general", frequency: ROUTINE_FREQUENCY.DAILY }],
    });
    expect(generateOverdueInstances(routine)).toEqual([]);
  });

  it("returns [] when notifications are disabled", () => {
    const routine = makeRoutine({
      type: ROUTINE_TYPES.WELLNESS_CHECK,
      notificationEnabled: false,
      wellnessCheckItems: [{ checkType: "general", frequency: ROUTINE_FREQUENCY.DAILY }],
    });
    expect(generateOverdueInstances(routine)).toEqual([]);
  });

  it("returns [] for transient (feeding/walk) types — they are not enumerated", () => {
    const feeding = makeRoutine({
      type: ROUTINE_TYPES.FEEDING,
      meals: [{ id: "m1", name: "Breakfast", time: "07:00", frequency: ROUTINE_FREQUENCY.DAILY }],
    });
    expect(generateOverdueInstances(feeding)).toEqual([]);
  });
});

describe("generateOverdueInstances — wellness check", () => {
  // Weekly on Wednesday (preferredDay=2). Within 30 days before Wed 06-10, the past
  // Wednesdays are 05-13, 05-20, 05-27, 06-03. Today's 09:00 instance is in the
  // FUTURE relative to 08:00 now, so it is correctly excluded.
  function weeklyWedRoutine() {
    return makeRoutine({
      type: ROUTINE_TYPES.WELLNESS_CHECK,
      wellnessCheckItems: [
        {
          checkType: "body_condition",
          frequency: ROUTINE_FREQUENCY.WEEKLY,
          preferredDay: 2,
          preferredTime: "09:00",
        },
      ],
    });
  }

  it("emits one overdue instance per past scheduled occurrence in the window", () => {
    const reminders = generateOverdueInstances(weeklyWedRoutine());

    expect(reminders).toHaveLength(4);
    expect(reminders.every((r) => r.type === "wellness_check")).toBe(true);
    expect(reminders.every((r) => r.checkType === "body_condition")).toBe(true);
    expect(reminders.every((r) => r.wellnessCheckItemIndex === 0)).toBe(true);
    // Every emitted instance is strictly in the past.
    expect(reminders.every((r) => new Date(r.scheduledAt) < NOW)).toBe(true);
    expect(allIdsUnique(reminders)).toBe(true);
  });

  it("emits ids identical to what the future generator would have produced", () => {
    // The future generator anchored on the day of the 06-03 occurrence would build
    // the same deterministic id — so dismissals/resolution align across the seam.
    // The id's date segment mirrors the generator's exact derivation (toISOString of
    // local midnight), so we compute it the same way to stay timezone-robust.
    const dateStr = new Date(2026, 5, 3).toISOString().split("T")[0];
    const reminders = generateOverdueInstances(weeklyWedRoutine());
    const ids = reminders.map((r) => r.id);
    expect(ids).toContain(`reminder_100_body_condition_0_${dateStr}`);
  });

  it("respects a smaller lookbackDays — older instances age out silently", () => {
    const dateStr = new Date(2026, 5, 3).toISOString().split("T")[0];
    const reminders = generateOverdueInstances(weeklyWedRoutine(), {
      lookbackDays: 10,
    });
    // Only 06-03 falls within 10 days of 06-10; 05-27 and earlier are gone.
    expect(reminders).toHaveLength(1);
    expect(reminders[0].id).toBe(`reminder_100_body_condition_0_${dateStr}`);
  });

  it("does not duplicate the future generator's output (no overlap in time)", () => {
    const routine = weeklyWedRoutine();
    const future = generateRemindersFromRoutine(routine);
    const overdue = generateOverdueInstances(routine);
    const futureIds = new Set(future.map((r) => r.id));
    expect(overdue.every((r) => !futureIds.has(r.id))).toBe(true);
  });
});

describe("generateOverdueInstances — medical care", () => {
  it("emits one overdue instance per past daily dose within the window", () => {
    const routine = makeRoutine({
      type: ROUTINE_TYPES.MEDICAL_CARE,
      medicalCareItems: [
        { id: "med1", type: "medication", name: "Rimadyl", times: ["08:00"] },
      ],
    });

    // lookback 3 days → 06-07, 06-08, 06-09 at 08:00 (today's 08:00 is == now, not < now).
    const reminders = generateOverdueInstances(routine, { lookbackDays: 3 });

    expect(reminders).toHaveLength(3);
    expect(reminders.every((r) => r.type === "medical_care")).toBe(true);
    expect(reminders.every((r) => r.medicalCareItemId === "med1")).toBe(true);
    expect(reminders.every((r) => new Date(r.scheduledAt) < NOW)).toBe(true);
    expect(allIdsUnique(reminders)).toBe(true);
  });

  it("emits a single overdue instance for a past date-based item (vaccine)", () => {
    const routine = makeRoutine({
      type: ROUTINE_TYPES.MEDICAL_CARE,
      medicalCareItems: [
        { id: "vac1", type: "vaccine", name: "Rabies", nextDue: "2026-06-05" },
      ],
    });

    const reminders = generateOverdueInstances(routine);
    expect(reminders).toHaveLength(1);
    expect(reminders[0].medicalCareItemId).toBe("vac1");
    expect(new Date(reminders[0].scheduledAt) < NOW).toBe(true);
  });
});

describe("generateOverdueInstances — clamp to routine/item start (no phantom backfill)", () => {
  // An ISO timestamp N whole days before the pinned NOW.
  const daysAgo = (n) => {
    const d = new Date(NOW);
    d.setDate(d.getDate() - n);
    return d.toISOString();
  };

  it("a routine created now yields 0 overdue — wellness/medical/photo", () => {
    const wellness = makeRoutine({
      type: ROUTINE_TYPES.WELLNESS_CHECK,
      createdAt: NOW.toISOString(),
      wellnessCheckItems: [
        { checkType: "general", frequency: ROUTINE_FREQUENCY.DAILY, preferredTime: "09:00" },
      ],
    });
    const medical = makeRoutine({
      type: ROUTINE_TYPES.MEDICAL_CARE,
      createdAt: NOW.toISOString(),
      medicalCareItems: [
        { id: "med1", type: "medication", name: "Rimadyl", times: ["07:00", "19:00"] },
      ],
    });
    const photo = makeRoutine({
      type: ROUTINE_TYPES.PHOTO_CHECK,
      createdAt: NOW.toISOString(),
      photoCheckSchedule: [
        { bodyArea: "paws", frequency: ROUTINE_FREQUENCY.WEEKLY, preferredDay: 2, preferredTime: "10:00" },
      ],
    });

    expect(generateOverdueInstances(wellness)).toEqual([]);
    expect(generateOverdueInstances(medical)).toEqual([]);
    expect(generateOverdueInstances(photo)).toEqual([]);
  });

  it("a daily wellness routine created N days ago yields at most N instances, none before creation", () => {
    const N = 5;
    const createdAt = daysAgo(N);
    const routine = makeRoutine({
      type: ROUTINE_TYPES.WELLNESS_CHECK,
      createdAt,
      wellnessCheckItems: [
        { checkType: "general", frequency: ROUTINE_FREQUENCY.DAILY, preferredTime: "09:00" },
      ],
    });

    const reminders = generateOverdueInstances(routine);

    expect(reminders.length).toBeGreaterThan(0);
    expect(reminders.length).toBeLessThanOrEqual(N);
    expect(
      reminders.every((r) => new Date(r.scheduledAt) >= new Date(createdAt)),
    ).toBe(true);
    expect(reminders.every((r) => new Date(r.scheduledAt) < NOW)).toBe(true);
  });

  it("daily medical care clamps to the routine's creation day", () => {
    const routine = makeRoutine({
      type: ROUTINE_TYPES.MEDICAL_CARE,
      createdAt: daysAgo(2),
      medicalCareItems: [
        { id: "med1", type: "medication", name: "Rimadyl", times: ["08:00"] },
      ],
    });

    // From 2 days ago at 08:00 up to (not incl.) today's 08:00 == now → 2 doses.
    const reminders = generateOverdueInstances(routine);
    expect(reminders.length).toBeLessThanOrEqual(2);
    expect(
      reminders.every((r) => new Date(r.scheduledAt) >= new Date(daysAgo(2))),
    ).toBe(true);
  });

  it("medical care also clamps to a later item.startDate", () => {
    const routine = makeRoutine({
      type: ROUTINE_TYPES.MEDICAL_CARE,
      createdAt: daysAgo(20), // routine is old…
      medicalCareItems: [
        // …but this item only started 2 days ago.
        { id: "med1", type: "medication", name: "Rimadyl", times: ["08:00"], startDate: daysAgo(2) },
      ],
    });

    const reminders = generateOverdueInstances(routine);
    expect(reminders.length).toBeLessThanOrEqual(2);
    expect(
      reminders.every((r) => new Date(r.scheduledAt) >= new Date(daysAgo(2))),
    ).toBe(true);
  });

  it("does not suppress genuinely-missed past instances (routine older than the window)", () => {
    const routine = makeRoutine({
      type: ROUTINE_TYPES.WELLNESS_CHECK,
      createdAt: daysAgo(40), // older than the 30-day lookback → window governs
      wellnessCheckItems: [
        {
          checkType: "body_condition",
          frequency: ROUTINE_FREQUENCY.WEEKLY,
          preferredDay: 2,
          preferredTime: "09:00",
        },
      ],
    });

    // Same 4 weekly Wednesdays in the window as the un-clamped case.
    expect(generateOverdueInstances(routine)).toHaveLength(4);
  });
});

describe("generateOverdueInstances — photo check", () => {
  it("emits a separate per-area overdue instance, none merged", () => {
    const routine = makeRoutine({
      type: ROUTINE_TYPES.PHOTO_CHECK,
      photoCheckSchedule: [
        { bodyArea: "paws", frequency: ROUTINE_FREQUENCY.WEEKLY, preferredDay: 2, preferredTime: "10:00" },
        { bodyArea: "ears", frequency: ROUTINE_FREQUENCY.WEEKLY, preferredDay: 2, preferredTime: "10:00" },
      ],
    });

    const reminders = generateOverdueInstances(routine, { lookbackDays: 10 });
    // Each area: only 06-03 within 10 days.
    expect(new Set(reminders.map((r) => r.relatedBodyArea))).toEqual(
      new Set(["paws", "ears"]),
    );
    expect(reminders.every((r) => r.type === "photo_check")).toBe(true);
    expect(reminders.every((r) => new Date(r.scheduledAt) < NOW)).toBe(true);
    expect(allIdsUnique(reminders)).toBe(true);
  });

  it("enumerates every missed day for a DAILY photo schedule, ignoring preferredDay", () => {
    const routine = makeRoutine({
      type: ROUTINE_TYPES.PHOTO_CHECK,
      // Created Sunday 06:00, before that day's 10:00 slot.
      createdAt: new Date(2026, 5, 7, 6, 0, 0).toISOString(),
      photoCheckSchedule: [
        { bodyArea: "paws", frequency: ROUTINE_FREQUENCY.DAILY, preferredDay: 6, preferredTime: "10:00" },
      ],
    });

    const reminders = generateOverdueInstances(routine);

    // Sun 7th, Mon 8th, Tue 9th at 10:00 were all missed; Wed 10th 10:00 is
    // still ahead of the 08:00 NOW. A weekly read of this schedule would have
    // produced only the Sunday instance.
    expect(reminders.map((r) => r.scheduledAt)).toEqual(
      [
        new Date(2026, 5, 7, 10, 0, 0),
        new Date(2026, 5, 8, 10, 0, 0),
        new Date(2026, 5, 9, 10, 0, 0),
      ].map((d) => d.toISOString()),
    );
    expect(allIdsUnique(reminders)).toBe(true);
  });
});
