// PP2 — the iOS permission prompts are rendered by the OS, not by React, so `t()`
// can never reach them. They come from `expo.locales` in app.json, which prebuild
// turns into per-locale InfoPlist.strings. Nothing at runtime would ever catch a
// drifted or missing translation here (it only shows up in a native build, on a
// Spanish phone, at permission-prompt time) — so it is pinned in CI instead.

const appJson = require("../app.json");
const en = require("./en.json");
const es = require("./es.json");

const expo = appJson.expo;
const infoPlist = expo.ios.infoPlist;

/** Info.plist keys iOS shows to the user, i.e. the ones that must be localized. */
const usageKeys = Object.keys(infoPlist).filter((k) =>
  k.endsWith("UsageDescription"),
);

test("app.json points at both locale files", () => {
  expect(expo.locales).toEqual({
    en: "./locales/en.json",
    es: "./locales/es.json",
  });
});

test("CFBundleLocalizations declares exactly the locales we ship", () => {
  expect(infoPlist.CFBundleLocalizations).toEqual(["en", "es"]);
  expect(Object.keys(expo.locales).sort()).toEqual(
    [...infoPlist.CFBundleLocalizations].sort(),
  );
});

test("EN and ES carry the identical key set (no half-translated prompt)", () => {
  expect(Object.keys(es).sort()).toEqual(Object.keys(en).sort());
});

test("every user-facing usage string is localized", () => {
  expect(usageKeys.length).toBeGreaterThan(0);
  for (const key of usageKeys) {
    expect(en).toHaveProperty(key);
    expect(es).toHaveProperty(key);
  }
});

test("the English file matches app.json verbatim (it is the base fallback)", () => {
  // iOS falls back to the unlocalized Info.plist value for any language we don't
  // ship, so a drift between the two would mean English users and es-fallback
  // users read different copy — and Apple reviews the app.json one.
  for (const key of usageKeys) {
    expect(en[key]).toBe(infoPlist[key]);
  }
});

test("ES strings are real translations, not English left in place", () => {
  for (const key of usageKeys) {
    expect(es[key].trim().length).toBeGreaterThan(0);
    expect(es[key]).not.toBe(en[key]);
  }
});

test("the brand name is not translated", () => {
  expect(en.CFBundleDisplayName).toBe("PawPi");
  expect(es.CFBundleDisplayName).toBe("PawPi");
});
