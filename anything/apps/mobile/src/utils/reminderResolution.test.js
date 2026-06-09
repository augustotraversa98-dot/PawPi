import {
  buildResolutionIndex,
  isInstanceResolved,
  selectOverdueReminders,
  buildOverdueReminders,
  instanceKey,
  PERSISTENT_TYPES,
} from "./reminderResolution";
import { toDateStr } from "./wellnessLog";
import { ROUTINE_TYPES } from "../data/routinesData";

// Pure tests for the resolution layer — "is this scheduled instance already done?"
// and the Overdue selection. No React, no fetch: feed it rows + reminders, read the
// verdict. Local-noon timestamps keep toDateStr stable across timezones.

const at = (y, m, d, h = 12) => new Date(y, m, d, h, 0, 0).toISOString();

describe("buildResolutionIndex + isInstanceResolved — wellness (exact linkage)", () => {
  const index = buildResolutionIndex({
    wellnessLogs: [
      {
        routine_id: 100,
        wellness_check_item_index: 0,
        values_json: { scheduledDate: "2026-06-03", bodyCondition: "ideal" },
      },
    ],
  });

  it("resolves on exact routine_id + item_index + scheduledDate match", () => {
    const reminder = {
      type: "wellness_check",
      checkType: "body_condition",
      routineId: 100,
      wellnessCheckItemIndex: 0,
      scheduledAt: at(2026, 5, 3, 9),
    };
    expect(isInstanceResolved(reminder, index)).toBe(true);
  });

  it("does NOT resolve a different scheduled day for the same item", () => {
    const reminder = {
      type: "wellness_check",
      checkType: "body_condition",
      routineId: 100,
      wellnessCheckItemIndex: 0,
      scheduledAt: at(2026, 5, 10, 9),
    };
    expect(isInstanceResolved(reminder, index)).toBe(false);
  });
});

describe("isInstanceResolved — weight (date heuristic)", () => {
  const reminder = {
    type: "wellness_check",
    checkType: "weight",
    scheduledAt: at(2026, 5, 3, 9),
  };

  it("resolves when a weight log is dated ON OR AFTER the scheduled date", () => {
    const index = buildResolutionIndex({
      weightLogs: [{ logged_at: at(2026, 5, 5) }],
    });
    expect(isInstanceResolved(reminder, index)).toBe(true);
  });

  it("does NOT resolve when the only weight log predates the scheduled date", () => {
    // Explicit requirement: yesterday's weigh-in must not suppress today's check.
    const index = buildResolutionIndex({
      weightLogs: [{ logged_at: at(2026, 5, 1) }],
    });
    expect(isInstanceResolved(reminder, index)).toBe(false);
  });
});

describe("isInstanceResolved — photo check (per-area date heuristic)", () => {
  const reminder = {
    type: "photo_check",
    relatedBodyArea: "paws",
    scheduledAt: at(2026, 5, 3, 10),
  };

  it("resolves when a same-area photo is dated on/after the scheduled date", () => {
    const index = buildResolutionIndex({
      photoChecks: [{ body_area: "paws", created_at: at(2026, 5, 4) }],
    });
    expect(isInstanceResolved(reminder, index)).toBe(true);
  });

  it("does NOT resolve from a photo of a different body area", () => {
    const index = buildResolutionIndex({
      photoChecks: [{ body_area: "ears", created_at: at(2026, 5, 4) }],
    });
    expect(isInstanceResolved(reminder, index)).toBe(false);
  });
});

describe("isInstanceResolved — medical care (exact day)", () => {
  const reminder = {
    type: "medical_care",
    routineId: 100,
    medicalCareItemId: "med1",
    scheduledAt: at(2026, 5, 3, 8),
  };

  it("resolves when a dose was given ON the scheduled day", () => {
    const index = buildResolutionIndex({
      medicalLogs: [
        { routine_id: 100, medical_care_item_id: "med1", given_at: at(2026, 5, 3) },
      ],
    });
    expect(isInstanceResolved(reminder, index)).toBe(true);
  });

  it("does NOT resolve from a dose given on a DIFFERENT day (missed doses stay)", () => {
    const index = buildResolutionIndex({
      medicalLogs: [
        { routine_id: 100, medical_care_item_id: "med1", given_at: at(2026, 5, 4) },
      ],
    });
    expect(isInstanceResolved(reminder, index)).toBe(false);
  });
});

describe("selectOverdueReminders", () => {
  const NOW = new Date(2026, 5, 10, 8, 0, 0);

  const pastWellness = {
    id: "remA",
    type: "wellness_check",
    checkType: "body_condition",
    routineId: 100,
    wellnessCheckItemIndex: 0,
    scheduledAt: at(2026, 5, 3, 9),
  };
  const futureWellness = {
    id: "remB",
    type: "wellness_check",
    checkType: "body_condition",
    scheduledAt: at(2026, 5, 11, 9),
  };
  const pastFeeding = {
    id: "remC",
    type: "feeding",
    scheduledAt: at(2026, 5, 3, 7),
  };
  const resolvedWellness = {
    id: "remD",
    type: "wellness_check",
    checkType: "body_condition",
    routineId: 200,
    wellnessCheckItemIndex: 1,
    scheduledAt: at(2026, 5, 4, 9),
  };
  const dismissedWellness = {
    id: "remE",
    type: "wellness_check",
    checkType: "mobility",
    routineId: 300,
    wellnessCheckItemIndex: 0,
    scheduledAt: at(2026, 5, 5, 9),
  };

  const index = buildResolutionIndex({
    wellnessLogs: [
      {
        routine_id: 200,
        wellness_check_item_index: 1,
        values_json: { scheduledDate: toDateStr(resolvedWellness.scheduledAt) },
      },
    ],
  });

  it("keeps only past, persistent, unresolved, undismissed instances (deduped)", () => {
    const overdue = selectOverdueReminders({
      reminders: [
        pastWellness,
        futureWellness, // future → excluded
        pastFeeding, // non-persistent → excluded
        resolvedWellness, // logged → excluded
        dismissedWellness, // dismissed → excluded
        { ...pastWellness }, // duplicate id → deduped
      ],
      index,
      dismissedKeys: new Set(["remE"]),
      now: NOW,
    });

    expect(overdue.map((r) => r.id)).toEqual(["remA"]);
  });

  it("sorts most-recently-due first", () => {
    const older = { id: "old", type: "wellness_check", scheduledAt: at(2026, 5, 1, 9) };
    const newer = { id: "new", type: "wellness_check", scheduledAt: at(2026, 5, 8, 9) };
    const overdue = selectOverdueReminders({
      reminders: [older, newer],
      index: buildResolutionIndex({}),
      now: NOW,
    });
    expect(overdue.map((r) => r.id)).toEqual(["new", "old"]);
  });
});

