// Per-request memo of "which user_profiles.id did applyIdentity already resolve AND stamp?".
//
// Why this exists (latency, not security): production runs Railway us-east4 -> Supabase sa-east-1,
// so every sequential statement costs a full cross-continent round trip (~150-180 ms). A trivial
// route like GET /api/threads/unread-count was paying ~8 of them (~1.4 s on an idle server):
// token-revocation check, BEGIN, profile lookup + set_config (applyIdentity), the SAME profile
// lookup + set_config again in the handler (resolveOrCreateUserId), the real query, COMMIT.
// withRequestContext already resolved and stamped the caller at the top of the transaction;
// resolveUserId / resolveOrCreateUserId used to redo that work. They now reuse it.
//
// Safety properties (each is load-bearing):
//   - The memo only ever holds a value applyIdentity READ from user_profiles for that exact
//     auth id on this request's own transaction, and stamped with a top-level (non-savepoint)
//     set_config — so it never grants anything the lookup itself would not have returned, and
//     the stamp it implies survives for the whole transaction.
//   - Positive results only. "No profile yet" is never memoised, so the lazy-create paths
//     (ensureUserProfile / resolveOrCreateUserId) still run their real lookup + insert.
//   - Keyed by auth id: a caller asking about a different auth id gets a normal lookup.
//   - AsyncLocalStorage scoped to one request: outside withRequestContext (unit tests with a
//     mocked sql, cron/background work) there is no scope and every call falls through to the
//     database exactly as before. Nothing is shared between requests.
//
// No imports from ./sql or ./requestContext on purpose: currentUser.js imports this module, and
// many unit tests replace those two with partial mocks.

import { AsyncLocalStorage } from 'node:async_hooks';

const identityStore = new AsyncLocalStorage();

/** Run `fn` with a fresh, empty identity memo (one per request). */
export function runWithIdentityScope(fn) {
  return identityStore.run({ authUserId: null, userId: null }, fn);
}

/** Record that `userId` was resolved and stamped for `authUserId`. No-op outside a scope. */
export function rememberRequestIdentity(authUserId, userId) {
  const scope = identityStore.getStore();
  if (!scope || authUserId == null || userId == null) return;
  scope.authUserId = String(authUserId);
  scope.userId = userId;
}

/** The memoised user_profiles.id for `authUserId`, or null (no scope / different caller / unknown). */
export function recallRequestIdentity(authUserId) {
  const scope = identityStore.getStore();
  if (!scope || authUserId == null || scope.userId == null) return null;
  return scope.authUserId === String(authUserId) ? scope.userId : null;
}
