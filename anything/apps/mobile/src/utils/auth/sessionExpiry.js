// Drop a session the server (or a confirming re-check) says is dead, send the user to Welcome — ONCE.
// Lives here (not inline in fetch.ts) so the fetch wrapper and the EntryPoint launch gate share the
// same one-shot guard, cleanup and telemetry. The auth store + router are required lazily so the
// entry-file fetch module keeps zustand/expo-router out of its import graph.

import { trackAuthDiag } from './sessionHealth';

// Why the session was dropped -> auth_diag kind (registry AUTH_DIAG_KINDS).
const DIAG_KIND = {
  code: 'session_cleared_code',
  recheck: 'session_cleared_recheck',
  launch_401: 'session_cleared_launch_401',
  launch_403: 'session_cleared_launch_403',
};

let sessionExpiryInFlight = false;

/**
 * @param {{ reason: 'code'|'recheck'|'launch_401'|'launch_403', jwt?: string, navigate?: boolean, markExpired?: boolean }} opts
 *   jwt      the token that failed. If the signed-in session has since changed (sign-out, another
 *            account) a late 401 for the OLD token is ignored instead of killing the new session.
 *   navigate false at launch: the EntryPoint redirects itself, a second replace would double-navigate.
 *   markExpired false keeps the cleanup's push-token unregister (the launch gate always did that).
 */
export function expireSession({ reason, jwt, navigate = true, markExpired = true }) {
  // Several queries usually fail together; sign out once.
  if (sessionExpiryInFlight) return;
  sessionExpiryInFlight = true;
  try {
    const { useAuthStore } = require('@/utils/auth/store');
    const current = useAuthStore.getState().auth;
    if (jwt && current && current.jwt !== jwt) return;
    if (current) {
      // The server already rejected this session: the cleanup in setAuth must not try to
      // unregister the push token as that (dead) user.
      if (markExpired) require('@/utils/auth/sessionEpoch').markSessionExpired();
      useAuthStore.getState().setAuth(null);
      trackAuthDiag(DIAG_KIND[reason] ?? 'session_cleared_code');
    }
    // Anonymous telemetry only: tag the coming landing on Welcome as "session_expired" (annotation, no
    // navigation change; it can never throw into the session handling below).
    try {
      require('@/telemetry/navExpect').markNavigationReason('session_expired');
    } catch {
      // ignore
    }
    if (navigate) {
      const { router } = require('expo-router');
      router.replace('/welcome');
    }
  } catch {
    // Never let session handling break the request itself.
  } finally {
    // Allow a later, genuinely new session to be handled again.
    setTimeout(() => {
      sessionExpiryInFlight = false;
    }, 1000);
  }
}

// Test-only: clear the one-shot guard between cases.
export const __resetSessionExpiryForTests = () => {
  sessionExpiryInFlight = false;
};
