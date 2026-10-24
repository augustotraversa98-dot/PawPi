// In-memory copy of the stored session, so the global fetch wrapper does not hit the Keychain (a native
// SecureStore read + JSON.parse) before EVERY first-party request. The cold-start burst alone is ~13 requests,
// each of which used to wait on its own awaited native call (perf audit 2026-10-23, F1.6).
//
// Three states, deliberately distinct:
//   undefined  unknown — nothing cached yet, the caller reads the Keychain (and caches a real result);
//   null       known signed out — set by the auth store on logout / session expiry;
//   object     the { jwt, user } the auth store last wrote.
// The auth store (utils/auth/store.js setAuth) is the only writer of the Keychain item, and it updates this cache
// in the same call, so the two cannot drift. A failed or empty Keychain read is NEVER cached, so a transient
// Keychain error cannot strip the Authorization header from later requests.
//
// Depends on nothing: like ./secureStore it is imported by the fetch wrapper at the very top of the entry file.

let cached; // undefined | null | { jwt, user }

export function getCachedAuth() {
  return cached;
}

export function setCachedAuth(auth) {
  cached = auth === undefined ? undefined : auth;
}

/** Test seam: forget everything. */
export function resetCachedAuthForTests() {
  cached = undefined;
}
