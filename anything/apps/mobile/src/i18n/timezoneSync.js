// timezoneSync — report the device's IANA time zone to the server (notifications v2).
//
// user_profiles.timezone was read by the care ring / streaks / digest / win-back day boundaries but written by
// nothing, so every owner behaved as America/Buenos_Aires. We PUT the device zone on app entry and again only
// when it changed (travel, DST-rule change, a new phone). The server ignores it unless its NOTIF_V2_ENABLED
// flag is on, and falls back to America/Buenos_Aires for anyone who never syncs. Best-effort, never throws;
// the patched global fetch attaches the auth JWT (an unauthenticated 401 is simply swallowed).

import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "pawpi.timezoneSynced.v1";

/** The device's current IANA zone (e.g. "America/Argentina/Buenos_Aires"), or null when unavailable. */
export function deviceTimeZone() {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return typeof tz === "string" && (tz.includes("/") || tz === "UTC") ? tz : null;
  } catch {
    return null;
  }
}

/**
 * @param {{ fetchImpl?: Function, timeZone?: string|null }} [opts] test seams
 * @returns {Promise<boolean>} true when a PUT was acknowledged
 */
export async function syncTimezoneToServer({ fetchImpl, timeZone } = {}) {
  try {
    const doFetch = fetchImpl || fetch;
    const tz = timeZone === undefined ? deviceTimeZone() : timeZone;
    if (!tz) return false;
    const last = await AsyncStorage.getItem(KEY).catch(() => null);
    if (last === tz) return false; // already told the server this zone
    const res = await doFetch("/api/user-profile/timezone", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ timezone: tz }),
    });
    if (!res?.ok) return false;
    const data = await res.json().catch(() => ({}));
    // Remember only a REAL write: a flag-off server answers {skipped}, and we must retry once it is on.
    if (data?.timezone === tz) {
      await AsyncStorage.setItem(KEY, tz).catch(() => {});
      return true;
    }
    return false;
  } catch {
    return false;
  }
}
