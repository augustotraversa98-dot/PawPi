// clientDiagnostics — fire-and-forget "the app saw something it should never see" beacon.
//
// POSTs one small, PII-free record (event name, which check fired, the recent screen trail, the
// JS-session age, app/OS version) to /api/client-diagnostics, which writes ONE searchable line
// (`[client-diagnostics]`) to the server logs. Best-effort by design: it never throws, never
// blocks the caller, and a failed send is silently dropped — a diagnostic must not be able to
// break the very flow it is observing.

import { Platform } from "react-native";
import Constants from "expo-constants";
import { getNavTrail, sessionAgeSeconds } from "./navTrail";

export const EVENT_WIZARD_FOR_EXISTING_OWNER = "onboarding_wizard_for_existing_owner";

function appInfo() {
  try {
    return {
      app_version: Constants?.expoConfig?.version,
      build: Constants?.nativeBuildVersion ?? Constants?.expoConfig?.ios?.buildNumber,
    };
  } catch {
    return {};
  }
}

/** Build the payload (exported for tests). */
export function buildDiagnostic(event, details = {}) {
  return {
    event,
    ...details,
    session_age_s: sessionAgeSeconds(),
    trail: getNavTrail(),
    platform: Platform.OS,
    os_version: String(Platform.Version ?? ""),
    ...appInfo(),
  };
}

/** Send it. Resolves (never rejects) so tests can await; callers should not. */
export function reportClientDiagnostic(event, details = {}, fetchImpl = fetch) {
  try {
    return Promise.resolve(
      fetchImpl("/api/client-diagnostics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildDiagnostic(event, details)),
      }),
    ).then(
      () => undefined,
      () => undefined,
    );
  } catch {
    return Promise.resolve();
  }
}
