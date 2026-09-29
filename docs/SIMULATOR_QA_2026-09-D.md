# Simulator QA — 2026-09-29 (Run D): true first-run sweep against production

**Scope:** Full QA sweep of `main` (`2aeb1546`, #567–#574 merged) on the iOS Simulator, from a
genuine first launch, against the **live production backend**
(`https://pawpi-production.up.railway.app`). FIND-AND-REPORT ONLY — nothing fixed in the app; one
temporary, local-only, reverted-before-commit JS edit was used mid-run purely to unblock testing
after a native permission alert could not be dismissed (see "Environment reliability" below).

## Environment / setup

- Fresh local Debug build (`xcodebuild`, `/tmp/pawpi-derived-qad`), Metro started separately
  (`npx expo start --port 8081`). Backend pointed at production via a gitignored
  `anything/apps/mobile/.env.local` (removed again after the sweep; `.env` untouched).
- Device: iPhone 16 Pro Max simulator, iOS/Xcode 26.6.
- True first run confirmed: fresh install (`simctl uninstall` + `keychain reset` + install) landed
  on Welcome with no restored session.
- **es-AR pass:** attempted but not completed as its own full second sweep — see "Regression
  checklist" (#572) and "Not covered" below for what could and couldn't be confirmed this run.

## ⚠️ Headline finding: onboarding cannot be completed (Step 5, gender)

**On every one of 3 independent, from-scratch attempts, onboarding freezes solid at Step 5 of 9
("What's Buddy's gender?") and cannot proceed.** Tapping either "Female" or "Male" does nothing —
no selection highlight, no checkmark, "Next" stays disabled with "Pick male or female to
continue." Once this happens, **the entire screen goes inert**, including the always-enabled back
arrow — not just the two gender cards.

- Reproduced 3 times from a clean app launch (distinct process IDs each time: 22044 → 22911 →
  25125), including once with deliberate 4–6 second pauses between every onboarding step to rule
  out a screen-transition race condition. Identical result every time.
- Diagnostics gathered via `xcrun simctl ... log show`: iOS **does** dispatch the touch event to
  the app's window each time (`shouldSend: 1`) — this is not a touch-delivery failure. The app
  process sits at **0% CPU** afterward (not an infinite loop or hang). No fatal JS exception or
  crash is logged around the failure.
- Recovery is only possible by fully killing and relaunching the app; returning to Step 5
  immediately re-triggers the identical freeze.
- Source: `anything/apps/mobile/src/app/onboarding.jsx` (gender step, ~lines 1236–1313) uses the
  same `PressableScale` + `Card` pattern as the working breed-selection step earlier in the same
  flow, so nothing jumps out by inspection in the time available. The only recent change to this
  file is #573 (a `useEffect` gated to `currentStep === 1` for live handle-uniqueness checking) —
  it doesn't obviously touch step 5, but is the newest edit to this exact file and worth a first
  look.
- **This could not be worked around** (gender is required, with no skip), so neither the
  skip-photo nor add-photo Flow 1 pass could be completed to the final "Create profile" step in
  this run, and no new pet could be created via onboarding.

**Severity: S0.** If this reproduces outside this harness, it is a complete new-account blocker —
nobody could finish setting up a pet at all. **However**, this was only reproduced in a local
Debug+Metro+Simulator harness that also showed broader touch-reliability problems over the course
of this session (see below), and prior sweeps (Runs A–C, including one the day before) completed
onboarding successfully through this same step. **This needs an urgent, independent confirmation
on a real device or a clean TestFlight/production build before being treated as certainly present
for real users** — but given the potential impact, that check should happen immediately rather
than waiting for the next scheduled QA pass.

## Environment reliability (session-wide caveat)

Over the ~2 hours of this sweep, ordinary tap delivery in the Debug+Metro+Simulator harness became
noticeably unreliable — plain `TouchableOpacity` rows in Menu/Settings intermittently failed to
respond, always recovering after a full app relaunch. Three native `Alert.alert` dialogs behaved
inconsistently: the location-permission prompt dismissed on the first tap, but the first-launch
"Enable Reminders" prompt and the "Delete account?" confirmation each failed to dismiss across
6–8 tap attempts at varied coordinates (recovered safely each time via `simctl terminate`, with no
data loss — confirmed the test account and its pet were intact afterward).

One especially alarming and reproducible (3/3) observation: tapping "Español" in **Settings →
Language** appeared to open the **"Delete account?"** confirmation instead of switching language.
Reading the actual source (`src/components/Settings/AppSettings.jsx`) shows the language list and
the delete-account button are fully independent, ordinarily-scoped `TouchableOpacity` handlers
with no plausible code path connecting them — so this is very likely a touch-delivery/queueing
artifact of this specific long-running harness rather than a real app defect. It's flagged here
only because of how severe it would be if ever real; a fresh, short, manual check of
**Settings → Español** is worth doing independently of this report, but it is **not** being
reported as a confirmed bug.

Given this, the exhaustive bilingual full-screen pass the task asked for could not be completed to
the standard of prior runs — coverage below is real but narrower than intended, and anything not
explicitly confirmed PASS/FAIL should be treated as unverified this run, not as passing by default.

## Regression checklist (confirm each recent fix)

| # | Item | Result | Notes |
|---|---|---|---|
| #568 | Onboarding step 0 back arrow → photo screen | ✅ **PASS** | Confirmed cleanly: step 1 ("What's your dog's name?") → back arrow → lands on the photo screen, not dead. |
| #568 | Keyboard-open crash on name field | Device-only | Sim can't reproduce real keyboard timing, per task brief — not re-litigated. |
| #570 | Reset App Data / logout teardown crash | ⚠️ **NOT VERIFIED** | Not reached this run — session reliability issues (above) consumed the time budget before this could be tested cleanly. |
| #571 | Profile tab nav-stack reset (Menu → nested screen → other tab → Profile lands on ROOT) | ✅ **PASS** | Reproduced the exact repro from Run C's finding #2: Profile → Menu → Reminders & Routines → Health tab → Profile. Landed on the Profile root (Luna's social profile) on the **first** tap, not the stale Reminders & Routines screen. Fix holds. |
| #572 | es-AR i18n (Dog Profile, Settings tracking card, Feed daily-moment badge, voseo) | ⚠️ **NOT INDEPENDENTLY VERIFIED** | Could not complete the language switch cleanly this run (see "Environment reliability"). The fix commit (`edeffb9a`) **is** included in the current production deploy (see below), so it should be live — recommend a quick follow-up check rather than treating this as a new regression. |
| #573 | Handle uniqueness validated at step 2, not just review | ⚠️ **INCONCLUSIVE** | Selecting a suggested handle chip (`@buddy.paws`, matching a handle used by a prior QA account) was accepted without any "taken" warning and advanced past step 2 normally — but this doesn't necessarily contradict the fix, since the account's own onboarding session had never actually submitted that handle to the backend in this run (nothing to collide with). Attempting to type a handle manually to force a real collision test triggered an unrelated tooling issue (typing into the custom-handle field intermittently opened the React Native Dev Menu in this Debug build) before a clean test could be completed. |
| #574 | Stores & Vets "All" filter — pet-relevant businesses only | 🔴 **FAIL (as currently deployed)** | See below — root cause identified as a **missing production deploy**, not a defect in the merged fix. |

### #574 — root cause: not yet deployed to production

Live-tested against production: **Stores & Vets → Discover → "All"** still surfaces "Pistacho -
coffee & brunch," "Bodegon Casa Emma" (a bodegón/restaurant), and "Art'e-casa de té" (a tea house)
alongside real vets. Checked Railway's deployment history via MCP: the latest **SUCCESS**
deployment on the production service is commit `5017cc80` (#573). Commit `2aeb1546` (#574, merged
to `main` today at 14:41 ART) **does not appear in the deployment list at all** — it was never
shipped. The fix itself looks correct in the repo; this is purely an ops/deploy gap.
**Action: deploy `main` to Railway production**, then re-verify.

## Flow 1 — signup + onboarding (skip-photo path): BLOCKED

- Created a fresh account: `augusto+qa-20260929@pawpi.info` / `PawpiQA2026!` via the native-styled
  WebView signup form — worked correctly first try, including the strength meter and terms
  checkbox, and landed in onboarding as expected.
- Steps 0 (photo, skipped) → 1 (name: "Buddy") → 2 (handle) → 3 (breed: Mixed breed) → 4 (age: 2
  years) all completed correctly against the live production backend.
- **Blocked at step 5 (gender)** — see headline finding above. Could not reach the review/submit
  step, so the add-photo pass and the final "Create profile" submission were not exercised this
  run.
- This account currently has **no pet** (never completed onboarding) — left as-is; either useful
  for the dev team to reproduce the gender-step bug directly, or safe to delete along with prior
  QA accounts.

## Flow 2 — screen walk (existing account: Run C's "Luna")

Given Flow 1 couldn't produce a fresh second account, Flow 2 coverage used Run C's existing
`augusto+qa2-20260928@pawpi.info` (pet "Luna") to still exercise the main app against production.

| Screen | Result | Notes |
|---|---|---|
| Login (existing account) | ✅ PASS | Email/password login worked correctly; landed on Feed. |
| Feed | ✅ PASS | Real "Getting started" 1/5 checklist, real suggested post from another user, no fake data. |
| Health Hub → Today | ✅ PASS | Honest 0/3 ring, real date, no fake data. |
| Care (training) | ✅ PASS | Real catalog (8 programs, 41 sessions), 0/41 progress — not fake user data. |
| Stores & Vets → Discover | 🔴 FAIL (deploy gap) | See #574 above. |
| Profile (pet social) | ✅ PASS | Correct counts, "No daily posts yet," correct owner name shown. |
| Menu → Reminders & Routines | ✅ PASS (nav only) | "No routines yet," opened without crash. |
| Menu → Settings → Notifications/Walk tracking | ✅ PASS (nav only, English) | Renders correctly; Spanish-language re-check not completed this run. |
| Native location-permission prompt | ✅ PASS | Dismissed correctly on first tap ("Allow While Using App"). |

A location-permission system prompt fired on first login to this account ("PawPi uses your
location to find nearby pet-friendly places…") — expected behavior, not a bug.

## Empty-state / fake-data audit

No fake/mock data, counts, or sample images observed anywhere covered this run (Feed, Health
Today, Care, Stores & Vets). All zero-states seen were honest.

## Private-write test

**None made.** Flow 1's onboarding never reached a point where a pet/routine could be created (see
above), and Flow 2 used an existing account read-only (navigation only, no new routines, logs,
posts, messages, bookings, payments, reviews, or lost-and-found broadcasts).

## Device-only / not covered this run

- The exact "tap the dog-name field → crash" repro from real-device keyboard timing (per task
  brief, sim can't reproduce this).
- Native Sign-in-with-Apple completion (requires a real Apple ID/device).
- Real OS push notifications.
- #570 (Reset App Data / logout crash retest) — not reached.
- A clean, full es-AR bilingual pass — not completed to the standard of prior runs (see
  "Environment reliability").
- With-photo onboarding pass, and onboarding steps 6–9 (special days, notes, review, submit) —
  unreachable behind the Step 5 blocker.
- Exhaustive "every button/every screen" coverage of Vet Record, all Reminders & Routines
  creation forms, Family & Caregivers, Lost & Found, Memories & Wrapped, and Pet Services — not
  reached given the time spent isolating the Step 5 blocker and the session's touch-reliability
  issues.

## Test accounts

- `augusto+qa-20260929@pawpi.info` — password `PawpiQA2026!`. **No pet** (onboarding blocked at
  gender step, see above). Left as-is — useful for reproducing the Step 5 bug directly, or safe to
  delete.
- Reused (no new writes): `augusto+qa2-20260928@pawpi.info` (Luna) from Run C, for Flow 2 coverage.

## PASS/FAIL matrix

| Flow | Result |
|---|---|
| Flow 1 — signup | ✅ PASS |
| Flow 1 — onboarding steps 0–4 | ✅ PASS |
| Flow 1 — onboarding step 5 (gender) onward | 🔴 **FAIL — hard blocker (S0), see headline finding** |
| #568 back-arrow regression | ✅ PASS |
| #571 Profile nav-stack regression | ✅ PASS |
| #572 es-AR i18n regression | ⚠️ Not independently verified this run |
| #573 handle-validation regression | ⚠️ Inconclusive this run |
| #574 directory-scoping regression | 🔴 FAIL — missing production deploy, not a code defect |
| #570 teardown-crash regression | ⚠️ Not reached this run |
| Flow 2 — screen walk (existing account) | ✅ PASS (one data-scoping finding, #574, already covered) |

## Verdict

The single most important result of this sweep is that **onboarding could not be completed on any
of three clean attempts**, freezing hard at the gender step with the whole screen going
unresponsive — a potential S0 if it holds outside this harness. Given this session also showed
broader touch-reliability degradation (flaky native alerts, intermittent ordinary taps) that
*didn't* affect earlier, simpler onboarding steps or the Profile-nav regression retest, the gender
freeze looks like a genuine, distinct issue rather than pure tooling noise — but it must be
confirmed on a real device or clean build immediately given the stakes. Separately, #574's fix is
correct in the repo but was never deployed to production — a quick, low-risk action item. #568 and
#571 are both confirmed holding. #572, #573, and #570 need a follow-up pass once the gender-step
blocker (or the environment issue causing it) is understood, since this run couldn't reach them
cleanly.
