# PawPi — live production QA kit

Everything a separate Claude session needs to QA the **live App Store build** of PawPi by driving it
with computer use (screenshots + clicks) on this Mac.

| File | What it is |
|---|---|
| [`screen-and-button-inventory.md`](screen-and-button-inventory.md) | Every screen reachable from the bottom tabs, with each button/input/modal, its expected result, and the source file it comes from. |
| [`live-qa-rules.md`](live-qa-rules.md) | QA-account protocol, the DO-NOT-TOUCH list (money, outbound messages, public posts, account deletion, social login), and the design checks to run on every screen. |
| [`bug-report-template.md`](bug-report-template.md) | Run-file + bug-entry templates and severity definitions. |
| [`runs/`](runs/) | One markdown file per QA run (results). |

**Read order for the QA session:** this README → `live-qa-rules.md` (all of it, before touching the
app) → `screen-and-button-inventory.md` (area by area) → write results with `bug-report-template.md`.

This kit changes no app code, migrations or config. It was derived from the code at the commit it was
merged on; if the live build is newer than the inventory, trust the screen and note the drift as a
finding.

---

## 1. Environment (checked 2026-10-16, read-only)

| Check | Result |
|---|---|
| macOS | **26.4.1** (build 25E253) — iPhone Mirroring needs 15+, so it is supported |
| CPU | **Apple Silicon (arm64, Apple M5)** — can run iPhone/iPad apps natively |
| PawPi already on this Mac? | **Yes.** `/Applications/PawPi.app` is an App Store "iPhone & iPad Apps" install: bundle `com.pawpi.app`, version **1.0.2**, build **26**, iPhone-only (`UIDeviceFamily = [1]`), minimum iOS 18.0, store release date 2026-09-25 (App Store metadata inside the bundle). |
| iPhone Mirroring.app | Present in `/System/Applications` (needs an iPhone on the same Apple ID, unlocked, iOS 18+, and is **not** an alternative that adds anything for this task) |
| Mac availability per the repo | `app.json` has `ios.supportsTablet: false` and no Mac Catalyst / visionOS keys. So the app is **iPhone-only**; Apple runs it on Apple Silicon Macs as "Designed for iPhone" in a fixed portrait window, **if** the App Store Connect Mac-availability toggle is on. Nothing in the repo or `docs/` records that toggle. The fact that it is installed here from the App Store shows it is currently enabled. |
| Where to confirm the toggle | App Store Connect → My Apps → PawPi → **Pricing and Availability** → section **"iPhone and iPad Apps on Apple Silicon Macs"** (must stay "Make this app available"). |

**Recommended route:** run the already-installed native Mac copy (`/Applications/PawPi.app`). It is the
exact App Store binary, needs no phone, and gives a stable window to screenshot. Use iPhone Mirroring
only if the Mac copy misbehaves (see caveats).

### Caveats of the "iPhone app on Mac" route (affect what QA can conclude)
- **No on-screen keyboard** — you type on the Mac keyboard, so "button hidden behind keyboard" checks
  from `live-qa-rules.md` **cannot be verified here**. Mark those items *Not testable on Mac* and ask the
  human to spot-check on a real iPhone (known: keyboard bugs only reproduce on device).
- Window is a fixed iPhone-sized portrait window; no rotation, no pinch gestures, no haptics. Pull-to-refresh
  = click-and-drag down; swipes = click-and-drag. Some native iOS 26 "Liquid Glass" tab-bar visuals can render
  slightly differently on macOS.
- Camera uses the Mac camera; photo picker uses the Mac Photos/Files library; location is the Mac's.
  Push notifications may not be delivered the same way. Treat those as *behaviour differences*, not bugs.
- Sign in with Apple opens a macOS sheet; Google sign-in opens the default browser. Both are on the DO-NOT-TOUCH list.

## 2. What the human (Augusto) must do by hand — before starting the QA session

1. **Nothing to install** — PawPi 1.0.2 (26) is already there. To refresh it: Mac App Store → profile
   (bottom-left) → **Apps / iPhone & iPad Apps** → *Update* next to PawPi. Never install a TestFlight or
   sandbox build for this exercise.
2. **Claude desktop app permissions** (System Settings → Privacy & Security): turn on **Screen & System
   Audio Recording** and **Accessibility** for *Claude* (the app that runs computer use). Quit and reopen
   Claude after granting. (This could not be verified from the shell — macOS keeps that list private.)
3. **Make the QA account yourself** (the QA session must not create accounts): follow
   `live-qa-rules.md` §1 — dedicated e-mail, dedicated dog named `QA-…`. Store the password in your password
   manager, **outside the repo**; type/fill it yourself when the login screen appears.
4. Optional but recommended: set a macOS display with enough room for a tall portrait window, and set
   Spanish as the in-app language for the second pass (Profile → ☰ → Settings → Language).
5. In the QA session, say explicitly: *"QA account is `qa-…`; do not touch anything on the DO-NOT-TOUCH list."*

## 3. How the QA session should start

1. Load the `computer-use` skill, request access to **PawPi** only (not Mail, Messages, Safari, etc.).
2. Open `/Applications/PawPi.app`. The app does not display its version anywhere (Settings has no version row),
   so record it from the bundle instead:
   `plutil -extract CFBundleShortVersionString raw /Applications/PawPi.app/Wrapper/PawPi.app/Info.plist` and
   `CFBundleVersion` (build). Put both in the run file.
3. Create `docs/qa/runs/<date>_<build>_<device>.md` from the template and work area by area.
4. Never type the QA password; ask the human to sign in when the login screen shows.
