// Real-shape regression — the Today/Overdue pipeline run end-to-end against the
// CAPTURED runtime payload (src/utils/__fixtures__/todayOverdueRealShape.json):
// the actual GET /api/routines rows (snake_case SELECT *), the actual resolver
// rows (wellness/medical logs, photo checks, weight logs) and the actual
// dismissal rows, pulled from the live DB on 2026-06-10. Guards the gap that
// hand-written fixtures can't: field names/types as the API really returns them.
//
// The class of bug this pins (the "Overdue never appears" forensic, 2026-06-10):
// generateOverdueInstances DID emit from the real shape, but day-level medical
// resolution matching let a morning "given" log resolve the same item's evening
// dose, so a passed instance was born-resolved — dropped from Overdue AND from
// every other section (sectionTodayReminders homes past-due persistent types in
// Overdue exclusively). These tests run the real store transform
// (routinesStore.loadRoutines with fetch mocked to the captured payload) so a
// transform-layer shape regression also fails here.
//
// Times: the fixture was captured on a UTC+2 device; jest.tz.setup.js pins the
// suite to Europe/Rome so the local-calendar math reproduces identically on CI.

jest.mock("@/utils/notifications", () => ({
  scheduleReminderNotification: jest.fn(async () => null),
  cancelNotification: jest.fn(async () => {}),
  resolveReminderTiming: jest.fn(() => null),
}));

import useRoutinesStore from "@/store/routinesStore";
import {
  buildResolutionIndex,
  buildOverdueReminders,
} from "@/utils/reminderResolution";
import { sectionTodayReminders } from "@/utils/reminderSections";
import { generateOverdueInstances } from "@/utils/reminderGenerator";
import fixture from "./__fixtures__/todayOverdueRealShape.json";

const PET_ID = 2;
// The afternoon of the capture: the medication instance (17:34 local) has passed.
const AFTERNOON = new Date("2026-06-10T17:51:00+02:00");
// That evening: the two wellness checks (21:10 / 21:12 local) have passed too.
const EVENING = new Date("2026-06-10T21:15:00+02:00");

// Instance ids from the real data (dateStr embeds the UTC date of local
// midnight — one day behind the local day on a UTC+2 device; see the id
// convention note in reminderGenerator.js).
const MED_ID = "reminder_7_mc_1781032258166_dmcnka_2026-06-09_0";
const WELLNESS_GENERAL_TODAY = "reminder_6_general_0_2026-06-09";
const WELLNESS_MOBILITY_TODAY = "reminder_6_mobility_1_2026-06-09";

