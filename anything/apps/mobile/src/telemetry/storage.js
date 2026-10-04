// Thin async key-value adapters over the native stores, loaded LAZILY (require inside each call) so importing
// telemetry never touches a native module and a missing/mocked module only fails the one call (which every
// caller already catches). Interface: { getItem(key), setItem(key, value), removeItem(key) } -> Promise.

/** AsyncStorage (UI preferences, funnel "once" markers). */
export function asyncStorageKv() {
  const store = () => {
    // eslint-disable-next-line global-require
    const mod = require('@react-native-async-storage/async-storage');
    return mod?.default ?? mod;
  };
  return {
    getItem: async (key) => store().getItem(key),
    setItem: async (key, value) => store().setItem(key, value),
    removeItem: async (key) => store().removeItem(key),
  };
}

/**
 * SecureStore (install_id, opt-out mirror). The SAME options are used on every read, write and delete: expo-secure-store
 * resolves a different Keychain service when they differ (the bug documented in utils/auth/secureStore.js).
 * A separate keychainService keeps this away from the auth token entry.
 */
export function secureStoreKv(keychainService = 'pawpi-telemetry') {
  const load = () => {
    // eslint-disable-next-line global-require
    const SecureStore = require('expo-secure-store');
    const options = {
      keychainService,
      keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
      requireAuthentication: false,
    };
    return { SecureStore, options };
  };
  return {
    getItem: async (key) => {
      const { SecureStore, options } = load();
      return SecureStore.getItemAsync(key, options);
    },
    setItem: async (key, value) => {
      const { SecureStore, options } = load();
      return SecureStore.setItemAsync(key, value, options);
    },
    removeItem: async (key) => {
      const { SecureStore, options } = load();
      return SecureStore.deleteItemAsync(key, options);
    },
  };
}
