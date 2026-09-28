# Simulator QA — 2026-09-28 (Run C): true first-run sweep against production

**Scope:** Full QA sweep of `main` (`c81844ab`, #567 social login + #568 onboarding fixes merged)
on the iOS Simulator, from a genuine first launch, against the **live production backend**
(`https://pawpi-production.up.railway.app`). FIND-AND-REPORT ONLY — nothing fixed.

## Environment / setup
- Fresh local Debug build (no prior `com.pawpi.app` install existed on this simulator — genuine
  first run). Built via `xcodebuild` directly (Expo CLI's `expo run:ios` is currently broken on
  this Xcode version — device-detection chokes on `devicectl` JSON output and demands code-signing
  certs even for a simulator target; see `xcode-ios-simulator-available` recipe).
- Backend pointed at production via a new gitignored `anything/apps/mobile/.env.local`
  (`EXPO_PUBLIC_BASE_URL`/`PROXY_BASE_URL`/`HOST`/`API_URL` = `https://pawpi-production.up.railway.app`),
  removed again after the sweep — `.env` is back to the LAN-IP dev default, untouched.
- Device: iPhone 16 Pro Max simulator, iOS/Xcode 26.6.
- Landed on Welcome with no restored session — confirmed true first-run state.

## Flow 1 (highest priority) — signup + onboarding: PASS

Two full onboarding passes, both against production, both successful with **no crash**:

| Pass | Account | Photo path | Result |
|---|---|---|---|
| A | `augusto+qa-20260928@pawpi.info` / Buddy | Skipped | ✅ Complete, no crash |
| B | `augusto+qa2-20260928@pawpi.info` / Luna | Added via gallery | ✅ Complete, no crash |

- Email/password signup (native-styled WebView form) succeeded first try both times; strong-password
  meter and terms checkbox worked correctly.
- **#568 regression-tested and confirmed fixed:** step-0 back arrow returns to `/onboarding-photo`
  (not disabled, not stranding the user) — verified on Pass A.
- **#568 keyboard-crash fix:** tapping the dog-name field did **not** crash on the simulator, as
  expected (device-only repro per the task brief — the sim can't reproduce the real keyboard timing).
  Marked device-only, not a regression finding.
- Photo path (Pass B): native photo-library permission prompt → picker → crop-preview → "Cute! Use
  this photo?" all worked. **Chose "Only use as profile photo"**, not "Post as daily + use as profile
  photo" — the latter would have published a real public feed post, which is forbidden for this sweep.
- All 9 steps (name, handle, breed, age, gender, weight, special days incl. the inline calendar
  date-picker, notes, review) round-tripped correctly through the final review screen and persisted.
- Welcome screen social buttons: "Continue with Apple" and "Continue with Google" both render and
  are enabled (correctly gated per #567). Native Apple completion is device-only, not exercised.

## Flow 2 — full screen walk (new empty accounts): mostly PASS, findings below

**⚠️ Documentation note:** the bottom tab bar is now **Feed / Health / Care / Stores & Vets /
Profile** — `ARCHITECTURE.md` (and this task's own brief) still describe the older
Feed/Health/Training/Community/More structure. Not a bug, but stale docs; "Care" is the old
Training/self-training-progress surface, "Stores & Vets" is the old Community/directory surface,
and "Profile" (reached via a hamburger **Menu**) is the old More landing page. The sweep below
covers the real, current structure.

| Screen | Result | Notes |
|---|---|---|
| Feed | ✅ PASS | Honest empty "Getting started" checklist (1/5 done), real suggested-feed post from an existing user, no fake data |
| Health → Today | ✅ PASS | Honest 0/3 ring, no fake data |
| Health → Track | ✅ PASS | Real category list |
| Health → Vet Record | ✅ PASS | "No upcoming appointment", "Medical history 0 items" — honest |
| Care (ex-Training) | ✅ PASS | Real catalog counts (not user data), 0/x progress |
| Stores & Vets → Discover | ⚠️ FINDING (below) | |
| Stores & Vets → My Activity | ✅ PASS | All honest empty states |
| Profile (pet social) | ✅ PASS | All counts 0, "No daily posts yet" |
| Menu → My Dogs / Community / My Hub / Family & Caregivers / Lost & Found / Memories & Wrapped | ✅ PASS (nav only) | Opened without crash |
| Menu → Dog Profile | ⚠️ FINDING (i18n, below) | |
| Menu → Reminders & Routines | ⚠️ FINDING (nav bug, below) | |
| Menu → Settings | ⚠️ FINDING (i18n, below) | |
| Menu → Reset App Data | 🔴 FINDING (crash, below) | |

## Findings (worst first)

| # | Screen | Severity | Issue | Repro | Suggested fix area |
|---|---|---|---|---|---|
| 1 | Menu → Reset App Data | **S1** | RedBox: *"Attempted to remove more RCTKeyboardObserver listeners than added"* fires when resetting app data / tearing down the authenticated app tree. Debug-build RedBox is fatal-looking; even if release builds only warn, it signals a real keyboard-listener add/remove mismatch somewhere in the screen teardown path (same family as the #568 keyboard-crash class of bugs). | Sign in → navigate around (esp. after visiting a KeyboardAwareScrollView-based form) → Profile → Menu → Reset App Data. Fires reliably. | Keyboard-listener lifecycle (`RCTKeyboardObserver` add/remove balance) in shared form/modal teardown, likely `KeyboardAwareScrollView`-adjacent code paths (`adjustForKeyboard` family from #568). |
| 2 | Profile tab (nav) | **S1** | Reproduction of the documented "More tab" nav-stack bug, just moved to the renamed **Profile** tab: after pushing a nested screen from the Menu (Reminders & Routines, Settings) and switching to another tab, the **first** tap back on Profile shows the stale pushed screen instead of the Profile landing page. A **second** tap on the already-active tab correctly pops to root. | Profile → Menu → Reminders & Routines (or Settings) → tap Feed → tap Profile. Shows Reminders & Routines / Settings, not the Profile landing page. Tap Profile again → correctly lands on Profile. Reproduced 3 times, consistent. | `(tabs)/more/_layout.jsx`-equivalent nested Stack under the renamed Profile tab — same root cause architecture flagged in `ARCHITECTURE.md` §5 (undeclared nested routes / tab-tap not resetting to root on first tap from another tab). |
| 3 | Dog Profile (Menu → Dog Profile) | S2 | Large i18n gap under es-AR: only the field *labels* are translated (Raza/Edad/Sexo/Peso); values and several section headers stay English — "Mixed Breed", "~2 years", "Male", "lbs", "Birthday / Adoption Date", "Not set", "NOTES & PREFERENCES", "No extra notes yet. Add information about allergies,...", "GROOMING". | Settings → Language → Español → Menu → Dog Profile. | Dog Profile view screen i18n coverage — values/enums aren't run through the breed/gender/unit translation maps the Edit-profile screen already uses correctly. |
| 4 | Settings ("Seguimiento de paseos" section) | S2 | Whole "Connected tracking" card is hardcoded English under es-AR: "Connected tracking", the Apple Health/Apple Watch/Manual tracking card labels and descriptions, "COMING SOON" badges, and the tip banner ("Tip: Apple Health and Watch tracking will be available soon..."). | Settings → Language → Español, scroll to "Seguimiento de paseos". | `SettingsScreen` walk-tracking card — not wired to i18n at all. |
| 5 | Feed post card | S2 | The "Daily moment" pill/badge on a feed post stays in English under es-AR (should be "Momento diario" — key exists elsewhere in the locale files per repo search). | Settings → Español → Feed. | Feed post-card badge component. |
| 6 | Onboarding pet-handle step | S2 (UX) | Handle uniqueness is only validated at the **final** "Create profile" step (9 of 9) via a native "Handle already taken" alert — not live at step 2 where the handle is actually chosen. A common name (e.g. `@luna`) forces the user to scroll back through the whole form after already filling everything in. | Onboarding step 2: pick a suggested handle likely to collide (e.g. `@luna`) → fill the rest of the form → tap "Create profile" at step 9 → alert. | Live availability check on the handle field at step 2 (debounced `GET`), mirroring the pattern already used for other uniqueness checks in the codebase. |
| 7 | Stores & Vets → Discover ("All" filter) | S2 (data quality) | The default "All" category filter surfaces businesses with no pet-care relevance at all mixed in with vets/groomers — e.g. a coffee & brunch spot, a bodegón/restaurant, a tea house. Looks like the seeded directory dataset (`PawPi Directory`, ~3,627 rows per prior audit) isn't scoped to pet-related categories, or the default filter doesn't exclude non-pet business types. | Stores & Vets tab, default "All" filter, scroll the Suggested list. | Directory seed data categorization / default-filter scoping — worth checking with whoever owns the `directory-claim-flow` seed loader. |
| 8 | Getting Started checklist (Feed) | S3 (i18n polish) | "Activa las notificaciones" breaks the otherwise-consistent Argentine voseo used by its sibling items ("Completá", "Registrá", "Compartí"); should be "Activá". | Settings → Español → Feed → Getting Started checklist, 5th item. | One locale string in `es.json`. |
| 9 | Health hub sub-tabs | S3 (needs confirmation) | Health hub shows only 3 sub-tabs (Today/Track/Vet Record) for a brand-new account; the task brief expected 4 (Today/Track/Insights/Vet Record). Could be intentional data-gating (Insights needs history to be meaningful) rather than a bug — flagging to confirm intent, not asserting a defect. | Health tab, brand-new account, zero logs. | Confirm whether Insights is meant to be gated behind having ≥N logs, or whether it's missing/misrouted. |
| — | Web signup form's Apple button | Not a bug | "Continue with Apple (Coming soon)" is disabled on the **web** email-signup form (a WebView), while the native Welcome screen's "Continue with Apple" is enabled. This is expected — Apple's native Sign-in-with-Apple only works through a native entry point, not inside a WebView, so the web form's own Apple button being unimplemented is correct, not an inconsistency in #567. | — | — |

## Empty-state / fake-data audit: PASS

No fake/mock data, counts, or sample images found anywhere across Feed, Health (Today/Track/Vet
Record), Care, Stores & Vets → My Activity, or Profile for either new account. All zero-states are
honest ("No routines yet", "No daily posts yet", "No upcoming appointment", "Medical history 0
items", etc.).

## Private-write test (required by the sweep, then reverted)

On Buddy's account (Pass A): created a **Feeding routine** (2 meals/day, default Breakfast
08:00 + Dinner 20:00) via Reminders & Routines → Create First Routine → Feeding. Confirmed it
persisted (native "Routine created" alert, real computed "Next: Dinner this evening at 8:00 PM").
**Deleted it immediately after** (Delete Routine → confirm) — confirmed back to "No routines yet".
No other private writes were made. No public feed/community posts, no messages, no bookings, no
payments, no reviews, no lost-&-found broadcasts were created (Pass B's photo was saved as profile-
photo-only, explicitly avoiding the "post as daily" option to stay compliant with the sweep's safety
rules).

## Device-only, not covered

- The exact "tap the dog-name field → crash" repro from a real device's keyboard-open timing — not
  reproducible on the simulator (confirmed no crash; per the task brief this is expected and not
  re-litigated as a finding).
- Native Sign-in-with-Apple completion (requires a real Apple ID / device).
- Real OS push notifications.
- Reduce Transparency / accessibility-toggle fallback for the liquid-glass tab bar.

## Test accounts created (for deletion)

- `augusto+qa-20260928@pawpi.info` — password `PawpiQA2026!`, pet "Buddy" (@buddy.paws). Feeding
  routine created then deleted; account itself left as-is for later deletion.
- `augusto+qa2-20260928@pawpi.info` — password `PawpiQA2026!`, pet "Luna" (@luna_qa2). Profile photo
  uploaded (not posted publicly); no other writes.

## PASS/FAIL matrix

| Flow | Result |
|---|---|
| Flow 1 — signup + onboarding (skip-photo) | ✅ PASS |
| Flow 1 — signup + onboarding (add-photo) | ✅ PASS |
| Flow 1 — #568 step-0 back arrow | ✅ PASS (confirmed fixed) |
| Flow 1 — #567 social buttons render/gating | ✅ PASS |
| Flow 2 — screen walk / empty states | ✅ PASS (2 data findings noted above: #7 directory scoping, #9 Insights tab to confirm) |
| Flow 2 — known nav-bug re-test | 🔴 **FAIL — still reproduces** (finding #2, now on the Profile tab) |
| Flow 2 — es-AR i18n pass | ⚠️ PARTIAL — several real gaps (findings #3, #4, #5, #8) |
| Reset App Data / logout path | 🔴 **FAIL** — RedBox crash (finding #1) |

## Verdict

The core first-run funnel (download → sign up → onboard → land in Feed) is solid: both onboarding
paths complete cleanly against production with no crashes, and #567/#568 are confirmed fixed as
shipped. The two S1 issues are not in that funnel — they're in the **Reset App Data** flow (crash)
and in **cross-tab navigation back to Profile** after visiting a nested Menu screen (stale-screen
bug, structurally the same defect the team already knows about on the old "More" tab, just
resurfaced under the new tab name). Neither blocks a new user's first session, but both should be
fixed before the next release. The i18n gaps are real but cosmetic; the handle-validation and
directory-scoping items are UX/data-quality polish.
