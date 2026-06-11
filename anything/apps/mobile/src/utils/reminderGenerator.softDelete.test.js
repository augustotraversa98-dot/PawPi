import {
  generateOverdueInstances,
  generateRemindersFromRoutine,
  isRoutineDeleted,
} from "./reminderGenerator";
import { buildOverdueReminders } from "./reminderResolution";
import { ROUTINE_TYPES, ROUTINE_FREQUENCY } from "../data/routinesData";

// Soft-delete exclusion (Routine-deletion ticket). A deleted routine — marked with
// `deletedAt`/`deleted_at` — must generate NO reminders anywhere: not forward
// (generateRemindersFromRoutine), not overdue (generateOverdueInstances /
// buildOverdueReminders). This is a SEPARATE marker from is_active: pausing also
// flips is_active off, so deletion needs its own guard or a still-"active" but
// soft-deleted row (e.g. mid-refetch) would keep emitting instances. Tests pin a
// routine that WOULD enumerate (active, notifications on, valid daily cadence) and
// assert the only thing suppressing it is the delete marker.

const NOW = new Date(2026, 5, 10, 8, 0, 0); // Wed 2026-06-10 08:00 local

beforeAll(() => {
  jest.useFakeTimers();
  jest.setSystemTime(NOW);
});

afterAll(() => {
  jest.useRealTimers();
});

function makeWellnessRoutine(overrides) {
  return {
    id: "100",
    petId: "42",
    isActive: true,
    notificationEnabled: true,
    times: [],
    days: [],
    type: ROUTINE_TYPES.WELLNESS_CHECK,
    wellnessCheckItems: [
      { checkType: "general", frequency: ROUTINE_FREQUENCY.DAILY },
    ],
    ...overrides,
  };
}

describe("isRoutineDeleted", () => {
  it("is true for either the app-format `deletedAt` or raw `deleted_at`", () => {
    expect(isRoutineDeleted({ deletedAt: "2026-06-10T00:00:00Z" })).toBe(true);
    expect(isRoutineDeleted({ deleted_at: "2026-06-10T00:00:00Z" })).toBe(true);
  });

  it("is false when neither marker is set", () => {
    expect(isRoutineDeleted({ deletedAt: null, deleted_at: null })).toBe(false);
    expect(isRoutineDeleted({})).toBe(false);
    expect(isRoutineDeleted(null)).toBe(false);
  });
});

describe("generators skip soft-deleted routines", () => {
  it("a non-deleted routine DOES enumerate (control)", () => {
    const routine = makeWellnessRoutine();
    expect(generateRemindersFromRoutine(routine).length).toBeGreaterThan(0);
    expect(generateOverdueInstances(routine).length).toBeGreaterThan(0);
  });

  it("generateRemindersFromRoutine returns [] for a soft-deleted routine", () => {
    expect(
      generateRemindersFromRoutine(
        makeWellnessRoutine({ deletedAt: "2026-06-09T12:00:00Z" }),
      ),
    ).toEqual([]);
  });

  it("generateOverdueInstances returns [] for a soft-deleted routine", () => {
    expect(
      generateOverdueInstances(
        makeWellnessRoutine({ deleted_at: "2026-06-09T12:00:00Z" }),
      ),
    ).toEqual([]);
  });

  it("the delete marker suppresses even while is_active is still true", () => {
    const deletedButActive = makeWellnessRoutine({
      isActive: true,
      deletedAt: "2026-06-09T12:00:00Z",
    });
    expect(generateOverdueInstances(deletedButActive)).toEqual([]);
    expect(generateRemindersFromRoutine(deletedButActive)).toEqual([]);
  });
});

describe("buildOverdueReminders excludes soft-deleted routines", () => {
  const emptyIndex = {
    wellnessKeys: new Set(),
    maxWeightDate: null,
    maxPhotoDateByArea: new Map(),
    medicalKeys: new Set(),
  };

  it("drops a soft-deleted routine's overdue instances from the Today list", () => {
    const live = makeWellnessRoutine({ id: "live", petId: "42" });
    const deleted = makeWellnessRoutine({
      id: "dead",
      petId: "42",
      deletedAt: "2026-06-09T12:00:00Z",
    });

    const overdue = buildOverdueReminders({
      routines: [live, deleted],
      vetReminders: [],
      index: emptyIndex,
      now: NOW,
      petId: "42",
    });

    expect(overdue.length).toBeGreaterThan(0);
    expect(overdue.every((r) => r.routineId === "live")).toBe(true);
    expect(overdue.some((r) => r.routineId === "dead")).toBe(false);
  });
});
