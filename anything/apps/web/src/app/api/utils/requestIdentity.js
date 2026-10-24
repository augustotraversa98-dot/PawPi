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

// ---------------------------------------------------------------------------------------------------------
// Process-wide cache of auth_user_id -> user_profiles.id (perf audit 2026-10-23, finding 1 / section 5.2).
//
// The per-request memo above saves the handler a second lookup, but withRequestContext still paid one
// awaited cross-region round trip per request to resolve the caller before the handler's first statement.
// The mapping is effectively immutable (user_profiles.auth_user_id is UNIQUE, ids are never reassigned), so
// after the first request the answer can be remembered and the identity stamp (`set_config`) sent PIPELINED
// with the handler's first statement instead of awaited alone: one round trip fewer on every request.
//
// Safety properties:
//   - POSITIVE results only, and only what applyIdentity READ from user_profiles for that exact auth id.
//     "No profile yet" is never cached, so lazy profile creation behaves exactly as before.
//   - Bounded staleness: a short TTL (default 5 min, IDENTITY_CACHE_TTL_MS; 0 disables the cache) and an
//     explicit forget on account deletion. The cache only ever supplies the id to STAMP; every owner-scoped
//     policy still keys on the stamped value, and a wrong/stale id could only point at a profile that no
//     longer exists (matching nothing), never at another user's, because ids are not reused.
//   - Keyed by the auth id the verified session carries; a different caller never reads another's entry.
//   - Size-capped; the oldest entry is evicted first.

const DEFAULT_IDENTITY_TTL_MS = 5 * 60 * 1000;
const MAX_CACHED_IDENTITIES = 5000;
const profileIdCache = new Map(); // String(authUserId) -> { userId, expiresAt }

function identityTtlMs() {
  const raw = process.env.IDENTITY_CACHE_TTL_MS;
  if (raw === undefined || raw === '') return DEFAULT_IDENTITY_TTL_MS;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_IDENTITY_TTL_MS;
}

/** The cached user_profiles.id for `authUserId`, or null (unknown, expired, or the cache is disabled). */
export function getCachedProfileId(authUserId, now = Date.now()) {
  if (authUserId == null) return null;
  const key = String(authUserId);
  const hit = profileIdCache.get(key);
  if (!hit) return null;
  if (hit.expiresAt <= now) {
    profileIdCache.delete(key);
    return null;
  }
  return hit.userId;
}

/** Remember a profile id that was just READ from user_profiles for `authUserId`. */
export function cacheProfileId(authUserId, userId, now = Date.now()) {
  const ttl = identityTtlMs();
  if (ttl === 0 || authUserId == null || userId == null) return;
  const key = String(authUserId);
  profileIdCache.delete(key); // re-insert so Map order == age order
  profileIdCache.set(key, { userId, expiresAt: now + ttl });
  while (profileIdCache.size > MAX_CACHED_IDENTITIES) {
    profileIdCache.delete(profileIdCache.keys().next().value);
  }
}

/** Drop one caller's entry (account deletion). */
export function forgetCachedProfileId(authUserId) {
  if (authUserId != null) profileIdCache.delete(String(authUserId));
}

/** Drop everything (tests). */
export function clearCachedProfileIds() {
  profileIdCache.clear();
}
