// Night run #2 flow audit F1 — regression tests for the routine/reminder store fixes:
//  F1-04  pausing/resuming a wellness routine must NOT wipe its items (wrong field fallback);
//  F1-07  completing/skipping a reminder cancels its pending OS alert (by deterministic id);
//  F1-01  removing future reminders cancels by reminder id even when the in-memory notification id
//         is gone (state restored after an app restart).

jest.mock("expo-notifications", () => ({
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: jest.fn(async () => ({ status: "granted" })),
  requestPermissionsAsync: jest.fn(async () => ({ status: "granted" })),
  scheduleNotificationAsync: jest.fn(async () => "n"),
  cancelScheduledNotificationAsync: jest.fn(async () => {}),
  getAllScheduledNotificationsAsync: jest.fn(async () => []),
  AndroidNotificationPriority: { HIGH: "high", DEFAULT: "default" },
}));

jest.mock("@/utils/notifications", () => {
  const actual = jest.requireActual("@/utils/notifications");
  return {
    __esModule: true,
    ...actual,
    scheduleReminderNotification: jest.fn(async (r) => r.id),
    cancelNotification: jest.fn(async () => {}),
    reconcileRoutineNotifications: jest.fn(async () => 0),
  };
});

jest.mock("./socialPetStore", () => ({
  __esModule: true,
  default: { getState: () => ({ notifications: [], markNotificationRead: jest.fn() }) },
}));

import useRemindersStore from "./remindersStore";
import useRoutinesStore from "./routinesStore";
import { cancelNotification } from "@/utils/notifications";

const wellnessItems = [
  { checkType: "general", frequency: "daily", preferredTime: "20:00", reminderEnabled: true },
  { checkType: "mobility", frequency: "daily", preferredTime: "20:10", reminderEnabled: true },
];

const appWellness = {
  id: "100",
  petId: "2",
  type: "wellness_check",
  isActive: true,
  title: "Wellness",
  description: "",
  wellnessCheckItems: wellnessItems,
  frequency: "daily",
  times: ["20:00"],
  days: [],
  notificationEnabled: true,
  timeSensitive: false,
};

const dbRow = (isActive) => ({
  id: 100,
  pet_id: 2,
  routine_type: "wellness_check",
  is_active: isActive,
  title: "Wellness",
  wellness_check_schedule: wellnessItems,
  frequency: "daily",
  times: ["20:00"],
  days: [],
  notification_enabled: true,
  time_sensitive: false,
});

beforeEach(() => {
  useRemindersStore.setState({ reminders: [], snoozes: {} });
  useRoutinesStore.setState({ routines: [appWellness], initialized: true });
  cancelNotification.mockClear();
});

describe("F1-04 — pausing a wellness routine keeps its items", () => {
  it("toggleRoutineActive sends the existing items in the PUT body (not [])", async () => {
    let putBody;
    global.fetch = jest.fn(async (url, opts) => {
      putBody = JSON.parse(opts.body);
      return { ok: true, json: async () => ({ routine: dbRow(false) }) };
    });
    await useRoutinesStore.getState().toggleRoutineActive("100");
    expect(putBody.isActive).toBe(false);
    expect(putBody.wellnessCheckSchedule).toHaveLength(2);
    expect(putBody.wellnessCheckSchedule.map((i) => i.checkType)).toEqual(["general", "mobility"]);
  });
});

describe("F1-07 / F1-01 — cancelling OS alerts", () => {
  const reminder = (over = {}) => ({
    id: "reminder_100_general_0_2099-01-01",
    routineId: "100",
    status: "upcoming",
    scheduledAt: new Date(Date.now() + 86400000).toISOString(),
    nextTriggerAt: new Date(Date.now() + 86400000).toISOString(),
    ...over,
  });

  it("completeReminder cancels the pending alert by the reminder id", () => {
    useRemindersStore.setState({ reminders: [reminder()] });
    useRemindersStore.getState().completeReminder("reminder_100_general_0_2099-01-01");
    expect(cancelNotification).toHaveBeenCalledWith("reminder_100_general_0_2099-01-01");
  });

  it("prefers the stored OS id when there is one", () => {
    useRemindersStore.setState({ reminders: [reminder({ scheduledNotificationId: "OS-9" })] });
    useRemindersStore.getState().completeReminder("reminder_100_general_0_2099-01-01");
    expect(cancelNotification).toHaveBeenCalledWith("OS-9");
  });

  it("removing a routine's future reminders cancels by id even with no stored notification id (post-restart)", async () => {
    useRemindersStore.setState({
      reminders: [reminder(), reminder({ id: "reminder_100_general_0_2099-01-02" })],
    });
    await useRemindersStore.getState().removeFutureRemindersByRoutine("100");
    expect(cancelNotification).toHaveBeenCalledWith("reminder_100_general_0_2099-01-01");
    expect(cancelNotification).toHaveBeenCalledWith("reminder_100_general_0_2099-01-02");
    expect(useRemindersStore.getState().reminders).toHaveLength(0);
  });

  it("disabling (pause) cancels by id as well", async () => {
    useRemindersStore.setState({ reminders: [reminder()] });
    await useRemindersStore.getState().disableFutureRemindersByRoutine("100");
    expect(cancelNotification).toHaveBeenCalledWith("reminder_100_general_0_2099-01-01");
  });
});
