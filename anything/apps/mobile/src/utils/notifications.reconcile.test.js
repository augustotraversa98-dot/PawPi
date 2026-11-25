// Flow audit F1-01: OS notifications for routine reminders are scheduled with a DETERMINISTIC id
// (the reminder's own id) so a relaunch replaces instead of duplicating, and a sweep removes legacy
// random-id duplicates and orphans left behind by deleted/paused/edited routines.

const mockPending = [];
jest.mock("expo-notifications", () => ({
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: jest.fn(async () => ({ status: "granted" })),
  requestPermissionsAsync: jest.fn(async () => ({ status: "granted" })),
  scheduleNotificationAsync: jest.fn(async (req) => {
    const identifier = req.identifier || `random-${Math.random()}`;
    // Same identifier REPLACES the pending request (iOS/Android behaviour).
    const i = mockPending.findIndex((p) => p.identifier === identifier);
    const entry = { identifier, content: req.content, trigger: req.trigger };
    if (i >= 0) mockPending[i] = entry;
    else mockPending.push(entry);
    return identifier;
  }),
  getAllScheduledNotificationsAsync: jest.fn(async () => mockPending.slice()),
  cancelScheduledNotificationAsync: jest.fn(async (id) => {
    const i = mockPending.findIndex((p) => p.identifier === id);
    if (i >= 0) mockPending.splice(i, 1);
  }),
  AndroidNotificationPriority: { HIGH: "high", DEFAULT: "default" },
  SchedulableTriggerInputTypes: { DATE: "date" },
}));

import {
  scheduleReminderNotification,
  selectStaleRoutineNotifications,
  selectAlarmsToCancel,
  reconcileRoutineNotifications,
} from "./notifications";

const HOUR = 3600 * 1000;
const mk = (id, petId = 1) => ({
  id,
  petId,
  type: "feeding",
  title: "Breakfast",
  nextTriggerAt: new Date(Date.now() + 2 * HOUR).toISOString(),
});

beforeEach(() => {
  mockPending.length = 0;
});

describe("deterministic scheduling", () => {
  it("uses the reminder id as the OS identifier and records the pet", async () => {
    const id = await scheduleReminderNotification(mk("reminder_5_0_2026-10-20"));
    expect(id).toBe("reminder_5_0_2026-10-20");
    expect(mockPending[0].content.data.petId).toBe(1);
  });

  it("arming the same window twice (an app relaunch) leaves ONE notification per reminder", async () => {
    const window = [mk("reminder_5_0_2026-10-20"), mk("reminder_5_0_2026-10-21")];
    for (const r of window) await scheduleReminderNotification(r);
    for (const r of window) await scheduleReminderNotification(r); // relaunch
    expect(mockPending).toHaveLength(2);
  });
});

describe("selectStaleRoutineNotifications", () => {
  const pend = (identifier, reminderId, petId) => ({ identifier, content: { data: { reminderId, petId } } });

  it("selects legacy random-id duplicates of routine instances", () => {
    const stale = selectStaleRoutineNotifications(
      [pend("UUID-1", "reminder_5_0_d1", undefined), pend("reminder_5_0_d2", "reminder_5_0_d2", 1)],
      { petId: 1, validReminderIds: new Set(["reminder_5_0_d1", "reminder_5_0_d2"]) },
    );
    expect(stale).toEqual(["UUID-1"]);
  });

  it("selects orphans for THIS pet whose reminder is no longer generated (deleted/paused routine)", () => {
    const stale = selectStaleRoutineNotifications(
      [pend("reminder_9_0_d1", "reminder_9_0_d1", 1), pend("reminder_5_0_d1", "reminder_5_0_d1", 1)],
      { petId: 1, validReminderIds: new Set(["reminder_5_0_d1"]) },
    );
    expect(stale).toEqual(["reminder_9_0_d1"]);
  });

  it("never touches another pet's, un-tagged, or non-routine notifications", () => {
    const stale = selectStaleRoutineNotifications(
      [
        pend("reminder_7_0_d1", "reminder_7_0_d1", 2), // other pet
        pend("reminder_8_0_d1", "reminder_8_0_d1", undefined), // legacy, same id => can't know the pet
        pend("telehealth_1", "telehealth_1", 1), // not a routine instance
        { identifier: "x", content: { data: {} } },
      ],
      { petId: 1, validReminderIds: new Set() },
    );
    expect(stale).toEqual([]);
  });
});

