import {
  generateRemindersFromRoutine,
  generateOverdueInstances,
} from "./reminderGenerator";
import { ROUTINE_TYPES, ROUTINE_FREQUENCY } from "../data/routinesData";

// P1b — HOURLY (every N hours) for medical-care, the canonical "every 8h
// medication" case. Same intra-day interval machinery as the wellness hourly
// cadence: forward steps the series across the horizon; overdue is capped to
// TODAY only. Instance ids carry the locked `_HHMM` suffix so same-day siblings
// stay distinct.
//
// Anchors are kept within a day or two of NOW so absolute-ms interval stepping
// doesn't drift across a DST boundary in the local test tz.

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

function medicalRoutine(item, overrides = {}) {
  return makeRoutine({
    type: ROUTINE_TYPES.MEDICAL_CARE,
    medicalCareItems: [item],
    ...overrides,
  });
}

// Reproduce the generator's hourly id exactly (local-midnight date + _HHMM).
const hourlyId = (itemId, d) => {
  const dateStr = new Date(d.getFullYear(), d.getMonth(), d.getDate())
    .toISOString()
    .split("T")[0];
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `reminder_100_${itemId}_${dateStr}_${hh}${mm}`;
};
const allIdsUnique = (rs) => new Set(rs.map((r) => r.id)).size === rs.length;

describe("medical-care HOURLY — forward", () => {
  it("steps an every-8h medication from its anchor time across the horizon", () => {
    const routine = medicalRoutine({
      id: "med1",
      type: "medication",
      name: "Pain relief",
      times: ["08:00"], // anchor time-of-day
      startDate: "2026-06-10",
      frequency: ROUTINE_FREQUENCY.HOURLY,
      intervalHours: 8,
    });

    const reminders = generateRemindersFromRoutine(routine, 1); // ends 06-11 08:00

    const occ = [
      new Date(2026, 5, 10, 8, 0, 0),
      new Date(2026, 5, 10, 16, 0, 0),
      new Date(2026, 5, 11, 0, 0, 0),
      new Date(2026, 5, 11, 8, 0, 0),
    ];
    expect(reminders.map((r) => r.scheduledAt)).toEqual(
      occ.map((d) => d.toISOString()),
    );
    expect(reminders.map((r) => r.id)).toEqual(
      occ.map((d) => hourlyId("med1", d)),
    );
    // Same-day siblings (08:00 vs 16:00) get distinct ids via the _HHMM suffix.
    expect(allIdsUnique(reminders)).toBe(true);
  });

  it("defaults to a 4h interval when intervalHours is absent", () => {
    const routine = medicalRoutine({
      id: "med1",
      type: "medication",
      times: ["08:00"],
      startDate: "2026-06-10",
      frequency: ROUTINE_FREQUENCY.HOURLY,
    });

    const reminders = generateRemindersFromRoutine(routine, 1);
    const t0 = new Date(reminders[0].scheduledAt).getTime();
    const t1 = new Date(reminders[1].scheduledAt).getTime();
    expect((t1 - t0) / (60 * 60 * 1000)).toBe(4);
  });

  it("preferredTime overrides times[0] as the anchor", () => {
    const routine = medicalRoutine({
      id: "med1",
      type: "medication",
      times: ["08:00"],
      preferredTime: "09:30",
      startDate: "2026-06-10",
      frequency: ROUTINE_FREQUENCY.HOURLY,
      intervalHours: 6,
    });

    const [first] = generateRemindersFromRoutine(routine, 1);
    expect(first.scheduledAt).toBe(new Date(2026, 5, 10, 9, 30, 0).toISOString());
  });

  it("works for a date-based care type too, defaulting the anchor to 09:00", () => {
    const routine = medicalRoutine({
      id: "ht1",
      type: "heartworm",
      name: "Infusion",
      nextDue: "2026-06-10",
      startDate: "2026-06-10",
      frequency: ROUTINE_FREQUENCY.HOURLY,
      intervalHours: 12,
    });

    const reminders = generateRemindersFromRoutine(routine, 1);
    expect(reminders[0].scheduledAt).toBe(
      new Date(2026, 5, 10, 9, 0, 0).toISOString(),
    );
    expect(reminders.every((r) => /_\d{4}$/.test(r.id))).toBe(true);
    expect(allIdsUnique(reminders)).toBe(true);
  });
});

describe("medical-care HOURLY — overdue (capped to today)", () => {
  it("emits only today's past occurrences, never the lookback window", () => {
    const routine = medicalRoutine(
      {
        id: "med1",
        type: "medication",
        times: ["00:00"],
        preferredTime: "00:00", // anchor at local midnight
        startDate: "2026-06-09", // yesterday — keeps the series DST-stable
        frequency: ROUTINE_FREQUENCY.HOURLY,
        intervalHours: 4,
      },
      { createdAt: "2026-06-01T00:00:00.000Z" },
    );

    // Today's occurrences before 08:00 NOW: 00:00 and 04:00 (08:00 == now, out).
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

  it("clamps to a same-day creation time — nothing before the routine existed", () => {
    const routine = medicalRoutine(
      {
        id: "med1",
        type: "medication",
        preferredTime: "00:00",
        startDate: "2026-06-09",
        frequency: ROUTINE_FREQUENCY.HOURLY,
        intervalHours: 4,
      },
      // Created today at 02:00 → the 00:00 occurrence predates it.
      { createdAt: new Date(2026, 5, 10, 2, 0, 0).toISOString() },
    );

    const reminders = generateOverdueInstances(routine, { lookbackDays: 30 });
    expect(reminders.map((r) => r.scheduledAt)).toEqual([
      new Date(2026, 5, 10, 4, 0, 0).toISOString(),
    ]);
  });

  it("forward and overdue never emit the same occurrence", () => {
    const routine = medicalRoutine(
      {
        id: "med1",
        type: "medication",
        preferredTime: "00:00",
        startDate: "2026-06-09",
        frequency: ROUTINE_FREQUENCY.HOURLY,
        intervalHours: 4,
      },
      { createdAt: "2026-06-01T00:00:00.000Z" },
    );
    const future = generateRemindersFromRoutine(routine, 1);
    const overdue = generateOverdueInstances(routine, { lookbackDays: 30 });
    const futureIds = new Set(future.map((r) => r.id));
    expect(overdue.every((r) => !futureIds.has(r.id))).toBe(true);
  });
});
