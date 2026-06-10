// buildTodayProgress — pinned against the captured real-shape payload
// (src/utils/__fixtures__/todayOverdueRealShape.json, PR #42) run through the
// real store transform, so the counts are derived from the exact rows the API
// returns. Times: jest.tz.setup.js pins the suite to Europe/Rome (the fixture
// was captured on a UTC+2 device).
//
// Fixture schedule for pet 2 on 2026-06-10 (local):
//   meals    11:35 (routine 8) + 23:40 (routine 2)        → Meals total 2
//   meds     17:34 daily medication (routine 7)            → Meds  total 1
//   wellness 21:12 general + 21:10 mobility (routine 6)    → Wellness total 2
// The walk routine (10:30 + 23:00) belongs to pet 3 — a pet-scoping pin.
// fixture.medicalLogs holds a morning "given" (11:32 local) that must NOT
// count for the 17:34 dose (per-instance resolution, the #42 rule).

jest.mock("@/utils/notifications", () => ({
  scheduleReminderNotification: jest.fn(async () => null),
  cancelNotification: jest.fn(async () => {}),
}));

import useRoutinesStore from "@/store/routinesStore";
import { buildResolutionIndex } from "@/utils/reminderResolution";
import { buildTodayProgress } from "@/utils/todayProgress";
import fixture from "./__fixtures__/todayOverdueRealShape.json";

const AFTERNOON = new Date("2026-06-10T17:51:00+02:00");

// Today's wellness instance ids (dateStr embeds the UTC date of local midnight
// — one day behind the local day on a UTC+2 device; see reminderGenerator.js).
const WELLNESS_GENERAL_TODAY = "reminder_6_general_0_2026-06-09";
const MED_ID = "reminder_7_mc_1781032258166_dmcnka_2026-06-09_0";

async function loadStoreFromFixture() {
  global.fetch = jest.fn(async () => ({
    ok: true,
    json: async () => ({ routines: fixture.routines }),
  }));
  await useRoutinesStore.getState().loadRoutines();
  return useRoutinesStore.getState().routines;
}

const realIndex = () =>
  buildResolutionIndex({
    wellnessLogs: fixture.wellnessLogs,
    weightLogs: fixture.weightLogs,
    medicalLogs: fixture.medicalLogs,
    photoChecks: fixture.photoChecks,
  });

const realDismissedKeys = () =>
  new Set(fixture.dismissals.map((d) => d.instance_key));

const FOOD_LOG_TODAY = { logged_at: "2026-06-10T09:36:00+00:00" }; // 11:36 local
const FOOD_LOG_YESTERDAY = { logged_at: "2026-06-09T09:36:00+00:00" };
const WALK_LOG_TODAY = { start_time: "2026-06-10T08:40:00+00:00" };

const VET_ROWS = [
  { id: 1, status: "scheduled", appointment_date: "2026-06-10" },
  { id: 2, status: "completed", appointment_date: "2026-06-10" },
  { id: 3, status: "cancelled", appointment_date: "2026-06-10" },
  { id: 4, status: "scheduled", appointment_date: "2026-06-11" }, // tomorrow
];

const progressFor = (routines, overrides = {}) =>
  buildTodayProgress({
    instances: [],
    routines,
    petId: 2,
    index: realIndex(),
    dismissedKeys: realDismissedKeys(),
    now: AFTERNOON,
    ...overrides,
  });

const byKey = (progress, key) =>
  progress.categories.find((c) => c.key === key);

