# Release prep — app build 25 (v1.0.2)

State of `main` at `8171cb4` plus the three night-run PRs (#617, #618, #619, **open, not merged**). Nothing here
changes `eas.json`, `package.json` or `app.json` — the version work was already done in #607 and verified below.
This is a checklist for the human steps; Claude does not build, submit or apply anything.

## 1. Version + build number (verified, no change needed)

| Item | Where | Value | OK |
|---|---|---|---|
| Marketing version | `anything/apps/mobile/app.json` → `expo.version` | **`1.0.2`** | ✅ (#607) |
| iOS build number | not in the repo: `eas.json` has `appVersionSource: "remote"` and `build.production.autoIncrement: true`, and `ios.buildNumber` was removed from `app.json` (#607) | EAS assigns the next number on `eas build` | ✅ |
| Runtime version | `app.json` → `runtimeVersion` | `"1.0.0"` (fixed string — see §4) | ⚠️ read §4 |
| `package.json` `version` | `anything/apps/mobile/package.json` | `1.0.0` | ignored (`appVersionSource: remote`); left alone |

**Before building, confirm the next number is 25.** Build 24 is the last one shipped as v1.0.1, so
`autoIncrement` should produce 25. Check, from `anything/apps/mobile`:

```bash
eas build:version:get --platform ios --profile production   # expect 24 (the last build); the next build becomes 25
# only if it is NOT 24 (e.g. a manual upload skipped a number):
eas build:version:set --platform ios --profile production    # then re-check
```

## 2. What is in build 25

Mobile changes merged since the v1.0.1 bump (#579), from `git log 44a7764..origin/main -- anything/apps/mobile`:

- **Client telemetry** (#600) — anonymous, allowlisted behaviour events + Settings opt-out + server kill switch.
  *This is the headline of build 25* and the reason the human actions in §3 exist.
- Preference/storage: device preferences kept on sign-out (#605); onboarding never creates a second dog for an account
  that already has one; EntryPoint routes once per session; profile-less accounts get 200 on launch/Services routes;
  onboarding diagnostics beacon (#598).
- Carry-overs from the v1.0.1 line (#580-#592): point the app at `https://www.pawpi.info`, failed-sign-in recovery
  (Start over / back), "Use a different account", keyboard-safe onboarding, 24-hour times, `lbs` alias fix, Place
  review sheet keyboard.

**Open PRs that would join the build if you merge them first (all mobile, none auto-merged):**

| PR | What | Risk to look at |
|---|---|---|
| #617 | logout cancels every scheduled notification, unregisters the push token, clears the previous user's in-memory reminders | touches `utils/auth/store.js` `setAuth` (the one place every logout passes through) — no auth/token logic changed |
| #618 | launch requests 40 → 18 (shared pets/routines cache, tabs mount on first open, Discover waits for location) | first open of Health/Training/Services/More now mounts the screen at that moment (blank cream placeholder for one frame) |
| #619 | notifications audit doc + first-reminder setup nudge (local, ≤2 per pet) | new local notifications; copy EN + ES |

#617 and #618 both edit `store/routinesStore.js` in adjacent hunks, so the second to merge needs a trivial conflict
resolution. #619 reads best after #617 (the nudge re-arms after the logout cleanup).

## 3. Human actions before submitting (none are automated)

1. **Decide the three PRs** above (merge / hold). Then `main` is the build input — do not build from a PR branch.
2. **Gates, from the repo root of each app** (all three are required checks in CI too):
   ```bash
   cd anything/apps/mobile && npm test
   cd anything/apps/web && npm test && npm run test:integration
   ```
3. **App Store Connect → App Privacy**: add Diagnostics / Usage Data — not linked to the user, not used for tracking
   (answers drafted in `docs/privacy/telemetry.md`). Do this **before** submitting, not after.
4. **Live privacy policy** text and `docs/app-store-privacy-data-map.md`: both still say "no Diagnostics/Usage" — update
   at the same time (`docs/test-backlog.md` ACTION 4).
5. **Railway/Grafana** (`docs/observability/OPERATIONS.md` §14, `docs/test-backlog.md` ACTION 4): env vars, Grafana apply,
   and keep client alert rules **paused** until build 25 has been live a few days.
6. **APNs `.p8` key** (`docs/LAUNCH-CHECKLIST.md`) is still the gate for iOS remote push; it does not block this build
   (owner reminders are local), but business pushes stay dark without it.
7. **Release notes** for App Store Connect (EN + ES): `docs/app-store-connect-content.md` / `-es.md`. Suggested "What's new"
   if #617-#619 are in: *"Faster launch, reminders no longer carry over between accounts on a shared device, and a
   gentle prompt to set up your first reminder."* — keep health wording non-diagnostic.
8. **Build and submit** (from `anything/apps/mobile`, per `docs/app-store-submission-runbook.md` §2-§3):
   ```bash
   eas build --platform ios --profile production
   eas submit --platform ios --profile production
   ```
   Test the TestFlight install on a **real iPhone** (§5) before pressing *Submit for Review*.

## 4. Runtime version / OTA — read before publishing any EAS Update

`runtimeVersion` is the fixed string `"1.0.0"` and `updates.url` is enabled, so a JS bundle published to the
`production` channel is eligible for **every** installed build (21, 24, 25…), not only 25. Tonight's three PRs add **no
native dependency** (no `package.json` / `app.json` change; the new JS uses `@react-navigation/native`'s
`NavigationContext` and `expo-notifications` APIs that already ship in build 21+), so they would not break older builds
— but anything that needs a native module added since build 21 (e.g. the native Apple sign-in) must **not** be
pushed over the air to builds that lack it. Prefer shipping build 25 through the App Store and treat OTA as a
separate decision.

## 5. Device checklist for build 25 (add to `docs/test-backlog.md` as "build 25")

- [ ] **Telemetry:** Settings → "Help improve PawPi" toggle works; turning it off stops events (Grafana
  `pawpi_telemetry_ingest_total` goes quiet for that device); on → `perf_startup` appears after a cold start.
- [ ] **Logout leak (#617):** sign in as A with a routine due in ~2 min → log out → **no** alert fires; sign in as B → only
  B's reminders are scheduled; switching account via onboarding's "Use a different account" behaves the same.
  Optional: `device_push_tokens` has no row for A's device token after A logs out (verify in Supabase).
- [ ] **Launch (#618):** cold start on Wi-Fi and on LTE — Feed shows content as before; open Health, Training, Services
  and Profile for the first time — each loads its data (brief blank on first open is expected, no empty-state flash);
  Services shows a loading state until location answers (or ≤3 s), then results; nothing is blank after a pull-to-refresh.
- [ ] **Reminder nudge (#619):** new account, one pet, no routine, notifications allowed → after arming, two local
  notifications arrive (tomorrow / +4 days) in the daytime; creating any routine **before** they fire cancels them;
  tapping one opens the reminders screen; with *Settings → Care reminders* off, none are scheduled. EN and ES copy.
- [ ] Regression: email + password, Google and Apple sign-in; onboarding; posting a daily moment; Today/Upcoming reminders.

## 6. After it ships

1. In Grafana Explore, `{job="pawpi-client"}` should show events within minutes of the first cold start (kill switch:
   `TELEMETRY_INGEST_ENABLED=false` on Railway).
2. Compare launch calls per session before/after (`pawpi_http_*` by route for one client IP): expect ~18 launch requests
   instead of ~40 if #618 is in.
3. Un-pause the client alert rules only after a few days of data (`OPERATIONS.md` §8).

## 7. Rollback

- App Store: *Remove from sale* is not needed — expedite a fix as 1.0.3, or re-promote the previous build in App Store
  Connect (build 24 is v1.0.1).
- Server side nothing in these PRs needs rolling back (no migration, no API change). Telemetry has a server kill switch.
- If #618's first-focus mounting misbehaves on a device, the single switch is `components/FirstFocusGate.jsx`
  (render `children` unconditionally) — one-file revert.
