import { Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSegments } from "expo-router";

// How much of the bottom of the screen a tab screen must keep clear of tappable /
// readable content.
//
// On iOS the Liquid Glass tab bar is NATIVE (expo-router NativeTabs) and floats over
// the content: the React Native safe-area inset only covers the home indicator, NOT
// the bar. So a sticky "Save" button or the last row of a scroll view that is padded
// by `insets.bottom` alone ends up hidden behind the bar (QA 2026-10-16 bugs 01/03).
// The Android bar is a JS <Tabs> bar rendered IN-FLOW, so the screen already ends above
// it and only the plain safe-area inset applies.
//
// Screens pushed on the ROOT stack (service/*, modals, chat, …) sit above the tab
// navigator and have no tab bar underneath, so they only need the safe-area inset.
//
// Visible height of the iOS native bar above the home-indicator zone. Deliberately a
// little generous (UITabBar is 49pt; the iOS 26 glass bar floats a few pt taller) —
// a few spare points are invisible, a hidden Save button is not.
export const IOS_TAB_BAR_HEIGHT = 56;

// Pure so it can be unit-tested without a navigator.
export function computeBottomClearance({ platform, inTabs, insetBottom }) {
  const inset = Number.isFinite(insetBottom) ? insetBottom : 0;
  return platform === "ios" && inTabs ? inset + IOS_TAB_BAR_HEIGHT : inset;
}

// Returns the bottom clearance in points for the CURRENT screen. Use it wherever you
// would have written `insets.bottom` for padding a sticky footer or the end of a
// scroll view on a screen that can be shown inside the tab bar.
export default function useBottomClearance() {
  // useSafeAreaInsets throws without a provider (bare unit-test renders); the clearance
  // is only a padding hint, so degrade to 0 instead of crashing the screen.
  let insets = null;
  try {
    insets = useSafeAreaInsets();
  } catch {
    insets = null;
  }
  // Defensive: a few unit tests mock expo-router without useSegments.
  const segments = typeof useSegments === "function" ? useSegments() : [];
  return computeBottomClearance({
    platform: Platform.OS,
    inTabs: segments?.[0] === "(tabs)",
    insetBottom: insets?.bottom,
  });
}
