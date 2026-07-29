import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import { queryClient } from '@/utils/queryClient';
import { authKey, secureStoreOptions } from './secureStore';

// Re-exported for the existing importers (useAuth, tests). The definitions live
// in ./secureStore so the global fetch wrapper can share them without pulling
// zustand/react-query into the entry-file import graph.
export { authKey, secureStoreOptions };

/**
 * This store manages the authentication state of the application.
 */
export const useAuthStore = create((set) => ({
  isReady: false,
  auth: null,
  setAuth: (auth) => {
    if (auth) {
      SecureStore.setItemAsync(
        authKey,
        JSON.stringify(auth),
        secureStoreOptions,
      ).catch(() => {
        // Swallow Keychain write errors — the app remains in-memory authed
        // for this session and the next launch will re-auth via the WebView.
        // Throwing here would propagate into the unhandled-rejection /
        // TurboModule rethrow path and crash on iOS 26.x.
      });
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