# Native iOS Widgets / Live Activities / Watch (ticket 2.76)

Status: **Phase 1 (Home + Lock-screen Widget) — built & STAGED, pending the Apple
Developer account.** Attended track: each phase is device-tested by Tats and
merged only after approval (no auto-merge on green CI).

This doc is the orientation + the **plug-and-play handoff**: when the Apple
account is ready, follow the checklist at the bottom and it's a short, mechanical
finish.

---

## What Phase 1 delivers

A WidgetKit extension that shows the active pet's day on the Home screen
(small + medium) and Lock screen (accessory rectangular / inline / circular):

- pet name + 🔥 posting streak (ticket 2.37),
- today's next reminders + a "done / total" count,
- the next vet appointment,
- an "in-progress walk/trip" banner when a walk (2.7) or transport trip (2.70)
  is live — which becomes the widget's primary tap target,
- a clean **"Open PawPi to get started"** empty state when logged out / no pet.

Tapping the widget deep-links into the right screen.

**No fake data on any user-facing surface.** The hardcoded sample in
`widget.swift` is used ONLY for Xcode previews / the placeholder; the live widget
shows the real snapshot or the empty state.

---

## Architecture

### Native target
Added with **`@bacons/apple-targets`** (Evan Bacon's Expo Apple-targets plugin),
wired into Continuous Native Generation. `expo prebuild` reads
`targets/widget/expo-target.config.js` and generates the Widget Extension inside
the iOS project. The plugin also ships the native **`ExtensionStorage`** module
(shared App Group UserDefaults write + `WidgetCenter` reload) — so there is **no
custom native module** to maintain.

- Plugin registered in `anything/apps/mobile/app.json` → `expo.plugins`.
- Dev dependency: `@bacons/apple-targets` (in `package.json`).

### Data flow (App Group snapshot)

```
 RN app (foreground / data change)
   useCurrentPet, useTodayReminders, usePostingStreak,
   useVetAppointmentReminders, useWalkSessions, useTransportTrips
        │  (real data the app already computes)
        ▼
   buildWidgetSnapshot()          src/utils/widgetSnapshot.js   (PURE, unit-tested)
        │  small JSON snapshot
        ▼
   syncWidgetSnapshot()           src/native/widgetBridge.ts    (guarded, no-ops until armed)
        │  ExtensionStorage.set(APP_GROUP_ID, key, json)
        │  ExtensionStorage.reloadWidget(kind)
        ▼
   App Group shared UserDefaults  ──read──►  SwiftUI widget   targets/widget/widget.swift
        ▲                                          │
        │  tap → pawpi://widget/<target>           │ widgetURL
        └──────── resolveWidgetRoute() ◄───────────┘
                  src/native/useWidgetDeepLinks.js → expo-router push
```

- `WidgetSync` (`src/native/WidgetSync.jsx`) is mounted once in the root
  `src/app/_layout.jsx`. It renders nothing and **only mounts the data hooks when
  the bridge is actually live** (`isWidgetBridgeAvailable()`), so while the
  account is pending it adds **zero** extra queries/polling/network.
- Deep links use the `pawpi://` scheme (added to `app.json` → `expo.scheme`).
  `useWidgetDeepLinks()` (mounted in the root layout) translates
  `pawpi://widget/...` URLs into expo-router destinations.

### Files (JS side — all CI-testable / already green)

| File | Role |
|------|------|
| `src/native/appGroup.ts` | **single JS config spot** for the App Group id + keys (placeholder + `isAppGroupConfigured()`) |
| `src/utils/widgetSnapshot.js` | pure `buildWidgetSnapshot()` + `widgetDeepLink()` + `resolveWidgetRoute()` |
| `src/utils/widgetSnapshot.test.js` | 12 unit tests (builder + routing) |
| `src/native/widgetBridge.ts` | guarded write/reload via `ExtensionStorage` (no-ops until armed) |
| `src/native/WidgetSync.jsx` | gathers real data → builds → syncs; mounted in root layout |
| `src/native/useWidgetDeepLinks.js` | widget tap → expo-router route |
| `src/app/_layout.jsx` | mounts `<WidgetSync/>` + `useWidgetDeepLinks()` |
| `src/app/(tabs)/health.jsx` | reads `?section=` so the appointment/today deep links land on the right tab |
| `app.json` | `scheme: "pawpi"` + `@bacons/apple-targets` plugin |

### Files (native side)

| File | Role |
|------|------|
| `targets/widget/expo-target.config.js` | target descriptor (type `widget`, colors, deployment 16.0, App Group entitlement) |
| `targets/widget/widget.swift` | SwiftUI widget UI (small/medium/accessories) + snapshot model + timeline provider + Xcode previews |

### The App Group id lives in (must all match)
1. `src/native/appGroup.ts` → `APP_GROUP_ID` (the JS source of truth)
2. `targets/widget/expo-target.config.js` → `entitlements["com.apple.security.application-groups"]`
3. `targets/widget/widget.swift` → `PawPiWidgetConfig.appGroupId`

All three are `group.PLACEHOLDER.pawpi` today. (1) is the JS single-spot; (2) and
(3) are the unavoidable native copies — flip all three together.

---

## Local verification (NO Apple account needed)

- `npm test` (jest) — green; covers the snapshot builder + deep-link routing.
- `npx expo config --type public` — resolves the plugin and emits the widget app
  extension entry (confirms the target is wired).
- `npx expo prebuild -p ios` — generates the Widget Extension target locally
  (codegen / simulator level; signing not required to generate). Open the
  generated `ios/*.xcworkspace` in Xcode → the `widget` scheme → SwiftUI previews
  render against the sample snapshot. *(Don't commit the generated `ios/` dir —
  it's CNG output.)*

---

## ✅ FINISH WHEN THE APPLE ACCOUNT IS READY

Account-gated steps only — everything above is already built. Do these in order:

1. **Register identifiers under the team** (Apple Developer portal):
   - App bundle id for the main app (set `ios.bundleIdentifier` in `app.json` —
     currently unset, so the widget id derives from a default placeholder).
   - The widget extension id is derived as `<app-bundle-id>.widget` — no manual
     registration needed beyond enabling capabilities below.
   - An **App Group** id, e.g. `group.com.pawpi.app.shared`.

2. **Paste the real App Group id into the 3 spots** (search `PLACEHOLDER`):
   - `src/native/appGroup.ts` → `APP_GROUP_ID`
   - `targets/widget/expo-target.config.js` → entitlements group
   - `targets/widget/widget.swift` → `PawPiWidgetConfig.appGroupId`
   Setting (1) automatically arms `isAppGroupConfigured()` / the bridge.

3. **Enable capabilities** (App Groups on BOTH targets):
   - The widget target already gets the App Group via `expo-target.config.js`.
   - Add the **same App Group to the MAIN app target** so the RN side can write:
     in `app.json`, set
     `ios.entitlements["com.apple.security.application-groups"] = ["group.com.pawpi.app.shared"]`.
   - Set `ios.appleTeamId` (or `EXPO_APPLE_TEAM_ID`) so prebuild stamps the
     signing team.

4. **EAS credentials**: configure signing for the app + the widget extension
   (`eas credentials` / EAS will prompt). Provisioning profiles must include the
   App Groups capability.

5. **Build on device**: `eas build --profile development -p ios` (or a local dev
   build). Expo Go CANNOT run widgets — a dev/EAS build is required.

6. **Device acceptance pass** (attach screenshots to the PR):
   - Add the widget (small + medium + a Lock-screen accessory) → shows the real
     pet, today's reminders, streak.
   - Complete a reminder in-app → the widget updates (WidgetCenter reload).
   - Tap the widget → deep-links to the right screen (Today / Vet Record / live
     walk / feed).
   - Logged out / no pet → "Open PawPi to get started" empty state.

7. **Merge** once Tats approves the device pass.

### Optional follow-up (not blocking)
- Wire the snapshot `doneCount` to the exact Today-progress source (currently a
  safe `0`) for a precise "done/total" — display nicety, see the TODO in
  `WidgetSync.jsx`.

---

## Phase 2 / 3 (later, separate PRs)

- **Phase 2 — Live Activity** (ActivityKit) for an in-progress walk/transport:
  add an ActivityKit target + attributes, start/update/end from the RN app. Needs
  the Push/Live-Activities capability for later APNs updates.
- **Phase 3 — Apple Watch app** (watchOS): a glanceable Today view + a
  complication + a "mark done" round-trip, reading the same shared snapshot via
  WatchConnectivity / the shared container. Largest; its own multi-PR effort.

Both reuse the snapshot model + App Group flow established here.
