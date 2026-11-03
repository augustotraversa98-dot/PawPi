# Release — app v1.0.5 (next EAS iOS build)

**Status: PREPARED, not built, not submitted.** v1.0.4 (EAS build 30) is **live** on the App Store. This file is the delta, the
commands and the device checklist for the next release; it is modelled on [`release-1.0.4.md`](release-1.0.4.md). Nothing here
submits anything for App Store review — "Submit for Review" is always a manual button in App Store Connect.

**Why 1.0.5 exists — two bugs found after 1.0.4:**

1. **Users were signed out about 7 days after signing in.** The server session token lived 7 days and nothing ever refreshed it.
   Fixed by #732 (server, **already live**) and #733 (app, in this build).
2. **The keyboard covered the caption** in the daily-moment composer (and the same bug class on 11 other screens). Fixed by #734.

## 1. Baseline — what is live

| Item | Value | How it was determined |
|---|---|---|
| Live build | v1.0.4, EAS build **30**, profile `production`, channel `production`, runtime `1.0.0` | `eas build:list` (2026-11-03): newest FINISHED iOS build, `appBuildVersion` 30 |
| Built from commit | **`280fc814`** (2026-10-27, #730) | Same `eas build:list` row (`gitCommitHash`, commit message "docs(release): v1.0.4 What's New (EN/ES) + release doc (#730)"). **Confidence: high.** `95b2e2dc` (#731, the build-record doc) is the *next* commit on `main`, not part of the build. |
| Version in repo | `anything/apps/mobile/app.json` → `expo.version` **1.0.5** (this release; was 1.0.4) | this PR |
| Build number | Not in the repo — `eas.json` has `appVersionSource: remote` + `build.production.autoIncrement: true`; EAS assigns the next one (**31** expected) | `release-1.0.4.md` §1 |
| Runtime version | `"1.0.0"` fixed string (see §7 OTA warning) | `app.json` |

## 2. What is in 1.0.5 — the delta `280fc814..main`

Four commits, three of them change the app or server; one is docs:

| Commit | PR | What |
|---|---|---|
| `95b2e2dc` | #731 | docs only (1.0.4 build record) |
| `87cb174f` | #732 | **server** — 30-day session token + rolling refresh header |
| `8e555919` | #733 | **app** — keeps the refreshed token, hardens the launch gate and token cache, new anonymous `auth_diag` telemetry kinds |
| `2d456ec7` | #734 | **app** — keyboard no longer covers text inputs (12 screens) |

### No native change (verified)

`git diff 280fc814 origin/main` over `package.json`, `package-lock.json`, `eas.json`, `patches/` and `app.json` is **empty** (before this
PR's version bump). This PR changes exactly one line of `app.json` — `expo.version` 1.0.4 → 1.0.5; `plugins`, `ios.infoPlist`, permissions
and everything else are untouched. The new code uses only modules already in build 30 (`KeyboardAwareScrollView` is an existing
in-repo component). **Release risk is JS-only.**

### Mobile-affecting PRs, by risk

| Risk | PR | What | User-visible? |
|---|---|---|---|
| **Higher** | #733 | Auth, on **every** request path: stores `X-Pawpi-Refreshed-Token` through the auth store (Keychain write + read-back); a header-less 401 no longer clears the session at launch (re-checked with the stored token first); token cache can no longer be overwritten by a slow Keychain read, concurrent first requests share one read; EntryPoint key stable across a refresh. Ignored if the user signed out / switched account mid-request, on errors, on `/api/auth/*`, on malformed values | Yes (stay signed in ~30 days) |
| Medium | #734 | Keyboard handling on 12 screens (list below). Replaces `KeyboardAvoidingView` + plain `ScrollView` with the existing `KeyboardAwareScrollView`; the 6 full-screen reminder sheets keep their `KeyboardAvoidingView` next to it. **One visual change:** the daily-moment caption box is capped at **160 pt** tall and scrolls inside itself | Yes |
| Low | #733 (telemetry part) | New anonymous `auth_diag` kinds: `launch_read_timeout`, `launch_read_error`, `launch_no_token`, `launch_401_no_bearer`, `token_refreshed`, `cleared_age_lt1d` / `lt7d` / `lt30d` / `ge30d` / `unknown`. Only a fixed key; the token-age bucket is sent, never a timestamp, token, id or e-mail | No |

### Screens #734 touched (12) — spot-check each with the keyboard open

| # | Screen | Where to find it | Was → now |
|---|---|---|---|
| 1 | **Daily-moment composer** (`PostComposerModal`) | Feed → camera → photo (also pet profile; business "Post a moment" uses the same composer) | pageSheet + KAV + ScrollView → `KeyboardAwareScrollView` only; caption `maxHeight: 160` |
| 2 | **Pee** tracker | Health → Pee | same pageSheet fix |
| 3 | **Poo** tracker | Health → Poo | same pageSheet fix |
| 4 | **Weight** log | Health → Weight | same pageSheet fix |
| 5 | **Wellness log** | Sheet opened from a wellness reminder | same pageSheet fix |
| 6 | **Medical-care issue** sheet | Reminders → Medical care | KAV + ScrollView → KAV + `KeyboardAwareScrollView` |
| 7 | **Medical-care routine** (details step) | Reminders → Medical care → add an item | same |
| 8 | **Medication** routine | Reminders → Medication | same |
| 9 | **Preventive-care** routine | Reminders → Preventive care | same |
| 10 | **Vaccine** routine | Reminders → Vaccine | same |
| 11 | **Walk** routine (hosts WalkItem, DurationPaceSelector, SocialWalkSettings) | Reminders → Walk | same |
| 12 | **Nearby walks** (create-walk pageSheet) | More → Nearby walks → create a walk | no handling → `KeyboardAwareScrollView` |

**⚠️ The keyboard fix was NOT verified on a device before merge.** The iOS Simulator in the dev setup does not present the soft
keyboard, so #734's geometry is reasoned from React Native's `KeyboardAvoidingView` source and the repo's `KeyboardAwareScrollView`
window-coordinate logic, plus unit tests (`PostComposerModal.test.jsx` +3, new `keyboardAvoidance.audit.test.js`). This release's
TestFlight pass is the first real-device test. If any of the 12 screens misbehaves, see §7 (rollback / what to cut).

### Server-side items already live (no app build needed)

- **#732 — 30-day session token + rolling refresh** (merged, deployed on Railway). Defaults: `AUTH_JWT_MAX_AGE_SECONDS` = 30 days (cap
  1 year); `AUTH_JWT_REFRESH_AFTER_SECONDS` = 24 h. An authenticated **Bearer** `/api/*` request with a 2xx/3xx response whose token is
  older than the refresh age gets `X-Pawpi-Refreshed-Token` (same claims, fresh `iat`/`exp`/`jti`) and `Cache-Control: private, no-store`.
  Never on 4xx/5xx, `/api/auth/*`, cookie-only requests, revoked tokens, or when the request itself revoked the token. `token_invalidated_at`
  revocation still applies. **Backward compatible:** builds 21–30 ignore the header; status / body / content-type are unchanged.
- The anonymous telemetry allowlist for the new `auth_diag` kinds deployed with #733's web part, before any 1.0.5 build can emit them.

### Honest note — who benefits, and when

- **Users on 1.0.4 or older keep their existing 7-day tokens and cannot refresh them** (those builds ignore the refresh header). They keep
  being signed out roughly weekly until they **update to 1.0.5 and sign in once**. A session that is still alive when 1.0.5 is installed
  starts refreshing right away (the app stores the first refreshed token it receives), but a token that has already expired cannot be
  rescued.
- **Anyone who signs in now — on any build, including 1.0.4 — already gets a 30-day token** (the server change is live). Only the
  *refresh* (staying signed in past 30 days of use) needs 1.0.5.
- Real expiry now needs ~30 idle days. No Welcome "your session expired" message was added.

## 3. Live-client compatibility

The server half (#732) is live and was designed to be invisible to older builds: they ignore `X-Pawpi-Refreshed-Token`, and the response
status / body / content-type are unchanged (tested in `sessionGuard.test.js`, 23 tests). The only server-visible difference for builds
21–30 is the longer token lifetime for newly issued tokens. Nothing in 1.0.5 requires a server change, and no migration or schema
change is involved.

## 4. Commands — run by you, from a clean checkout of `main` after this PR merges

```bash
git checkout main && git pull
cd anything/apps/mobile && npm ci && npm test          # all green first (CI runs the same)
eas whoami                                             # confirm you are logged in as the PawPi owner
eas build:list --platform ios --limit 3                # last build should be 1.0.4 / 30; note its number
eas build --platform ios --profile production          # builds 1.0.5; EAS auto-increments the build number (31 expected)
eas submit --platform ios --profile production         # uploads to App Store Connect / TestFlight ONLY
```

Notes:
- `npm test` known flake: `search.discover-unlock.test.jsx` failed once on a clean `main` (passes alone); re-run it before treating it as a
  real failure.
- `eas.json` → `build.production.env` supplies `EXPO_PUBLIC_BASE_URL=https://www.pawpi.info` (and the other `EXPO_PUBLIC_*` URLs); a
  local `.env.local` is not part of the EAS upload. Do not run `eas build` from a branch with a localhost base URL anywhere.
- `eas submit` can sit IN_QUEUE for ~40 minutes with a frozen spinner. Poll the submission instead of re-running it.
- After upload, wait for App Store Connect's "Processing" to finish before TestFlight shows the build.

## 5. TestFlight checklist — real iPhone, EN + ES where noted

Legend: **[TF]** = plain TestFlight check on the production server. **[TEST-SERVER]** = needs a short-lifetime test server (optional,
simulator or a build pointed at a test server); can be skipped for the release because the refresh logic is unit-tested and the server side
was verified locally — but it is the only way to *see* a refresh happen within minutes.

### Session / sign-in (#733)

- [ ] **[TF]** **Sign in** (email, Apple and Google) and use several tabs: nothing visibly different from 1.0.4.
- [ ] **[TF]** **Force-quit and reopen** stays signed in.
- [ ] **[TF]** **Airplane mode at launch** (signed in) shows "We couldn't reach PawPi" + *Try again*, **not** Welcome; turn Wi-Fi back on,
      *Try again* → straight in, still signed in.
- [ ] **[TF] MOST IMPORTANT — log out, then log in as a DIFFERENT account:** nothing from the first account anywhere (feed, pets, profile,
      reminders, Messages, notifications badge, Discover, share card). #733 changed how the session token is stored and cached, so check
      this explicitly. Also switch A → log out → B quickly; B stays signed in and sees only B's data.
- [ ] **[TF]** **Reminders fire once** (no double alerts).
- [ ] **[TEST-SERVER]** Refresh works: test server with `AUTH_JWT_MAX_AGE_SECONDS=300` and `AUTH_JWT_REFRESH_AFTER_SECONDS=60`, build pointed
      at it, sign in **fresh** (old tokens keep their old expiry), use the app (tap around at least once a minute) for 6+ minutes → still
      signed in past the 5-minute mark; `token_refreshed` in the Metro log / telemetry.
- [ ] **[TEST-SERVER]** After a refresh, force-quit and reopen → lands in the app, not Welcome.
- [ ] **[TEST-SERVER]** Truly expired session: sign in on the test server, leave the app idle > 5 minutes, reopen → Welcome **once** (no
      flash of home, no loop); signing in again works.

### Keyboard (#734) — **not verified on a device before merge; this is the first real test**

For each screen: tap the field, the focused input **and** the button below it (Save / Post) stay visible above the keyboard; scroll still
works with the keyboard open; dismissing the keyboard leaves no leftover gap.

- [ ] **[TF]** **1. Daily moment** (Feed → camera → photo): tap the caption → caption box **and Post button** visible above the keyboard.
      Type a long **multi-line caption (10+ lines)**: the caption scrolls **inside its box** and Post stays visible. Do it in **English
      and Spanish**, and on the smallest iPhone you have. **The one visual change:** the caption box is capped at **160 pt** tall and
      scrolls inside itself — confirm that looks acceptable (no clipped last line, no jump). Also check the **business** "Post a moment" and
      the composer opened from a **pet profile** — same component.
- [ ] **[TF]** 2. Health → **Weight** log: notes field visible.
- [ ] **[TF]** 3. Health → **Pee**, then **Poo**: notes field visible.
- [ ] **[TF]** 4. **Wellness log** sheet (from a wellness reminder): notes / values visible.
- [ ] **[TF]** 5. Reminders → add **Medication** routine: scroll to the notes (bottom), tap → visible; also the dose / name fields.
- [ ] **[TF]** 6. Reminders → **Vaccine** routine and **Preventive care** routine: tap the notes at the bottom → visible.
- [ ] **[TF]** 7. Reminders → **Medical care** → add an item → the details notes (lowest fields) → visible; and the **issue** sheet's
      multiline field.
- [ ] **[TF]** 8. Reminders → **Walk** routine: expand a walk item, tap the social-walk / duration inputs near the bottom → visible.
- [ ] **[TF]** 9. More → **Nearby walks** → create a walk (pageSheet): description field visible.
- [ ] **[TF]** 10. Regression glance (not changed, same family): **Bark** (comments) composer, **Write review**, and a **chat** composer still
      ride above the keyboard.

### Release hygiene

- [ ] **[TF]** Sign-in smoke: email, Apple and Google (covered above if all three were used).
- [ ] **[TF]** **Settings footer** reads `v1.0.5 (N)` with N = the build number EAS assigned (31 expected).
- [ ] **[TF]** (If telemetry is ON) Grafana shows events for `app_version="1.0.5"` within a few minutes of a cold launch.
- [ ] **[TF], after a few days of real use** — Grafana `pawpi_client_auth_diag_total{diag=…}` for `app_version="1.0.5"`:
      `token_refreshed` ≈ once per active device per day; any `cleared_age_*` events. Reading guide:
      `cleared_age_ge30d` = genuine idle expiry (rare, fine); `cleared_age_lt1d` / `lt7d` = **investigate** (revocation, secret rotation or
      a server bug); `launch_read_timeout` > 0 = the 3 s Keychain guard is real; `launch_401_no_bearer` = launch 401 on a request that
      carried no token (the case #733 now ignores).

## 6. Before pressing Submit for Review

1. TestFlight build installed and the checklist above done on a real iPhone (at minimum: the sign-in / log-out-and-different-account
   items and keyboard items 1–9).
2. Paste the text from [`app-store-whats-new-1.0.5.md`](app-store-whats-new-1.0.5.md) (EN + ES); **delete the keyboard bullet if it failed
   on device**, delete the stay-signed-in bullet only if the session checks failed.
3. Attach the processed build to the 1.0.5 version page, confirm Privacy Policy URL `https://www.pawpi.info/privacy`, export compliance
   "No", then Submit for Review.
4. **App Store privacy declaration: no change.** The new `auth_diag` kinds are anonymous (a fixed key; the token-age bucket, never a
   timestamp, token, id or e-mail), already documented in [`privacy/telemetry.md`](privacy/telemetry.md) by #733 (§1 lists `auth_diag`
   sign-in/session diagnostics), and fall under the existing "Diagnostics → Other Diagnostic Data, not linked, no tracking" answer in
   its §4 table. No new data type, no change to the Privacy Policy text or to App Privacy answers.

## 7. Rollback

- **Bad TestFlight build:** do not submit it. Fix on `main`, then run the build commands again (a new build number is assigned).
- **Keyboard regression on some screen only:** the 12 screens are independent edits in #734. A fix-forward on `main` is a small JS change;
  rolling the whole app back also removes the auth fix, so prefer fix-forward unless the keyboard problem is on the daily-moment composer
  or a widely used screen.
- **Bad build already in review:** in App Store Connect remove it from the version and re-attach build 30 (v1.0.4), or expedite a fix. If it
  is already live, expedite a fix; build 30 can be re-promoted from App Store Connect.
- **Server vs app rollback — the server does NOT need one.** #732 is **backward compatible**: builds 21–30 ignore the refresh header, so
  rolling the app back does not need a server rollback. In the other direction, 1.0.5 against a server without #732 simply never
  receives a refresh header and behaves like 1.0.4.
- **Server variables (Railway — do not change them from this doc):**
  - To **stop refresh headers**, set `AUTH_JWT_REFRESH_AFTER_SECONDS` very high (e.g. larger than the token lifetime); the refresh is then
    never triggered.
  - To **restore the old 7-day lifetime**, set `AUTH_JWT_MAX_AGE_SECONDS` to `604800` (7 days). Only newly issued tokens change; tokens
    already issued keep their own expiry.
  - `TELEMETRY_INGEST_ENABLED=false` — kills client telemetry ingest.
  - `NOTIF_V2_ENABLED` — ON in production; `false` returns push to the previous behaviour.
  - `REQUEST_SINGLE_FLIGHT` — ON in production; `false` (and redeploy) returns the API to one round trip per query.
- **OTA (EAS Update) only for tiny JS-only hotfixes.** `runtimeVersion` is the fixed string `"1.0.0"`, so an update published to the
  `production` channel is eligible for **every** installed build (21, 24, 26, 27, 30, 31…), not just the newest. `eas update` does not apply
  `build.production.env`: the update would bake whatever `EXPO_PUBLIC_*` values the publishing shell has (a stray `.env.local` pointing at
  localhost would break every device). Prefer the App Store path.

## 8. Build record

_Filled in after the build, if one was made:_ not built yet.

| Item | Value |
|---|---|
| Version / EAS iOS build number | |
| EAS build | |
| Built from commit | |
| Built | |
| EAS submission | |
| Next step | |
