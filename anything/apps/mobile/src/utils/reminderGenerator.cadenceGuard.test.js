import {
  generateRemindersFromRoutine,
  generateOverdueInstances,
} from "./reminderGenerator";
import { ROUTINE_TYPES, ROUTINE_FREQUENCY } from "../data/routinesData";

// P1b — dev-time guard: a routine carrying a cadence its generator path cannot
// honor fails loudly in development, so a future ScheduleBlock change can't ship
// a schedule that silently never fires. The five cadence-driven types honor every
// cadence; vet-appointment is a single dated event (recurring/hourly are N/A).

function makeRoutine(overrides) {
  return {
    id: "100",
    petId: "42",
    isActive: true,
    notificationEnabled: true,
    times: ["09:00"],
    days: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("cadence guard — accepts honored cadences", () => {
  it.each([
    ROUTINE_FREQUENCY.HOURLY,
    ROUTINE_FREQUENCY.DAILY,
    ROUTINE_FREQUENCY.WEEKLY,
    ROUTINE_FREQUENCY.BIWEEKLY,
    ROUTINE_FREQUENCY.MONTHLY,
    ROUTINE_FREQUENCY.EVERY_3_MONTHS,
    ROUTINE_FREQUENCY.EVERY_6_MONTHS,
    ROUTINE_FREQUENCY.YEARLY,
    ROUTINE_FREQUENCY.ONCE,
    ROUTINE_FREQUENCY.WEEKDAYS,
    ROUTINE_FREQUENCY.WEEKENDS,
    ROUTINE_FREQUENCY.CUSTOM,
  ])("medical-care honors %s without throwing", (frequency) => {
    const routine = makeRoutine({
      type: ROUTINE_TYPES.MEDICAL_CARE,
      medicalCareItems: [
        { id: "m1", type: "medication", times: ["09:00"], frequency },
      ],
    });
    expect(() => generateRemindersFromRoutine(routine)).not.toThrow();
    expect(() => generateOverdueInstances(routine)).not.toThrow();
  });

  it("wellness/photo/feeding/walk accept an arbitrary cadence", () => {
    const cases = [
      makeRoutine({
        type: ROUTINE_TYPES.WELLNESS_CHECK,
        wellnessCheckItems: [
          { checkType: "general", frequency: ROUTINE_FREQUENCY.HOURLY },
        ],
      }),
      makeRoutine({
        type: ROUTINE_TYPES.PHOTO_CHECK,
        photoCheckSchedule: [
          { bodyArea: "paws", frequency: ROUTINE_FREQUENCY.CUSTOM, days: [0] },
        ],
      }),
      makeRoutine({
        type: ROUTINE_TYPES.FEEDING,
        meals: [{ id: "m1", time: "09:00", frequency: ROUTINE_FREQUENCY.MONTHLY }],
      }),
      makeRoutine({
        type: ROUTINE_TYPES.WALK,
        walks: [{ name: "W", time: "09:00", frequency: ROUTINE_FREQUENCY.WEEKLY }],
      }),
    ];
    for (const routine of cases) {
      expect(() => generateRemindersFromRoutine(routine)).not.toThrow();
    }
  });

  it("vet-appointment accepts ONCE (and an unset cadence)", () => {
    const once = makeRoutine({
      type: ROUTINE_TYPES.VET_APPOINTMENT,
      date: "2026-06-20",
      frequency: ROUTINE_FREQUENCY.ONCE,
    });
    const unset = makeRoutine({
      type: ROUTINE_TYPES.VET_APPOINTMENT,
      date: "2026-06-20",
    });
    expect(() => generateRemindersFromRoutine(once)).not.toThrow();
    expect(() => generateRemindersFromRoutine(unset)).not.toThrow();
  });
});

describe("cadence guard — rejects un-honorable cadences (dev only)", () => {
  it("throws when a vet appointment is given a recurring cadence", () => {
    const routine = makeRoutine({
      type: ROUTINE_TYPES.VET_APPOINTMENT,
      date: "2026-06-20",
      frequency: ROUTINE_FREQUENCY.WEEKLY,
    });
    expect(() => generateRemindersFromRoutine(routine)).toThrow(
      /cannot honor cadence "weekly"/,
    );
  });

  it("throws for an hourly vet appointment too", () => {
    const routine = makeRoutine({
      type: ROUTINE_TYPES.VET_APPOINTMENT,
      date: "2026-06-20",
      frequency: ROUTINE_FREQUENCY.HOURLY,
    });
    expect(() => generateRemindersFromRoutine(routine)).toThrow(
      /silently never fire/,
    );
  });

  it("is a no-op when __DEV__ is false (production)", () => {
    const original = global.__DEV__;
    global.__DEV__ = false;
    try {
      const routine = makeRoutine({
        type: ROUTINE_TYPES.VET_APPOINTMENT,
        date: "2026-06-20",
        frequency: ROUTINE_FREQUENCY.WEEKLY,
      });
      expect(() => generateRemindersFromRoutine(routine)).not.toThrow();
    } finally {
      global.__DEV__ = original;
    }
  });
});
