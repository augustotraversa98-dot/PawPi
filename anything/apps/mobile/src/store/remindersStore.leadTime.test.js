// Wiring: addReminderFromRoutine resolves the early-reminder lead-time off the
// source routine (in routinesStore) and passes it to scheduleReminderNotification,
// while the stored instance stays pinned to the event time. Uses the REAL
// resolveReminderTiming (pure) and a spy on scheduleReminderNotification.

jest.mock("expo-notifications", () => ({
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: jest.fn(async () => ({ status: "granted" })),
  requestPermissionsAsync: jest.fn(async () => ({ status: "granted" })),
  scheduleNotificationAsync: jest.fn(async () => "notif-id"),
  cancelScheduledNotificationAsync: jest.fn(async () => {}),
  AndroidNotificationPriority: { HIGH: "high", DEFAULT: "default" },
}));

jest.mock("@/utils/notifications", () => {
  const actual = jest.requireActual("@/utils/notifications");
  return {
    __esModule: true,
    ...actual,
    scheduleReminderNotification: jest.fn(async () => "notif-1"),
    cancelNotification: jest.fn(async () => {}),
  };
});

jest.mock("./socialPetStore", () => ({
  __esModule: true,
  default: {
    getState: () => ({ notifications: [], markNotificationRead: jest.fn() }),
  },
}));

import useRemindersStore from "./remindersStore";
import useRoutinesStore from "./routinesStore";
import { scheduleReminderNotification } from "@/utils/notifications";

const NOW = new Date(2026, 5, 10, 12, 0, 0);

const wellnessReminder = (overrides = {}) => ({
  id: "reminder_100_2026-06-12_0",
  routineId: 100,
  wellnessCheckItemIndex: 0,
  petId: "2",
  type: "wellness_check",
  title: "Body condition",
  description: "Weekly check",
  status: "upcoming",
  nextTriggerAt: new Date(NOW.getTime() + 48 * 60 * 60 * 1000).toISOString(),
  scheduledAt: new Date(NOW.getTime() + 48 * 60 * 60 * 1000).toISOString(),
  notificationEnabled: true,
  ...overrides,
});

const wellnessRoutine = (reminderTiming) => ({
  id: 100,
  type: "wellness_check",
  wellnessCheckItems: [{ reminderTiming }],
});

describe("remindersStore — early-reminder lead-time wiring", () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(NOW);
    useRemindersStore.setState({ reminders: [], snoozes: {} });
    useRoutinesStore.setState({ routines: [] });
    scheduleReminderNotification.mockClear();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("passes the wellness item's reminderTiming to scheduleReminderNotification", async () => {
    useRoutinesStore.setState({ routines: [wellnessRoutine("1h")] });
    const reminder = wellnessReminder();

    await useRemindersStore.getState().addReminderFromRoutine(reminder);

    expect(scheduleReminderNotification).toHaveBeenCalledTimes(1);
    expect(scheduleReminderNotification).toHaveBeenCalledWith(reminder, "1h");
    // Instance is stored unchanged — event time is preserved.
    const stored = useRemindersStore
      .getState()
      .reminders.find((r) => r.id === reminder.id);
    expect(stored.nextTriggerAt).toBe(reminder.nextTriggerAt);
    expect(stored.scheduledAt).toBe(reminder.scheduledAt);
  });

  it("passes null when the routine item has no reminderTiming (unchanged behavior)", async () => {
    useRoutinesStore.setState({ routines: [wellnessRoutine(undefined)] });
    const reminder = wellnessReminder();

    await useRemindersStore.getState().addReminderFromRoutine(reminder);

    expect(scheduleReminderNotification).toHaveBeenCalledWith(reminder, null);
  });

  it("passes null when the source routine is missing", async () => {
    const reminder = wellnessReminder({ routineId: 999 });

    await useRemindersStore.getState().addReminderFromRoutine(reminder);

    expect(scheduleReminderNotification).toHaveBeenCalledWith(reminder, null);
  });

  it("id-based de-dup: a second add for the same instance does not reschedule", async () => {
    useRoutinesStore.setState({ routines: [wellnessRoutine("1h")] });
    const reminder = wellnessReminder();

    await useRemindersStore.getState().addReminderFromRoutine(reminder);
    await useRemindersStore.getState().addReminderFromRoutine(reminder);

    expect(scheduleReminderNotification).toHaveBeenCalledTimes(1);
  });
});
