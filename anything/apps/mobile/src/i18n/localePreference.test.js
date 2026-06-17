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
