jest.mock("expo-constants", () => ({ __esModule: true, default: {} }));

import Constants from "expo-constants";
import { getAppVersionInfo, formatAppVersion } from "./appVersion";

afterEach(() => {
  for (const k of Object.keys(Constants)) delete Constants[k];
});

test("uses the native binary version + build when exposed", () => {
  Constants.nativeAppVersion = "1.0.2";
  Constants.nativeBuildVersion = "26";
  Constants.expoConfig = { version: "9.9.9" };
  expect(getAppVersionInfo()).toEqual({ version: "1.0.2", build: "26" });
  expect(formatAppVersion()).toBe("v1.0.2 (26)");
});

test("falls back to the app config (version from app.json, build from ios.buildNumber)", () => {
  Constants.expoConfig = { version: "1.0.2", ios: { buildNumber: "26" } };
  expect(formatAppVersion()).toBe("v1.0.2 (26)");
});

test("omits the build when it is unknown", () => {
  Constants.expoConfig = { version: "1.0.2" };
  expect(formatAppVersion()).toBe("v1.0.2");
});

test("returns an empty label when no version is available", () => {
  expect(formatAppVersion()).toBe("");
});

test("never returns the old hard-coded 1.0.0", () => {
  Constants.expoConfig = { version: "2.3.4" };
  expect(formatAppVersion()).not.toContain("1.0.0");
});
