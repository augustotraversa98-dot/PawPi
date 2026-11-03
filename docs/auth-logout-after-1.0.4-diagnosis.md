# Signed-in users logged out after 1.0.4 — diagnosis and fix

Status: diagnosis (sections below) plus the approved fix (see "Implementation"). Build 30 = 1.0.4; build 27 (`d49b494c`) = 1.0.3.
Written 2026-11-02 against `origin/main` @ `95b2e2dc`; telemetry evidence and implementation notes added the same day.

## TL;DR

1. **Most likely cause is not on the phone and not in 1.0.4.** Since A-05 (#554, merged 2026-09-14) the server issues
   session JWTs with `session.maxAge = 7 days`, and **nothing ever refreshes them**: the app stores the token it got at
   sign-in and replays it unchanged. Every user is therefore signed out **exactly 7 days after their last sign-in**,
   however often they open the app. "After updating to 1.0.4" is most likely coincidence — the update made them open
   the app, and the token was already past its `exp`.
2. The "server is not rejecting sessions" premise does not hold up: the one build-30 device you saw got **401 on all
   three requests, including the DELETE that carries an explicit Bearer** (see below). That is the signature of a token the
   server rejected, not of a missing header. `token_invalidated_at = NULL` for all rows only rules out *revocation*;
   it says nothing about *expiry*, which has no column — it lives inside the encrypted JWT.
3. #718 (the in-memory token cache) does **not** introduce a new "no token" state. It has one low-probability race
   (H4) worth a one-line guard.
4. There is a **second, real bug** that can log a user out on a transient failure (H3): a request that goes out
   *without* a bearer gets a 401 that the server stamps `session_expired`, and the launch gate believes that stamp
   without checking a bearer was sent. It predates 1.0.4 and is a plausible rare contributor.
5. **Telemetry (added 2026-11-02, see next section) supports H1 and does not support a Keychain cause.**

## Telemetry evidence (Grafana `auth_diag`, last 14 days, supplied by Augusto)

| kind | 1.0.4 (build 30) | 1.0.3 (build 27) |
|---|---|---|
| `launch_token_found` | 5 | 16 |
| `launch_no_token` | 3 | 6 |
| `keychain_ok` | 4 | 11 |
| `session_cleared_launch_401` | 2 | 1 |
| `keychain_write_failed` | 0 | n/a |
| `keychain_readback_mismatch` | 0 | n/a |

- Both 1.0.4 clears were a `401` on `GET /api/pets` at cold launch **immediately after `launch_token_found`**, matching
  Railway 401s on 2026-11-01 12:36Z and 2026-11-02 12:22Z (build 30). The token was found and sent; the server
  rejected it. That is the H1 signature ("token found, server says expired") and the opposite of a Keychain cause
  (H2 would show `launch_no_token` with no 401).
- The rate is the same order on 1.0.3 (1 clear / 16 token-found launches vs 2 / 5), so there is no evidence of a
  1.0.4 regression; the small counts cannot say more.
- `launch_no_token` (3 and 6) is a minority of launches and is not paired with any server 401, so it is the benign
  "signed out / fresh install / sign-in not completed" mix plus whatever H2 contributes. It stays unexplained until
  the new `launch_read_timeout` / `launch_read_error` kinds split it (PR 2).
- `keychain_write_failed = 0` and `keychain_readback_mismatch = 0`: sign-in tokens do reach the Keychain.
- **AUTH_SECRET was rotated on 2026-10-21/22.** Tokens issued before that are signature-invalid (one-time,
  expected): they decode to nothing and 401 exactly like an expired token, so some of the clears above may be
  those. They cannot recur.

## Evidence that the observed 401 trio carries a bearer

Observed on a build-30 device within 0.3 s: `POST /api/push-tokens`, `GET /api/pets`, `DELETE /api/push-tokens`, all 401.

- `DELETE /api/push-tokens` is sent only by `unregisterPushTokenAsync({ jwt })`, which returns early `if (!jwt)`
  (`utils/registerPushToken.js:103`) and sets `Authorization: Bearer ${jwt}` itself. It runs only from
  `cleanUpAfterIdentityChange(previousAuth)` — i.e. **after** `setAuth(null)` with a previous, non-null session.
  So a session with a jwt existed in the store and was sent explicitly.
- The fetch wrapper only overrides that header when its *own* auth is truthy; at that point `setAuth(null)` has already
  set the cache to `null`, so the explicit header survives (`__create/fetch.ts:174`).
- A DELETE with a *valid* bearer would be 200/404, not 401. A 401 there means the server rejected that jwt.
- The sequence POST → GET pets → (clear) → DELETE is exactly the launch-gate path: `EntryPoint` → `isSessionDead` →
  `expireSession({reason:'launch_401', markExpired:false})` → cleanup → unregister attempt.

Caveat: I have not seen the raw log lines; this is inferred from code. If the DELETE came from a manual sign-out the
inference weakens — the 0.3 s spacing argues against it.

## Hypotheses, ranked

### H1 — 7-day absolute JWT expiry, no refresh (HIGH; supported by the telemetry above)

- `web/__create/index.ts:251` `session: { strategy: 'jwt', maxAge: 7*24*60*60 }`. In `@auth/core` 0.37.4 `jwt.maxAge`
  defaults to `session.maxAge` (`lib/init.js:83`), so `exp = iat + 604800`. Verified locally: `encode(maxAge=7d)` →
  `exp-iat = 604800`; a token past `exp` makes `decode` throw `ERR_JWT_EXPIRED` (Auth.js allows 15 s clock tolerance
  only). `getToken` swallows that → unauthenticated → per-route `auth()` 401 → `stampSessionExpired` adds
  `session_expired`.
- Nothing re-issues the token. Mobile only reads `/api/auth/token` at sign-in (`AuthWebView.jsx`, `socialAuth.js`);
  no code calls `/api/auth/session` (which is what makes Auth.js roll a cookie). The audit itself notes "replays it with
  no refresh" (`AUDIT_2026-09.md`, A-05 Location) and shipped 7 d without a refresh path.
- Client then does the correct thing for a dead token: `launch_401` → `setAuth(null)` → Welcome. So this is "working as
  designed", which is why nothing looks broken in the logs.
- Fits: only ~5 401s in 5 days (a few active users × one expiry each, ×3 requests per launch-gate clear); 0 revocations;
  1.0.3 users get the identical treatment; #698 (2026-10-20, "logged out every time") was shipped for the same symptom and
  hardened the client but could not fix an honest expiry.
- Against: the timing "after the update" feels like a regression; if everyone is logged out weekly, someone would have
  said so earlier. (Counter: low user count; testers re-sign-in without reporting.)
- **Prediction:** `session_cleared_launch_401` (and `_code`) is the dominant clear, `launch_token_found` ≈ launches,
  clears cluster ~7 days after a sign-in, and the same count appears for 1.0.3.

### H2 — Keychain read returns nothing at cold launch (MEDIUM-LOW; unchanged since before build 27)

All of these end in `auth = null` → Welcome **without any 401 and without deleting the item** (so the *next* cold
launch usually recovers — a user who "had to sign in again" would not notice). They emit `launch_no_token`.

| Path | Code | Notes |
|---|---|---|
| Read slower than 3 s | `useAuth.js:28-31` races a 3 s timer that resolves `null` | A late Keychain answer is then ignored; the first launch after an app update (cold securityd, disk) is the slowest. Indistinguishable from "no token" today. |
| Read throws | `useAuth.js:38-42` | Device locked and before first unlock (push-triggered background launch right after reboot); `AFTER_FIRST_UNLOCK` covers every case after the first unlock. |
| Startup fallback | `startupFallback.js:27-33` forces `auth:null,isReady` at 4 s if still not ready | Same family. |
| `JSON.parse` throws | same `.catch` | Corrupt blob; unlikely. |
| Item not visible to the new build | Keychain access group / service / accessibility mismatch | `secureStore.js` last changed 2026-07-28 (#260), so builds 27 and 30 read identically — an attribute mismatch would already have hit 1.0.3. **Not checked here:** a change of signing team / `keychain-access-groups` entitlement between builds would hide the item. Worth diffing `codesign -d --entitlements` on build 27 vs 30 (needs the .ipa). `…THIS_DEVICE_ONLY` also means a restore to a new phone always signs out. |

A background launch while locked is not a logout by itself: the user never sees Welcome, and the item survives.

### H3 — A header-less request is read as a dead session (LOW-MEDIUM; real bug, pre-existing)

- `useAuth.initiate` and the fetch wrapper read the Keychain **independently**. If initiate succeeds (store = authed) but
  the wrapper's read for `GET /api/pets` fails or times out, the request goes out with **no `Authorization`**
  (`fetch.ts:164-170` swallows the error, nothing is cached).
- The server answers 401 and `stampSessionExpired` stamps `session_expired` on **every** non-machine 401, including
  "no token" (`sessionExpiredCode.js`, no distinction).
- `fetchPets` sets `error.sessionExpired = true` from that stamp (`launchQueries.js`), `EntryPoint` passes
  `hasCode: true` to `isSessionDead` → `dead` with **no re-check**, → `setAuth(null)` → **Keychain item deleted**. A
  transient read failure becomes a permanent logout.
- The wrapper's own handler is safe (`auth && status===401`: only if a bearer was attached); the EntryPoint path has no
  equivalent guard, and it passes the *store's* `auth.jwt`, not what was actually sent.
- Why I rank it below H1: the observed trio's DELETE 401 contradicts it for that device (a valid token + explicit header
  would not 401), and it needs a failure the wrapper rarely has. It is the only path where a *transient* error can log
  a user out, so it violates the stated rule and should be fixed regardless.

### H4 — #718 cache races (LOW)

What #718 does: cache is `undefined` (unknown) / `null` (signed out) / object, written only by `setAuth`; failed or empty
reads are never cached (`fetch.ts:166-171`, `tokenCache.js`). Walked through:

- **No new "no token" state.** Before #718 each request read the Keychain; a failed read already meant "no header".
  After #718 a failed read is retried on the next request, strictly better.
- **Cache never diverges from the Keychain** in steady state: `setAuth` writes both; no other writer of `authKey`
  exists (grep: only `persistAuth`, `store.js` delete, `useAuth`/wrapper reads). `useAuth.initiate` and
  `startupFallback` call `setState` directly and leave the cache `undefined` — harmless (wrapper falls back to the
  Keychain).
- **One latent race:** the cold-launch burst (~13 requests) all see `undefined`, so ~13 Keychain reads run
  concurrently with no de-dupe, and each does `if (auth) setCachedAuth(auth)` *after* its await. If `setAuth(null)` /
  `setAuth(new)` runs while one of those reads is in flight, the late completion **overwrites the cache with the old
  session**. Effects: after a launch-gate clear, a straggler can resurrect the dead token in the cache (Keychain is
  already deleted), so later requests send a dead bearer until the next sign-in; after an account switch it could send the
  old user's bearer. Window is milliseconds at cold start; not a logout cause, but it is a correctness hole.
- **Cold-launch Keychain read** (Q2) is the same as before #718; no new timeout path was added.

### H5 — A stale late 401 kills a newer session (RULED OUT for the wrapper; caveat for EntryPoint)

- Wrapper path: `expireSession({jwt})` returns early when `current.jwt !== jwt` (`sessionExpiry.js:35`), and `jwt` is
  the token actually sent. A new sign-in always has a new jwt (new `iat`), so an old token's late 401 is ignored.
- Side effect: that early return still sets the 1 s one-shot guard (`sessionExpiryInFlight`), so a *genuine* expiry
  within that second is dropped (then handled by the next 401). Harmless.
- Caveat: `EntryPoint` passes the store's jwt rather than the sent one (H3).
- `sessionHealth`'s `aliveUntil` 30 s cooldown can only *suppress* a clear, never cause one.

### Other things checked and ruled out

- Server revocation: all 122 `token_invalidated_at` NULL ⇒ `isTokenRevoked` is never true (fails open on DB error).
- `AUTH_SECRET` rotation would 401 everyone at once; ~5 401s total says no.
- Ghost-sub tokens (non-integer `sub`, pre-#582 Google sign-ins) → 401, but those tokens are > 7 days old now.
- `markMalformed` clear (`isUsableToken`): token shape comes from the server; not a live path.

## Every path that clears the session / yields "no token"

| Path | Trigger | auth_diag kind |
|---|---|---|
| Wrapper `handleUnauthorized` → `expireSession('code')` | non-launch 401 with header `session_expired` while a bearer was sent | `session_cleared_code` |
| Wrapper → `isSessionDead` → recheck | 401 w/o code, `/api/session` also 401 | `session_cleared_recheck` |
| EntryPoint launch gate | `/api/pets` 401 (stamped or re-check dead) | `session_cleared_launch_401` |
| EntryPoint launch gate | `/api/pets` 403 + dead verdict | `session_cleared_launch_403` |
| EntryPoint | malformed token (`isUsableToken`) | **none** |
| `useAuth.initiate` | Keychain read null / 3 s timeout / throw | `launch_no_token` (conflated) |
| `startupFallback` | 4 s hard deadline | `launch_no_token` (conflated) |
| Manual: `signOut`, `OwnerMenu`, `AppSettings`, `business/profile`, `startOver`, delete-account | user action | none |

## What to read from telemetry (per app_version, 7 d)

| Observation | Meaning |
|---|---|
| `session_cleared_launch_401` + `session_cleared_code` high, `launch_token_found` ≈ launches | H1 (or H3). Same on 1.0.3 ⇒ H1, not a regression. |
| `launch_no_token` high **and** few `session_cleared_*` | H2. |
| `keychain_write_failed`/`readback_mismatch` > 0 | Sign-in token never persisted: separate bug class. |
| `recheck_alive` > 0 | Business 401s the client correctly ignored (good). |
| 1.0.3 ≈ 1.0.4 per-launch rate | Not a 1.0.4 regression. |

Cheap extra check needing no code: ask the friend when he last typed his password. If it was ~7 days before the
logout, H1 is confirmed.

## Smallest safe fix for the top hypothesis (H1) — NOT implemented, needs approval

> **Implemented** in PR 1 (server) as A + B together and PR 2 (app); see "Implementation" at the end.

**Option A (smallest, config only):** raise `session.maxAge` from 7 d to 30 d (`web/__create/index.ts:251`). A-05's
real protection is the `token_invalidated_at` check, which stays. Tokens already issued keep their baked-in `exp`, so
this only helps from the next sign-in; users currently on 7 d tokens still hit it once. Risk: a leaked token that is
*not* revoked stays valid up to 30 d instead of 7 (the pre-A-05 posture, minus the revocation hole). Needs the same
security sign-off A-05 had.

**Option B (proper): rolling refresh.** Server re-signs the token when it is older than a threshold (e.g. > 3 d) and
returns it in a response header (e.g. `X-Pawpi-Token`), and the fetch wrapper stores it via `setAuth` (same user ⇒ not
an identity change). Keeps 7 d bounded for an *idle* leaked token while active users never see Welcome. Risk: adds an
API response header (you excluded API changes for this task), touches the auth path on every request, and needs a device
test of the rotation + `persistAuth` read-back. Recommended as the real fix, but only with approval.

## Smallest safe fixes for H3 and H4 (client only, no API change)

- **H3:** at the EntryPoint (and `fetchPets`), only honour a `session_expired` stamp when a bearer was actually sent. In
  the wrapper, expose "was a bearer attached" on the response (e.g. a `WeakSet`/symbol), and when the launch 401 was
  header-less, do **not** clear: retry once after re-reading the Keychain, else show the existing retry screen. Never
  weakens auth: a 401 with a bearer still clears; a header-less 401 can never log anyone out. Risk: low; one extra
  branch at launch. Test: unit test with the wrapper's Keychain read mocked to reject.
- **H4:** only write the cache if it is still `undefined` after the await (`if (auth && getCachedAuth() === undefined)`),
  and de-dupe concurrent first reads with one shared promise. Risk: very low.
- **H2 (optional):** make the 3 s guard on `initiate` non-destructive: if it fires, keep `isReady=true` but treat the
  late result as authoritative when it arrives (re-hydrate), instead of dropping it. Risk: medium (touches the
  un-brick guarantee in `startupFallback`); only after telemetry says H2 matters.

## Minimum extra anonymous `auth_diag` kinds (if H1 can't be confirmed from existing data)

Add to `AUTH_DIAG_KINDS` in both `web/src/lib/telemetry/registry.js` and `mobile/src/telemetry/registry.js` (the web
allowlist must ship first or the events are rejected). No tokens, ids or emails:

- `launch_read_timeout` — the 3 s guard fired (splits `launch_no_token` into timeout vs throw vs empty).
- `launch_read_error` — the Keychain read threw.
- `launch_401_no_bearer` — the launch 401 went out without an Authorization header (H3 signal).
- `cleared_age_lt7d`, `cleared_age_ge7d`, `cleared_age_unknown` — age of the cleared session, from a new
  `signedInAt` epoch-ms stored next to `jwt`/`user` (additive field; sessions that predate it report `unknown`). This is
  the single most decisive signal for H1: expiry clears will all be `ge7d`.

## Implementation (approved 2026-11-02)

**PR 1 — server, backward compatible, ships first (no app build needed)**

- `session.maxAge` is now `AUTH_JWT_MAX_AGE_SECONDS` (default **30 days**, hard cap 1 year, invalid values ignored).
- Rolling refresh in `web/src/app/api/utils/sessionGuard.js` (the revocation guard moved out of `__create/index.ts` so it
  can be tested): on an authenticated **Bearer** `/api/*` request answered with a 2xx/3xx whose token is older than
  `AUTH_JWT_REFRESH_AFTER_SECONDS` (default **24 h**; must be below the lifetime, else it falls back to the default or
  to half the lifetime), the response carries `X-Pawpi-Refreshed-Token`: the same claims with a fresh `iat`/`exp`/`jti`,
  encoded with the same secret and cookie salt as sign-in. The response also gets `Cache-Control: private, no-store`
  so no shared cache can store a credential.
- Never refreshes on any 4xx/5xx (so never on a 401), on `/api/auth/*`, for a cookie-only request, for a revoked or
  ghost token, or when the request itself revoked the token (the revocation lookup is repeated just before minting;
  covers reset-password / sign-out-everywhere).
- Revocation still applies: the refreshed token has a new `iat`, so a `token_invalidated_at` cutoff kills every older
  token (including the one it replaced) and the 30 s cutoff cache is unchanged. The refresh lookup reuses that cache.
- Old builds (21-30) ignore the header; nothing else about the response changes. `CORS_ORIGINS` now also sends
  `Access-Control-Expose-Headers: X-Pawpi-Refreshed-Token`. No schema change, no new endpoint.
- Residual risks: a leaked token that is never revoked now lives up to 30 days instead of 7, and anyone replaying
  it also receives refreshed tokens (a thief who keeps using it keeps it alive). Revocation (password reset) is the
  mitigation and is unchanged. If the DB lookup fails the guard fails
  open (as before) and **no** refresh happens. Account deletion does not currently call `invalidateUserTokens`
  (only reset-password does), so a deleted user's token is not revoked by that path — unchanged by this PR.
- Env for a device test (set on a test server, then redeploy): `AUTH_JWT_MAX_AGE_SECONDS=300`,
  `AUTH_JWT_REFRESH_AFTER_SECONDS=60`. Tokens already issued keep their original `exp`; sign in again after changing.

**PR 2 — app (1.0.5, no version bump; implemented)**

- **Refresh stored**: `__create/fetch.ts` reads `X-Pawpi-Refreshed-Token` on a 2xx/3xx first-party `/api` response (not
  `/api/auth/*`, not while the launch gate is deciding) and calls `useAuthStore.applyRefreshedToken(sentJwt, newJwt)`. That
  goes through `setAuth(…, { refresh: true })`: Keychain write + read-back (`persistAuth`), the in-memory `tokenCache` and the
  store move together. It is ignored when the signed-in session is no longer the one that sent the request (sign-out or
  another account while in flight), when the value is not a well-formed token, or when it is the token we already hold.
  A refresh keeps the user's React Query cache (no identity change) and does not emit `keychain_ok`.
- **H3 closed**: the wrapper marks every response whose request carried the stored token (`markBearerSent`);
  `fetchPets` only reports `sessionExpired` when the 401 answers a request that sent a token. A header-less 401 at launch
  goes to the existing re-check (which sends the stored token explicitly): alive → retry screen, 401 → cleared. It is
  counted as `launch_401_no_bearer`.
- **H4 closed**: `tokenCache.loadCachedAuth` shares ONE Keychain read between concurrent first requests and writes the
  result with `setCachedAuthIfUnset`, so a read that resolves after a logout / sign-in / refresh cannot overwrite it.
  `useAuth.initiate` also hands its (already awaited) read to the cache, so the first request does not read the Keychain again.
- **EntryPoint key**: a refresh changes the JWT but not the signed-in user, so `useSessionKey` keeps the key and the launch gate
  does not re-run; another account still routes again.
- **Telemetry** (`AUTH_DIAG_KINDS`, web allowlist ships with this PR, app events only exist from build 1.0.5): `launch_read_timeout`,
  `launch_read_error` (split `launch_no_token`), `launch_401_no_bearer`, `token_refreshed`, and the age of the token when a session
  is cleared — `cleared_age_lt1d | lt7d | lt30d | ge30d | unknown`. Age comes from `tokenAt`, an additive epoch-ms field the
  store stamps next to `jwt`/`user` (sign-in or refresh; a session stored before 1.0.5 reports `unknown` until its first
  refresh). Only the bucket leaves the device. The buckets replace the 7-day ones proposed above, now that the lifetime is 30
  days: with the refresh a healthy session is < 1 day old, so `ge30d` = genuine expiry, `lt1d`/`lt7d` = the server rejected a young token.
- **How to read it after 1.0.5 ships**: `token_refreshed` should be roughly one per active device per day. `session_cleared_*`
  followed by `cleared_age_ge30d` means a real 30-day idle expiry (expected, rare). `cleared_age_lt1d`/`lt7d` is the signal to
  investigate (revocation, secret rotation or a server bug). `launch_read_timeout` > 0 means the 3 s Keychain guard (H2) is real.
- Not done: no "your session expired" line on Welcome (a genuine expiry now needs 30 idle days; add EN+ES copy later if wanted).

## Not done / not verified

- No Grafana access from this session; the telemetry table above was supplied by Augusto.
- I did not read raw production log lines; the "bearer was present" inference is from code.
- Build 27 vs 30 signing entitlements were not compared (needs the binaries).
- No on-device repro.
