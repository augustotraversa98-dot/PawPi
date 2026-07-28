import * as SecureStore from 'expo-secure-store';

/**
 * Single source of truth for how the auth JWT is addressed in the Keychain.
 *
 * Both the key and the options MUST be identical on every read and write.
 * expo-secure-store derives the Keychain `kSecAttrService` from
 * `options.keychainService` and falls back to the literal `"app"` when the
 * option is omitted (see SecureStoreModule.swift `query(with:options:)`), so a
 * read that forgets these options looks in a *different* Keychain partition
 * and comes back empty — silently, as errSecItemNotFound maps to nil.
 *
 * That is exactly how login used to break: the store wrote the token under
 * `anything-auth`, the global fetch wrapper read it under `app`, found nothing,
 * and sent every first-party API request with no Authorization header. The
 * EntryPoint gate then saw 401 on /api/pets, treated the fresh session as
 * expired, cleared it and bounced the user back to Welcome. Import these
 * constants rather than re-declaring them so the two halves can never drift.
 *
 * This module deliberately depends on nothing but expo-secure-store: it is
 * pulled in by src/__create/polyfills at the very top of the entry file, before
 * the app graph loads, and must not drag zustand/react-query into that path.
 */
export const authKey = `${process.env.EXPO_PUBLIC_PROJECT_GROUP_ID}-jwt`;

/**
 * - keychainService: pinned to a stable name so reads and writes always hit
 *   the same partition. Without this, SecureStore derives a service name from
 *   the bundle that can drift between Classic and EAS builds, causing reads
 *   to miss writes from a previous build.
 * - keychainAccessible: AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY allows the auth
 *   token to be read on every cold launch after the device has been unlocked
 *   once since boot. The default (WHEN_UNLOCKED) refuses access during the
 *   first-unlock window, which is the most common TestFlight failure mode.
 * - requireAuthentication: false keeps SecureStore on its non-biometric code
 *   path, so it never reads NSFaceIDUsageDescription or constructs a
 *   biometry-current-set access control object — both of which can throw
 *   NSException and trip iOS 26's unhandled async-void TurboModule rethrow.
 */
export const secureStoreOptions = {
  keychainService: 'anything-auth',
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
  requireAuthentication: false,
};
