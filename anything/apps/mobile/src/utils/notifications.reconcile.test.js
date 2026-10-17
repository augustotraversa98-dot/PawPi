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
