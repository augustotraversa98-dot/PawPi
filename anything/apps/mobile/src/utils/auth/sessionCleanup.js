// Identity-change cleanup: everything on THIS DEVICE that belongs to the previous user and must
// not outlive them. Called from useAuthStore.setAuth — the one choke point every logout path
// funnels through (manual logout, business logout, account deletion, 401 / session expiry,
// EntryPoint clearSession, "Use a different account" / startOver, a direct switch to another
// user) — so no individual path can forget it.
//
//   1. bump the session epoch  → in-flight reminder loads/scheduling for the old user abandon
//   2. unregister this device's push token for the old user (DELETE /api/push-tokens, sent with
//      the OLD jwt explicitly, because setAuth drops the stored one in the same tick) and let
//      the next login register it again
//   3. cancel EVERY locally scheduled notification (routine reminders, walks, telehealth,
//      streak-save, daily-return) — they were scheduled from the old user's data
//   4. empty the in-memory routines/reminders stores (and the local in-app reminder rows in the
//      notification centre) so the next user's tab mount can never re-schedule the previous
//      user's routines or see their reminder rows
//
// Every step is best-effort and isolated: a failure in one never blocks another, and nothing
// here throws (a logout must always complete). It does NOT create or change reminders — after
// the next login they are scheduled exactly as before, from that user's own routines.

import { bumpSessionEpoch, consumeSessionExpired } from "./sessionEpoch";

const warn = (step, error) => {
  console.warn(`[sessionCleanup] ${step} failed:`, error?.message ?? error);
};

/** Stable identity of an auth blob, or null. `user.id` is auth_users.id; the jwt is the fallback. */
export function identityKey(auth) {
  if (!auth) return null;
  const id = auth.user?.id;
  return id != null ? `u:${id}` : auth.jwt ? `j:${auth.jwt}` : null;
}

/** true when moving from `previous` to `next` means a different person (or no one) is signed in. */
export function isIdentityChange(previous, next) {
  if (!previous) return false; // first sign-in: nothing from a previous user to clean up
  return identityKey(previous) !== identityKey(next);
}

/**
 * Run the cleanup for a user who is going away. Returns a promise that settles once the
 * notification + push-token work is done (callers do not need to await it; tests do).
 *
 * @param {{ jwt?: string } | null} previousAuth the auth blob being replaced (its jwt is needed
 *   to unregister the push token, because the request goes out after the stored jwt is gone)
 */
export function cleanUpAfterIdentityChange(previousAuth) {
  try {
    bumpSessionEpoch();
  } catch (error) {
    warn("epoch", error);
  }

  const tasks = [];
  const sessionExpired = consumeSessionExpired();

  // 2. push token — started FIRST so it is already in flight with the old jwt. When the session
  // is already dead (401) the server cannot be reached as that user: skip the call, still reset.
  tasks.push(
    (async () => {
      const { unregisterPushTokenAsync, resetPushTokenRegistration } = require("@/utils/registerPushToken");
      resetPushTokenRegistration(); // the next login must register again (the memo is per process)
      if (sessionExpired) return;
      await unregisterPushTokenAsync({ jwt: previousAuth?.jwt });
    })().catch((error) => warn("push token", error)),
  );

  // 3. local notifications
  tasks.push(
    (async () => {
      const { cancelAllNotifications, cancelDailyReturnReminder } = require("@/utils/notifications");
      await cancelDailyReturnReminder(); // also forgets its persisted id
      await cancelAllNotifications();
    })().catch((error) => warn("notifications", error)),
  );

  // 4. in-memory stores (lazy requires: the stores import the notification layer)
  try {
    const useRoutinesStore = require("@/store/routinesStore").default;
    const useRemindersStore = require("@/store/remindersStore").default;
    const useSocialPetStore = require("@/store/socialPetStore").default;
    useSocialPetStore.setState({ notifications: [], unreadNotificationCount: 0 });
    useRoutinesStore.setState({ routines: [], initialized: false, loading: false, error: null });
    useRemindersStore.setState({ reminders: [], snoozes: {} });
  } catch (error) {
    warn("stores", error);
  }

  return Promise.all(tasks).then(() => undefined);
}
