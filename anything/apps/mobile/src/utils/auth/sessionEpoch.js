// A monotonically increasing counter that changes whenever the signed-in IDENTITY changes
// (logout, session expiry, account deletion, switching account — every path goes through
// useAuthStore.setAuth, see ./store.js and ./sessionCleanup.js).
//
// Async work that was started for one identity (a routines fetch, a batch of reminder
// scheduling) captures the epoch up front and re-checks it after each await. If it moved, the
// user the work was for is gone: drop the result instead of scheduling a notification or filling
// a store for the NEXT user. Kept in its own dependency-free module so stores, the auth store and
// tests can all share it without an import cycle.

let epoch = 0;

export function getSessionEpoch() {
  return epoch;
}

export function bumpSessionEpoch() {
  epoch += 1;
  return epoch;
}

// Set by the fetch layer when the server said the stored session is dead (401). The very next
// cleanup then skips the server-side push-token unregister: that request could only 401 too (and
// would re-enter the session-expiry handler). One-shot — consumed by the cleanup it belongs to.
let sessionExpired = false;

export function markSessionExpired() {
  sessionExpired = true;
}

export function consumeSessionExpired() {
  const was = sessionExpired;
  sessionExpired = false;
  return was;
}
