// clearAccountStorage: sign-out / account deletion remove account data but keep the device-level choices
// (language, notification preferences, telemetry opt-out).

import {
  KEEP_KEYS,
  KEEP_PREFIXES,
  isAccountKey,
  clearAccountStorage,
} from "./accountStorage";

function fakeStorage(initial) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getAllKeys: jest.fn(async () => [...data.keys()]),
    multiRemove: jest.fn(async (keys) => {
      keys.forEach((k) => data.delete(k));
    }),
    clear: jest.fn(async () => data.clear()),
  };
}

const KEPT = {
  "pawpi:locale": "es",
  "pawpi.notifPrefs.v1": '{"walks":false}',
  "pawpi.notifSentLog.v1": '{"2026-10-04":2}',
  "pawpi.notifOpenHours.v1": "[8,9]",
  "pawpi.dailyReturnReminderId": "notif-123",
  "pawpi.telemetry.enabled": "0",
  "pawpi.telemetry.funnel_once": "{}",
  "pawpi.telemetry.optout": "1",
};

const REMOVED = {
  has_completed_onboarding: "true",
  pet_profile: '{"name":"Rex"}',
  onboarding_progress: "{}",
  onboarding_pet_photo: "file:///x.jpg",
  create_first_moment: "true",
  "pawpi:selectedPetId": '{"state":{"selectedPetId":7}}',
  "pawpi:activeProviderId": '{"state":{"activeProviderId":3}}',
  "pawpi:reminderSnoozes": "{}",
  "pawpi.streakSaveSent.2026-10-04": "1",
  "pawpi.gettingStartedCelebrated": "1",
  some_future_cache: "x", // unknown keys are account data by default
};

describe("isAccountKey", () => {
  it.each(Object.keys(KEPT))("keeps %s", (k) => expect(isAccountKey(k)).toBe(false));
  it.each(Object.keys(REMOVED))("removes %s", (k) => expect(isAccountKey(k)).toBe(true));
  it("treats a non-string key as not ours to remove", () => {
    expect(isAccountKey(undefined)).toBe(false);
    expect(isAccountKey(null)).toBe(false);
  });
  it("keep-list matches exactly or by prefix, not by substring", () => {
    expect(isAccountKey("pawpi:locale")).toBe(false);
    expect(isAccountKey("pawpi:locale.copy")).toBe(true);
    expect(isAccountKey("x.pawpi.telemetry.enabled")).toBe(true);
    expect(KEEP_KEYS.length).toBeGreaterThan(0);
    expect(KEEP_PREFIXES.length).toBeGreaterThan(0);
  });
});

describe("clearAccountStorage", () => {
  it("removes account keys, keeps language / notification prefs / telemetry opt-out", async () => {
    const storage = fakeStorage({ ...KEPT, ...REMOVED });
    const res = await clearAccountStorage(storage);

    expect(res.ok).toBe(true);
    expect([...storage.data.keys()].sort()).toEqual(Object.keys(KEPT).sort());
    expect([...storage.data.entries()].sort()).toEqual(Object.entries(KEPT).sort()); // values untouched
    expect(res.removed.sort()).toEqual(Object.keys(REMOVED).sort());
    expect(res.kept.sort()).toEqual(Object.keys(KEPT).sort());
  });

  it("never wipes everything: it must not call clear()", async () => {
    const storage = fakeStorage({ ...KEPT, ...REMOVED });
    await clearAccountStorage(storage);
    expect(storage.clear).not.toHaveBeenCalled();
  });

  it("is a no-op (no multiRemove call) when there is nothing to remove", async () => {
    const storage = fakeStorage(KEPT);
    const res = await clearAccountStorage(storage);
    expect(res).toEqual({ ok: true, removed: [], kept: Object.keys(KEPT) });
    expect(storage.multiRemove).not.toHaveBeenCalled();
  });

  it("handles an empty store", async () => {
    const res = await clearAccountStorage(fakeStorage({}));
    expect(res).toEqual({ ok: true, removed: [], kept: [] });
  });

  it("never throws when storage fails (the caller still has to drop the session)", async () => {
    const storage = {
      getAllKeys: jest.fn().mockRejectedValue(new Error("disk")),
      multiRemove: jest.fn(),
    };
    await expect(clearAccountStorage(storage)).resolves.toEqual({ ok: false, removed: [], kept: [] });

    const failingRemove = {
      getAllKeys: jest.fn().mockResolvedValue(["pet_profile"]),
      multiRemove: jest.fn().mockRejectedValue(new Error("disk")),
    };
    await expect(clearAccountStorage(failingRemove)).resolves.toMatchObject({ ok: false });
  });

  it("defaults to the real AsyncStorage module (in-memory jest mock)", async () => {
    const AsyncStorage = (() => { const m = require("@react-native-async-storage/async-storage"); return m.default ?? m; })();
    await AsyncStorage.clear();
    await AsyncStorage.multiSet([
      ["pawpi:locale", "en"],
      ["pet_profile", "{}"],
    ]);
    const res = await clearAccountStorage();
    expect(res.ok).toBe(true);
    expect(await AsyncStorage.getAllKeys()).toEqual(["pawpi:locale"]);
    await AsyncStorage.clear();
  });
});
