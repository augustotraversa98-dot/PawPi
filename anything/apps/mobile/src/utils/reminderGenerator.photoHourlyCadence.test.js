import {
  generateRemindersFromRoutine,
  generateOverdueInstances,
} from "./reminderGenerator";
import { ROUTINE_TYPES, ROUTINE_FREQUENCY } from "../data/routinesData";

// P1b — HOURLY (every N hours) for photo checks. Same intra-day interval
// machinery as the wellness / medical-care hourly cadence: forward steps the
// series across the horizon, overdue is capped to TODAY, ids carry `_HHMM`.

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

const hourlyId = (area, d) => {
  const dateStr = new Date(d.getFullYear(), d.getMonth(), d.getDate())
    .toISOString()
    .split("T")[0];
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `reminder_100_${area}_${dateStr}_${hh}${mm}`;
};
const allIdsUnique = (rs) => new Set(rs.map((r) => r.id)).size === rs.length;

describe("photo HOURLY — forward", () => {
  it("steps an every-6h photo check from its anchor time", () => {
    const routine = photoRoutine({
      bodyArea: "paws",
      frequency: ROUTINE_FREQUENCY.HOURLY,
      intervalHours: 6,
      preferredTime: "10:00",
      startDate: "2026-06-10",
    });

    const reminders = generateRemindersFromRoutine(routine, 1); // ends 06-11 08:00

    const occ = [
      new Date(2026, 5, 10, 10, 0, 0),
      new Date(2026, 5, 10, 16, 0, 0),
      new Date(2026, 5, 10, 22, 0, 0),
      new Date(2026, 5, 11, 4, 0, 0),
    ];
    expect(reminders.map((r) => r.scheduledAt)).toEqual(
      occ.map((d) => d.toISOString()),
    );
    expect(reminders.map((r) => r.id)).toEqual(
      occ.map((d) => hourlyId("paws", d)),
    );
    expect(reminders.every((r) => r.type === "photo_check")).toBe(true);
    expect(reminders.every((r) => r.relatedBodyArea === "paws")).toBe(true);
    expect(allIdsUnique(reminders)).toBe(true);
  });

  it("defaults to a 4h interval when intervalHours is absent", () => {
    const routine = photoRoutine({
      bodyArea: "ears",
      frequency: ROUTINE_FREQUENCY.HOURLY,
      preferredTime: "10:00",
      startDate: "2026-06-10",
    });

    const reminders = generateRemindersFromRoutine(routine, 1);
    const t0 = new Date(reminders[0].scheduledAt).getTime();
    const t1 = new Date(reminders[1].scheduledAt).getTime();
    expect((t1 - t0) / (60 * 60 * 1000)).toBe(4);
  });

  it("each body area runs an independent hourly series", () => {
    const routine = makeRoutine({
      type: ROUTINE_TYPES.PHOTO_CHECK,
      photoCheckSchedule: [
        {
          bodyArea: "paws",
          frequency: ROUTINE_FREQUENCY.HOURLY,
          intervalHours: 8,
          preferredTime: "10:00",
          startDate: "2026-06-10",
        },
        {
          bodyArea: "ears",
          frequency: ROUTINE_FREQUENCY.HOURLY,
          intervalHours: 8,
          preferredTime: "10:00",
          startDate: "2026-06-10",
        },
      ],
    });

    const reminders = generateRemindersFromRoutine(routine, 1);
    expect(new Set(reminders.map((r) => r.relatedBodyArea))).toEqual(
      new Set(["paws", "ears"]),
    );
    expect(allIdsUnique(reminders)).toBe(true);
  });
});

describe("photo HOURLY — overdue (capped to today)", () => {
  it("emits only today's past occurrences", () => {
    const routine = photoRoutine(
      {
        bodyArea: "paws",
        frequency: ROUTINE_FREQUENCY.HOURLY,
        intervalHours: 4,
        preferredTime: "00:00",
        startDate: "2026-06-09", // keeps the series DST-stable near NOW
      },
      { createdAt: "2026-06-01T00:00:00.000Z" },
    );

    const reminders = generateOverdueInstances(routine, { lookbackDays: 30 });
    expect(reminders.map((r) => r.scheduledAt)).toEqual([
      new Date(2026, 5, 10, 0, 0, 0).toISOString(),
      new Date(2026, 5, 10, 4, 0, 0).toISOString(),
    ]);
    expect(reminders.every((r) => r.status === "overdue")).toBe(true);
    expect(reminders.every((r) => new Date(r.scheduledAt) >= new Date(2026, 5, 10))).toBe(
      true,
    );
    expect(allIdsUnique(reminders)).toBe(true);
  });

  it("forward and overdue never emit the same occurrence", () => {
    const routine = photoRoutine(
      {
        bodyArea: "paws",
        frequency: ROUTINE_FREQUENCY.HOURLY,
        intervalHours: 4,
        preferredTime: "00:00",
        startDate: "2026-06-09",
      },
      { createdAt: "2026-06-01T00:00:00.000Z" },
    );
    const future = generateRemindersFromRoutine(routine, 1);
    const overdue = generateOverdueInstances(routine, { lookbackDays: 30 });
    const futureIds = new Set(future.map((r) => r.id));
    expect(overdue.every((r) => !futureIds.has(r.id))).toBe(true);
  });
});
