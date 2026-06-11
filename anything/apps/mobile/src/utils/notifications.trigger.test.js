// Trigger SHAPE regression. SDK 54 (expo-notifications 0.32) rejects a bare Date
// trigger: "The `trigger` object you provided is invalid. It needs to contain a
// `type` or `channelId` entry." scheduleReminderNotification must pass a typed
// DATE trigger (type + date + channelId) — never a bare Date/number. This test
// inspects the arg handed to scheduleNotificationAsync so the bare-Date form
// can't regress.

jest.mock("expo-notifications", () => ({
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: jest.fn(async () => ({ status: "granted" })),
  requestPermissionsAsync: jest.fn(async () => ({ status: "granted" })),
  scheduleNotificationAsync: jest.fn(async () => "notif-id"),
  cancelScheduledNotificationAsync: jest.fn(async () => {}),
  AndroidNotificationPriority: { HIGH: "high", DEFAULT: "default" },
  SchedulableTriggerInputTypes: { DATE: "date" },
}));

import * as Notifications from "expo-notifications";
import { scheduleReminderNotification } from "./notifications";

const HOUR = 60 * 60 * 1000;

const futureReminder = {
  id: "reminder_feeding_0_2026-06-12",
  type: "feeding",
  title: "Breakfast",
  description: "Time for breakfast",
  nextTriggerAt: new Date(Date.now() + HOUR).toISOString(),
};

describe("scheduleReminderNotification — typed DATE trigger", () => {
  beforeEach(() => Notifications.scheduleNotificationAsync.mockClear());

  it("passes a typed DATE trigger object, not a bare Date", async () => {
    await scheduleReminderNotification(futureReminder);

    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
    const { trigger } =
      Notifications.scheduleNotificationAsync.mock.calls[0][0];

    // Object form, never a bare Date / number.
    expect(trigger).toBeInstanceOf(Object);
    expect(trigger).not.toBeInstanceOf(Date);
    expect(typeof trigger).not.toBe("number");

    expect(trigger.type).toBe(Notifications.SchedulableTriggerInputTypes.DATE);
    expect(trigger.date).toBeInstanceOf(Date);
    // channelId routes Android to the channel initNotifications() creates.
    expect(trigger.channelId).toBe("default");
  });

  it("the trigger date matches the reminder's event time (no lead-time)", async () => {
    await scheduleReminderNotification(futureReminder);
    const { trigger } =
      Notifications.scheduleNotificationAsync.mock.calls[0][0];
    expect(trigger.date.toISOString()).toBe(futureReminder.nextTriggerAt);
  });
});
