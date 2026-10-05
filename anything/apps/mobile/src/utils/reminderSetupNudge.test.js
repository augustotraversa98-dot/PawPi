// First-reminder nudge scheduler (engagementNotifications.maybeArmReminderSetupNudge).
// Local only. Proves: armed once per pet (two daytime nudges), never from an unknown state, honours the
// care toggle + permission, cancelled the moment a reminder exists, survives the OS list being cleared,
// and never crosses pets.

const mockScheduled = [];
jest.mock("expo-notifications", () => ({
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: jest.fn(async () => ({ status: "granted" })),
  scheduleNotificationAsync: jest.fn(async () => {
    const id = `os-${mockScheduled.length + 1}`;
    mockScheduled.push(id);
    return id;
  }),
  cancelScheduledNotificationAsync: jest.fn(async (id) => {
    const i = mockScheduled.indexOf(id);
    if (i >= 0) mockScheduled.splice(i, 1);
  }),
  getAllScheduledNotificationsAsync: jest.fn(async () => mockScheduled.map((identifier) => ({ identifier }))),
  AndroidNotificationPriority: { HIGH: "high", DEFAULT: "default" },
  SchedulableTriggerInputTypes: { DATE: "date", DAILY: "daily" },
}));

import * as Notifications from "expo-notifications";
import AsyncStorage from "@react-native-async-storage/async-storage";
import en from "@/i18n/locales/en.json";
import es from "@/i18n/locales/es.json";
import { setNotificationPrefs, recordAppOpenHour } from "./notificationPreferences";
import {
  maybeArmReminderSetupNudge,
  cancelReminderSetupNudges,
  buildReminderSetupContent,
} from "./engagementNotifications";

const makeT = (dict) => (key, vars = {}) => {
  const val = key.split(".").reduce((o, k) => (o == null ? o : o[k]), dict);
  if (typeof val !== "string") throw new Error(`missing i18n key: ${key}`);
  return val.replace(/\{\{(\w+)\}\}/g, (_, k) => String(vars[k] ?? ""));
};
const t = makeT(en);

const NOW = new Date("2026-10-05T10:30:00"); // local time
const arm = (over = {}) =>
  maybeArmReminderSetupNudge({ t, petId: 5, petName: "Mango", hasReminder: false, permissionGranted: true, now: NOW, ...over });
const calls = () => Notifications.scheduleNotificationAsync.mock.calls.map(([arg]) => arg);

beforeEach(async () => {
  jest.clearAllMocks();
  mockScheduled.length = 0;
  await AsyncStorage.clear();
  Notifications.getPermissionsAsync.mockResolvedValue({ status: "granted" });
});

