// Early-reminder lead-time, OS-notification only. ScheduleBlock's "Early
// reminder" picker writes a `reminderTiming` lead-time; we honor it by firing
// the OS alert at (event − leadTime) WITHOUT moving the stored instance. These
// tests pin: the option→ms map, the per-type resolution (wellness live, vet /
// medical-vaccine excluded so they're never double-offset), and that
// scheduleReminderNotification computes the early trigger and skips past ones.

jest.mock("expo-notifications", () => ({
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: jest.fn(async () => ({ status: "granted" })),
  requestPermissionsAsync: jest.fn(async () => ({ status: "granted" })),
  scheduleNotificationAsync: jest.fn(async () => "notif-id"),
  cancelScheduledNotificationAsync: jest.fn(async () => {}),
  cancelAllScheduledNotificationsAsync: jest.fn(async () => {}),
  getAllScheduledNotificationsAsync: jest.fn(async () => []),
  addNotificationResponseReceivedListener: jest.fn(),
  addNotificationReceivedListener: jest.fn(),
  AndroidNotificationPriority: { HIGH: "high", DEFAULT: "default" },
}));

import * as Notifications from "expo-notifications";
import {
  LEAD_TIME_MS,
  resolveLeadTimeMs,
  resolveReminderTiming,
  scheduleReminderNotification,
} from "./notifications";

const NOW = new Date(2026, 5, 10, 12, 0, 0); // local noon

describe("resolveLeadTimeMs", () => {
  it("maps every ScheduleBlock option to its millisecond lead-time", () => {
    expect(resolveLeadTimeMs("on_time")).toBe(0);
    expect(resolveLeadTimeMs("5m")).toBe(5 * 60 * 1000);
    expect(resolveLeadTimeMs("15m")).toBe(15 * 60 * 1000);
    expect(resolveLeadTimeMs("30m")).toBe(30 * 60 * 1000);
    expect(resolveLeadTimeMs("1h")).toBe(60 * 60 * 1000);
    expect(resolveLeadTimeMs("1d")).toBe(24 * 60 * 60 * 1000);
    expect(resolveLeadTimeMs("1w")).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it("treats absent / null / unknown as 0 (no shift)", () => {
    expect(resolveLeadTimeMs(undefined)).toBe(0);
    expect(resolveLeadTimeMs(null)).toBe(0);
    expect(resolveLeadTimeMs("")).toBe(0);
    expect(resolveLeadTimeMs("bogus")).toBe(0);
  });

  it("covers exactly the ScheduleBlock option vocabulary", () => {
    expect(Object.keys(LEAD_TIME_MS).sort()).toEqual(
      ["1d", "1h", "1w", "15m", "30m", "5m", "on_time"].sort(),
    );
  });
});

describe("resolveReminderTiming", () => {
  it("reads a wellness item's reminderTiming by index", () => {
    const reminder = { type: "wellness_check", wellnessCheckItemIndex: 1 };
    const routine = {
      type: "wellness_check",
      wellnessCheckItems: [
        { reminderTiming: "5m" },
        { reminderTiming: "1h" },
      ],
    };
    expect(resolveReminderTiming(reminder, routine)).toBe("1h");
  });

  it("returns null for a wellness item with no reminderTiming", () => {
    const reminder = { type: "wellness_check", wellnessCheckItemIndex: 0 };
    const routine = { type: "wellness_check", wellnessCheckItems: [{}] };
    expect(resolveReminderTiming(reminder, routine)).toBeNull();
  });

  it("excludes vet_appointment and medical_care (already offset elsewhere)", () => {
    expect(
      resolveReminderTiming(
        { type: "vet_appointment" },
        { type: "vet_appointment", reminderTiming: "1d" },
      ),
    ).toBeNull();
    expect(
      resolveReminderTiming(
        { type: "medical_care", medicalCareItemId: "x" },
        { type: "medical_care", medicalCareItems: [{ reminderTiming: "1w" }] },
      ),
    ).toBeNull();
  });

  it("is null-safe when reminder or routine is missing", () => {
    expect(resolveReminderTiming(null, {})).toBeNull();
    expect(resolveReminderTiming({ type: "wellness_check" }, null)).toBeNull();
    expect(
      resolveReminderTiming(
        { type: "wellness_check", wellnessCheckItemIndex: 0 },
        { type: "wellness_check" },
      ),
    ).toBeNull();
  });
});

describe("scheduleReminderNotification — lead-time trigger", () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(NOW);
    Notifications.scheduleNotificationAsync.mockClear();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const reminderAt = (msFromNow) => ({
    id: "reminder_1_2026-06-10_0",
    type: "wellness_check",
    title: "Body condition",
    description: "Weekly check",
    nextTriggerAt: new Date(NOW.getTime() + msFromNow).toISOString(),
    timeSensitive: false,
  });

  const scheduledTrigger = () =>
    Notifications.scheduleNotificationAsync.mock.calls[0][0].trigger;

  it("with no lead-time, fires at the event time (unchanged)", async () => {
    const event = new Date(NOW.getTime() + 2 * 60 * 60 * 1000); // +2h
    await scheduleReminderNotification(reminderAt(2 * 60 * 60 * 1000));
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
    expect(scheduledTrigger().getTime()).toBe(event.getTime());
  });

  it("with a lead-time, fires at (event − leadTime)", async () => {
    await scheduleReminderNotification(reminderAt(2 * 60 * 60 * 1000), "1h");
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
    // event +2h, lead 1h → trigger +1h
    expect(scheduledTrigger().getTime()).toBe(NOW.getTime() + 60 * 60 * 1000);
  });

  it("on_time is treated as no shift", async () => {
    const event = new Date(NOW.getTime() + 2 * 60 * 60 * 1000);
    await scheduleReminderNotification(reminderAt(2 * 60 * 60 * 1000), "on_time");
    expect(scheduledTrigger().getTime()).toBe(event.getTime());
  });

  it("skips when (event − leadTime) is already in the past, even if event is future", async () => {
    // event +30m, lead 1h → trigger 30m ago → skip, no schedule
    const id = await scheduleReminderNotification(
      reminderAt(30 * 60 * 1000),
      "1h",
    );
    expect(id).toBeNull();
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });
});
