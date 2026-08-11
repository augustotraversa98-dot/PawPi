// In-memory handoff for the provider-post detail screen (ticket 2.88).
//
// WHY: the storefront post card opens `/service/provider-post`. Previously it passed the WHOLE
// post object as a `JSON.stringify(post)` navigation param. That JSON contains the post's signed
// image URLs, which carry `?`, `&`, `%` and `://` — when expo-router serializes such a value into
// the deep-link URL (typedRoutes is enabled), the resulting href is malformed, the router fails to
// match `/service/provider-post`, and it falls back to the `/service` root ("Uh-oh! This screen
// doesn't exist"). It was the ONLY navigation in the app shoving a JSON blob through a route param.
//
// FIX: navigation now carries only small, URL-safe primitives (providerId + postId). The rich post
// object is stashed here so the detail screen still renders instantly (body + images) and guests
// read without an auth'd refetch. A cold entry (empty store, e.g. a future deep-link) degrades to
// comments-only — never a crash.

const store = new Map();
const MAX_ENTRIES = 50; // bound growth; oldest-inserted evicted first (Map preserves insert order)

const keyFor = (providerId, postId) => `${providerId}:${postId}`;

export function stashProviderPost(providerId, postId, post) {
  if (providerId == null || postId == null || !post) return;
  const k = keyFor(providerId, postId);
  store.delete(k); // re-insert so it becomes newest
  store.set(k, post);
  if (store.size > MAX_ENTRIES) {
    const oldest = store.keys().next().value;
    store.delete(oldest);
  }
}

// Peek (does NOT delete): the detail screen may read this across re-renders.
export function getProviderPost(providerId, postId) {
  if (providerId == null || postId == null) return null;
  return store.get(keyFor(providerId, postId)) ?? null;
}

// Test-only reset.
export function __clearProviderPostHandoff() {
  store.clear();
}
