// i18n framework (ticket 2.29): en/es resolution, device-locale detection, and the
// English fallback for missing keys (a raw key is never rendered).

const mockGetLocales = jest.fn(() => [{ languageCode: "en" }]);
jest.mock("expo-localization", () => ({
  getLocales: () => mockGetLocales(),
}));

import i18n, { deviceLanguage } from "./index";

afterEach(async () => {
  await i18n.changeLanguage("en");
});

test("resolves English strings", async () => {
  await i18n.changeLanguage("en");
  expect(i18n.t("tabs.feed")).toBe("Feed");
  expect(i18n.t("settings.title")).toBe("Settings");
});

test("resolves Spanish strings", async () => {
  await i18n.changeLanguage("es");
  expect(i18n.t("tabs.feed")).toBe("Inicio");
  expect(i18n.t("settings.title")).toBe("Ajustes");
});

test("a missing key falls back to English (never a raw key in another language)", async () => {
  i18n.addResource("en", "translation", "__test.onlyEn", "English only");
  await i18n.changeLanguage("es");
  expect(i18n.t("__test.onlyEn")).toBe("English only");
});

test("deviceLanguage maps a Spanish phone to es, anything else to en", () => {
  mockGetLocales.mockReturnValueOnce([{ languageCode: "es" }]);
  expect(deviceLanguage()).toBe("es");
  mockGetLocales.mockReturnValueOnce([{ languageCode: "fr" }]);
  expect(deviceLanguage()).toBe("en");
  mockGetLocales.mockReturnValueOnce([]);
  expect(deviceLanguage()).toBe("en");
});
