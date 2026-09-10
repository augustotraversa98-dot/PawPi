// Connectivity wiring for React-Query (AUDIT_2026-09 A-06 + A-16).
//
// React-Query cannot tell that a React-Native app is offline or backgrounded unless we tell
// it: by default `onlineManager` assumes "online" and `focusManager` assumes "focused".
// Left unwired, two things go wrong:
//   - Offline: with the default `networkMode:'online'` a query sits in `pending/paused`
//     (`isLoading=false`, `data=undefined`), so every screen falls into its EMPTY state
//     ("No shops yet", "No messages") with no hint that the phone is offline, and a paused
//     mutation leaves a "Saving…" button spinning forever.
//   - Background: every `refetchInterval` keeps polling while the app is in the background,
//     because `refetchIntervalInBackground` (default false) is keyed on `focusManager`.
// `wireQueryConnectivity()` closes both gaps; `useIsOnline()` feeds the OfflineBanner.

import { useSyncExternalStore } from "react";
import { AppState } from "react-native";
import NetInfo from "@react-native-community/netinfo";
import { focusManager, onlineManager } from "@tanstack/react-query";

let wired = false;

/**
 * Idempotent. Call once from the root layout. Returns nothing — React-Query owns the
 * subscriptions for the life of the app.
 */
export function wireQueryConnectivity() {
  if (wired) return;
  wired = true;

  onlineManager.setEventListener((setOnline) =>
    NetInfo.addEventListener((state) => {
      // `null` means "unknown" on both flags — never treat unknown as offline, or a phone
      // that has not finished probing would be told it has no network.
      setOnline(state.isConnected !== false && state.isInternetReachable !== false);
    }),
  );

  focusManager.setEventListener((handleFocus) => {
    const sub = AppState.addEventListener("change", (status) => {
      handleFocus(status === "active");
    });
    return () => sub.remove();
  });
}

/** Reactive "is the device online?" — mirrors React-Query's onlineManager. */
export function useIsOnline() {
  return useSyncExternalStore(
    (onChange) => onlineManager.subscribe(onChange),
    () => onlineManager.isOnline(),
    () => true,
  );
}

// Test-only: allow re-wiring in a fresh test.
export function __resetConnectivityForTests() {
  wired = false;
}