describe("buildTodayProgress — real-shape fixture", () => {
  it("counts every category scheduled today, in display order, scoped to the pet", async () => {
    const routines = await loadStoreFromFixture();
    const progress = progressFor(routines, {
      foodLogs: [FOOD_LOG_TODAY, FOOD_LOG_YESTERDAY],
      vetAppointments: VET_ROWS,
      overdue: [{ id: MED_ID }],
    });

    expect(progress.categories.map((c) => c.key)).toEqual([
      "meals",
      "meds",
      "wellness",
      "vet",
    ]);
    expect(byKey(progress, "meals")).toMatchObject({ done: 1, total: 2 }); // yesterday's log doesn't count
    expect(byKey(progress, "meds")).toMatchObject({ done: 0, total: 1 }); // morning log ≠ the 17:34 dose (per-instance, #42)
    expect(byKey(progress, "wellness")).toMatchObject({ done: 0, total: 2 }); // Jun 9's log resolves Jun 9, not today
    expect(byKey(progress, "vet")).toMatchObject({ done: 1, total: 2 }); // cancelled + tomorrow out
    expect(progress.overdueCount).toBe(1); // passthrough of the section list
  });

  it("walks belong to pet 3 only — the same data scoped to pet 3 yields just Walks", async () => {
    const routines = await loadStoreFromFixture();
    const pet2 = progressFor(routines);
    expect(byKey(pet2, "walks")).toBeUndefined();

    const pet3 = progressFor(routines, {
      petId: 3,
      walkLogs: [WALK_LOG_TODAY],
    });
    expect(pet3.categories.map((c) => c.key)).toEqual(["walks"]);
    expect(byKey(pet3, "walks")).toMatchObject({ done: 1, total: 2 }); // 10:30 + 23:00
  });

  it("a log at the instance's exact scheduledAt marks the med done (1/1)", async () => {
    const routines = await loadStoreFromFixture();
    const progress = progressFor(routines, {
      index: buildResolutionIndex({
        wellnessLogs: fixture.wellnessLogs,
        medicalLogs: [
          ...fixture.medicalLogs,
          {
            routine_id: 7,
            medical_care_item_id: "mc_1781032258166_dmcnka",
            given_at: "2026-06-10T15:34:00+00:00", // = 17:34 local, the instance
          },
        ],
      }),
    });
    expect(byKey(progress, "meds")).toMatchObject({ done: 1, total: 1 });
  });

  it("dismissed leaves the denominator — skipping the only med drops the category", async () => {
    const routines = await loadStoreFromFixture();
    const progress = progressFor(routines, {
      dismissedKeys: new Set([...realDismissedKeys(), MED_ID]),
    });
    expect(byKey(progress, "meds")).toBeUndefined();
  });

  it("a snoozed instance counts as scheduled-but-NOT-done", async () => {
    const routines = await loadStoreFromFixture();
    // The store copy of today's general check, snoozed (PR #43 sets status).
    const snoozedCopy = {
      id: WELLNESS_GENERAL_TODAY,
      routineId: "6",
      petId: "2",
      type: "wellness_check",
      status: "snoozed",
      scheduledAt: new Date("2026-06-10T21:12:00+02:00").toISOString(),
    };
    const progress = progressFor(routines, { instances: [snoozedCopy] });
    expect(byKey(progress, "wellness")).toMatchObject({ done: 0, total: 2 });
  });

  it("an in-session completed store copy counts done before the DB refetch lands", async () => {
    const routines = await loadStoreFromFixture();
    const completedCopy = {
      id: WELLNESS_GENERAL_TODAY,
      routineId: "6",
      petId: "2",
      type: "wellness_check",
      status: "completed",
      scheduledAt: new Date("2026-06-10T21:12:00+02:00").toISOString(),
    };
    const progress = progressFor(routines, { instances: [completedCopy] });
    expect(byKey(progress, "wellness")).toMatchObject({ done: 1, total: 2 });
  });

  it("caps the food-log count at the scheduled total (manual extra logs can't exceed it)", async () => {
    const routines = await loadStoreFromFixture();
    const progress = progressFor(routines, {
      foodLogs: [
        FOOD_LOG_TODAY,
        { logged_at: "2026-06-10T11:00:00+00:00" },
        { logged_at: "2026-06-10T12:00:00+00:00" },
      ],
    });
    expect(byKey(progress, "meals")).toMatchObject({ done: 2, total: 2 });
  });

  it("EMPTY STATE: nothing scheduled today → no categories, never sample numbers", () => {
    const progress = buildTodayProgress({
      instances: [],
      routines: [],
      petId: 2,
      index: buildResolutionIndex({}),
      now: AFTERNOON,
    });
    expect(progress.categories).toEqual([]);
    expect(progress.overdueCount).toBe(0);
  });
});
