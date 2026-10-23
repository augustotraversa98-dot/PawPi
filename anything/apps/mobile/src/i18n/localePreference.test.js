// Persisted language override (ticket 2.29): the Settings selector switches the app
// language immediately and persists; "system" follows the phone.

const mockStore = {};
jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: jest.fn((k) => Promise.resolve(mockStore[k] ?? null)),
  setItem: jest.fn((k, v) => {
    mockStore[k] = v;
    return Promise.resolve();
  }),
  removeItem: jest.fn((k) => {
    delete mockStore[k];
    return Promise.resolve();
  }),
}));
jest.mock("expo-localization", () => ({
  getLocales: () => [{ languageCode: "en" }], // phone = English
}));

import i18n from "./index";
import {
  setLocalePreference,
  getLocalePreference,
  initLocaleFromStorage,
  syncLocaleToServer,
} from "./localePreference";

beforeEach(async () => {
  for (const k of Object.keys(mockStore)) delete mockStore[k];
  await i18n.changeLanguage("en");
});

test("setting Español switches + persists", async () => {
  await setLocalePreference("es");
  expect(i18n.language).toBe("es");
  expect(mockStore["pawpi:locale"]).toBe("es");
  expect(await getLocalePreference()).toBe("es");
});

test("'system' clears the override and follows the phone language (en)", async () => {
  await setLocalePreference("es");
  await setLocalePreference("system");
  expect(mockStore["pawpi:locale"]).toBeUndefined();
  expect(i18n.language).toBe("en"); // device = en
  expect(await getLocalePreference()).toBe("system");
});

test("initLocaleFromStorage applies a saved override on startup", async () => {
  mockStore["pawpi:locale"] = "es";
  await initLocaleFromStorage();
  expect(i18n.language).toBe("es");
});

describe("syncLocaleToServer (perf audit 2026-10-23: not on every launch)", () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  test("first launch PUTs once and remembers it per user+language", async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true });
    expect(await syncLocaleToServer({ userKey: 7 })).toBe(true);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(mockStore["pawpi.localeSynced.v1"]).toBe("7|en");
    // next launch, same account + language: no request
    expect(await syncLocaleToServer({ userKey: 7 })).toBe(false);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  test("a different account on the same device, or a changed language, syncs again", async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true });
    await syncLocaleToServer({ userKey: 7 });
    await syncLocaleToServer({ userKey: 8 });
    await i18n.changeLanguage("es");
    await syncLocaleToServer({ userKey: 8 });
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });

  test("a failed write is not remembered (retried next launch)", async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false });
    await syncLocaleToServer({ userKey: 7 });
    expect(mockStore["pawpi.localeSynced.v1"]).toBeUndefined();
    global.fetch = jest.fn().mockRejectedValue(new Error("offline"));
    expect(await syncLocaleToServer({ userKey: 7 })).toBe(false);
    expect(mockStore["pawpi.localeSynced.v1"]).toBeUndefined();
  });

  test("without a userKey (language changed in Settings) it always writes", async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true });
    await syncLocaleToServer();
    await syncLocaleToServer();
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });
});
