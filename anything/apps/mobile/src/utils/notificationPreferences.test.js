// E5 notification preferences — AsyncStorage-backed toggles, per-day send log, open-hour history.

import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  getNotificationPrefs,
  setNotificationPrefs,
  setCategoryEnabled,
  getSentLog,
  recordSent,
  recordAppOpenHour,
  getAppOpenHours,
} from "./notificationPreferences";
import { DEFAULT_PREFS, NOTIF_CATEGORIES } from "./notificationPolicy";

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe("preferences", () => {
  it("returns defaults when nothing stored", async () => {
    const p = await getNotificationPrefs();
    expect(p).toEqual(DEFAULT_PREFS);
  });

  it("persists a merged patch", async () => {
    await setNotificationPrefs({ frequencyCap: 2 });
    const p = await getNotificationPrefs();
    expect(p.frequencyCap).toBe(2);
    expect(p.social).toBe(true); // untouched keys keep defaults
  });

  it("toggles a category off and on", async () => {
    await setCategoryEnabled(NOTIF_CATEGORIES.STREAK, false);
    expect((await getNotificationPrefs()).streak).toBe(false);
    await setCategoryEnabled(NOTIF_CATEGORIES.STREAK, true);
    expect((await getNotificationPrefs()).streak).toBe(true);
  });

  it("ignores unknown categories", async () => {
    await setCategoryEnabled("not_a_category", false);
    const p = await getNotificationPrefs();
    expect(p.not_a_category).toBeUndefined();
  });
});

describe("send log (frequency cap)", () => {
  it("records and reads per-day counts, pruned to today", async () => {
    await recordSent("2026-08-14");
    await recordSent("2026-08-14");
    const log = await getSentLog("2026-08-14");
    expect(log["2026-08-14"]).toBe(2);
    // A different day is pruned out (only today is retained).
    expect(await getSentLog("2026-08-15")).toEqual({});
  });
});

describe("app-open hours", () => {
  it("records valid hours only", async () => {
    await recordAppOpenHour(9);
    await recordAppOpenHour(21);
    await recordAppOpenHour(99); // invalid, ignored
    expect(await getAppOpenHours()).toEqual([9, 21]);
  });
});
