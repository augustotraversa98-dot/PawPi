// accountStorage — what survives sign-out / account deletion in AsyncStorage.
//
// Sign-out and account deletion used to call AsyncStorage.clear(), which also wiped the things that belong to
// the DEVICE, not the account: the language choice, the notification preferences and the telemetry opt-out
// ("Help improve PawPi (anonymous)"). clearAccountStorage() removes everything EXCEPT an explicit keep-list,
// so a key added in the future is treated as account data (and removed) unless someone deliberately keeps it.
//
// KEPT (device-level):
//   pawpi:locale                  language choice
//   pawpi.notif*                  notification category prefs, daily frequency-cap log, usual-open-hour history
//                                 (no identity in any of them; the cap log must survive or the cap resets)
//   pawpi.dailyReturnReminderId   id of the OS-scheduled daily reminder. The OS notification outlives the
//                                 session; forgetting its id would schedule a second one on the next login.
//   pawpi.telemetry.*             anonymous-analytics opt-out + funnel "once" markers (an opt-out must never be
//                                 silently undone by signing out)
//
// REMOVED (account / session / cached-user data), e.g.:
//   has_completed_onboarding, pet_profile, onboarding_progress, onboarding_pet_photo, create_first_moment,
//   pawpi:selectedPetId, pawpi:activeProviderId, pawpi:reminderSnoozes, pawpi.streakSaveSent.<day>,
//   pawpi.gettingStartedCelebrated, and any key not listed above.
//
// The auth token lives in SecureStore and is dropped by setAuth(null); this helper only covers AsyncStorage.

export const KEEP_KEYS = ["pawpi:locale", "pawpi.dailyReturnReminderId"];
export const KEEP_PREFIXES = ["pawpi.notif", "pawpi.telemetry."];

/** true = the key is account/session data and is removed on sign-out. */
export function isAccountKey(key) {
  if (typeof key !== "string") return false;
  if (KEEP_KEYS.includes(key)) return false;
  return !KEEP_PREFIXES.some((p) => key.startsWith(p));
}

/**
 * Remove every account-scoped AsyncStorage key; keep the device-level ones (see the header).
 * Best-effort and NEVER throws: callers go on to drop the session and navigate regardless, so a storage error
 * must not leave the user signed in.
 *
 * @param {object} [storage] AsyncStorage-shaped ({ getAllKeys, multiRemove }); lazily required when omitted so
 *   importing this module never pulls the native module into unrelated test renders.
 * @returns {Promise<{ ok: boolean, removed: string[], kept: string[] }>}
 */
export async function clearAccountStorage(storage) {
  try {
    const store =
      storage ??
      (() => {
        const mod = require("@react-native-async-storage/async-storage");
        return mod?.default ?? mod;
      })();
    const keys = (await store.getAllKeys()) ?? [];
    const removed = keys.filter(isAccountKey);
    const kept = keys.filter((k) => !isAccountKey(k));
    if (removed.length > 0) await store.multiRemove(removed);
    return { ok: true, removed, kept };
  } catch {
    return { ok: false, removed: [], kept: [] };
  }
}
