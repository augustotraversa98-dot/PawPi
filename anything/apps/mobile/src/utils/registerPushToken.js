// registerPushToken — BN2 PR1 (remote-push foundation), device side.
//
// PawPi has only ever scheduled LOCAL reminders. This registers the device's EXPO
// push token with the backend (POST /api/push-tokens, migration 0109) so the web
// send layer can ring the phone for the notifications that matter (business events).
//
// Design notes:
//   • Permission is NOT asked cold here — initNotifications() (src/app/_layout.jsx)
//     already prompts once at startup for local reminders. We register the push token
//     AFTER auth, reusing that already-granted permission; if permission was declined
//     we no-op (no second prompt, no token).
//   • Simulators/emulators have no push token — expo-device gates that (isDevice).
//   • Best-effort + idempotent: the backend upsert is keyed UNIQUE(user_id, token),
//     and this module never throws (a failure just means no phone push — the in-app
//     bell still works). Guarded to run once per app session.
//   • iOS delivery stays dark until APNs credentials are configured in EAS/Apple
//     (docs/night-run-log.md). Registration still succeeds; only Apple-side delivery
//     is gated.

import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { Platform } from "react-native";
import { isNotificationPermissionGranted } from "./notifications";

// The EAS project id the Expo push service scopes tokens to (app.json → extra.eas).
function resolveProjectId() {
  return (
    Constants?.expoConfig?.extra?.eas?.projectId ??
    Constants?.easConfig?.projectId ??
    undefined
  );
}

let registerOncePromise = null;

/**
 * Fetch the device's Expo push token (respecting the existing permission state) and
 * upsert it to the backend. Memoized per session so a remount can't double-register.
 * Never throws; resolves to the token string on success, or null on any no-op path.
 *
 * @param {(input: string, init?: object) => Promise<Response>} [fetchImpl] test seam
 * @returns {Promise<string|null>}
 */
export async function registerPushTokenAsync(fetchImpl = fetch) {
  if (registerOncePromise) return registerOncePromise;
  registerOncePromise = (async () => {
    try {
      // A real device is required — the simulator has no APNs/FCM token.
      if (Device.isDevice === false) return null;

      // Reuse the permission asked at startup; do NOT prompt again here.
      const perms = await Notifications.getPermissionsAsync();
      if (!isNotificationPermissionGranted(perms)) return null;

      const projectId = resolveProjectId();
      const tokenResp = await Notifications.getExpoPushTokenAsync(
        projectId ? { projectId } : undefined,
      );
      const token = tokenResp?.data;
      if (!token) return null;

      const platform = Platform.OS === "android" ? "android" : "ios";
      await fetchImpl("/api/push-tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, platform }),
      });
      return token;
    } catch (error) {
      console.log("[registerPushToken] non-fatal:", error?.message);
      return null;
    }
  })();
  return registerOncePromise;
}

/** Test-only: clear the once-guard so each case starts fresh. */
export function __resetRegisterPushTokenForTests() {
  registerOncePromise = null;
}
