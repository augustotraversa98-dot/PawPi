// persistAuth — write the session to the Keychain and PROVE it landed.
//
// The store used to fire-and-forget the write and swallow every error: if the Keychain refused the
// write the user stayed signed in only in memory and found Welcome on the next launch, with nothing
// in any log. Now, after a sign-in: write -> read back -> compare. A throw or a mismatch gets ONE
// retry; if that fails too the user simply stays signed in for this run (in memory) and the failure
// is recorded as anonymous telemetry (`auth_diag`: keychain_write_failed | keychain_readback_mismatch).
//
// Everything here is contained: it returns a promise that NEVER rejects, because an unhandled
// rejection out of a SecureStore call is what crashed iOS 26 (TurboModule rethrow).

import * as SecureStore from 'expo-secure-store';
import { authKey, secureStoreOptions } from './secureStore';
import { trackAuthDiag } from './sessionHealth';

/**
 * @param {object} auth      the { jwt, user } being signed in
 * @param {{ isCurrent?: () => boolean }} [opts]
 *   isCurrent  returns false once this session was replaced / signed out while we were verifying,
 *              so a retry can never resurrect a session the user already left.
 * @returns {Promise<'ok'|'retried_ok'|'write_failed'|'readback_mismatch'|'superseded'>}
 */
export async function persistAuth(auth, { isCurrent = () => true } = {}) {
  try {
    const value = JSON.stringify(auth);

    // one attempt: 'ok' | 'write_failed' | 'readback_mismatch'
    const attempt = async () => {
      try {
        await SecureStore.setItemAsync(authKey, value, secureStoreOptions);
      } catch {
        return 'write_failed';
      }
      try {
        const back = await SecureStore.getItemAsync(authKey, secureStoreOptions);
        return back === value ? 'ok' : 'readback_mismatch';
      } catch {
        // could not read it back: we cannot prove it was stored
        return 'readback_mismatch';
      }
    };

    let result = await attempt();
    if (result === 'ok') {
      trackAuthDiag('keychain_ok');
      return finish(isCurrent, 'ok');
    }
    if (!isCurrent()) return finish(isCurrent, 'superseded');

    const firstFailure = result;
    result = await attempt();
    if (result === 'ok') {
      trackAuthDiag('keychain_retried_ok');
      return finish(isCurrent, 'retried_ok');
    }
    // Still failing: stay signed in (memory only) and say so. No token, no id in the event.
    trackAuthDiag(
      result === 'write_failed' || firstFailure === 'write_failed'
        ? 'keychain_write_failed'
        : 'keychain_readback_mismatch',
    );
    return result;
  } catch {
    return 'write_failed';
  }
}

// If the user signed out while we were writing, the delete may have run BEFORE our write landed:
// make sure the Keychain does not keep the session they just left. (Never touches a newer account:
// that one has its own persist.)
async function finish(isCurrent, result) {
  try {
    if (!isCurrent()) {
      const { useAuthStore } = require('./store');
      if (!useAuthStore.getState().auth) {
        await SecureStore.deleteItemAsync(authKey, secureStoreOptions);
      }
      return 'superseded';
    }
  } catch {
    // contained
  }
  return result;
}
