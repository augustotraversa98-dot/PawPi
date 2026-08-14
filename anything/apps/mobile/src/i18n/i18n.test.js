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

test("audit-added keys resolve in BOTH languages (no half-translated strings)", async () => {
  const en = require("./locales/en.json");
  const es = require("./locales/es.json");
  const newKeys = [
    ["providers", "searchPlaceholder"],
    ["providers", "sortTopRated"],
    ["providers", "noMatchBody"],
    ["providers", "bookFromPrice"],
    ["providers", "reviewsOther"],
    ["notifications", "filterRequests"],
    ["notifications", "accessRequestBody"],
    ["notifications", "filterBookings"],
    ["notifications", "bookingHint"],
    ["notifications", "bookingServiceFallback"],
    ["notifications", "bookingProviderFallback"],
    ["notifications", "booking_requested"],
    ["notifications", "booking_confirmed"],
    ["notifications", "booking_declined"],
    ["notifications", "booking_cancelled"],
    ["notifications", "booking_requestedFallback"],
    ["notifications", "booking_confirmedFallback"],
    ["notifications", "booking_declinedFallback"],
    ["notifications", "booking_cancelledFallback"],
    ["health", "trackerSoon"],
    ["health", "trackerSoonBody"],
    ["common", "yourPet"],
    ["booking", "reserveSlot"],
    ["booking", "noSlots"],
    ["booking", "modalityVideo"],
    ["telehealth", "availableAt"],
    ["telehealth", "availableWhenVetStarts"],
    ["notifications", "weeklyDigestTitle"],
    ["notifications", "weeklyDigestRich"],
    ["notifications", "weeklyDigestQuiet"],
    ["notifications", "weeklyDigestEmpty"],
    ["weeklyDigest", "title"],
    ["weeklyDigest", "headlineRich"],
    ["weeklyDigest", "headlineQuiet"],
    ["weeklyDigest", "headlineEmpty"],
    ["weeklyDigest", "milestoneBirthday"],
    ["weeklyDigest", "milestoneGotcha"],
    ["weeklyDigest", "shareSubtitle"],
    ["weeklyDigest", "prefsHint"],
  ];
  for (const [ns, key] of newKeys) {
    expect(typeof en[ns]?.[key]).toBe("string");
    expect(en[ns][key].length).toBeGreaterThan(0);
    expect(typeof es[ns]?.[key]).toBe("string");
    expect(es[ns][key].length).toBeGreaterThan(0);
    // Interpolation placeholders must survive translation (same {{vars}}).
    const vars = (s) => (s.match(/{{\s*\w+\s*}}/g) || []).sort();
    expect(vars(es[ns][key])).toEqual(vars(en[ns][key]));
  }
});

test("deviceLanguage maps a Spanish phone to es, anything else to en", () => {
  mockGetLocales.mockReturnValueOnce([{ languageCode: "es" }]);
  expect(deviceLanguage()).toBe("es");
  mockGetLocales.mockReturnValueOnce([{ languageCode: "fr" }]);
  expect(deviceLanguage()).toBe("en");
  mockGetLocales.mockReturnValueOnce([]);
  expect(deviceLanguage()).toBe("en");
});
