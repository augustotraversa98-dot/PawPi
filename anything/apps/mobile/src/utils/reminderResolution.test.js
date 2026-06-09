import {
  buildResolutionIndex,
  isInstanceResolved,
  selectOverdueReminders,
  instanceKey,
  PERSISTENT_TYPES,
} from "./reminderResolution";
import { toDateStr } from "./wellnessLog";

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
