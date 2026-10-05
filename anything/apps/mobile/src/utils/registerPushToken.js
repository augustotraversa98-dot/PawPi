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
// The token this session registered (or last resolved), so a logout can unregister it.
let lastKnownToken = null;

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
      lastKnownToken = token;

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

/**
 * Forget this session's registration so the NEXT signed-in user registers the device again.
 * The once-per-session memo is otherwise process-wide: without this, user B signing in after
 * user A (no app restart) would get A's cached promise back and never send their own POST.
 */
export function resetPushTokenRegistration() {
  registerOncePromise = null;
}

/**
 * Remove this device's push-token association for the user who is signing out
 * (DELETE /api/push-tokens {token} — deletes by token for the CALLER only). It must go out with
 * the signing-out user's own jwt, passed explicitly: the auth store drops the stored jwt in the
 * same tick as the logout, and the endpoint is 401 without one. Never throws; resolves true when
 * the server acknowledged, false on any no-op / failure (no token, no jwt, permission declined,
 * simulator, network error, dead session).
 *
 * @param {{ jwt?: string, fetchImpl?: Function }} [options]
 * @returns {Promise<boolean>}
 */
export async function unregisterPushTokenAsync({ jwt, fetchImpl = fetch } = {}) {
  try {
    if (!jwt) return false; // nobody to authenticate as (the session is already dead)
    let token = lastKnownToken;
    if (!token) {
      // Registered in an earlier process, or never this session: the Expo token is stable per
      // install, so resolve it the same way registration does (no permission prompt).
      if (Device.isDevice === false) return false;
      const perms = await Notifications.getPermissionsAsync();
      if (!isNotificationPermissionGranted(perms)) return false;
      const projectId = resolveProjectId();
      const tokenResp = await Notifications.getExpoPushTokenAsync(
        projectId ? { projectId } : undefined,
      );
      token = tokenResp?.data ?? null;
    }
    if (!token) return false;
    const response = await fetchImpl("/api/push-tokens", {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${jwt}`,
      },
      body: JSON.stringify({ token }),
    });
    lastKnownToken = null;
    return !!response?.ok;
  } catch (error) {
    console.log("[registerPushToken] unregister non-fatal:", error?.message);
    return false;
  }
}

/** Test-only: clear the once-guard so each case starts fresh. */
export function __resetRegisterPushTokenForTests() {
  registerOncePromise = null;
  lastKnownToken = null;
}
