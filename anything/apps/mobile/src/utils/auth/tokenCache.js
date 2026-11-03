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
// Two rules keep a slow Keychain read from clobbering newer state (docs/auth-logout-after-1.0.4-diagnosis.md, H4):
//   - a Keychain READ result is only written when the cache is still undefined when the read resolves (a sign-in,
//     refresh or logout that landed meanwhile wins; the old code could resurrect the session a logout had just cleared);
//   - concurrent first requests share ONE Keychain read instead of each starting their own (loadCachedAuth).
//
// Depends on nothing: like ./secureStore it is imported by the fetch wrapper at the very top of the entry file.

let cached; // undefined | null | { jwt, user }
let firstRead = null; // the in-flight Keychain read, shared by concurrent callers

export function getCachedAuth() {
  return cached;
}

export function setCachedAuth(auth) {
  cached = auth === undefined ? undefined : auth;
}

/** Cache a Keychain read result, but only a real session and only if nothing has set the cache since. */
export function setCachedAuthIfUnset(auth) {
  if (cached === undefined && auth) cached = auth;
}

/**
 * The session for a request: the cached copy, or ONE shared Keychain read (`read` resolves the parsed session or
 * null; a throw counts as null). The result is cached only via setCachedAuthIfUnset, and what every waiter gets
 * is whatever the cache holds once the read resolves — so a logout/sign-in that landed meanwhile is respected.
 * @returns {Promise<{ jwt: string, user: object } | null>}
 */
export function loadCachedAuth(read) {
  if (cached !== undefined) return Promise.resolve(cached);
  if (!firstRead) {
    const mine = Promise.resolve()
      .then(read)
      .catch(() => null)
      .then((auth) => {
        setCachedAuthIfUnset(auth);
        return cached !== undefined ? cached : (auth ?? null);
      })
      .finally(() => {
        if (firstRead === mine) firstRead = null;
      });
    firstRead = mine;
  }
  return firstRead;
}

/** Test seam: forget everything. */
export function resetCachedAuthForTests() {
  cached = undefined;
  firstRead = null;
}
