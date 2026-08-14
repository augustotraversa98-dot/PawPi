// E5 engagement notifications — the guarded streak-save scheduler + positive copy builders.

jest.mock("expo-notifications", () => ({
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: jest.fn(async () => ({ status: "granted" })),
  scheduleNotificationAsync: jest.fn(async () => "streak-id"),
  cancelScheduledNotificationAsync: jest.fn(async () => {}),
  AndroidNotificationPriority: { HIGH: "high", DEFAULT: "default" },
  SchedulableTriggerInputTypes: { DATE: "date", DAILY: "daily" },
}));

import * as Notifications from "expo-notifications";
import AsyncStorage from "@react-native-async-storage/async-storage";
import en from "@/i18n/locales/en.json";
import { setNotificationPrefs, recordSent } from "./notificationPreferences";
import {
  maybeScheduleStreakSave,
  buildStreakSaveContent,
  buildDormantContent,
  buildMilestoneCountdownContent,
} from "./engagementNotifications";

// A minimal i18n resolver over the REAL en.json — doubles as a key-existence check.
function t(key, vars = {}) {
  const val = key.split(".").reduce((o, k) => (o == null ? o : o[k]), en);
  if (typeof val !== "string") throw new Error(`missing i18n key: ${key}`);
  return val.replace(/\{\{(\w+)\}\}/g, (_, k) => String(vars[k] ?? ""));
}

const AT_RISK = {
  walkDone: true,
  momentDone: true,
  careDone: false, // exactly one segment left
  ringClosed: false,
  restDay: false,
  paused: false,
};

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  Notifications.getPermissionsAsync.mockResolvedValue({ status: "granted" });
  Notifications.scheduleNotificationAsync.mockResolvedValue("streak-id");
});

describe("maybeScheduleStreakSave", () => {
  it("schedules the positive nudge when the ring is one segment from closing", async () => {
    const id = await maybeScheduleStreakSave({
      t,
      ring: AT_RISK,
      streakCount: 12,
      petName: "Rex",
      now: new Date("2026-08-14T09:00:00"),
    });
    expect(id).toBe("streak-id");
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
    const arg = Notifications.scheduleNotificationAsync.mock.calls[0][0];
    expect(arg.content.title).toContain("Rex");
    expect(arg.content.data.category).toBe("streak");
  });

  it("does not schedule twice in one day", async () => {
    const now = new Date("2026-08-14T09:00:00");
    await maybeScheduleStreakSave({ t, ring: AT_RISK, streakCount: 12, petName: "Rex", now });
    Notifications.scheduleNotificationAsync.mockClear();
    const again = await maybeScheduleStreakSave({ t, ring: AT_RISK, streakCount: 12, petName: "Rex", now });
    expect(again).toBeNull();
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it("is suppressed when the streak category is toggled off", async () => {
    await setNotificationPrefs({ streak: false });
    const id = await maybeScheduleStreakSave({
      t,
      ring: AT_RISK,
      streakCount: 12,
      petName: "Rex",
      now: new Date("2026-08-14T09:00:00"),
    });
    expect(id).toBeNull();
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it("is suppressed once the daily frequency cap is reached", async () => {
    await setNotificationPrefs({ frequencyCap: 1 });
    const day = "2026-08-14";
    await recordSent(day); // cap of 1 already used
    const id = await maybeScheduleStreakSave({
      t,
      ring: AT_RISK,
      streakCount: 12,
      petName: "Rex",
      now: new Date("2026-08-14T09:00:00"),
    });
    expect(id).toBeNull();
  });

  it("does not schedule when the ring is not at risk (two segments open)", async () => {
    const id = await maybeScheduleStreakSave({
      t,
      ring: { ...AT_RISK, momentDone: false },
      streakCount: 12,
      petName: "Rex",
      now: new Date("2026-08-14T09:00:00"),
    });
    expect(id).toBeNull();
  });
});

describe("copy builders (positive, interpolated)", () => {
  it("streak-save names the pet and count", () => {
    const c = buildStreakSaveContent(t, { petName: "Rex", streakCount: 7 });
    expect(c.title).toContain("Rex");
    expect(c.body).toContain("7");
  });
  it("dormant uses the friend when available", () => {
    const c = buildDormantContent(t, { petName: "Rex", friendPetName: "Bella" });
    expect(c.title).toContain("Bella");
  });
  it("milestone countdown names the days", () => {
    const c = buildMilestoneCountdownContent(t, { petName: "Rex", kind: "gotcha", days: 3 });
    expect(c.body).toContain("3");
  });
});
