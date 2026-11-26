# Hardening pass 2: report (2026-11-26)

Twelve items, worked one after another. No hard stop was hit. Every draft below is unmerged on purpose. The three hand-applied
migrations are numbered 0149, 0150 and 0151; apply them in that order, each followed by its `verify_NNNN.sql` (every row must read PASS).

Notes on method: one branch and worktree per item off the latest `origin/main`; integration tests ran only against the throwaway
embedded Postgres (never the `.env` database); the only production touches were read-only, counts-only `SELECT`s for items 4, 7, 8
and 12, and a names-only look at the Railway variable list for item 2. #827 (the nonce-based CSP) was not touched.

## Items

| # | Item | PR | Result | What it still needs from the owner |
|---|---|---|---|---|
| 1 | Apple ID out of `eas.json` | [#828](https://github.com/augustotraversa98-dot/PawPi/pull/828) | **merged** | Set `EXPO_APPLE_ID` (shell or EAS variable) before the next `eas submit`. Decide whether the old value in git history matters (it needs a history rewrite). |
| 2 | `NEXT_PUBLIC_*` in the production build | [#829](https://github.com/augustotraversa98-dot/PawPi/pull/829) | **merged** (adds a build-time check); the Maps picker is **not fixed in production yet** | The production Railway service has no `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY` variable. Set it (a referrer-restricted browser key; it was not set from here because it is a secret) and redeploy, then read the `[public-env]` lines in the build log. |
| 3 | Permissions-Policy header | [#830](https://github.com/augustotraversa98-dot/PawPi/pull/830) | draft | Review and merge. Expect a small textual conflict with #827 in `securityHeaders.js`. Spot-check the header after deploy and sign in once from the app. |
| 4 | `vet_notes` pet-ownership check | [#831](https://github.com/augustotraversa98-dot/PawPi/pull/831) | draft | Apply migration **0149**, then `verify_0149.sql`. Production counts were checked first (2 rows, none affected). |
| 5 | `GET /api/auth/mobile-return` | [#832](https://github.com/augustotraversa98-dot/PawPi/pull/832) | draft (auth behaviour, flag off by default) | Real-device Google sign-in checks listed in the PR, then set `MOBILE_RETURN_REQUIRE_NONCE=1`. |
| 6 | SameSite=Lax session cookie | [#833](https://github.com/augustotraversa98-dot/PawPi/pull/833) | draft (flag off by default) | Run the device checklist in the PR (Safari, iOS older than 16.4, app sign-in, Apple/Google callbacks) before setting `AUTH_COOKIE_SAMESITE=lax`. |
| 7 | Two gaps from 0147 | [#834](https://github.com/augustotraversa98-dot/PawPi/pull/834) | draft | Apply migration **0150**, then `verify_0150.sql`. |
| 8 | Finder rate-limit retention | [#835](https://github.com/augustotraversa98-dot/PawPi/pull/835) | draft | Apply migration **0151**, then `verify_0151.sql`. Nothing is overdue today, so it removes nothing on apply. |
| 9 | Removed `/integrations` proxy | [#836](https://github.com/augustotraversa98-dot/PawPi/pull/836) | **merged** | Nothing. |
| 10 | CORS origins | no PR (by design) | done, written to `STATE.md` | Read `STATE.md` (kept out of the repository on purpose; see below). One thing to confirm on the Railway dashboard. |
| 11 | `@auth/core` bump | [#838](https://github.com/augustotraversa98-dot/PawPi/pull/838) | **merged** (4 checks green, incl. the full integration suite) | After deploy, sign in once by email and once with Google, from the app and the website. |
| 12 | Field-encryption design | [#837](https://github.com/augustotraversa98-dot/PawPi/pull/837) | **merged** | Decide the six questions at the end of `docs/design-field-encryption.md`. |

Duplicate check for items 3 and 4: no open PR or branch existed for either, and neither feature was on `main`, so neither was skipped.

## Things worth knowing about specific items

- **Item 2.** The inlining step itself works (verified with a local production build). The new `npm run build` check prints which
  `NEXT_PUBLIC_*` names the build saw, warns when the Maps key is missing, and fails the build if a value that is set did not reach the
  bundle. Whether Railpack passes service variables to the build was not verifiable from here; the first build after you set the key
  will show it.
- **Item 5.** The detailed analysis is in `STATE.md`, not here. Short version: the fix ties the token hand-back to a sign-in that
  `mobile-start` began in the same browser, with enforcement off until a device test.
- **Item 6.** `SameSite=Lax` does not change what a top-level link click carries, so it does not replace the item 5 change.
- **Items 7 and 8.** In both, other test files re-apply older migrations on the shared test database; the new tests re-assert their own
  migration first so they do not depend on file order. One existing test line (`shared-pets-access`) now sends this pet's media key
  for the caregiver photo case.
- **Item 7 CI.** The first integration run of #834 passed all 168 files and then the Node process ran out of memory during teardown (exit 134); the single allowed re-run passed. The whole suite is close to the default heap on the runner; if it recurs on other PRs, the integration job needs a larger `--max-old-space-size`.
- **Item 11.** One existing test needed an adjustment: in 0.41 Auth.js resolves the provider before it checks the CSRF token, so
  with Google not configured the answer is `error=Configuration` instead of `MissingCSRF`. The request is still refused with no
  session in both cases, and both are now pinned. `jose` moved 5.10.0 to 6.2.18 as a transitive of `@auth/core` (nothing in the app
  imports it directly).

## Found, not fixed

- **Git history.** The Apple ID removed in #828 is still in earlier commits. The owner's personal email address is also written into
  `0114_admin_identity.sql` and `verify_0114.sql` (it is how the admin flag is granted); that migration is already applied.
- **Production variables (names only, outside what was asked).** The Railway service variable list shows no `CORS_ORIGINS`. If that is
  right, no CORS headers are sent at all, which is the safest state. Please confirm on the dashboard.
- **`c.env` under the Node server.** `__create/index.ts` reads `c.env.AUTH_URL`, which is always empty under the Node server (the
  environment is on `process.env`); the `x-forwarded-proto` fallback is what actually makes cookies `Secure`. Harmless today.
- **Caregiver uploads.** The private-upload endpoint admits owners and family only, so a caregiver cannot upload a private photo through
  the app. Several `health_*` log tables with a photo or URL column (and the `areas` photos in general checks) accept free text from
  caregivers; only photo checks were in scope for item 7.
- **Old rate-limit rows.** Other sender-keyed counters (for example for signed-out vet-invite opens) have no age-out beyond cleanup when
  the same sender returns, and `app_rate_limit_gc` is not called by any job.
- **Leftovers of the old platform.** On the server, first-party `/_create` URLs are still prefixed with the old platform's host in
  `src/__create/fetch.ts`; `docs/rls-hardening.md` still mentions the removed `/integrations` proxy in a historical note.
- **Expo web sign-in.** The web build of the app signs in through a cross-site iframe, which needs the current `SameSite=None` cookie;
  it will not work with item 6's flag on.
- **Test-suite pattern.** Tests that re-apply an older migration on the shared test database put older policy text back for files that
  run later. Any future test of a policy changed by a later migration needs the same re-assert in `beforeAll`.
- **Sandbox.** This sandbox runs as root, which the embedded Postgres refuses; the committed harness only works unprivileged (as in CI).
  The suite was run as the `postgres` OS user with no change to the repository.

## About `STATE.md`

`docs/night-run/2026-11-26/STATE.md` is the running log, including the item 10 CORS write-up. The repository is public, so the detailed item 5
analysis (what an outsider could and could not obtain from the old behaviour) is **not** in it; that full version was kept outside the
repository for the owner.
