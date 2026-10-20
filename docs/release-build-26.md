# Release — app build 26 (v1.0.2)

**Status: SUBMITTED for App Store review** (v1.0.2, build 26). Built from `main` at **`49a834b1`**, which includes
PRs **#617–#629 (all merged)**. Nothing here changes `eas.json`, `package.json` or `app.json` — the version work was
done in #607. This file is the record of what shipped plus the device checklist; Claude does not build, submit or
apply anything.

Build history, so nobody picks the wrong one:

| Build | Version | State |
|---|---|---|
| 24 | v1.0.1 | what was on TestFlight before this release |
| 25 | v1.0.2 | exists in EAS, **stale, never distributed** — do not submit or test it |
| **26** | **v1.0.2** | **in App Store review** (commit `49a834b1`) |

## 1. Version + build number

| Item | Where | Value |
|---|---|---|
| Marketing version | `anything/apps/mobile/app.json` → `expo.version` | **`1.0.2`** (#607) |
| iOS build number | not in the repo: `eas.json` has `appVersionSource: "remote"` and `build.production.autoIncrement: true`, and `ios.buildNumber` was removed from `app.json` (#607) | EAS assigned **26** |
| Runtime version | `app.json` → `runtimeVersion` | `"1.0.0"` (fixed string — see §4) |
| `package.json` `version` | `anything/apps/mobile/package.json` | `1.0.0` — ignored (`appVersionSource: remote`); left alone |

## 2. What is in build 26

Mobile changes merged since the v1.0.1 bump (#579), up to `49a834b1`:

- **Client telemetry** (#600) — anonymous, allowlisted behaviour events + Settings opt-out ("Help improve PawPi") +
  server kill switch. This is the first build that sends it, and the reason the privacy steps in §3 exist.
- **Legal links in Settings** (#621) — Privacy Policy, Terms of Service and EULA rows opening the hosted pages on
  `www.pawpi.info`.
- **Notifications v2, mobile side** (#626–#628) — device time-zone sync, per-category notification toggles and the
  quiet-hours control (these appear only while the server flag `NOTIF_V2_ENABLED` is on), and the unread badge.
- **Logout leak fix** (#617) — logout cancels every scheduled notification, unregisters the push token and clears the
  previous user's in-memory reminders (the change is in `utils/auth/store.js` `setAuth`; no auth/token logic changed).
- **Launch requests 40 → 18** (#618) — shared pets/routines cache, tabs mount on first open, Discover waits for
  location (first open of Health/Training/Services/More shows a blank cream placeholder for one frame).
- **First-reminder setup nudge** (#619) — local notifications, ≤2 per pet; copy EN + ES.
- Preference/storage: device preferences kept on sign-out (#605); onboarding never creates a second dog for an account
  that already has one; EntryPoint routes once per session; profile-less accounts get 200 on launch/Services routes;
  onboarding diagnostics beacon (#598).
- Carry-overs from the v1.0.1 line (#580–#592): point the app at `https://www.pawpi.info`, failed-sign-in recovery
  (Start over / back), "Use a different account", keyboard-safe onboarding, 24-hour times, `lbs` alias fix, Place
  review sheet keyboard.

Server-only PRs in the same range (no app build needed): #622 (trace-span scrubbing), #623 (plain 404 for scanner
probe paths), #624 (flaky test fix), and the docs PRs #620, #625, #629.

## 3. Release steps — state

1. ✅ **Merged**: #617–#629 are all on `main`; build 26 was built from `49a834b1`.
2. ✅ **Gates** (also required checks in CI): `cd anything/apps/mobile && npm test`; `cd anything/apps/web && npm test && npm run test:integration`.
3. ✅ **Privacy Policy URL**: `https://www.pawpi.info/privacy` (hosted EN + ES; the policy URL can only change on a new version page, i.e. 1.0.2).
4. ✅ **App Store Connect → App Privacy** as published (matches `docs/app-store-privacy-data-map.md`, #608):
   **Product Interaction, Performance Data, Other Diagnostic Data** — each purpose **Analytics**, **not linked** to the
   user, **not used for tracking**. **Crash Data is NOT declared**: the app sends only JS client errors by error
   *class name* (no message, no stack), has no native crash logs and no crash-reporting SDK. Details:
   `docs/privacy/telemetry.md` §6.
5. ✅ **Build and submit** via EAS (`docs/app-store-submission-runbook.md` §2–§3); **submitted for review**.
6. ✅ **Server** (done before/with the build): migrations **0131** and **0132** applied and verified on production;
   `NOTIF_V2_ENABLED=true` on Railway (see `docs/notifications-v2-design.md`).
7. ⏳ **Still open** (not part of this build): Grafana apply + client alert rules stay **paused** until build 26 has
   been live a few days (`docs/observability/OPERATIONS.md` §8, `docs/test-backlog.md` ACTION 4); the APNs `.p8` key
   (`docs/LAUNCH-CHECKLIST.md`) remains the gate for business pushes; release notes live in
   `docs/app-store-connect-content.md` / `-es.md`.

## 4. Runtime version / OTA — read before publishing any EAS Update

`runtimeVersion` is the fixed string `"1.0.0"` and `updates.url` is enabled, so a JS bundle published to the
`production` channel is eligible for **every** installed build (21, 24, 26…), not only 26. Anything that needs a native
module added since build 21 (e.g. the native Apple sign-in) must **not** be pushed over the air to builds that lack
it. Prefer shipping through the App Store and treat OTA as a separate decision.

## 5. Device checklist for build 26 (mirrored in `docs/test-backlog.md`)

Run on a **real iPhone** with the build-26 install. This is what the release pass covered:

- [ ] **Settings → legal rows (#621):** three rows — **Privacy Policy**, **Terms of Service** and **End User License
  Agreement (EULA)** (Spanish: same rows, es-AR copy). Each opens its hosted page on `www.pawpi.info` in the browser
  (the Privacy Policy row must land on `https://www.pawpi.info/privacy`), and coming back returns to Settings. A row
  only shows when its URL is configured.
- [ ] **Notification toggles (#628):** Settings shows the new per-category rows (bookings, adoption, walker
  confirmations, lost-pet alerts — default on; weekly-summary push, occasional push, occasional email — default off);
  toggle each one, close and reopen Settings, and the choice persists.
- [ ] **Quiet hours follow the phone's time zone:** set quiet hours, confirm they apply in the device's local time
  (22:00–08:00 stays silent), and that changing the phone's time zone (or travelling) moves the window with it after
  the app is next opened (`PUT /api/user-profile/timezone` sync).
- [ ] **Booking confirmation push:** with the server flag on and push allowed, confirm a booking → the phone rings
  once, with EN/ES copy; with the booking category switched off, or inside quiet hours, it stays silent.
- [ ] **Basics / regression:** email + password, Google and Apple sign-in; onboarding; posting a daily moment;
  Today/Upcoming reminders.

Carry-over checks from the other build-26 PRs — not part of the pass above, still worth a look when convenient:

- [ ] **Telemetry:** Settings → "Help improve PawPi" toggle works; turning it off stops events (Grafana
  `pawpi_telemetry_ingest_total` goes quiet for that device); on → `perf_startup` appears after a cold start.
- [ ] **Logout leak (#617):** sign in as A with a routine due in ~2 min → log out → **no** alert fires; sign in as B →
  only B's reminders are scheduled.
- [ ] **Launch (#618):** cold start on Wi-Fi and LTE; Health, Training, Services and Profile each load on first open;
  Services shows a loading state until location answers (or ≤3 s).
- [ ] **Reminder nudge (#619):** new account, one pet, no routine → two local notifications arrive in the daytime;
  creating any routine before they fire cancels them.

## 6. After it ships

1. In Grafana Explore, `{job="pawpi-client"}` should show events within minutes of the first cold start (kill switch:
   `TELEMETRY_INGEST_ENABLED=false` on Railway).
2. Compare launch calls per session before/after (`pawpi_http_*` by route for one client IP): expect ~18 launch
   requests instead of ~40.
3. Un-pause the client alert rules only after a few days of data (`OPERATIONS.md` §8).

## 7. Rollback

- App Store: *Remove from sale* is not needed — expedite a fix as 1.0.3, or re-promote the previous build in App Store
  Connect (build 24 is v1.0.1).
- Notifications v2 server side: set `NOTIF_V2_ENABLED=false` on Railway (and restart) to return to the previous push
  behaviour; the migrations are additive and stay. Telemetry has its own kill switch (`TELEMETRY_INGEST_ENABLED=false`).
- If #618's first-focus mounting misbehaves on a device, the single switch is `components/FirstFocusGate.jsx`
  (render `children` unconditionally) — one-file revert.

---

## 8. Build 27 (v1.0.3) prep — what YOU verify before submitting

**Claude does not build, submit or publish.** Build 26 (v1.0.2) is live on the App Store, so the next build ships as
**v1.0.3, EAS iOS build number 27** (remote counter is at 26; `autoIncrement` assigns 27; nothing in the repo carries it).
This section supersedes §1 for the next release: marketing version is bumped in `app.json` by PR #700.

### 8.1 Before you build
- [ ] **#700 (version 1.0.3) merged**; `main` CI green (mobile jest, web vitest, web integration) and the gitleaks scan green.
- [ ] **Server first.** The server half of the session fix (#698: `session_expired` code, `GET /api/session`, walk-pickup 403)
  is already live on production. Re-check read-only: `curl -i https://www.pawpi.info/api/session` → `401`, header
  `x-pawpi-error-code: session_expired`, body `{"error":"Unauthorized","code":"session_expired"}`.
- [ ] Release notes: paste `docs/app-store-whats-new-1.0.3.md` (EN + ES) into the 1.0.3 version page after you have edited it.
- [ ] Privacy declaration: **no change**. The new anonymous `auth_diag` events (a fixed key such as `session_cleared_code`; never a
  token, id or e-mail) fall under the already-declared *Other Diagnostic Data* (see `docs/privacy/telemetry.md` §1/§6).
- [ ] Open items that are NOT part of this build and must not be assumed applied: the case-insensitive pet-handle index, payment-settlement SQL, notification-type SQL, and the finishing migration for 0126 (`0134`). Applied + verified: 0122–0125, 0127–0129 (2026-10-20) and 0133 (see `docs/db-migration-inventory.md`).

### 8.2 On a real iPhone with the TestFlight build 27 (before "Submit for Review")
Settings → **Help improve PawPi** must be ON for the telemetry checks. Use a real device — the simulator cannot reproduce Keychain
behaviour.

- [ ] **Fresh Apple sign-in stays signed in:** sign in with Apple, finish the first screens, force-quit, reopen → still signed in
  (no Welcome). Repeat once after a phone restart (before first unlock the Keychain can refuse reads).
- [ ] **Stale token at cold launch:** reinstall over an account whose sessions were revoked (reset its password on the web, then open
  the app with the old install's Keychain item) → **Welcome once**: no flash of the home screen, no second Welcome, no loop; signing in
  again works.
- [ ] **Airplane mode at launch (signed in):** "We couldn't reach PawPi" + *Try again* — NOT Welcome. Turn Wi-Fi back on → *Try again*
  → straight in, still signed in.
- [ ] **No logout on a wrong pickup code:** with a walker/business account, Walker walks → scan an invalid or expired pickup QR
  (or any non-PawPi QR) → the "Invalid code" alert appears and you are **still signed in** afterwards (kill and reopen to be sure).
- [ ] **A real revoked session mid-use:** sign in, reset that account's password on the web, pull-to-refresh any tab → Welcome, once.
- [ ] **Version label:** Settings footer reads `v1.0.3 (27)`.
- [ ] Tab bar, Settings (Log out + confirm), pet-handle suggestions, "Streak with a friend", reminders — the other night-run items in
  `docs/test-backlog.md` "To test — next build".

### 8.3 The `auth_diag` telemetry reaches the server (do this on the same device, right after 8.2)
Within about a minute of a cold launch + sign-in, events for `app_version` **1.0.3** must appear. Nothing appears until the first event
(the counter is created lazily), and nothing if telemetry is OFF or the kill switch `TELEMETRY_INGEST_ENABLED=false` is set.

- [ ] **Grafana Explore → Prometheus (metrics):**
  `sum by (diag) (increase(pawpi_client_auth_diag_total{app_version="1.0.3"}[1h]))`
  Expected after a clean sign-in + relaunch: `launch_token_found` (or `launch_no_token` on the very first launch) and `keychain_ok`.
- [ ] **Grafana Explore → Loki (one log line per event):**
  `{job="pawpi-client", event="auth_diag", app_version="1.0.3"} | json | line_format "{{.props_kind}} build={{.build}} ios={{.os_major}}"`
  (stream labels are only `job`, `event`, `app_version`, `platform`; the kind is in the JSON field `props.kind`). The line must NOT
  contain a token, e-mail or user id — if it does, stop and do not submit.
- [ ] Ingest health: `sum by (result) (increase(pawpi_telemetry_ingest_total[1h]))` — `invalid` should stay at 0 (an `invalid` here after
  build 27 would mean the app and the server disagree on the event registry).

**How to read the kinds** (the question is "why were people logged out every time?"):

| `diag` | Meaning |
|---|---|
| `keychain_ok` / `keychain_retried_ok` | sign-in token written and read back (second = needed the retry) |
| `keychain_write_failed` / `keychain_readback_mismatch` | **cause B is real**: the Keychain refused/lost the token (user stayed signed in only until the next launch) |
| `launch_no_token` shortly after a successful sign-in | same signature as cause B |
| `session_cleared_launch_401` / `_403` | **cause A**: a stored token the server rejected at cold launch (e.g. reinstall kept an old Keychain item) |
| `session_cleared_code` / `session_cleared_recheck` | a real dead session while using the app (revoked/expired), by code or by the one re-check |
| `recheck_alive` | a bare 401 that was NOT a dead session (the old "log out on any 401" bug would have logged these users out) |
| `launch_token_found` | cold launch found a stored token |

Alert rules for client signals stay **paused** (see §3 item 7 and `OPERATIONS.md` §8); this is a manual read until a few days of
build-27 data exist.

### 8.4 Rollback
Same as §7: expedite a fix as 1.0.4, or re-promote 1.0.2 (build 26) in App Store Connect. The server half is backward compatible with
builds ≤ 26 (it only adds a code/header and one route; the one status change is walk-pickup 401 → 403).
