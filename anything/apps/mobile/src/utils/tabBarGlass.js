import { Appearance, Platform } from "react-native";

// QA 2026-10-16 bug 10 / night run #2 PR A — the bottom tab bar looked solid black.
//
// On iOS the bar is the SYSTEM tab bar (expo-router NativeTabs). It is translucent glass
// by default, but it follows the phone's light/dark setting while every PawPi screen is a
// light cream surface (the app has no dark theme). With the phone in dark mode the system
// renders a DARK glass bar under cream content, which reads as a black bar.
//
// The fix has two small, JS-only parts (no native module, so it is OTA-safe):
//   1. `forceLightAppearance()` pins the app to the light scheme on iOS so the system glass
//      (and every other native control: keyboard, alerts, sheets) matches the cream app.
//   2. `legacyTabBarBlur()` gives iOS < 26 (which has no Liquid Glass) a light, thin,
//      translucent system material instead of the default chrome. iOS 26+ returns
//      undefined so the real glass is never overridden.

// Marketing major version of the running iOS, or 0 when unknown / not iOS.
export function iosMajorVersion(version = Platform.Version, os = Platform.OS) {
  if (os !== "ios") return 0;
  const major = parseInt(String(version), 10);
  return Number.isFinite(major) ? major : 0;
}

// `blurEffect` for NativeTabs: only the pre-glass fallback gets one.
export function legacyTabBarBlur(version = Platform.Version, os = Platform.OS) {
  if (os !== "ios") return undefined;
  const major = iosMajorVersion(version, os);
  // Unknown version (0) is treated as "don't override" — never risk the real material.
  if (major === 0 || major >= 26) return undefined;
  return "systemUltraThinMaterialLight";
}

// Pin the native UI to the light scheme. Safe to call repeatedly; never throws.
export function forceLightAppearance(os = Platform.OS) {
  if (os !== "ios") return false;
  try {
    Appearance.setColorScheme("light");
    return true;
  } catch {
    return false;
  }
}
