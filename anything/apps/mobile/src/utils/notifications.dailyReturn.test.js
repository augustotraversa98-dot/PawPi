// Daily-return reminder (ticket 2.98): scheduled EXACTLY ONCE when permission is granted, never
// duplicated on a re-call/re-render, and never scheduled when permission is denied.

jest.mock("expo-notifications", () => ({
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: jest.fn(async () => ({ status: "granted" })),
  requestPermissionsAsync: jest.fn(async () => ({ status: "granted" })),
  scheduleNotificationAsync: jest.fn(async () => "daily-id"),
  cancelScheduledNotificationAsync: jest.fn(async () => {}),
  AndroidNotificationPriority: { HIGH: "high", DEFAULT: "default" },
  SchedulableTriggerInputTypes: { DATE: "date", DAILY: "daily" },
}));

import * as Notifications from "expo-notifications";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  ensureDailyReturnReminder,
  getNotificationPermissionGranted,
} from "./notifications";

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  Notifications.getPermissionsAsync.mockResolvedValue({ status: "granted" });
  Notifications.scheduleNotificationAsync.mockResolvedValue("daily-id");
});

describe("ensureDailyReturnReminder", () => {
  it("schedules a repeating DAILY reminder once when permission is granted", async () => {
    const id = await ensureDailyReturnReminder("Time to check on Mango 🐾");
    expect(id).toBe("daily-id");
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
    const arg = Notifications.scheduleNotificationAsync.mock.calls[0][0];
    expect(arg.trigger.type).toBe("daily");
    expect(arg.trigger.hour).toBe(10);
    expect(arg.trigger.channelId).toBe("default");
    expect(arg.content.body).toBe("Time to check on Mango 🐾");
  });

  it("does NOT double-schedule on a second call (idempotent via the persisted id)", async () => {
    await ensureDailyReturnReminder("hola");
    Notifications.scheduleNotificationAsync.mockClear();
    const again = await ensureDailyReturnReminder("hola");
    expect(again).toBe("daily-id"); // returns the already-scheduled id
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it("does nothing (no schedule) when permission is not granted", async () => {
    Notifications.getPermissionsAsync.mockResolvedValue({ status: "denied" });
    const id = await ensureDailyReturnReminder("hola");
    expect(id).toBeNull();
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });
});

describe("getNotificationPermissionGranted", () => {
  it("true when granted (either the boolean or the status)", async () => {
    Notifications.getPermissionsAsync.mockResolvedValue({ granted: true });
    expect(await getNotificationPermissionGranted()).toBe(true);
    Notifications.getPermissionsAsync.mockResolvedValue({ status: "granted" });
    expect(await getNotificationPermissionGranted()).toBe(true);
  });
  it("false when denied", async () => {
    Notifications.getPermissionsAsync.mockResolvedValue({ status: "denied" });
    expect(await getNotificationPermissionGranted()).toBe(false);
  });
});
