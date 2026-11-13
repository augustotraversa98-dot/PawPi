// Daily-return reminder (ticket 2.98): scheduled EXACTLY ONCE when permission is granted, never
// duplicated on a re-call/re-render, and never scheduled when permission is denied.

jest.mock("expo-notifications", () => ({
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: jest.fn(async () => ({ status: "granted" })),
  requestPermissionsAsync: jest.fn(async () => ({ status: "granted" })),
  // like the OS: echoes the identifier it was given
  scheduleNotificationAsync: jest.fn(async (req) => req.identifier || "daily-id"),
  cancelScheduledNotificationAsync: jest.fn(async () => {}),
  AndroidNotificationPriority: { HIGH: "high", DEFAULT: "default" },
  SchedulableTriggerInputTypes: { DATE: "date", DAILY: "daily" },
}));

import * as Notifications from "expo-notifications";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  ensureDailyReturnReminder,
  getNotificationPermissionGranted,
  DAILY_RETURN_IDENTIFIER as ID,
} from "./notifications";

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  Notifications.getPermissionsAsync.mockResolvedValue({ status: "granted" });
  Notifications.scheduleNotificationAsync.mockImplementation(async (req) => req.identifier || "daily-id");
});

describe("ensureDailyReturnReminder", () => {
  it("schedules a repeating DAILY reminder once when permission is granted", async () => {
    const id = await ensureDailyReturnReminder("Time to check on Mango 🐾");
    expect(id).toBe(ID);
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
    expect(again).toBe(ID); // returns the already-scheduled id
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

// ---------------------------------------------------------------------------------------------------
// Duplicate-notification regression (2026-11-13): the same daily "…le encantaría verte hoy 🐾" arrived
// TWICE at the same moment. Cause: check-then-schedule across awaits with no lock and a random OS id,
// so overlapping calls each scheduled their own repeating DAILY request and only the last id was kept.
// ---------------------------------------------------------------------------------------------------
describe("ensureDailyReturnReminder — no duplicates", () => {
  const { isDailyReturnRequest, DAILY_RETURN_IDENTIFIER } = require("./notifications");
  const legacyDaily = (identifier) => ({
    identifier,
    content: { title: "PawPi", body: "A Epsilon le encantaría verte hoy 🐾", data: {} },
    trigger: { type: "daily", hour: 10, minute: 0, repeats: true },
  });

  beforeEach(() => {
    Notifications.getAllScheduledNotificationsAsync = jest.fn(async () => []);
    // Slow OS call so overlapping callers interleave, like the device.
    Notifications.scheduleNotificationAsync.mockImplementation(
      async (req) => {
        await new Promise((r) => setTimeout(r, 5));
        return req.identifier || "random-os-id";
      },
    );
  });

  it("concurrent calls schedule exactly ONE request (fails on the old check-then-schedule code)", async () => {
    const ids = await Promise.all([
      ensureDailyReturnReminder("A Epsilon le encantaría verte hoy 🐾"),
      ensureDailyReturnReminder("A Epsilon le encantaría verte hoy 🐾"),
      ensureDailyReturnReminder("A Epsilon le encantaría verte hoy 🐾"),
    ]);
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
    expect(new Set(ids).size).toBe(1);
  });

  it("schedules under a deterministic identifier so a missed race replaces instead of adding", async () => {
    await ensureDailyReturnReminder("hola");
    const arg = Notifications.scheduleNotificationAsync.mock.calls[0][0];
    expect(arg.identifier).toBe(DAILY_RETURN_IDENTIFIER);
    expect(arg.content.data).toEqual({ kind: "daily_return" });
  });

  it("self-heals a device that already has legacy duplicates: cancels the orphan AND the persisted legacy id", async () => {
    await AsyncStorage.setItem("pawpi.dailyReturnReminderId", "legacy-b");
    Notifications.getAllScheduledNotificationsAsync.mockResolvedValue([
      legacyDaily("legacy-a"), // orphan the old code lost track of
      legacyDaily("legacy-b"), // the one it did persist
    ]);
    await ensureDailyReturnReminder("hola");
    const cancelled = Notifications.cancelScheduledNotificationAsync.mock.calls.map((c) => c[0]).sort();
    expect(cancelled).toEqual(expect.arrayContaining(["legacy-a", "legacy-b"]));
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
    expect(await AsyncStorage.getItem("pawpi.dailyReturnReminderId")).toBe(DAILY_RETURN_IDENTIFIER);
  });

  it("is idempotent once migrated and still sweeps a late legacy duplicate without rescheduling", async () => {
    await ensureDailyReturnReminder("hola");
    Notifications.scheduleNotificationAsync.mockClear();
    Notifications.getAllScheduledNotificationsAsync.mockResolvedValue([
      { identifier: DAILY_RETURN_IDENTIFIER, content: { title: "PawPi", data: { kind: "daily_return" } }, trigger: { type: "daily", hour: 10, minute: 0 } },
      legacyDaily("legacy-z"),
    ]);
    const id = await ensureDailyReturnReminder("hola");
    expect(id).toBe(DAILY_RETURN_IDENTIFIER);
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
    expect(Notifications.cancelScheduledNotificationAsync.mock.calls.map((c) => c[0])).toEqual(["legacy-z"]);
  });

  it("never touches routine reminders or engagement nudges", () => {
    expect(isDailyReturnRequest({ identifier: "r1", content: { title: "🍽️ Breakfast", data: { reminderId: "r1" } }, trigger: { type: "date" } })).toBe(false);
    expect(isDailyReturnRequest({ identifier: "n1", content: { title: "PawPi", data: { category: "streak" } }, trigger: { type: "date" } })).toBe(false);
    expect(isDailyReturnRequest({ identifier: "d1", content: { title: "PawPi", data: {} }, trigger: { type: "calendar", repeats: false, dateComponents: { day: 3, hour: 10, minute: 0 } } })).toBe(false);
    expect(isDailyReturnRequest(legacyDaily("x"))).toBe(true);
    // iOS reads a repeating DAILY back as a calendar trigger with only hour/minute
    expect(isDailyReturnRequest({ identifier: "ios", content: { title: "PawPi", data: {} }, trigger: { type: "calendar", repeats: true, dateComponents: { hour: 10, minute: 0 } } })).toBe(true);
  });
});
