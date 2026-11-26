# Hardening pass 2 — STATE (2026-11-26)

Running log, one entry per item. Final summary lives in `REPORT-hardening-pass-2.md`.

Working notes:
- One branch + worktree per item off latest `origin/main`, named `claude/sequential-hardening-pass-tpcfma-itemNN`.
- Integration tests run only against the throwaway embedded Postgres, as the unprivileged `postgres` OS user (the sandbox is root and embedded Postgres refuses root).
- The one production touch: a read-only, counts-only `SELECT` for item 4 (Supabase MCP `execute_sql`), as that item asked for. Railway: variable NAMES only (never values) for item 2.

## Item 1 — Apple ID out of eas.json — DONE, merged (#828)
- Removed the `appleId` value from `submit.production.ios` in `eas.json`; `eas submit` reads `EXPO_APPLE_ID`. Runbook updated.
- Audit of `app.json`, `eas.json`, `.github/workflows/*`: nothing else personal.
- Still true after the merge: the old value is in git history (public repo). Removing it from history means a rewrite + force-push, which was not done. Owner decides.
- Incidental, not changed: migration `0114_admin_identity.sql` and `verify_0114.sql` hardcode the owner's Gmail address (that is how the admin flag is granted). Already applied; editing an applied migration is not appropriate here.

## Item 2 — NEXT_PUBLIC_* in the production build — DONE, merged (#829); one owner step remains
- Verified root cause: the production Railway service has NO `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY` variable (names only; set: `NEXT_PUBLIC_PRIVACY_POLICY_URL`, `NEXT_PUBLIC_TERMS_URL`). The picker renders nothing when it is unset, by design.
- The inlining step itself works: a local production build with the variable set puts it in `build/client`; without it, it is absent.
- NOT verified: whether Railpack passes service variables to the build step (Railway docs searched, not conclusive; the sandbox cannot reach pawpi.info to inspect the live bundle).
- Added `scripts/check-public-env.mjs` to `npm run build`: prints which `NEXT_PUBLIC_*` names the build saw, warns if the Maps key is missing, exits 1 if a set value is not in the bundle. Unit tests included.
- #827 interaction: #827 allows the Maps hosts based on the server's RUNTIME env, while the client key is fixed at BUILD time. No change to the Maps script source, so no CSP test needed re-running; but the two can disagree if the variable differs between build and runtime.
- Owner step: set the key (referrer-restricted browser key) on the Railway service and redeploy; read the `[public-env]` lines in the build log.

## Item 3 — Permissions-Policy — DONE, draft (#830)
- Checked first: no open PR or branch for it; no `Permissions-Policy` string anywhere on main.
- Allowed: `clipboard-write=(self)`, `fullscreen=(self)`. Everything else denied.
- No geolocation, camera/mic, payment, share, autoplay, passkey use in the web app; no embedded frames; telehealth opens the vendor room in a new top-level tab.
- Headless Chromium over a local production build + throwaway DB: header on all six public pages, no policy console warnings. Chromium rejected `bluetooth` and `web-share` as unrecognized, so both were dropped.
- Not driven in the browser: signed-in provider pages.
- Will conflict textually with #827 in `securityHeaders.js` (whichever lands second).

## Item 5 — mobile sign-in hand-back — investigated before changing anything
The detailed write-up of what triggers the route and what an outsider could and could not obtain is kept out of this public repository
while the change is still a draft with its flag off. Conclusion, in neutral terms: a real defence-in-depth gap (the hand-back was not tied
to a sign-in the app started), not remotely exploitable by a web page on its own. The fix is in #832 (see below).

## Item 4 — vet_notes pet-ownership check — DONE, draft (#831), owner applies 0149
- Checked first: no open PR or branch for it.
- `vet_notes_owner_all` WITH CHECK now adds `app_owns_pet(pet_id)` (same as 0140). Family/provider policies untouched. `verify_0149.sql` (7 rows) reads PASS in the harness; negative control confirmed.
- Production read-only counts (2026-11-26): 2 rows, 0 whose owner differs from the pet's owner, 0 orphaned. Nothing existing is affected. Both writers already stamp the pet owner.
- 4 CI checks green.

## Item 5 — mobile-return — DONE, draft (#832); analysis is above
- Fix is a one-time nonce from `mobile-start` (cookie + callbackUrl), enforced only when `MOBILE_RETURN_REQUIRE_NONCE=1` (default report-only). No app change. 20 tests; 14 fail against the old routes.
- Needs a real-device Google sign-in before the owner turns the flag on.
- The detailed risk write-up is deliberately not in the PR text or in this file (public repo).

## Item 6 — SameSite=Lax session cookie — DONE, draft (#833), flag `AUTH_COOKIE_SAMESITE=lax`, off by default
- Applies to the session cookie only; CSRF and callback-url cookies unchanged.
- The real-handler integration test caught my first wiring (it read `c.env`, which is empty under the Node server; `process.env` is right). Same quirk applies to the existing `c.env.AUTH_URL` read in `__create/index.ts`: it is always undefined in production and the `x-forwarded-proto` fallback is what makes cookies Secure. Harmless today, not changed.
- Device test list is in the PR. Expo web build (cross-site iframe sign-in) is expected to break with the flag on.