async function loadStoreFromFixture() {
  global.fetch = jest.fn(async () => ({
    ok: true,
    json: async () => ({
      routines: fixture.routines.filter((r) => r.pet_id === PET_ID),
    }),
  }));
  await useRoutinesStore.getState().loadRoutines(PET_ID);
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

const reconcile = (routines, now, overrides = {}) =>
  buildOverdueReminders({
    routines,
    vetReminders: [],
    index: realIndex(),
    dismissedKeys: realDismissedKeys(),
    now,
    lookbackDays: 30,
    petId: PET_ID,
    ...overrides,
  });

it("suite timezone is pinned to UTC+2 (jest.tz.setup.js) — fixture math depends on it", () => {
  expect(new Date(2026, 5, 10).getTimezoneOffset()).toBe(-120);
});

describe("store transform — real GET /api/routines payload", () => {
  it("yields the persistent routines with their item arrays and createdAt", async () => {
    const routines = await loadStoreFromFixture();

    const wellness = routines.find((r) => r.id === "6");
    expect(wellness.type).toBe("wellness_check");
    expect(wellness.isActive).toBe(true);
    expect(wellness.notificationEnabled).toBe(true);
    expect(Array.isArray(wellness.wellnessCheckItems)).toBe(true);
    expect(wellness.wellnessCheckItems).toHaveLength(2);
    expect(Number.isNaN(new Date(wellness.createdAt).getTime())).toBe(false);

    const medical = routines.find((r) => r.id === "7");
    expect(medical.type).toBe("medical_care");
    expect(medical.medicalCareItems).toHaveLength(1);
    // Real item shape quirks the generator must tolerate: empty-string dates.
    expect(medical.medicalCareItems[0].endDate).toBe("");
    expect(medical.medicalCareItems[0].nextDue).toBe("");
    expect(medical.medicalCareItems[0].times).toEqual(["17:34"]);
  });
});

describe("generateOverdueInstances — emits from the real refetched shape", () => {
  it("emits the passed medication dose with the deterministic id", async () => {
    const routines = await loadStoreFromFixture();
    const medical = routines.find((r) => r.id === "7");
    const out = generateOverdueInstances(medical, {
      lookbackDays: 30,
      now: AFTERNOON,
    });
    expect(out.map((r) => r.id)).toEqual([MED_ID]);
    expect(new Date(out[0].scheduledAt).getTime()).toBe(
      new Date("2026-06-10T17:34:00+02:00").getTime(),
    );
  });

  it("emits both wellness checks once their times pass", async () => {
    const routines = await loadStoreFromFixture();
    const wellness = routines.find((r) => r.id === "6");
    const ids = generateOverdueInstances(wellness, {
      lookbackDays: 30,
      now: EVENING,
    }).map((r) => r.id);
    expect(ids).toContain(WELLNESS_GENERAL_TODAY);
    expect(ids).toContain(WELLNESS_MOBILITY_TODAY);
  });
});

describe("reconciliation — the born-resolved bug stays dead", () => {
  it("a dose that passed its time appears in Overdue even though an EARLIER same-day log exists", async () => {
    // fixture.medicalLogs[0] is the real morning 'given' log (11:32 local) for
    // the same item. Under day-level matching it resolved the 17:34 instance
    // before it ever existed — the forensic root cause. Per-instance matching
    // must keep the missed dose visible.
    const routines = await loadStoreFromFixture();
    const overdue = reconcile(routines, AFTERNOON);
    expect(overdue.map((r) => r.id)).toEqual([MED_ID]);
  });

  it("exact-instance resolution still clears: a log at the instance's own scheduledAt removes it", async () => {
    const routines = await loadStoreFromFixture();
    const overdue = reconcile(routines, AFTERNOON, {
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
    expect(overdue.find((r) => r.id === MED_ID)).toBeUndefined();
  });

  it("wellness instances resolved by their exact log / dismissed by stored keys stay hidden", async () => {
    // Jun 9's general check was logged (values_json.scheduledDate 2026-06-09)
    // and the real dismissal rows cover the older phantom keys — none of them
    // may resurface alongside the legitimately-overdue medication.
    const routines = await loadStoreFromFixture();
    const ids = reconcile(routines, AFTERNOON).map((r) => r.id);
    expect(ids).toEqual([MED_ID]);
  });

  it("by evening the two passed wellness checks join Overdue (render condition data: count > 0)", async () => {
    const routines = await loadStoreFromFixture();
    const ids = reconcile(routines, EVENING).map((r) => r.id);
    expect(ids).toHaveLength(3);
    expect(ids).toEqual(
      expect.arrayContaining([
        MED_ID,
        WELLNESS_GENERAL_TODAY,
        WELLNESS_MOBILITY_TODAY,
      ]),
    );
  });

  it("dismissing the instance id still clears it durably", async () => {
    const routines = await loadStoreFromFixture();
    const overdue = reconcile(routines, AFTERNOON, {
      dismissedKeys: new Set([...realDismissedKeys(), MED_ID]),
    });
    expect(overdue).toEqual([]);
  });
});

describe("snooze against the real shape — Snoozed is the single home while active", () => {
  it("an active snooze (store map) pulls the passed dose out of Overdue and into Snoozed", async () => {
    const routines = await loadStoreFromFixture();
    const snoozes = { [MED_ID]: "2026-06-10T18:30:00+02:00" }; // active at 17:51

    const overdue = reconcile(routines, AFTERNOON, { snoozes });
    expect(overdue).toEqual([]);

    const storeCard = {
      id: MED_ID,
      routineId: "7",
      petId: "2",
      type: "medical_care",
      timeSensitive: true,
      status: "upcoming",
      scheduledAt: "2026-06-10T15:34:00.000Z",
      nextTriggerAt: "2026-06-10T15:34:00.000Z",
    };
    const { dueSoon, nextUp, snoozed } = sectionTodayReminders({
      reminders: [storeCard],
      overdueIds: new Set(),
      now: AFTERNOON,
      snoozes,
    });
    expect(snoozed.map((r) => r.id)).toEqual([MED_ID]);
    expect(dueSoon).toEqual([]);
    expect(nextUp).toEqual([]);
  });

  it("once the snooze elapses the unresolved dose returns to Overdue", async () => {
    const routines = await loadStoreFromFixture();
    const snoozes = { [MED_ID]: "2026-06-10T18:30:00+02:00" }; // over by 21:15
    const ids = reconcile(routines, EVENING, { snoozes }).map((r) => r.id);
    expect(ids).toContain(MED_ID);
  });
});

describe("sectioning — Overdue is the single home for past-due persistent items", () => {
  it("the passed dose is in Overdue and in NO other section (the old 'disappears entirely' shape)", async () => {
    const routines = await loadStoreFromFixture();
    const overdue = reconcile(routines, AFTERNOON);
    const overdueIds = new Set(overdue.map((r) => r.id));

    // The store-resident card for the same instance, as generated before its
    // time passed (future generator shape).
    const storeCard = {
      id: MED_ID,
      routineId: "7",
      petId: "2",
      type: "medical_care",
      timeSensitive: true,
      status: "upcoming",
      scheduledAt: "2026-06-10T15:34:00.000Z",
      nextTriggerAt: "2026-06-10T15:34:00.000Z",
    };
    const { dueSoon, nextUp } = sectionTodayReminders({
      reminders: [storeCard],
      overdueIds,
      now: AFTERNOON,
    });
    expect(overdueIds.has(MED_ID)).toBe(true);
    expect(dueSoon).toEqual([]);
    expect(nextUp).toEqual([]);
  });
});
