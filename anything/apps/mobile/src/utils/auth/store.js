import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import { queryClient } from '@/utils/queryClient';
import { authKey, secureStoreOptions } from './secureStore';
import { cleanUpAfterIdentityChange, isIdentityChange } from './sessionCleanup';
import { persistAuth } from './persistAuth';
import { setCachedAuth } from './tokenCache';

// Re-exported for the existing importers (useAuth, tests). The definitions live
// in ./secureStore so the global fetch wrapper can share them without pulling
// zustand/react-query into the entry-file import graph.
export { authKey, secureStoreOptions };

/**
 * This store manages the authentication state of the application.
 */
export const useAuthStore = create((set, get) => ({
  isReady: false,
  auth: null,
  setAuth: (auth) => {
    // Identity change (logout, session expiry, account deletion, switching account): anything on
    // this device that belongs to the user going away — scheduled notifications, the push-token
    // association, their in-memory routines/reminders — is cleaned up HERE, the one place every
    // such path passes through. Runs BEFORE the stored jwt is dropped below (the push-token
    // unregister captures the old jwt synchronously). A first sign-in (no previous auth) and a
    // same-user token refresh are not identity changes. Never throws.
    const previous = get().auth;
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
      persistAuth(auth, { isCurrent: () => get().auth === auth });
    } else {
      SecureStore.deleteItemAsync(authKey, secureStoreOptions).catch(() => {});
    }
    // Every setAuth call is an identity change (login, account switch, or
    // logout). Wipe the React Query cache so one account's server data (pets,
    // posts, today-daily-update, vet record, …) can never bleed into the next
    // session — the cause of the "logs in as demo but sees another account's
    // pet + 403s" bug. The persisted selectedPetId self-corrects via
    // useCurrentPet's find()-guard once ["pets"] is empty.
    queryClient.clear();
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