describe("buildOverdueReminders — deterministic, store-independent (regression for the disappearing-medication bug)", () => {
  // Medication routine created today at 07:00 with a dose at 08:00 that has passed.
  const routine = {
    id: "100",
    petId: "42",
    isActive: true,
    notificationEnabled: true,
    type: ROUTINE_TYPES.MEDICAL_CARE,
    createdAt: new Date(2026, 5, 10, 7, 0, 0).toISOString(),
    medicalCareItems: [
      { id: "med1", type: "medication", name: "Rimadyl", times: ["08:00"] },
    ],
  };
  const t1 = new Date(2026, 5, 10, 9, 0, 0); // 09:00, dose passed
  const t2 = new Date(2026, 5, 10, 9, 30, 0); // 30 min later

  it("derives the passed dose from the routine alone — no reminders store involved", () => {
    const overdue = buildOverdueReminders({
      routines: [routine],
      index: buildResolutionIndex({}),
      now: t1,
      petId: "42",
    });
    expect(overdue).toHaveLength(1);
    expect(overdue[0].type).toBe("medical_care");
    expect(overdue[0].medicalCareItemId).toBe("med1");
  });

  it("KEEPS the instance across a recompute with UNCHANGED routines and an advanced clock", () => {
    // This is the core regression: nothing about the in-memory store or refetch
    // timing can remove it — re-deriving from the same routine yields it again.
    const first = buildOverdueReminders({
      routines: [routine],
      index: buildResolutionIndex({}),
      now: t1,
      petId: "42",
    });
    const second = buildOverdueReminders({
      routines: [routine],
      index: buildResolutionIndex({}),
      now: t2,
      petId: "42",
    });
    expect(first).toHaveLength(1);
    expect(second).toHaveLength(1);
    expect(second[0].id).toBe(first[0].id);
  });

  it("a routine created just now (dose still future) yields nothing", () => {
    const fresh = {
      ...routine,
      createdAt: t1.toISOString(),
      medicalCareItems: [
        { id: "med1", type: "medication", times: ["09:05"] }, // 5 min in the future
      ],
    };
    expect(
      buildOverdueReminders({
        routines: [fresh],
        index: buildResolutionIndex({}),
        now: t1,
        petId: "42",
      }),
    ).toEqual([]);
  });

  it("clears ONLY via an exact-day medical log", () => {
    const index = buildResolutionIndex({
      medicalLogs: [
        {
          routine_id: 100,
          medical_care_item_id: "med1",
          given_at: new Date(2026, 5, 10, 8, 0, 0).toISOString(),
        },
      ],
    });
    expect(
      buildOverdueReminders({ routines: [routine], index, now: t2, petId: "42" }),
    ).toEqual([]);
  });

  it("clears via a dismissal of the instance id", () => {
    const [item] = buildOverdueReminders({
      routines: [routine],
      index: buildResolutionIndex({}),
      now: t1,
      petId: "42",
    });
    expect(
      buildOverdueReminders({
        routines: [routine],
        index: buildResolutionIndex({}),
        dismissedKeys: new Set([item.id]),
        now: t2,
        petId: "42",
      }),
    ).toEqual([]);
  });

  it("is scoped to the active pet and includes past vet reminders", () => {
    const vet = {
      id: "vet_apt_7",
      type: "vet_appointment",
      petId: "42",
      scheduledAt: new Date(2026, 5, 9, 14, 0, 0).toISOString(),
    };
    const overdue = buildOverdueReminders({
      routines: [routine],
      vetReminders: [vet],
      index: buildResolutionIndex({}),
      now: t2,
      petId: "42",
    });
    expect(overdue.map((r) => r.type).sort()).toEqual([
      "medical_care",
      "vet_appointment",
    ]);

    // A different pet sees none of pet 42's items.
    expect(
      buildOverdueReminders({
        routines: [routine],
        vetReminders: [vet],
        index: buildResolutionIndex({}),
        now: t2,
        petId: "99",
      }),
    ).toEqual([]);
  });
});

describe("helpers", () => {
  it("instanceKey returns the reminder id", () => {
    expect(instanceKey({ id: "reminder_1_x" })).toBe("reminder_1_x");
  });

  it("PERSISTENT_TYPES covers the four carry-across-days types", () => {
    expect(PERSISTENT_TYPES.has("wellness_check")).toBe(true);
    expect(PERSISTENT_TYPES.has("medical_care")).toBe(true);
    expect(PERSISTENT_TYPES.has("photo_check")).toBe(true);
    expect(PERSISTENT_TYPES.has("vet_appointment")).toBe(true);
    expect(PERSISTENT_TYPES.has("feeding")).toBe(false);
  });
});