describe("reconcileRoutineNotifications", () => {
  it("after a pause/delete, no pending notification remains for that routine (even after a restart)", async () => {
    // Launch 1 (older build, random ids) armed a duplicate; launch 2 armed the deterministic one.
    mockPending.push({ identifier: "LEGACY-A", content: { data: { reminderId: "reminder_5_0_d1", petId: 1 } } });
    await scheduleReminderNotification(mk("reminder_5_0_d1"));
    await scheduleReminderNotification(mk("reminder_6_0_d1")); // routine 6 is then deleted elsewhere
    const removed = await reconcileRoutineNotifications({ petId: 1, validReminderIds: new Set(["reminder_5_0_d1"]) });
    expect(removed).toBe(2);
    expect(mockPending.map((p) => p.identifier)).toEqual(["reminder_5_0_d1"]);
  });
});

describe("selectAlarmsToCancel (the one cancellation rule)", () => {
  const pend = (identifier, data) => ({ identifier, content: { data } });
  const routine = (rid, petId, identifier = rid) => pend(identifier, { reminderId: rid, petId });
  const pending = [
    routine("reminder_5_0_d1", 7), // lost / scoped dog
    routine("reminder_5_0_d2", "7"), // petId may arrive as a string
    pend("streak-uuid", { category: "streak", petId: 7 }),
    pend("nudge-uuid", { nudge: "reminder_setup", petId: 7 }),
    routine("reminder_9_0_d1", 1), // the OTHER dog
    pend("pawpi-daily-return", { kind: "daily_return" }),
    pend("telehealth_3_1", { reminderId: "telehealth_3_1", petId: null }),
  ];

  it("a lost pet: every alarm tagged with that dog, whatever its kind; nothing else", () => {
    expect(selectAlarmsToCancel(pending, { lostPetIds: [7] })).toEqual([
      "reminder_5_0_d1",
      "reminder_5_0_d2",
      "streak-uuid",
      "nudge-uuid",
    ]);
  });

  it("a deleted routine: only that routine's instances of the scoped dog", () => {
    const list = [routine("reminder_5_0_d1", 7), routine("reminder_6_0_d1", 7), routine("reminder_9_0_d1", 1)];
    expect(
      selectAlarmsToCancel(list, { validIds: ["reminder_5_0_d1"], scopePetIds: [7] }),
    ).toEqual(["reminder_6_0_d1"]);
  });

  it("the LAST routine removed (no valid id at all) still cancels the dog's alarms, and only the dog's", () => {
    expect(selectAlarmsToCancel(pending, { validIds: new Set(), scopePetIds: ["7"] })).toEqual([
      "reminder_5_0_d1",
      "reminder_5_0_d2",
    ]);
  });

  it("another dog is untouched when it is not in scope, even with an empty valid set", () => {
    expect(selectAlarmsToCancel([routine("reminder_9_0_d1", 1)], { validIds: [], scopePetIds: [7] })).toEqual([]);
    expect(selectAlarmsToCancel([routine("reminder_9_0_d1", 1)], { validIds: [] })).toEqual([]);
  });

  it("legacy ids: a random-id duplicate is cancelled by a load sweep and by its known reminder id", () => {
    const legacy = [
      routine("reminder_5_0_d1", undefined, "UUID-OLD"), // old build: random id, no petId
      routine("reminder_8_0_d1", undefined), // deterministic id, no petId: the pet is unknown
    ];
    expect(selectAlarmsToCancel(legacy, { validIds: ["reminder_5_0_d1"], scopePetIds: [7] })).toEqual(["UUID-OLD"]);
    expect(selectAlarmsToCancel(legacy, { lostPetIds: [7], resolvedKeys: ["reminder_5_0_d1"] })).toEqual(["UUID-OLD"]);
    expect(selectAlarmsToCancel(legacy, { lostPetIds: [7] })).toEqual([]);
  });

  it("resolved keys cancel exactly those instances", () => {
    expect(selectAlarmsToCancel(pending, { resolvedKeys: new Set(["reminder_9_0_d1"]) })).toEqual(["reminder_9_0_d1"]);
  });

  it("no criteria cancels nothing; junk is ignored", () => {
    expect(selectAlarmsToCancel(pending)).toEqual([]);
    expect(selectAlarmsToCancel(undefined, { lostPetIds: [7] })).toEqual([]);
    expect(selectAlarmsToCancel([null, {}], { lostPetIds: [7] })).toEqual([]);
  });
});

describe("reconcileRoutineNotifications with no reminder left", () => {
  it("cancels the dog's orphan alarms and keeps the other dog's", async () => {
    await scheduleReminderNotification(mk("reminder_5_0_d1", 1));
    await scheduleReminderNotification(mk("reminder_9_0_d1", 2));
    await expect(reconcileRoutineNotifications({ petId: 1, validReminderIds: new Set() })).resolves.toBe(1);
    expect(mockPending.map((p) => p.identifier)).toEqual(["reminder_9_0_d1"]);
  });
});
