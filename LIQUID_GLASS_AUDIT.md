# Liquid Glass Redesign — Phase 0 Audit & Plan

iOS 26 Liquid Glass adoption for App Store submission. Reference target: Instagram on iOS 26 —
floating translucent tab bar, content scrolling behind it, shrink-on-scroll-down / grow-on-scroll-up,
and no dead strip above the home indicator.

**Status: Phase 0 complete. STOPPING for approval before Phase 1** — the migration changes
`popToTopOnBlur` behavior (see §4). Everything else (route names, deep links) is preserved.

---

## 1. Apple's rules that apply to us

From the HIG (Materials / Tab bars / Toolbars / Layout) and "Adopting Liquid Glass":

- **Liquid Glass is a material for the navigation/control layer only** — tab bars, toolbars,
  nav bars, floating controls, sheets. Never apply it to content, and never stack glass on glass.
- On iOS 26 the **system renders the tab bar's Liquid Glass automatically** when the app is built
  against the iOS 26 SDK (we are: Expo SDK 54 → Xcode 26). We must *not* paint a custom
  background/blur over it, or we defeat the material and the scroll-edge effect.
- **Scroll-edge effect**: content must scroll *behind* the bar; the system fades/condenses the
  material at the edge. This requires the OS to own the bar (native `UITabBar`), not a JS overlay.
- **Tab-bar minimize behavior** (`minimizeBehavior`) is the Instagram shrink-on-scroll — iOS 26 only.
- **Concentric radii**: a glass child's corner radius = parent radius − padding.
- **Use glass sparingly** so it stays special; keep the warm PawPi hues (glass changes material, not hue).
- **Accessibility**: honor Reduce Transparency (fall back to a solid surface) and Increase Contrast.
- **Safe areas / layout**: background should extend edge-to-edge under the home indicator; the OS
  insets interactive content. Don't hard-code bottom padding to clear the bar — use content insets.

Why the current approach can't pass as Liquid Glass: `GlassSurface` is an `expo-blur` `BlurView` +
a static warm tint. It's a frosted overlay — no refraction, no system scroll-edge condense, no
minimize-on-scroll. Those come only from the native tab bar, which Expo exposes via
`expo-router/unstable-native-tabs`.

---

## 2. Current implementation (what we have today)

**Tab bar** — `src/app/(tabs)/_layout.jsx`
- JS React Navigation `<Tabs>` from `expo-router`.
- Floating pill: `tabBarStyle` with `marginHorizontal: 16`, `marginBottom: max(insets.bottom, 12)`,
  `height: 62`, `borderRadius: RADIUS.bar`, transparent bg, `ELEVATION.lg` shadow.
- `tabBarBackground` = `<GlassSurface intensity={BLUR.thick}>` absolute-filled, warm tint + hairline.
- 5 tabs, in order, with these **route names** (must be preserved — deep links + tests depend on them):
  | slot | route `name` | label (i18n) | current icon (lucide) |
  |------|--------------|--------------|-----------------------|
  | 1 | `index` | `tabs.feed` | `Home` |
  | 2 | `health` | `tabs.health` | `HeartPulse` |
  | 3 | `training` | `tabs.care` | `PawPrint` |
  | 4 | `services` | `tabs.storesVets` | `Stethoscope` (`popToTopOnBlur`) |
  | 5 | `more` | `tabs.profile` | `ProfileTabIcon` = pet avatar (`popToTopOnBlur`) |
- Active tint `COLORS.coral`, inactive `#B5947F`.
- **Side effects living in `TabLayout`** (must be carried over verbatim): `syncLocaleToServer()` on
  mount; reminders-from-routines bootstrap + `startReminderNotificationSync()` cleanup.

**Theme tokens** — `src/constants/{colors,spacing,elevation}.js` via `theme.js` barrel.
`COLORS`, `RADIUS` (incl. `RADIUS.bar`), `MATERIALS` (glassTint*, glassBorder, solidFallback),
`BLUR` (thin/regular/thick + `tint:"light"`), `ELEVATION` (sm/md/lg, warm terracotta shadow).

**Tab screens** — each wraps in `<View style={{ flex:1, backgroundColor: COLORS.cream }}>`, then a
`ScrollView`/`RefreshableScrollView` with **hard-coded bottom padding** to clear the floating pill:
- `index.jsx` (Feed): `RefreshableScrollView … contentContainerStyle={{ paddingBottom: 60 }}`,
  plus an absolutely-pinned locked-feed card sibling and a FAB/composer.