## Item 7 — 0147 follow-ups — DONE, draft (#834), owner applies 0150
- (a) staff access request must name the pet's actual owner (helper `app_pet_owner_is`, DEFINER, REVOKE/GRANT pair); (b) caregiver-role photo check must reference this pet's private media key `pets/<id>/<name>`. Route returns a clean 400 for caregivers instead of a 500.
- Production read-only counts: 6 grants, 0 owner mismatches; 4 photo checks, none in private-key form (existing rows, unaffected: INSERT-only check).
- Changed one line of `shared-pets-access` (it sent a non-key URL for the caregiver case).
- Test-isolation lesson: other integration files re-apply 0139/0147/0146 on the shared cluster and restore older policy text; new tests re-assert their own migration in `beforeAll`.
- Incidental, NOT fixed: the private-upload endpoint admits owner/family only, so a caregiver cannot upload a private photo through the app at all. Other log tables with photo/URL columns that caregivers can insert into (`photo_url` on several `health_*` logs, `areas` photos in general checks) accept any text; only photo checks were in scope.

## Item 8 — finder rate-limit retention — DONE, draft (#835), owner applies 0151
- The hourly purge only matched `emergency_relay%`. The tag/card page open bucket `emergency_public_read` (keyed on a hash of the sender address) was never cleared. 0151 adds it to `app_purge_finder_details()`.
- Production read-only counts: 4 such rows, all from today, none overdue; latent until ~late Feb 2027.
- Other IP-keyed buckets (e.g. `vet_invite_open` for signed-out callers) have no age-out other than self-clean on return and the manual `app_rate_limit_gc`, which no job calls. Not changed.

## Item 9 — /integrations leftovers — DONE (#836)
- No caller in apps/web or apps/mobile (only `client-integrations/` component wrappers, a comment, tests). Server route already 404s with no outbound request (test exists).
- `isFirstPartyURL` (web `src/__create/fetch.ts`) no longer matches `/integrations`; stale bullet removed from `docs/legal/accuracy-sweep-2026-10-16.md`. New test: 1 of 3 fails against the old code.
- Not changed: `docs/rls-hardening.md` line 58 still lists "the `/integrations` proxy" in a historical design note; and on the server a first-party `/_create` URL is still prefixed with `https://www.create.xyz` (`fetch.ts`).

## Item 10 — CORS configuration (read from the repo, not the Railway dashboard)
Where: `anything/apps/web/__create/index.ts` (`hono/cors`, mounted on `/*` only when `process.env.CORS_ORIGINS` is set) and `src/app/api/utils/originGuard.js` (reads the same variable for the cross-site check on writes under `/api`).

Origins the code is written to trust: NONE are hard-coded. The only source is the comma-separated `CORS_ORIGINS` env var, split on commas and trimmed. Exact-string match, no wildcard handling (a literal `*` in the list is not a wildcard in array form). What the docs say the intended values are:
- production: `https://www.pawpi.info` (`docs/ops/secret-rotation-runbook.md` line 497, "Public origins");
- tests use `http://localhost:8081` (the Expo web dev origin) as the one listed origin.
Beyond the list, `originGuard` also treats as "own site" any Origin whose host:port equals this request's `Host` / first `X-Forwarded-Host` (scheme not compared because TLS ends at the proxy), plus Bearer-token callers, and `/api/auth/*` (Auth.js's own CSRF).

What cors() sends when the list is set: `Access-Control-Allow-Origin` echoing the request origin only if it is in the list (Hono 4.12.3), default methods GET/HEAD/PUT/POST/DELETE/PATCH, `Access-Control-Expose-Headers` for the refreshed-token header, and NO `Access-Control-Allow-Credentials` (so browsers do not send cookies cross-origin even to a listed origin).

Flags for the owner:
1. Incidental to item 2 (variable NAMES only, no values): the production Railway service's variable list does not include `CORS_ORIGINS`. If that is right, the cors middleware is not mounted at all in production: no CORS headers on any response, and only same-site pages can write. That is the safest state; the runbook line suggesting `https://www.pawpi.info` is unnecessary for same-origin pages. Please confirm on the dashboard (outside what was asked here).
2. Config hazard: a literal `null` in `CORS_ORIGINS` would make `cors()` answer `Access-Control-Allow-Origin: null` for opaque-origin pages while `originGuard` deliberately drops it. Never list `null`.
3. Exact-match only: a trailing slash, different case, or a missing port silently matches nothing (and `originGuard` then falls back to the host comparison).
4. `cors()` is mounted on `/*` (HTML pages and `/api/auth/*` too), not just `/api`. It adds read access for listed origins to everything the browser can fetch without cookies.
5. CSP `connect-src` is `'self' https:` (any https host) on main; #827 does not change that. Not CORS, but it is the other half of "who may a page talk to".
Nothing looks wrong in the code itself.

## Item 11 — @auth/core bump — PR #838 (merge when 4 checks green)
- `^0.37.2` -> `^0.41.3` (0.41.3 is the latest). bun.lock: `@auth/core` 0.37.4 -> 0.41.3 and its transitive `jose` 5.10.0 -> 6.2.18 (major). Nothing imports jose directly.
- Unit suite 388 files / 4045 tests pass; production build OK.
- Integration: ONE failure under 0.41: `/api/auth/signin/google` without a CSRF token now redirects with `error=Configuration` instead of `MissingCSRF` when Google is not configured (0.41 resolves the provider before the CSRF check). Fix attempt 1 (test only): register Google in that test (like production) and assert MissingCSRF; added a case pinning that unconfigured is still a refusal with no session. 58/58 pass. No application code change. (Counts as 1 of 2 allowed fix attempts.)
- Full local integration run on 0.41.3: see the end of this entry once finished; CI is the gate.

## Item 12 — field-encryption design — DONE, merged (#837)
- `docs/design-field-encryption.md`. Key facts: nothing searches/indexes these columns today; the cost is the SQL functions that assemble the public emergency page and compose finder messages (`app_emergency_finder_message` would need to take pre-encrypted input); production volume is tiny (counts in the doc).