describe("arming", () => {
  it("schedules exactly two daytime local nudges (tomorrow and +4 days) with the tap payload", async () => {
    const ids = await arm();
    expect(ids).toHaveLength(2);
    const [first, second] = calls();
    // no learned open hour yet → evening fallback (19) clamped into the daytime window → 19:00
    expect(first.trigger.date).toEqual(new Date("2026-10-06T19:00:00"));
    expect(second.trigger.date).toEqual(new Date("2026-10-09T19:00:00"));
    expect(first.content.data).toEqual({ category: "care", nudge: "reminder_setup", petId: 5 });
    expect(first.content.title).toContain("Mango");
    expect(first.content.title).not.toEqual(second.content.title); // a different follow-up, not a repeat
  });

  it("uses the owner's usual open hour, clamped to the daytime (never at night)", async () => {
    for (let i = 0; i < 5; i += 1) await recordAppOpenHour(2); // a 2 am habit
    await arm();
    expect(calls()[0].trigger.date.getHours()).toBe(9);
  });

  it("only ever arms once per pet: later runs schedule nothing new", async () => {
    await arm();
    Notifications.scheduleNotificationAsync.mockClear();
    expect(await arm()).toEqual([]);
    expect(await arm()).toEqual([]);
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it("does nothing while the reminder state is unknown (loading / failed read)", async () => {
    expect(await arm({ hasReminder: undefined })).toEqual([]);
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it("does nothing without OS permission", async () => {
    expect(await arm({ permissionGranted: false })).toEqual([]);
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it("does nothing when the Care reminders toggle is off", async () => {
    await setNotificationPrefs({ care: false });
    expect(await arm()).toEqual([]);
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it("does nothing without a pet", async () => {
    expect(await arm({ petId: null })).toEqual([]);
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });
});

describe("once a reminder exists", () => {
  it("cancels the pending nudges and never arms again for that pet", async () => {
    await arm();
    expect(mockScheduled).toHaveLength(2);

    await maybeArmReminderSetupNudge({ t, petId: 5, hasReminder: true, now: NOW });
    expect(mockScheduled).toHaveLength(0); // both cancelled
    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledTimes(2);

    // e.g. the owner deletes their only routine later: still no nagging
    Notifications.scheduleNotificationAsync.mockClear();
    expect(await arm()).toEqual([]);
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it("a user who already has reminders is never armed (and nothing is stored)", async () => {
    await maybeArmReminderSetupNudge({ t, petId: 5, hasReminder: true, now: NOW });
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
    expect(await AsyncStorage.getItem("pawpi.reminderNudge.v1.5")).toBeNull();
  });

  it("cancelReminderSetupNudges with no state is a harmless no-op", async () => {
    await expect(cancelReminderSetupNudges(99)).resolves.toBeUndefined();
    await expect(cancelReminderSetupNudges(null)).resolves.toBeUndefined();
  });
});

describe("survives the OS list being cleared (e.g. the logout cleanup)", () => {
  it("re-arms the slots still in the future at the SAME times", async () => {
    await arm();
    const originalTimes = calls().map((c) => c.trigger.date.getTime());
    mockScheduled.length = 0; // cancel-all
    Notifications.scheduleNotificationAsync.mockClear();

    const rearmed = await arm({ now: new Date("2026-10-05T12:00:00") });
    expect(rearmed).toHaveLength(2);
    expect(calls().map((c) => c.trigger.date.getTime())).toEqual(originalTimes);
  });

  it("does not re-arm a slot whose time has passed (it fired) and finishes when both have", async () => {
    await arm();
    mockScheduled.length = 0;
    Notifications.scheduleNotificationAsync.mockClear();

    // 2026-10-07: the first slot (Oct 6) is past, the second (Oct 9) still ahead
    expect(await arm({ now: new Date("2026-10-07T12:00:00") })).toHaveLength(1);
    expect(calls()[0].trigger.date).toEqual(new Date("2026-10-09T19:00:00"));

    mockScheduled.length = 0;
    Notifications.scheduleNotificationAsync.mockClear();
    // after both have passed: nothing, and the pet is finished for good
    expect(await arm({ now: new Date("2026-10-20T12:00:00") })).toEqual([]);
    expect(await arm({ now: new Date("2026-10-21T12:00:00") })).toEqual([]);
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });
});

describe("scoping", () => {
  it("state is per pet: arming pet 5 does not stop pet 6, and cancelling pet 5 leaves pet 6's nudges", async () => {
    await arm({ petId: 5, petName: "Mango" });
    await arm({ petId: 6, petName: "Rex" });
    expect(mockScheduled).toHaveLength(4);
    expect(calls().filter((c) => c.content.data.petId === 6).every((c) => c.content.title.includes("Rex"))).toBe(true);

    await maybeArmReminderSetupNudge({ t, petId: 5, hasReminder: true, now: NOW });
    expect(mockScheduled).toHaveLength(2);
    expect(await AsyncStorage.getItem("pawpi.reminderNudge.v1.6")).not.toBeNull();
  });

  it("never throws", async () => {
    Notifications.scheduleNotificationAsync.mockRejectedValueOnce(new Error("boom"));
    jest.spyOn(console, "error").mockImplementation(() => {});
    await expect(arm()).resolves.toEqual([]);
  });
});

describe("copy", () => {
  it("is positive, in EN and ES, falls back when the pet has no name, and never makes a health claim", () => {
    for (const [dict, name] of [[en, "Mango"], [es, "Mango"]]) {
      const tt = makeT(dict);
      for (const step of [0, 1]) {
        const { title, body } = buildReminderSetupContent(tt, { petName: name, step });
        expect(title).toContain(name);
        expect(body.length).toBeGreaterThan(10);
        expect(`${title} ${body}`).not.toMatch(/diagnos|disease|sick|illness|enfermedad|diagn[óo]stic/i);
      }
    }
    expect(buildReminderSetupContent(t, { step: 0 }).title).toContain("your pup");
    expect(buildReminderSetupContent(makeT(es), { step: 1 }).title).not.toEqual(
      buildReminderSetupContent(makeT(es), { step: 0 }).title,
    );
  });
});