- `health.jsx`: glass header (`GlassSurface`, `paddingTop: insets.top`) + body `ScrollView`
  `paddingBottom: 80` (some sections self-scroll).
- `training.jsx` (Care): several `ScrollView`s `paddingBottom: 40/100`.
- `services.jsx`: grid, `paddingBottom: SPACING.md`.
- `more/*`: its own `Stack` (anchored on `index` via `unstable_settings.initialRouteName`).

**Accessibility** — `src/hooks/useAccessibilityPrefs.js` exposes `useReduceTransparency()` and
`useReducedMotion()` (iOS-guarded, default false). `GlassSurface` already swaps to
`MATERIALS.solidFallback` under Reduce Transparency. `app.json` → `userInterfaceStyle: "automatic"`,
`newArchEnabled: true`.

**Other GlassSurface/blur usage (Phase 3 targets, chrome only):** headers/bars in
`FeedHeader.jsx`, ~18 `service/*` screens, `business/_layout.jsx` (a *separate* business Tabs shell),
`notifications/messages/chat/events/forum-*`. One direct `BlurView` in `Feed/PostCard.jsx` (the
locked-feed tease — leave as-is, it's content-tease not chrome). No `expo-glass-effect` usage yet.

---

## 3. Native Tabs API (verified against installed `expo-router@6.0.23`)

Import surface: `import { NativeTabs, Icon, Label } from "expo-router/unstable-native-tabs";`
(`Icon`/`Label`/`Badge`/`VectorIcon` are re-exported from the same entry.)

- `<NativeTabs minimizeBehavior="onScrollDown" …>` → props include `minimizeBehavior`
  (`automatic|never|onScrollDown|onScrollUp`, iOS 26), `tintColor`, `iconColor`, `labelStyle`,
  `backgroundColor`/`blurEffect` (**iOS ≤18 fallback only — must be omitted on the iOS 26 path**).
- `<NativeTabs.Trigger name="index">` with children `<Icon sf="house" />` (or
  `sf={{ default:"house", selected:"house.fill" }}`) and `<Label>{t("tabs.feed")}</Label>`.
- Per-trigger: `disablePopToTop` (default **false** → re-tapping an active tab pops its stack to
  root), `disableScrollToTop`, `role`, `hidden`. **There is no `popToTopOnBlur`.** (see §4)
- Icons are **SF Symbols (`sf`) or an image `src`** — not arbitrary React components. No JS
  `useBottomTabBarHeight` is exported from native-tabs; the native `UITabBarController` handles
  content insets, so scroll-behind + scroll-edge is automatic when scroll views use
  `contentInsetAdjustmentBehavior="automatic"`.

---

## 4. Migration wrinkles & how each is handled

### 4a. ⚠️ `popToTopOnBlur` behavior CHANGES (this is why I'm stopping)
- **Today:** `services` and `more` reset their stacks to root **when you leave the tab** (on blur),
  so you always re-enter at the grid/landing root. For `more`, this pairs with the
  `initialRouteName:"index"` anchor to avoid a deep-push trapping the tab on a sub-screen.
- **Native tabs:** offer only `disablePopToTop` (pop-to-root **on re-tap of the active tab**,
  enabled by default) — the standard iOS behavior — plus `disableScrollToTop`. There is **no
  pop-on-blur**. So under native tabs, leaving `services`/`more` and returning would keep the pushed
  sub-screen instead of resetting.
- **DECISION (Augusto, approved):** Option 1 — **accept the native default** (re-tap-to-root). No
  custom pop-on-blur; the `more/_layout` `initialRouteName:"index"` anchor stays. `disablePopToTop`
  is left at its default (`false`).
- **Options:**
  1. **Accept the native default** (chosen): re-tap-to-root is the iOS-native behavior every
     Instagram/App-Store app uses. The `more/_layout` `initialRouteName:"index"` anchor stays and
     keeps deep pushes off the stack base. Slight UX change: `services`/`more` no longer auto-reset
     purely by switching tabs. Cleanest, most "native", least code.
  2. **Replicate pop-on-blur** with a small `useFocusEffect` cleanup on the `services` and `more`
     stack roots that pops to top when the screen loses focus — preserves today's exact behavior at
     the cost of a bit of custom navigation code fighting the native controller.
- Route names, params, and deep links are **unchanged** either way.

### 4b. Tests break under the platform split
- `jest-expo` runs with `Platform.OS === "ios"`, and `(tabs)/_layout.test.jsx` mocks
  `expo-router`'s `<Tabs>`/`<Tabs.Screen>` and asserts the 5 route names/titles. If the iOS branch
  renders `NativeTabs`, that mock captures nothing and the suite fails.
- **Fix:** extract the five tabs into a shared, platform-agnostic config array
  (`tabsConfig.js`: `{ name, titleKey, sf, sfSelected }`) that both the iOS `NativeTabs` and the
  Android `<Tabs>` render from. Point `_layout.test.jsx` at that config (assert names/titles/order
  there) and add a thin render test per branch by toggling `Platform.OS`. `health.section-deeplink`
  and the other screen tests don't touch the layout tree and should stay green.

### 4c. Profile tab avatar icon — KNOWN iOS PLATFORM LIMITATION (not a bug)
- Native `Icon` can't host the `PetAvatar` React component (SF Symbols or an image source only).
- **Investigated + tested on iOS 26.5 (2026-08-24):** the active pet's PHOTO **cannot** be shown as
  the iOS native tab icon in Expo SDK 54. Expo Router's `convertOptionsIconToPropsIcon`
  (`native-tabs/NativeBottomTabs/NativeTabsView.js`) maps an `<Icon src={{uri}}>` to
  react-native-screens' **`templateSource`** on iOS in *both* the 4.16 and 4.18 code paths — never
  `imageSource`. `templateSource` = a *tinted template* (iOS fills the alpha shape with the tab
  tint), so an opaque photo would render as a solid coral square, not the photo. Empirically it was
  worse: passing the remote `avatar_url` **broke the whole tab bar** (a solid black bar with no
  icons); reverting to the SF Symbol instantly fixed it. The only path to the real photo would be
  patch-package'ing expo-router + a local-download/circular-mask pipeline — fragile on a core nav
  lib, out of scope for an App Store branch.
- **Decision (Augusto, approved):** ship the **`pawprint.circle` / `pawprint.circle.fill`** SF Symbol
  with the coral selected tint on iOS. Android keeps the live `PetAvatar` pet photo via the JS bar.
- **Identity preserved on-screen:** the Profile tab landing (`(tabs)/more/index.jsx` →
  `pet-profile.jsx` embedded) already **leads with a prominent 128px pet-photo hero** (the active
  pet's `PetAvatar` inside the live Care Ring), then the name, `@handle`, breed/age, and a grid of the
  pet's photos — verified on the iOS 26.5 sim. So the photo identity lost from the tiny tab icon is
  clearly present, and much larger, on the screen itself. No code change needed.

### 4d. Icon mapping (SF Symbols)
| slot | route | default → selected SF Symbol |
|------|-------|------------------------------|
| Feed | `index` | `house` → `house.fill` |
| Health | `health` | `heart.text.square` → `heart.text.square.fill` |
| Care | `training` | `pawprint` → `pawprint.fill` |
| Stores & Vets | `services` | `stethoscope` (no distinct filled variant) |
| Profile | `more` | `pawprint.circle` → `pawprint.circle.fill` |

### 4e. Android must keep the JS bar
- Render `NativeTabs` on iOS and the **existing** `<Tabs>` + `GlassSurface` pill on Android — never
  both in one tree. A `Platform.OS === "ios"` split at the top of `_layout.jsx`, both branches
  mapping the shared `tabsConfig`. The `TabLayout` side effects wrap both branches.

### 4f. Edge-to-edge content / kill the dead strip
- The strip exists because content is padded *above* an in-flow pill and the background doesn't paint
  under the home indicator. With native tabs the bar is translucent and content scrolls behind it.
- Per screen: keep `backgroundColor: COLORS.cream` on a `flex:1` root that reaches the physical
  bottom (no bottom `SafeAreaView`/inset padding); keep top safe-area for headers; set scroll views
  to `contentInsetAdjustmentBehavior="automatic"` and **remove the magic `paddingBottom: 60/80/100`**
  (replace with a small content-spacing value, not a bar-clearance hack). Verify Feed, Health, Care,
  Services, More.

### 4g. iOS 18 / iOS 26 fallback
- Native tabs render a standard opaque `UITabBar` on iOS 18 (no Liquid Glass, no minimize) — a clean
  graceful fallback. `minimizeBehavior` is simply ignored pre-26. Test on an iOS 26 simulator for the
  glass, and confirm iOS 18 still looks correct.

---

## 5. Step-by-step plan (Phases 1–4)

**Phase 1 — Native Liquid Glass tab bar (iOS)**
1. Add `src/app/(tabs)/tabsConfig.js` — the shared 5-tab array (name, titleKey, sf, sfSelected).
2. Rewrite `_layout.jsx`: keep `TabLayout` side effects; split `Platform.OS === "ios"` →
   `NativeTabs` (from config, `minimizeBehavior="onScrollDown"`, coral tint via `DynamicColorIOS`,
   **no** custom bg/blur) vs Android → existing `<Tabs>` + `GlassSurface` pill (unchanged).
3. Delete the dead `tabBarBackground`/pill styling from the iOS path only.
4. Apply the §4a `popToTopOnBlur` decision.
5. Update `_layout.test.jsx` per §4b; run `npm test`.

**Phase 2 — Edge-to-edge + kill dead space** — per §4f across the five tab screens.

**Phase 3 — Broader Liquid Glass (chrome only, `expo-glass-effect`)** — convert floating headers /
top bars / FABs that sit over scrolling content to `GlassView` (guarded by `isLiquidGlassAvailable()`,
falling back to today's `GlassSurface`); glass handle/background on `@gorhom/bottom-sheet` sheets;
concentric radii; keep it sparing; keep warm hues.

**Phase 4 — A11y + QA** — Reduce Transparency (solid fallback), Increase Contrast, Dark Mode,
Dynamic Type; iOS 26 sim (glass + minimize) and iOS 18 (fallback); `npm test` green; before/after
screenshots of Feed + Health (idle + mid-scroll).

---

## 5b. Implementation status (Phases 0–3 done)
- **Phase 1 ✅** — `_layout.jsx` split (iOS `NativeTabs` / Android `<Tabs>`), shared `tabsConfig.js`,
  `minimizeBehavior="onScrollDown"`, no custom bg/blur on iOS, side effects preserved,
  `_layout.test.jsx` rewritten for both branches.
- **Phase 2 ✅** — `contentInsetAdjustmentBehavior="automatic"` + removed magic `paddingBottom` on
  Feed / Health / Care / Services (ServicesDiscovery) / Profile (pet-profile).
- **Phase 3 ✅** — `GlassSurface` upgraded to real `GlassView` on iOS 26 (guarded), blur fallback
  elsewhere, solid under Reduce Transparency; services map-mode bottom sheet given glass bg + grabber.
  Small header buttons intentionally left non-glass (they sit ON the glass header → avoid glass-on-glass).
- **Phase 4 (QA) — in progress:**
  - `npm test` (mobile): **260 suites / 2021 tests green.**
  - Reduce Transparency → solid `MATERIALS.solidFallback` preserved (GlassSurface solid branch first).
  - Dark Mode: iOS native path uses `PlatformColor("secondaryLabel")` + `GlassView colorScheme:"auto"`
    (adapts automatically); `userInterfaceStyle:"automatic"` unchanged.
  - **Verified on iOS 26.5 simulator ✅** — a local Xcode 26 Debug build (`BUILD SUCCEEDED`) on an
    iPhone 16 Pro Max (iOS 26.5) rendered the genuine native Liquid Glass tab bar: floating
    translucent capsule, SF Symbols (`house` / `heart.text.square` / `pawprint` / `stethoscope` /
    `pawprint.circle`), coral active tint, and content scrolling *behind* the bar (green from the
    next feed post visibly bleeds through it) — the scroll-edge effect. Tab switching + deep content
    all work. (An existing demo session was already signed in, so Feed/Health were reachable.)
  - Real Liquid Glass renders only in an iOS-26-SDK build (EAS build 14 / local Xcode 26), not Expo
    Go; iOS 18 falls back to a standard opaque bar.

## 6. Guardrails
Surgical, reversible changes. Preserve every route name, param, deep link, and persistence. No fake
data. No duplicated/competing bars. iOS gets NativeTabs; Android keeps the working JS bar.
