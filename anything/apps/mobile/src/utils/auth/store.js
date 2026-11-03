import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import { queryClient } from '@/utils/queryClient';
import { authKey, secureStoreOptions } from './secureStore';
import { cleanUpAfterIdentityChange, isIdentityChange } from './sessionCleanup';
import { persistAuth } from './persistAuth';
import { setCachedAuth } from './tokenCache';
import { isUsableToken } from './recovery';

// Re-exported for the existing importers (useAuth, tests). The definitions live
// in ./secureStore so the global fetch wrapper can share them without pulling
// zustand/react-query into the entry-file import graph.
export { authKey, secureStoreOptions };

/**
 * This store manages the authentication state of the application.
 */
// `tokenAt` (epoch ms the app received the token: sign-in or last refresh) is stamped on every session the store
// is handed, so a later clear can report how old the token was (auth_diag cleared_age_*). It is additive: the same
// token re-set without a stamp keeps the previous one, and a session stored before 1.0.5 simply has none.
const withTokenAt = (auth, previous) => {
  if (!auth || typeof auth.tokenAt === 'number') return auth;
  if (previous?.jwt === auth.jwt) {
    return typeof previous.tokenAt === 'number' ? { ...auth, tokenAt: previous.tokenAt } : auth;
  }
  return { ...auth, tokenAt: Date.now() };
};

export const useAuthStore = create((set, get) => ({
  isReady: false,
  auth: null,
  /**
   * Swap in the token the server handed back in X-Pawpi-Refreshed-Token (rolling refresh). Applied only when the
   * signed-in session is STILL the one that sent `sentJwt`: a sign-out, or a switch to another account, while the
   * request was in flight wins, so a late response can never resurrect or overwrite a session. Goes through
   * setAuth, so the Keychain write (+ read-back), the in-memory cache and the store move together.
   * @returns {boolean} whether the new token was applied
   */
  applyRefreshedToken: (sentJwt, newJwt) => {
    const current = get().auth;
    if (!current || !sentJwt || current.jwt !== sentJwt) return false;
    if (!isUsableToken(newJwt) || newJwt === current.jwt) return false;
    get().setAuth({ ...current, jwt: newJwt, tokenAt: Date.now() }, { refresh: true });
    return true;
  },
  setAuth: (nextAuth, { refresh = false } = {}) => {
    const previous = get().auth;
    const auth = withTokenAt(nextAuth, previous);
    // Identity change (logout, session expiry, account deletion, switching account): anything on
    // this device that belongs to the user going away — scheduled notifications, the push-token
    // association, their in-memory routines/reminders — is cleaned up HERE, the one place every
    // such path passes through. Runs BEFORE the stored jwt is dropped below (the push-token
    // unregister captures the old jwt synchronously). A first sign-in (no previous auth) and a
    // same-user token refresh are not identity changes. Never throws.
    if (isIdentityChange(previous, auth)) {
      try {
        cleanUpAfterIdentityChange(previous);
      } catch {
        // a logout must always complete
      }
    }
    // Keep the fetch wrapper's in-memory copy in lockstep with the Keychain (null = known signed out).
    setCachedAuth(auth ?? null);
    if (auth) {
      // Write -> read back -> retry once -> report (persistAuth). It never rejects, so a Keychain
      // failure cannot reach the unhandled-rejection / TurboModule rethrow path that crashes iOS
      // 26.x; on failure the app stays authed in memory for this session (and the failure is
      // recorded as anonymous telemetry). `get().auth === auth` stops a retry from resurrecting a
      // session the user signed out of (or replaced) while we were verifying.
      // A refresh is not a sign-in: it must not inflate the keychain_ok sign-in counter, but its failures still report.
      persistAuth(auth, { isCurrent: () => get().auth === auth, reportOk: !refresh });
    } else {
      SecureStore.deleteItemAsync(authKey, secureStoreOptions).catch(() => {});
    }
    // Every setAuth call is an identity change (login, account switch, or
    // logout). Wipe the React Query cache so one account's server data (pets,
    // posts, today-daily-update, vet record, …) can never bleed into the next
    // session — the cause of the "logs in as demo but sees another account's
    // pet + 403s" bug. The persisted selectedPetId self-corrects via
    // useCurrentPet's find()-guard once ["pets"] is empty.
    // A rolling token refresh keeps the same user, so it keeps their cache too.
    if (!refresh) queryClient.clear();
    set({ auth });
  },
}));

/**
 * This store manages the state of the authentication modal.
 */
export const useAuthModal = create((set) => ({
  isOpen: false,
  mode: 'signup',
  open: (options) => set({ isOpen: true, mode: options?.mode || 'signup' }),
  close: () => set({ isOpen: false }),
}));