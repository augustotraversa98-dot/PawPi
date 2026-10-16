# PawPi — screen & button inventory (for live QA)

Derived from the **real code** in `anything/apps/mobile` at commit `e6880a88` (`main`, 2026-10-16),
by reading the screens, their nested components, handlers, `router.push` targets, `Alert.alert`
dialogs, API calls and the EN/ES i18n files. Nothing here was run on a device: treat every
"expected result" as *what the code says should happen*, and every discrepancy you see on screen as a
finding to report (see `bug-report-template.md`).

> **Drift warning.** The App Store binary is 1.0.2 (26) and the app has `expo-updates` enabled
> (`app.json` → `updates.enabled`, `runtimeVersion 1.0.0`), so the JavaScript on the phone can be newer
> than the binary and may differ from this commit. If the screen disagrees with a row, trust the
> screen, note the build, and report the drift.

## How to read this file

- **Source paths** are relative to `anything/apps/mobile/` (e.g. `src/app/(tabs)/index.jsx:120`).
  Every row has one. `path:line` is the line of the control/handler.
- **Screen ID** = the markdown heading slug of the `###` heading (use it in run files and screenshot names).
- Each screen has: *File / Reached from*, *Gating*, an element table, *Empty / loading / error states*,
  *Modals opened*, *Back behaviour*.
- **Risk column** (the full policy is in `live-qa-rules.md`):

| Mark | Meaning | Default for the tester |
|---|---|---|
| 💸 | Spends or commits real money (payment redirect, deposit, purchase, donation, subscription) | **DO NOT TAP** |
| 📤 | Sends a message/notification/request to another real person or business | **DO NOT TAP** (unless the recipient is a second QA account you own) |
| 🌍 | Posts or shows content publicly / to other real users | **DO NOT TAP** with real content; only with `QA-` content if live-qa-rules allows |
| 🗑️ | Deletes data or the account | **DO NOT TAP** the account/permanent ones; QA-data deletes only as allowed |
| 🔑 | Apple / Google / social login | **DO NOT TAP** (human signs in) |
| ⚠️ | Other irreversible or outbound action (data leaves the app, grants access, uploads to AI/server) | Ask / read the rule first |

- Each part ends with **"Risky actions found in Part X"**; `live-qa-rules.md` §2 consolidates them.

## The real bottom tab bar

Source of truth: `src/app/(tabs)/tabsConfig.js`, rendered by `src/app/(tabs)/_layout.jsx` (iOS native
"Liquid Glass" tabs). **It is not exactly the five names in the QA brief** — "Community" is not a tab:

| # | EN label | ES label | Route | What it is |
|---|---|---|---|---|
| 1 | Feed | Inicio | `(tabs)/index.jsx` | Social feed → **Part A** |
| 2 | Health | Salud | `(tabs)/health.jsx` | Today / Track / Vet Record → **Part C** |
| 3 | Care | Cuidado | `(tabs)/training.jsx` | Learn + Hire panes → **Part D** (i18n key `tabs.care`; the file/route is still called `training`) |
| 4 | Stores & Vets | Tiendas y Veterinarias | `(tabs)/services.jsx` | Discover providers/places/shop → **Part E** |
| 5 | Profile | Perfil | `(tabs)/more/index.jsx` | The active dog's social profile, with the ☰ owner menu → **Part B** |

Community (forum), My Hub, Data Access, Reminders & Routines, Settings, Memories etc. are reached from
the Profile tab's ☰ menu (and some from other screens) — see Part B and Part D.

## Parts

| Part | Area (matches the QA brief's grouping) |
|---|---|
| G | Auth, onboarding, app entry, system screens, **list of every OS permission prompt** |
| A | Feed, Dog-social post flows, notifications, search, events, global overlays |
| B | Dog Social Profile, Profile/More tab, Settings, account, household, emergency card, lost & found |
| C | Health Today / Track / Insights / Vet Record, Reminders & Routines |
| D | Care tab (training), Community/forum, buddy walks, followers |
| E | Stores & Vets and every consumer pet-service flow (vet, grooming, walking, daycare, sitting, training, shop, adoption, telehealth, transport, insurance, rx) |
| F | Messaging (DMs + business chat) and Business / provider mode |

## Reachability notes (read before hunting for a screen)

From the code-readers' findings — a tester will not find these by tapping, so do **not** report them as
"missing"; do report it if one *is* reachable on screen:

- **No in-app link (deep-link only):** `/nearby-walks`, `/create-walk` (Buddy Walks is documented in Part D), `/household`, `/service/vet`, `/service/grooming`, `/service/sitting`, `/service/pet-friendly`, `/service/my-claims`.
- **Hidden by flags:** Health **Insights** section and the **Nutrition** button (`SHOW_NUTRITION = false`), plus several unmounted Health components (listed in Part C).
- **Conditional entry points:** Weekly digest only from a `weekly_digest` bell notification; Welcome-back only from a notification row flagged `relatedWelcomeBack`; Memories only from the Profile ☰ menu; Events from Community; Emergency Card from Health → Vet Record; Insurance apply from Stores & Vets → Insurance; "Getting started" card lives on the **Feed**.
- **Gated by data/role:** Day card (needs 2+ caregivers posting the same day), milestone cards (a followed pet with a birthday today), video posts (lucky-user only), Business mode and walker workspace (needs a provider account — a plain pet-owner QA account will not see them), Locked-feed overlay (account state).
- **Cannot be fully tested on the Mac "iPhone app" route:** soft-keyboard behaviour, haptics, push delivery, rotation — see `README.md`.

## Cross-area watch-list (code-read suspicions to confirm or refute on screen)

Not confirmed on a device — each is where a reader of the code *expected* trouble. Confirm, then file as a normal bug (or mark "works").

1. **Raw/technical text can reach users** in `Alert`s: onboarding "Create profile" failure (`alert(error.message)`), booking/daycare errors, feed "Could not save: …", Photo Check "Save Note Only" (raw "petId, bodyArea, and imageUrl are required").
2. **Hard-coded English (does not follow ES):** Notifications, Wrapped, Follows, My Hub, post detail ("N paws / N barks"), most of Care → Learn, Walk live, Reminders screen, many Today/Photo Check/Vet Summary strings, chat strings, hosted sign-in/sign-up web pages, the not-found page, and the startup "🔔 Enable Reminders" alert.
3. **A debug box** ("🔧 Debug") in the walk modal visible to users (Part C).
4. **Buttons that appear to do nothing else but tick/alert:** Health Today "Start walk", "Start check", "Log weight", "View appointment"; walk modal "Start walk".
5. **Possible duplicate log:** Feeding "Log as usual" → second "How did it go?" dialog.
6. **Reminders → Settings switches** are local state only (no effect). Vet Record **Medications** tab always empty-card.
7. **Forum thread:** Report/Block show on your *own* thread/comment (`isOwn` not passed); no reply-to-comment, no delete UI; compose category chips are raw English.
8. **Chat:** only "Block" (no Report); no unblock UI anywhere; `/provider-chat` has no Report/Block; no error UI on failed send/upload.
9. **Settings → Account Privacy** is a static "Public" row; **"Reset App Data" in the ☰ menu is just logout** (no confirm, no server call); account deletion is Settings → Delete account (two alerts, then `DELETE /api/account`).
10. **My Activity → walk row** pushes `/walk-live` with no session id (expect "Walk not found").
11. **My Activity → "Sitting visits"** opens the sitter's workspace; owners see "No sitter workspace".
12. **Adoption → Favorites** empty-state says "Tap the heart" but no screen can add a favourite.
13. **Edit Medical Profile** may drop the keyboard after each keystroke (inputs defined in render) — Mac cannot show the soft keyboard but typing focus loss is visible.
14. **Onboarding handle check** rejects 8 hard-coded "mock taken" handles (buddy, max, charlie, cooper, lucy, daisy, duke, molly).
15. **No in-app update prompt**; OTA updates apply silently on the next cold start.
16. **Terms consent**: Apple/Google sign-in show no Terms/Privacy checkbox; only the hosted web signup page records consent.
17. **Known More/Profile-tab stale-flow bug** (history: `ARCHITECTURE.md` §5; fix: `src/app/(tabs)/more/index.jsx` + `more/_layout.jsx` pop-to-top on blur): re-test it — see `live-qa-rules.md` §3.8.


## Contents
- **Part G** — Auth, onboarding, app entry, system screens & permission prompts
- **Part A** — Feed tab + global overlays (notifications, search, memories, events…)
- **Part B** — Dog social profile, Profile/More tab, Settings, account
- **Part C** — Health tab (Today / Track / Vet Record) + Reminders & Routines
- **Part D** — Care tab, Community/forum, buddy walks, follows
- **Part E** — Stores & Vets tab and consumer-side pet services (bookings, shop, adoption…)
- **Part F** — Messaging + Business / provider mode


---

<!-- ===== PART G ===== -->

## Part G — Auth, onboarding, app entry and system screens

All paths below are relative to `anything/apps/mobile/` unless they start with `../web/` (hosted web pages shown inside the auth WebView). EN labels come from `src/i18n/locales/en.json`; ES (Argentine voseo) in brackets when short. Production build env: `EXPO_PUBLIC_BASE_URL=https://www.pawpi.info` (eas.json production profile).

Legend for Risk: 💸 spends money, 📤 messages/notifies a real user, 🌍 posts publicly / visible to other real users, 🗑️ deletes data/account, 🔑 Apple/Google/social login, ⚠️ other irreversible/outbound action.

---

## 0. EntryPoint decision table (src/app/index.jsx) — who lands where

`src/app/_layout.jsx` declares `initialRouteName="index"` (line 117), so EVERY cold launch and every post-login hand-off runs `EntryPoint`. There is **no "first launch only" flag**. `has_completed_onboarding` (AsyncStorage) is only WRITTEN (`src/app/index.jsx:135`, `src/app/onboarding.jsx:521`) and never read for routing: the decision is 100 % server-driven.

Auth bootstrap before the table: `useAuth().initiate()` (`src/utils/auth/useAuth.js`) reads the SecureStore JWT with a 3 s race; a hard 4 s fallback (`src/utils/auth/startupFallback.js:22`) forces `isReady=true, auth=null` if that wedges (→ Welcome, plus a tiny grey "Startup diagnostic: <code>" line on Welcome, `src/app/welcome.jsx:186-197`). RootLayout renders `null` (native splash stays) until `isReady` (`src/app/_layout.jsx:109`).

| # | Condition (evaluated in order) | Call made | Result / destination | Code |
|---|---|---|---|---|
| 1 | auth store not ready | none | "Loading…" screen (PawMark + spinner + hard-coded English `Loading...`) | `src/app/index.jsx:215-238` |
| 2 | ready, `auth == null` (logged out, fresh install, logged out, session cleared) | none | `/welcome` | `src/app/index.jsx:56-63` |
| 3 | auth present but JWT malformed (`isUsableToken` false) | none | `setAuth(null)` then `/welcome` | `src/app/index.jsx:66-73`, `src/utils/auth/recovery.js:9-11` |
| 4 | auth OK → `GET /api/pets` (12 s abort, `retry:false`, shared RQ key `["pets"]`) returns 200 with >= 1 pet | — | `/(tabs)` (owner home/feed); also writes `has_completed_onboarding=true` | `src/app/index.jsx:97-101,134-136`, `src/utils/auth/determinePetsRoute.js:65-67` |
| 5 | `/api/pets` 200 with 0 pets (or body without `pets`) → then `GET /api/providers` (best-effort; any failure = `[]`) returns >= 1 provider the account is active staff of | — | `/business` (Business home) — never forced into pet onboarding | `src/app/index.jsx:103-112`, `determinePetsRoute.js:71-73` |
| 6 | `/api/pets` 200 with 0 pets AND no provider | — | `/onboarding-photo` (start of onboarding, NOT `/onboarding`) | `determinePetsRoute.js:75` |
| 7 | `/api/pets` 401 or 403 | — | `setAuth(null)` (clears Keychain + RQ cache + push token) then `/welcome` | `index.jsx:129-133`, `determinePetsRoute.js:50-52` |
| 8 | `/api/pets` network error / timeout (12 s) / any other non-OK (404, 5xx) / non-JSON | — | **Retry screen** (never onboarding, to avoid duplicate pets): "We couldn't reach PawPi. Check your connection and try again." + Try again + Start over + back arrow | `index.jsx:114-124,137-143,155-212` |

Other facts:
- EntryPoint routes **once per JWT** (`routedForSession`, `index.jsx:39-45`); it re-runs only on logout, account switch, fresh sign-in, or "Try again" (`force:true`).
- **`/welcome-back` is NOT routed from EntryPoint.** It is only opened by tapping an in-app notification row flagged `relatedWelcomeBack` (`src/app/notifications.jsx:566-567`).
- After the redirect is rendered it calls `markNavigationReady()` (`index.jsx:248`) which releases a parked notification-tap deep link (cold start from a push).
- Language/tutorial/permission gating: none in EntryPoint.

### Launch / "Loading…" / "Couldn't reach PawPi" — `EntryPoint` in `src/app/index.jsx`
- **File:** `src/app/index.jsx` · **Reached from:** every app launch (initial route, `src/app/_layout.jsx:117`); `router.replace("/")` from `src/app/auth/expo-web-success.jsx:35`.
- **Gating / data needed:** none for the loading state; the retry screen only shows after a failed pets read for a logged-in user.

| # | Element | Type | Source | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | Paw mark + spinner + "Loading..." (English only, not in en.json) | loading state | `src/app/index.jsx:215-238` | Shown while auth/pets resolve; auto-redirects per table above | |
| 2 | Back arrow (a11y "Back" [Atrás]) top-left of retry screen | icon button | `src/app/index.jsx:167-175` | `startOver()` → `setAuth(null)` (logs out) + `router.replace("/welcome")` | ⚠️ (logs out) |
| 3 | "We couldn't reach PawPi. Check your connection and try again." [No pudimos conectarnos con PawPi…] | text | `src/app/index.jsx:186` | Informational; no raw error text shown | |
| 4 | "Try again" [Probar de nuevo] | button | `src/app/index.jsx:188-200` | Re-runs `determineRoute({force:true})` (new GET /api/pets) | |
| 5 | "Start over" [Empezar de nuevo] | button | `src/app/index.jsx:201-209` | Logs out (`startOver`) and goes to `/welcome` | ⚠️ |

- **Empty / loading / error states:** loading = spinner screen; error = retry screen above. Raw technical text never shown (error only `console.error`).
- **Modals / sheets / alerts opened:** none (but the notification pre-permission Alert from RootLayout can appear on top, see section 16).
- **Back / dismiss behaviour:** hardware/iOS back not applicable (root). Back arrow = logout (see row 2).

---

## 1. Welcome — `/welcome`

### Welcome — `src/app/welcome.jsx`
- **File:** `src/app/welcome.jsx` · **Reached from:** EntryPoint rows 2/3/7 (`src/app/index.jsx:60,70`); `startOver()` (`src/utils/auth/recovery.js:24`); 401 mid-session (`src/__create/fetch.ts:105` → `router.replace('/welcome')`); "Use a different account" / error-screen logout; `src/app/auth/expo-web-success.jsx:35` when auth did not stick.
- **Gating / data needed:** logged-out only (no guard if a logged-in user navigates here manually). Social buttons depend on `GET /api/auth/social-enabled` → `{google, apple}` (public, cached 300 s: `../web/src/app/api/auth/social-enabled/route.js`) AND device support. If that probe fails/offline, **both social buttons are simply hidden** (no "coming soon"). Fires anonymous funnel `activation/welcome_view` (`welcome.jsx:27-29`).

| # | Element (EN label / ES) | Type | Source | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | "Access for vets & businesses" [Acceso para veterinarias y negocios] (top-right underlined link) | link | `src/app/welcome.jsx:84-102` (handler `:68-70`) | `router.push("/vet-business-access")` → signed-out business gate (section 6) | |
| 2 | PawPi paw mark + "PawPi" wordmark | static | `src/app/welcome.jsx:105-119` | none | |
| 3 | Tagline "Your pet's daily care, moments, and community — all in one place." [El cuidado diario de tu mascota…] | text | `src/app/welcome.jsx:122-136` | none | |
| 4 | "Create account" [Crear cuenta] (coral, primary) | button (trackId `welcome_signup`) | `src/app/welcome.jsx:144-150` (handler `:52-54`) | `useAuthModal.open({mode:"signup"})` → full-screen auth WebView at `<BASE>/account/signup?callbackUrl=/api/auth/token` (section 3). NOTE: **no native Terms checkbox here**; the Terms/Privacy checkbox lives on the hosted signup page | |
| 5 | "Log in" [Iniciar sesión] (secondary) | button (trackId `welcome_signin`) | `src/app/welcome.jsx:153-159` (`:56-58`) | `open({mode:"signin"})` → auth WebView at `/account/signin` | |
| 6 | Divider "or" [o] | text | `src/components/auth/SocialSignInButtons.jsx:52` | rendered only if at least one social button is shown | |
| 7 | Native "Continue with Apple" (system `AppleAuthenticationButton`, black, text localized by iOS, not en.json) | native button | `src/components/auth/SocialSignInButtons.jsx:56-64` | iOS only AND server `apple:true` AND `isAvailableAsync()`. Tap → native Apple sheet → see section 2. Success → `setAuth` + `router.replace("/auth/expo-web-success")` | 🔑 |
| 8 | "Continue with Google" [Continuar con Google] (white bordered, "G" glyph; spinner while busy) | button (trackId `auth_google`) | `src/components/auth/SocialSignInButtons.jsx:67-95` | Shown when server `google:true`. Opens system browser (ASWebAuthenticationSession) → see section 2 | 🔑 |
| 9 | "Forgot password?" [¿Olvidaste tu contraseña?] (underlined, centered) | link | `src/app/welcome.jsx:169-183` (handler `:64-66`) | `open({mode:"forgot-password"})` → WebView at `/account/forgot-password` | |
| 10 | "Startup diagnostic: <code>" (grey 11 px) | text, conditional | `src/app/welcome.jsx:186-197` | Only if this launch used the hard startup fallback or the previous boot stalled; a boot-milestone code, not a stack trace | |

- **Empty / loading / error states:** social-enabled probe failing → no social buttons (silent). Social failure alerts: see section 2.
- **Modals / sheets / alerts opened:** `AuthModal` (full-screen WebView, section 3); native Apple sheet; system browser sheet; "Sign-in failed" alert.
- **Back / dismiss behaviour:** no back (root screen, `headerShown:false`). iOS edge-swipe has nothing to pop to.

---

## 2. Social sign-in flows (native Apple, system-browser Google)

### Apple sign-in (native sheet) — `signInWithApple()` in `src/utils/auth/socialAuth.js`
- **File:** `src/utils/auth/socialAuth.js` · **Reached from:** Apple button on Welcome (`SocialSignInButtons.jsx:62`).
- **Gating / data needed:** iOS device with an Apple ID signed in; server `apple` provider configured; `usesAppleSignIn:true` in `app.json` (iOS). Requests FULL_NAME + EMAIL scopes.

| # | Element | Type | Source | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | Apple system sheet ("Continue with Apple", Face ID/passcode, "Hide My Email" choice) | OS sheet | `src/utils/auth/socialAuth.js:64-70` | Returns identity token. Cancel (`ERR_REQUEST_CANCELED`) → returns `null`, nothing happens, no alert (`:73`) | 🔑 |
| 2 | (silent) CSRF → `GET <BASE>/api/auth/csrf` | API | `src/utils/auth/socialAuth.js:88-92` | sets CSRF cookie | 🔑 |
| 3 | (silent) `POST <BASE>/api/auth/callback/apple-native` with identityToken + raw nonce (+ name/email on first auth) | API | `src/utils/auth/socialAuth.js:106-111` | **Creates a real account if the Apple ID is new** (no Terms checkbox is shown in this path and the mobile app never POSTs `/api/legal/consent`; consent is only recorded by the hosted signup page `../web/src/app/account/signup/page.jsx:151`) | 🔑 ⚠️ |
| 4 | (silent) `GET <BASE>/api/auth/token` → `{jwt,user}` | API | `src/utils/auth/socialAuth.js:114-126` | stored via `setAuth`; `router.replace("/auth/expo-web-success")` (`welcome.jsx:34-38`) → EntryPoint decides pets vs onboarding | 🔑 |

### Google sign-in (system browser) — `signInWithGoogle()` in `src/utils/auth/socialAuth.js`
| # | Element | Type | Source | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | System browser sheet opening `<BASE>/api/auth/mobile-start?provider=google&return=pawpi%3A%2F%2Fauth-callback` | OS web-auth session | `src/utils/auth/socialAuth.js:134-135`, `src/utils/auth/socialAuthShared.js:9,14-17` | Google account chooser/consent in Safari sheet. Dismiss/cancel → `null`, nothing happens | 🔑 |
| 2 | Return to `pawpi://auth-callback?token=…&uid=…&email=…&name=…` | deep link (consumed by `openAuthSessionAsync`) | `src/utils/auth/socialAuthShared.js:23-49` | Token parsed → `setAuth`, then same hand-off as Apple. New Google user = new real account (no Terms checkbox) | 🔑 ⚠️ |
| 3 | `…auth-callback?error=<code>` | error return | `src/utils/auth/socialAuth.js:142-148` | Throws `GOOGLE_AUTH_REJECTED` → alert "Sign-in failed" / "We couldn't sign you in with Google. Please try again, or use email instead." | |
| 4 | Return without token and without error | error | `src/utils/auth/socialAuth.js:150` | generic alert (below) | |

- **Empty / loading / error states:** any thrown failure → `Alert.alert("Sign-in failed" [No se pudo iniciar sesión], "We couldn't sign you in. Please try again." [No pudimos iniciar tu sesión. Probá de nuevo.])` (`SocialSignInButtons.jsx:36-40`; keys `welcome.social.errorTitle/errorBody/googleDeniedBody`). Raw error only goes to `console.error` — **no technical text leaks**. Buttons ignore taps while `busy`.
- **Modals / sheets / alerts opened:** Apple sheet; ASWebAuthenticationSession (iOS shows "pawpi.info wants to use … to sign in" system prompt); the error alert.
- **Back / dismiss behaviour:** swipe-down/Cancel in the sheet = silent no-op.
- **Deep-link note:** `pawpi://auth-callback` is handled by `WebBrowser.openAuthSessionAsync`, not by an expo-router route; there is no `auth-callback` route, so opening that URL manually from outside would land on `+not-found` (section 14). No `associatedDomains`/`intentFilters` in `app.json`, so web links (e.g. the password-reset email link) open in Safari/Chrome, not in the app.

---

## 3. Auth modal (email/password WebView) — sign-in, sign-up, forgot-password

### Auth modal — `AuthModal` (`src/utils/auth/useAuthModal.jsx`) + `AuthWebView` (`src/utils/auth/AuthWebView.jsx`)
- **File:** `src/utils/auth/useAuthModal.jsx`, `src/utils/auth/AuthWebView.jsx` · **Reached from:** Welcome buttons 4/5/9 (`src/app/welcome.jsx:53,57,65`); vet-business-access gate (`src/app/vet-business-access.jsx:225,201` via `useAuth().signIn/signUp`); `useRequireAuth`. `<AuthModal />` is mounted once at the root (`src/app/_layout.jsx:162`) so it can overlay any screen.
- **Gating / data needed:** only renders if `EXPO_PUBLIC_PROXY_BASE_URL` or `EXPO_PUBLIC_BASE_URL` set (`useAuthModal.jsx:45`). Modes: `signup` | `signin` | `forgot-password` → URL `<BASE>/account/<mode>?callbackUrl=/api/auth/token` (`AuthWebView.jsx:7-8,15`). Modal is `visible = isOpen && !auth`; it auto-closes when `auth` appears (`useAuthModal.jsx:37-43`).

| # | Element | Type | Source | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | Full-screen slide-up modal containing the web page | WebView | `src/utils/auth/useAuthModal.jsx:50-63`, `src/utils/auth/AuthWebView.jsx:78-127` | Loads hosted page (tables in 3a-3d). Cookies shared (`sharedCookiesEnabled`) | |
| 2 | Back arrow (top-left, a11y label hard-coded English "Back") | icon button | `src/utils/auth/useAuthModal.jsx:65-80` | `close()` → modal dismissed, back on Welcome (any form text is lost). This is the ONLY native way out; Android hardware back also calls `close` (`:50`) | |
| 3 | In-WebView navigation interception | behaviour | `src/utils/auth/AuthWebView.jsx:90-126` | Every navigation is cancelled and re-loaded in the same WebView with `?callbackUrl=/api/auth/token` appended (`:117-124`). Likely consequence: tapping the Terms/Privacy links on the signup page (`target=_blank`) **loads the legal page inside the same WebView, replacing the form**; Back arrow then closes the modal and loses the typed form. Verify on device | |
| 4 | Success handshake | behaviour | `src/utils/auth/AuthWebView.jsx:91-113` | When WebView navigates to `<BASE>/api/auth/token`, app does `fetch` with cookies, reads `{jwt,user}`, `setAuth`. Then `router.replace("/auth/expo-web-success")` (`:20-28`) and modal closes (`useAuthModal.jsx:37-43`) | |
| 5 | Token fetch failure | silent | `src/utils/auth/AuthWebView.jsx:94-111` | Only `console.error`; the user just stays on the page with no message | |

- **Empty / loading / error states:** WebView load failure shows the platform's blank/ error page (no `onError` handler); no native error copy. All web error strings are English only even in Spanish phones (web pages are not localized).
- **Modals / sheets / alerts opened:** none native; OS password autofill/keychain suggestions may appear.
- **Back / dismiss behaviour:** Back arrow / Android back = close. No swipe-to-dismiss (transparent `Modal`, `animationType="slide"`). Anonymous telemetry: `signup_or_oauth_start` on open (`:30-34`).

### 3a. Hosted Sign-up page (inside WebView) — `/account/signup`
- **File:** `../web/src/app/account/signup/page.jsx` · **Reached from:** Welcome "Create account"; link "Log in" on sign-in page.
- **Gating:** Submit button disabled until name, email, valid password, matching confirm AND Terms checkbox are all filled (`:77-83`).

| # | Element (EN, web pages are English only) | Type | Source | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | "Full name" input (placeholder "Your name") | text input | `../web/src/app/account/signup/page.jsx:189` | required | |
| 2 | "Email" input (placeholder "your@email.com") | email input | `../web/src/app/account/signup/page.jsx:207` | required | |
| 3 | "Password" input ("At least 8 characters") + live strength meter and 3 requirement bullets (>= 8 chars; mix 3 of lower/upper/number/symbol; not a common password) | password input | `../web/src/app/account/signup/page.jsx:225-275` | meter colours/labels from `passwordStrength` | |
| 4 | "Confirm password" ("Re-enter password") | password input | `../web/src/app/account/signup/page.jsx:282` | must match | |
| 5 | Checkbox "I agree to the Terms of Service and Privacy Policy, including PawPi's zero-tolerance policy for objectionable content and abusive behavior." (unchecked by default) | checkbox | `../web/src/app/account/signup/page.jsx:306-321` | Required to enable submit. Links (new tab/in-WebView, see 3.3) go to `EXPO_PUBLIC_TERMS_URL`/`PRIVACY_POLICY_URL` consts (`../web/src/constants/legal.js`); if unset they render as plain bold text. **There is no separate EULA checkbox** (EULA is at `/eula`, referenced in env only) | |
| 6 | "Create account" / "Creating account..." | submit | `../web/src/app/account/signup/page.jsx:324-330` | `signUpWithCredentials` (redirect:false) → creates the account → `POST /api/legal/consent {source:"mobile_signup"}` (best-effort, retried once, `:27-43,151`) → `window.location.href = result.url` → app token handshake (3.4) | ⚠️ (creates a real account) |
| 7 | Inline error box (red) | text | `../web/src/app/account/signup/page.jsx:299-303` | messages: "Please enter your full name", "Please fill in all required fields", "Passwords do not match", "Please accept the Terms of Service and Privacy Policy to continue", first password rule error, "This email is already registered. Try logging in instead." (`CredentialsSignin`), "This email is already registered.", "Could not create account. Please try again.", "That password is too weak. Use at least 8 characters…", fallback "Something went wrong. Please try again." | |
| 8 | Social buttons | hidden | `../web/src/components/auth/SocialSignInButtons.jsx:18-19,40` | **Never rendered inside the mobile WebView** (native Welcome owns Apple/Google) | |
| 9 | "Already have an account? Log in" | link | `../web/src/app/account/signup/page.jsx:336-346` | goes to `/account/signin` (query preserved) in the same WebView | |

### 3b. Hosted Sign-in page — `/account/signin`
- **File:** `../web/src/app/account/signin/page.jsx` · **Reached from:** Welcome "Log in"; signup page link.

| # | Element | Type | Source | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | Title "Welcome Back" / "Sign in to continue" | text | `../web/src/app/account/signin/page.jsx:59-62` | | |
| 2 | "Email" ("your@email.com") | input | `../web/src/app/account/signin/page.jsx:72` | | |
| 3 | "Password" ("Enter your password") | input | `../web/src/app/account/signin/page.jsx:90` | | |
| 4 | "Forgot password?" | link | `../web/src/app/account/signin/page.jsx:105-110` | → `/account/forgot-password` (3c) in same WebView | |
| 5 | "Log in" / "Signing in..." | submit | `../web/src/app/account/signin/page.jsx:121-127` | `signInWithCredentials(redirect:true)` → on success redirect to `/api/auth/token` → app stores JWT → EntryPoint | |
| 6 | Error box | text | `../web/src/app/account/signin/page.jsx:114-118` | "Please fill in all fields"; "Incorrect email or password. Please try again."; "Could not sign in. Please try again."; "Sign-in failed. Please try again."; "Something went wrong. Please try again." | |
| 7 | "Don't have an account? Create account" | link | `../web/src/app/account/signin/page.jsx:133-143` | → `/account/signup` | |

### 3c. Hosted Forgot-password page — `/account/forgot-password`
- **File:** `../web/src/app/account/forgot-password/page.jsx` · **Reached from:** Welcome "Forgot password?"; sign-in page link.

| # | Element | Type | Source | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | Title "Forgot Password?" / "Enter your email to receive reset instructions" | text | `../web/src/app/account/forgot-password/page.jsx:~85-92` | | |
| 2 | "Email" input | input | `../web/src/app/account/forgot-password/page.jsx:~99-110` | required | |
| 3 | "Send reset link" / "Sending..." | submit | `../web/src/app/account/forgot-password/page.jsx:~119-125` (fetch `:30`) | `POST /api/account/forgot-password {email}` → **sends a real password-reset email** to that address. Success screen "Check your email — If an account exists for <email>, we've sent a link… The link works once and expires in 30 minutes. Don't see it? Check your spam folder." (same message whether or not account exists) | 📤 |
| 4 | "Back to login" (success screen) / "Remember your password? Log in" | link | `../web/src/app/account/forgot-password/page.jsx:~66-72,~126-133` | → `/account/signin` | |
| 5 | Errors | text | `../web/src/app/account/forgot-password/page.jsx:22-40` | "Please enter your email address"; server `data.error`; "Something went wrong. Please try again."; "Couldn't reach the server. Check your connection and try again." | |

### 3d. Reset-password page (opened from the email link in the SYSTEM BROWSER, not the app) — `/account/reset-password`
- **File:** `../web/src/app/account/reset-password/page.jsx` · **Reached from:** link in the reset email (no universal link configured, so it opens in Safari).
- Fields: new password ("At least 8 characters") + confirm ("Re-enter password") + submit → `POST /api/account/reset-password` (`:50`); errors "Please choose a stronger password.", "Passwords don't match"; invalid/expired token screen offers a link to `/account/forgot-password` (`:86`); success screen links to `/account/signin` (`:108`). Submit changes the account password (⚠️ irreversible change of credentials).

---

## 4. Auth success hand-off — `/auth/expo-web-success`

### Setting up your account — `src/app/auth/expo-web-success.jsx`
- **File:** `src/app/auth/expo-web-success.jsx` (layout `src/app/auth/_layout.jsx`) · **Reached from:** `router.replace` after a successful email/Apple/Google login (`src/utils/auth/AuthWebView.jsx:26`, `src/app/welcome.jsx:37`).
- **Gating / data needed:** none; it makes no routing decision of its own.

| # | Element | Type | Source | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | Paw mark + spinner | static | `src/app/auth/expo-web-success.jsx:64-67` | | |
| 2 | "Setting up your account…" [Preparando tu cuenta…] | text | `src/app/auth/expo-web-success.jsx:68-77` | | |
| 3 | "This will only take a moment…" [Esto tomará solo un momento…] | text | `src/app/auth/expo-web-success.jsx:78-87` | | |
| 4 | Back arrow (a11y "Back") top-left | icon button | `src/app/auth/expo-web-success.jsx:52-60` | `startOver()` → logs out + `/welcome` ("cancel without killing the app") | ⚠️ |
| 5 | (automatic) | effect | `src/app/auth/expo-web-success.jsx:32-35` | When `isReady`: `router.replace(isAuthenticated ? "/" : "/welcome")` → EntryPoint decision table (section 0) | |

- **Empty / loading / error states:** the EntryPoint (not this screen) shows the "couldn't reach" retry state.
- **Back / dismiss behaviour:** only the back arrow (= logout).

---

## 5. Use a different account (shared link + confirm alert)

### "Use a different account" — `UseDifferentAccountLink` (`src/components/onboarding/UseDifferentAccountLink.jsx`)
- **File:** `src/components/onboarding/UseDifferentAccountLink.jsx` · **Reached from:** onboarding photo screen (`src/app/onboarding-photo.jsx:322`) and onboarding wizard header (`src/app/onboarding.jsx:959`). NOT on the photo-preview screen.
- **Gating / data needed:** signed-in user with no pet (the only way to reach those screens).

| # | Element | Type | Source | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | "Use a different account" [Usar otra cuenta] (small grey link) | link | `src/components/onboarding/UseDifferentAccountLink.jsx:50-59` | Opens confirm alert | |
| 2 | Alert "Log out and start over?" [¿Cerrar sesión y empezar de nuevo?] / "You'll go back to the welcome screen and any progress here will be cleared." | alert | `src/components/onboarding/UseDifferentAccountLink.jsx:25-28` | | |
| 3 | Alert button "Cancel" [Cancelar] | alert button | `src/components/onboarding/UseDifferentAccountLink.jsx:29` | dismiss, no change | |
| 4 | Alert button "Log out" [Cerrar sesión] (destructive style) | alert button | `src/components/onboarding/UseDifferentAccountLink.jsx:30-43` | Deletes local drafts (`onboarding_progress`, `onboarding_pet_photo`, `create_first_moment`; `:11-15`), then `startOver` = `setAuth(null)` (deletes Keychain token, clears RQ cache, unregisters push token via `cleanUpAfterIdentityChange`) and `router.replace("/welcome")`. Server data is NOT deleted | ⚠️ (logs out, discards local draft) |

---

## 6. Vet & business access — signed-out gate (only the auth-relevant part)

### List your business on PawPi (signed-out) — `/vet-business-access` → `SignedOutGate`
- **File:** `src/app/vet-business-access.jsx` (985 lines; the signed-in business-onboarding form `ProviderOnboarding`, line ~240+, belongs to another area and is NOT inventoried here) · **Reached from:** Welcome "Access for vets & businesses" (`src/app/welcome.jsx:69`), also Business-mode entry points elsewhere.
- **Gating / data needed:** `!isAuthenticated`. If the visitor is logged in, the same route shows the business setup form instead (`:99-103`).

| # | Element | Type | Source | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | Close "X" (top-right) | icon button | `src/app/vet-business-access.jsx:77-96` | `router.back()` → Welcome | |
| 2 | "List your business on PawPi" [Publicá tu negocio en PawPi] + subtitle | text | `src/app/vet-business-access.jsx:148-151` | | |
| 3 | Terms checkbox "I agree to the Terms of Service and Privacy Policy, including PawPi's zero-tolerance policy…" (unchecked) | checkbox (a11y role `checkbox`) | `src/app/vet-business-access.jsx:154-198` | toggles; "Terms of Service" / "Privacy Policy" inline links `Linking.openURL(EXPO_PUBLIC_TERMS_URL / PRIVACY_POLICY_URL)` (`:180-193`) open Safari (no-op if env unset) | |
| 4 | "Create account" [Crear cuenta] (50 % opacity until checked) | button | `src/app/vet-business-access.jsx:200-222` | Unchecked → Alert "One more step" / "Please agree to the Terms of Service and Privacy Policy to create an account." (`:137-140`). Checked → `signUp()` → auth modal in signup mode (section 3) | |
| 5 | "Log in" [Iniciar sesión] | button | `src/app/vet-business-access.jsx:225` | `signIn()` → auth modal sign-in; NOT gated on the checkbox | |

- Note: this native Terms gate says it "mirrors welcome.jsx", but Welcome no longer has a native checkbox (consent moved to the hosted signup page), so the two entry points differ.
- **Back / dismiss behaviour:** X button, iOS swipe-back.

---

## 7. Onboarding — photo step

### Let's meet your dog — `/onboarding-photo`
- **File:** `src/app/onboarding-photo.jsx` · **Reached from:** EntryPoint row 6 (`determinePetsRoute.js:75`, destination `/onboarding-photo`); back from wizard step 1 when stack has it (`src/app/onboarding.jsx:381-385`).
- **Gating / data needed:** logged-in, no pets. On mount `useLeaveOnboardingIfHasPets` calls `GET /api/pets` and, if the account already has a pet, `router.replace("/(tabs)")` (`src/utils/onboardingGuard.js:47-62`; fails OPEN on network error). Funnel `activation/onboarding_photo`. Mount only READS permissions (`:36-37`), no OS prompt yet.

| # | Element (EN / ES) | Type | Source | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | 📸 + "Let's meet your dog" [Conozcamos a tu perro] + "Start with a photo. You can use it as your dog's first pet moment." | text | `src/app/onboarding-photo.jsx:221-253` | | |
| 2 | "Open camera" [Abrir cámara] | primary button | `src/app/onboarding-photo.jsx:259-269` (handler `:74-136`) | First tap: **OS camera permission prompt** (NSCameraUsageDescription, `:93-94`). Granted → `ImagePicker.launchCameraAsync` (square crop editor, quality .8) → on photo `router.push("/onboarding-photo-preview",{photoUri})`. Denied → alert (below). Camera throws → alert "Camera Error / Could not open camera. Please try again." | |
| 3 | "Choose from gallery" [Elegir de la galería] | secondary button | `src/app/onboarding-photo.jsx:272-282` (handler `:138-200`) | First tap: **OS Photos permission prompt** (NSPhotoLibraryUsageDescription, `:157-158`; "limited" is accepted). Opens picker → preview screen. Error → "Gallery Error / Could not open gallery. Please try again." | |
| 4 | "Skip for now" [Omitir por ahora] (underlined) | link | `src/app/onboarding-photo.jsx:285-303` (handler `:202-205`) | `router.push("/onboarding")` wizard with no photo | |
| 5 | "Don't worry, you can change this later." | text | `src/app/onboarding-photo.jsx:308-320` | | |
| 6 | "Use a different account" | link | `src/app/onboarding-photo.jsx:322` | section 5 | ⚠️ |

- **Empty / loading / error states:** permission denied → Alert "Camera Access Required" / "Photo Library Access Required" [Se necesita acceso a la cámara / a las fotos] body "Photo access is turned off. You can enable it in Settings or skip for now." with buttons "Skip for now" (cancel) and "Open Settings" [Abrir Ajustes] → `Linking.openSettings()` (`:52-72`). Raw errors only to console.
- **Modals / sheets / alerts opened:** OS permission dialogs; OS camera / photo picker with crop editor; denied/error alerts.
- **Back / dismiss behaviour:** iOS edge-swipe back would pop to the previous route (usually the EntryPoint redirect); no header.

### Cute! Use this photo? — `/onboarding-photo-preview`
- **File:** `src/app/onboarding-photo-preview.jsx` · **Reached from:** photo screen after capture/pick (`onboarding-photo.jsx:121,185`).
- **Gating / data needed:** route param `photoUri`. Same pet-exists guard on mount (`:36`). No "Use a different account" link on this screen and no visible back button (swipe back only).

| # | Element | Type | Source | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | Title "Cute! Use this photo?" [¡Qué lindo! ¿Usar esta foto?] + "Choose how you'd like to use it" | text | `src/app/onboarding-photo-preview.jsx:201-227` | | |
| 2 | Circular photo preview (280 px) | image | `src/app/onboarding-photo-preview.jsx:230-251` | | |
| 3 | "Post as daily + use as profile photo" / hint "Share this moment with friends" [Publicar como momento + usar de perfil / Compartí este momento con amigos] (coral) | button | `src/app/onboarding-photo-preview.jsx:257-292` (handler `:42-67`) | Saves photo URI to AsyncStorage `onboarding_pet_photo`, sets `create_first_moment="true"`, `router.push("/onboarding")`. **Nothing is posted yet**; the public post is created later at wizard step 9 "Create profile" (`src/app/onboarding.jsx:534-589`: `POST /api/posts` caption "Meet <name>! 🐾", `is_daily_update:true`, then `POST /api/onboarding/welcome`) | 🌍 |
| 4 | "Only use as profile photo" / hint "Don't post to feed" [Solo usar como foto de perfil / No publicar en el inicio] | button | `src/app/onboarding-photo-preview.jsx:295-328` | Saves photo, removes `create_first_moment`, → `/onboarding` | |
| 5 | "Retake" [Repetir] | button | `src/app/onboarding-photo-preview.jsx:333-363` (handler `:69-124`) | Re-checks camera permission (prompt if needed), relaunches camera; replaces preview image. Denied alert "Camera Permission Required" / "Please enable camera access to take photos." | |
| 6 | "Choose" [Elegir] | button | `src/app/onboarding-photo-preview.jsx:366-396` (handler `:126-181`) | Same for photo library; denied alert "Photo Library Permission Required" / "Please enable photo library access to choose photos." | |
| 7 | "Skip photo" [Omitir foto] | link | `src/app/onboarding-photo-preview.jsx:400-419` (`:183-186`) | `router.push("/onboarding")` WITHOUT clearing a previously saved `onboarding_pet_photo` or `create_first_moment` flag, so a stale photo may still show in the wizard | |
| 8 | "Don't worry, you can change this later." | text | `src/app/onboarding-photo-preview.jsx:423-435` | | |

- **Empty / loading / error states:** save failure → Alert "Error" [Error] / "Could not save photo. Please try again." (`:62-65`).
- **Modals / sheets / alerts opened:** OS pickers/permission dialogs, the alerts above.
- **Back / dismiss behaviour:** swipe back to photo screen (no on-screen back).

---

## 8. Onboarding wizard (`/onboarding`, 9 steps + success)

Common frame (all steps): `src/app/onboarding.jsx`. **Reached from:** photo screen "Skip for now" (`onboarding-photo.jsx:204`), preview screens (`onboarding-photo-preview.jsx:59,185`). **Gating:** logged in; mount guard `useLeaveOnboardingIfHasPets("onboarding")` (`onboarding.jsx:170`) sends accounts that already have a pet to `/(tabs)`; header counter "Step n of 9". Saved draft: name/fields persist in AsyncStorage `onboarding_progress` (debounced 400 ms, `:257-265`) and are merged back on mount (`:220-248`) but the wizard always restarts at step 1. The whole wizard is wrapped in `ErrorBoundary` (`:1932-1938`). Species is hard-coded `"dog"` (`:463`). Pet photo is the one chosen on the photo screens (`onboarding_pet_photo`).

### Wizard chrome (header + footer, shown on steps 1-9)
| # | Element | Type | Source | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | Back chevron (a11y "Back" [Atrás]) | icon button | `src/app/onboarding.jsx:933-950` (handler `:372-386`) | Step > 1: previous step. Step 1: `router.back()` (to photo screens) or `router.replace("/onboarding-photo")` | |
| 2 | "Step n of 9" [Paso n de 9] | text | `src/app/onboarding.jsx:953-958` | | |
| 3 | "Use a different account" | link | `src/app/onboarding.jsx:959` | section 5 | ⚠️ |
| 4 | Coral progress bar | static | `src/app/onboarding.jsx:964-979` | | |
| 5 | "Next" [Siguiente] | button (disabled+grey while the step's required field is invalid) | `src/app/onboarding.jsx:854-879` (handler `:357-370`) | Advances one step only if `canGoNext()` (`:725-754`) | |
| 6 | Inline validation (coral, above Next) | text | `src/app/onboarding.jsx:836-851`, copy `:758-775` | per-step messages below | |
| 7 | "Skip" [Omitir] (steps 7 and 8 only) | link | `src/app/onboarding.jsx:882-904` | advances without data | |
| 8 | Footer moves into the scroll area while the keyboard is open | layout | `src/app/onboarding.jsx:785,1002,1009` | device-only keyboard behaviour | |

### Step 1 of 9 — "What's your dog's name?" [¿Cómo se llama tu perro?]
- **Required:** non-empty trimmed name.
| # | Element | Type | Source | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | Name input, placeholder "e.g. Buddy" [ej. Firulais], auto-capitalise words, no autofocus | text input (testID `onboarding-name`) | `src/app/onboarding.jsx:1029-1052` | Typing fills `formData.name`; coral border once non-empty | |
| 2 | Validation "Add your dog's name to continue" [Agregá el nombre de tu perro para continuar] | text | `src/app/onboarding.jsx:762` | shown while empty | |

### Step 2 of 9 — "Choose <name>'s pet handle" [Elegí el usuario de <name>]
- **Required:** handle passing `isHandleAcceptable` (`src/utils/validateHandle.js`) AND the live availability check must have cleared that exact handle.
| # | Element | Type | Source | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | "Suggested handles:" [Usuarios sugeridos:] up to 5 chips `@name`, `@name.paws`, `@name_daily`, `@the_real_name`, `@name_adventures` (those in the mock taken-list are filtered) | buttons | `src/app/onboarding.jsx:1079-1128` (suggestions `:332-343`) | Tap fills the handle, runs local validation, highlights with a check | |
| 2 | "Or create your own:" [O creá el tuyo:] input, placeholder "custom_handle" [usuario_personalizado] | text input (testID `onboarding-handle-input`) | `src/app/onboarding.jsx:1140-1167` | Input is force-lower-cased and stripped to `[a-z0-9_.]`; format rules: 3-20 chars, must start with letter/number | |
| 3 | Inline error (red) | text (testID `onboarding-handle-error`) | `src/app/onboarding.jsx:1168-1174` | English-only strings from `src/utils/validateHandle.js:30-47`: "Pick a handle", "Handle must be at least 3 characters", "Handle must be 20 characters or fewer", "Use lowercase letters, numbers, _ or .", "This handle is already taken" — **not translated to ES** (only the API-taken message `onboarding.handleTaken` is) | |
| 4 | "Checking availability…" [Verificando disponibilidad…] + spinner | text | `src/app/onboarding.jsx:1175-1192` | Debounced (400 ms) `GET /api/pets/handle-availability?handle=<h>` (8 s timeout, `:279-330`). `available:false` → "This handle is already taken". Network error/timeout **fails open** (Next unlocks; POST /api/pets is the final backstop) | |
| 5 | Mock taken list | behaviour | `src/utils/validateHandle.js:12-21` | The handles buddy, max, charlie, cooper, lucy, daisy, duke, molly are always rejected locally as "taken" (hard-coded mock list, not the server) | |

### Step 3 of 9 — "What breed is <name>?" [¿Qué raza es <name>?]
- **Required:** non-empty breed. Subtitle "This helps us personalize care recommendations". Layout is not scrollable-wrapped (picker owns its own FlatList, `onboarding.jsx:984-989`).
| # | Element | Type | Source | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | Search box "Search breeds…" [Buscar razas…], magnifier icon | text input (testID `breed-search`) | `src/components/BreedPicker.jsx:225-244` | Case/accent-insensitive filter of the canonical list (`src/data/dogBreeds.js`), max 40 rows shown; "Keep typing to narrow the list…" footer when truncated | |
| 2 | "Mixed breed" [Mestizo] row (pinned first when not searching) | row button (testID `breed-option-mixed`) | `src/components/BreedPicker.jsx:111-118` | Stores canonical `"Mixed Breed"` | |
| 3 | "COMMON BREEDS" [Razas comunes] list: Labrador Retriever, Golden Retriever, German Shepherd Dog, Poodle, French Bulldog, Bulldog, Beagle, Dachshund, Chihuahua, Yorkshire Terrier, Shih Tzu, Border Collie, Siberian Husky | row buttons (testID `breed-option-<name>`) | `src/components/BreedPicker.jsx:120-127`, list `src/data/dogBreeds.js:227-241` | Tap selects (coral fill + check) | |
| 4 | Hint "Don't see yours? Search above — N breeds to find." [¿No ves la tuya? Buscá arriba…] | text | `src/components/BreedPicker.jsx:178-192` | | |
| 5 | `Use “<typed text>”` [Usar “…”] row (when typed text is not an exact match) | row button (testID `breed-option-custom`) | `src/components/BreedPicker.jsx:152-162` | Saves free-text breed | |
| 6 | "No breeds match — you can still use what you typed." | text | `src/components/BreedPicker.jsx:164-177` | zero results | |
| 7 | Validation "Add a breed to continue" [Agregá una raza para continuar] | text | `src/app/onboarding.jsx:764` | | |

### Step 4 of 9 — "How old is <name>?" [¿Qué edad tiene <name>?]
- **Required:** Years OR Months OR (a birthday set later). "Age helps us suggest the right activities and health checks."
| # | Element | Type | Source | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | "Years" [Años] numeric input, placeholder 0 | text input (testID `onboarding-age-years`) | `src/app/onboarding.jsx:1249-1273` | digits only | |
| 2 | "Months" [Meses] numeric input, placeholder 0 | text input (testID `onboarding-age-months`) | `src/app/onboarding.jsx:1286-1310` | digits only, no upper cap (e.g. 99 accepted) | |
| 3 | "An approximate age is fine — you can update it later." | text | `src/app/onboarding.jsx:1316-1323` | | |
| 4 | Validation "Add an age (years or months) to continue" | text | `src/app/onboarding.jsx:766` | | |

### Step 5 of 9 — "What's <name>'s gender?" [¿Cuál es el sexo de <name>?]
- **Required:** "Female" [Hembra] or "Male" [Macho] (no "unknown" option).
| # | Element | Type | Source | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | "Female" ♀️ card | selectable card (testID `onboarding-gender-female`) | `src/app/onboarding.jsx:1359-1395` | selects | |
| 2 | "Male" ♂️ card | selectable card (testID `onboarding-gender-male`) | `src/app/onboarding.jsx:1359-1395` | selects (coral + check) | |
| 3 | Validation "Pick male or female to continue" | text | `src/app/onboarding.jsx:768` | | |

### Step 6 of 9 — "How much does <name> weigh?" [¿Cuánto pesa <name>?]
- **Required:** number > 0. Unit defaults to "lbs" for US locale else "kg" (`src/utils/weightUnit.js:6-13`).
| # | Element | Type | Source | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | Weight input, placeholder 0 | decimal-pad input (testID `onboarding-weight`) | `src/app/onboarding.jsx:1419-1446` | strips non `[0-9.]` | |
| 2 | "kg" / "lbs" toggle | two buttons | `src/app/onboarding.jsx:1456-1482` | sets `weightUnit` | |
| 3 | Validation "Add a weight to continue" | text | `src/app/onboarding.jsx:770` | | |

### Step 7 of 9 — "When are <name>'s special days?" [¿Cuáles son los días especiales de <name>?] (OPTIONAL)
| # | Element | Type | Source | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | "🎂 Birthday (optional)" field, placeholder "Add a birthday" [Agregar un cumpleaños] | DateField (native inline calendar) | `src/app/onboarding.jsx:1539-1548`, `src/components/DateField.jsx:69-98` | Tap opens inline iOS calendar (Android calendar dialog); picking a day commits and closes; future dates blocked (`maximumDate=today`); stored `YYYY-MM-DD`, shown formatted | |
| 2 | "💝 Gotcha day (optional)" field, placeholder "Add an adoption / gotcha day" | DateField | `src/app/onboarding.jsx:1560-1569` | only one calendar open at a time (opening one collapses the other, `:1495-1508`) | |
| 3 | "Next" and "Skip" both enabled | buttons | `src/app/onboarding.jsx:882-904` | Skip fires `trackTap("onboarding_skip")` | |

### Step 8 of 9 — "Anything important we should remember about <name>?" [¿Algo importante que debamos recordar sobre <name>?] (OPTIONAL)
| # | Element | Type | Source | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | Notes multiline, placeholder "e.g. Allergic to chicken, loves long walks, nervous around loud noises..." | text input | `src/app/onboarding.jsx:1594-1615` | free text (allergies, meds); saved as pet `notes` | |
| 2 | "Skip" / "Next" | buttons | `src/app/onboarding.jsx:882-904` | | |

### Step 9 of 9 — Review "<name>'s profile" [Perfil de <name>] + "Create <name>'s profile"
| # | Element | Type | Source | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | Round photo (or 🐕 placeholder) | image | `src/app/onboarding.jsx:1659-1681` | | |
| 2 | Rows Name / Handle / Breed / Age / Gender / Weight / Special days / Notes, each with "Edit" [Editar] (coral) | list + buttons | `src/app/onboarding.jsx:1684-1737`, Edit at `:1773` | "Edit" jumps to that step (`goToStep`: 0,1,2,3,4,5,6,7); after editing the user must press Next through the remaining steps again (no jump-back-to-review) | |
| 3 | "Create <name>'s profile" [Crear el perfil de <name>] + check icon (spinner while submitting) | primary button (trackId `onboarding_done`) | `src/app/onboarding.jsx:804-832` (handler `:392-643`) | Re-validates all required fields (`firstIncompleteRequiredStep`, `:138-153`; jumps to first gap). Re-checks `GET /api/pets` (if a pet exists → `router.replace("/(tabs)")` and NO duplicate, `:405-410`). Then, in order: (a) `POST /api/upload` photo (public bucket) if any (`:420-450`, `src/utils/useUpload.js`); (b) `POST /api/pets` {name, handle, avatar_url, species "dog", breed, age_years/months, gender, weight(+unit), birthday, adoption_date, notes} (`:480-490`) **creates the real pet profile (public @handle, discoverable in Search)**; (c) refetch `["pets"]`; (d) `PATCH /api/user-profile {onboarding_completed:true}` (failure only warns); (e) AsyncStorage flags; (f) if `create_first_moment==="true"` and a photo: `GET /api/posts?limit=50`, then `POST /api/posts` {pet_id, image_url, caption "Meet <name>! 🐾", is_daily_update:true} (`:534-589`) and `POST /api/onboarding/welcome` (seeds streak day 1 + a labelled "PawPi Welcome" first paw, `src/utils/onboardingWelcome.js:11-22`); (g) clears drafts; (h) shows success screen | ⚠️ 🌍 |

- **Empty / loading / error states:** the submit failure path is `alert(error.message || "Could not save profile. Please try again.")` (`src/app/onboarding.jsx:639`) — it displays `error.message` verbatim, so **raw technical text CAN leak**: e.g. "Photo upload failed: <server/upload error>", "Photo upload succeeded but no URL was returned", the server's `errorData.error` from POST /api/pets, "Failed to create pet profile", and the global fetch guard text `Unexpected HTML response from API route "…" (status …). The backend is likely missing this endpoint.` (`src/__create/fetch.ts:222-229`) or `JSON Parse error…` if a non-JSON error body is returned. Note the post failure at (f) is non-fatal and silent.
- **Modals / sheets / alerts opened:** native `alert()` on failure; native calendar pickers (step 7).
- **Back / dismiss behaviour:** header back chevron walks steps backward; no swipe-to-dismiss confirmation, no "discard changes" prompt.

### Success screen — "<name> is ready!" [¡<name> está listo!]
- **File:** `src/app/onboarding.jsx` `StepSuccess` (`:1799-1927`), shown at `currentStep === 9` (`:780-783`, no header/footer).
| # | Element | Type | Source | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | 🎉 + "<name> is ready!" | text | `src/app/onboarding.jsx:1817-1832` | | |
| 2 | Banner "🔥 Day 1 — <name>'s care ring has begun" + "🐾 PawPi Welcome sent <name> a first paw" (only when the welcome call returned a streak) OR prompt "Take <name>'s first photo to close today's ring 🐾" | text | `src/app/onboarding.jsx:1834-1874` | | |
| 3 | "Now you can start tracking care, sharing moments, and meeting pet friends." | text | `src/app/onboarding.jsx:1876-1889` | | |
| 4 | "Set care routine" [Configurar rutina de cuidado] (coral) | button | `src/app/onboarding.jsx:1893-1907` (handler `:645-647`) | `router.replace("/(tabs)/health")` | |
| 5 | "Go to Feed" [Ir al inicio] | button | `src/app/onboarding.jsx:1909-1923` (handler `:649-668`) | resets `["pets"]`, `["posts"]`, `["today-daily-update"]` queries, waits 500 ms, `router.replace("/(tabs)")` | |

- **Back / dismiss behaviour:** no back; both buttons use `replace`, so onboarding cannot be re-entered by back-swipe. Re-entering later is blocked by the has-pets guard.

---

## 9. Shared field components

### DateField — `src/components/DateField.jsx`
- **File:** `src/components/DateField.jsx` · **Reached from:** onboarding step 7 (`onboarding.jsx:1539,1560`) and every date form app-wide. **Gating:** none; values canonical `YYYY-MM-DD` (`onChange` always canonical).
| # | Element | Type | Source | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | Field showing formatted date or placeholder + calendar icon | pressable | `src/components/DateField.jsx:69-98` | Toggles an inline native calendar (iOS `inline`, Android `calendar`) | |
| 2 | Native DateTimePicker | picker | `src/components/DateField.jsx:99-111` | Picking a day commits and closes; Android "dismissed" = cancel, no change (`:59-65`); light theme forced | |

### TimeField — `src/components/TimeField.jsx`
- **File:** `src/components/TimeField.jsx` · **Reached from:** reminder/schedule forms elsewhere (not used in onboarding). Canonical `HH:MM` 24 h.
| # | Element | Type | Source | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | Field showing "HH:MM" or placeholder + clock icon | pressable | `src/components/TimeField.jsx:70-99` | iOS: opens spinner and immediately commits the opening time into an EMPTY field (`:44-53`); tap again collapses | |
| 2 | Native spinner | picker | `src/components/TimeField.jsx:100-109` | iOS commits every wheel settle; Android is an OK/Cancel dialog | |

---

## 10. Welcome back (win-back screen)

### Welcome back — `/welcome-back`
- **File:** `src/app/welcome-back.jsx` · **Reached from:** tapping an in-app notification row with `relatedWelcomeBack` in the Notifications inbox (`src/app/notifications.jsx:566-567`). NOT reachable from EntryPoint or any tab; a tester needs a server-generated win-back notification. Not listed in `_layout.jsx` Stack (default stack options apply).
- **Gating / data needed:** a current pet (`useCurrentPet`); `GET /api/pets/:id/reengagement` (`src/hooks/useReengagement.js:17-24`). If the backend returns nothing: only the headline and the empty text show (no fake data).

| # | Element | Type | Source | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | Back arrow (testID `welcome-back-close`) + title "Welcome back" [Bienvenido de vuelta] | icon button | `src/app/welcome-back.jsx:45-52` | `router.back()` | |
| 2 | Loading spinner (testID `welcome-back-loading`) | loading | `src/app/welcome-back.jsx:55` | while query loads | |
| 3 | Coral hero "<pet> is so happy you're here 🐾" [<pet> está feliz de verte 🐾] (fallback pet name "your pup" [tu compañero]) | text | `src/app/welcome-back.jsx:59-63` | | |
| 4 | "Bring back <pet>'s streak — one tap, free 🔥" [Recuperá la racha de <pet> — un toque, gratis 🔥] | card button (testID `welcome-back-repair`), only if `repair_available` | `src/app/welcome-back.jsx:66-73` (`onRepair :39-41`) | `POST /api/pets/:id/reengagement {action:"repair"}` (`useReengagement.js:46-47`); **no confirmation**; failures are swallowed silently (no toast); on success the query refreshes | ⚠️ (server-side streak change) |
| 5 | Milestone card "<pet>'s birthday is in N days 🎂" / "<pet>'s gotcha day is in N days 🎉" | text, only if `milestone` | `src/app/welcome-back.jsx:76-85` | | |
| 6 | "WHAT YOUR PACK DID" [LO QUE HIZO TU GRUPO] cards: friend photo + "<name> shared a moment" [<name> compartió un momento] | list, only if `friends` | `src/app/welcome-back.jsx:88-101` | display only, real friends' recent posts | |
| 7 | Empty text "When <pet>'s friends post, you'll see them here 🐾" | text | `src/app/welcome-back.jsx:103` | shown when no friends | |
| 8 | "Don't send me these" [No me mandes estos mensajes] (underlined) | link (testID `welcome-back-optout`) | `src/app/welcome-back.jsx:107-109` | `POST /api/pets/:id/reengagement {action:"opt_out"}` — **no confirm, no feedback, no navigation**; silently turns off future win-back notifications (changes a stored preference) | ⚠️ |

- **Empty / loading / error states:** on fetch error `isLoading` ends and the screen shows the headline + empty-friends line (no error message).
- **Modals / sheets / alerts opened:** none.
- **Back / dismiss behaviour:** back arrow; iOS swipe-back.

---

## 11. Not-found screen

### Uh-oh! This screen doesn't exist (yet). — `+not-found`
- **File:** `src/app/+not-found.tsx` · **Reached from:** any unmatched route/deep link (e.g. an old notification `pathname`, a typed `pawpi://something`, or `pawpi://auth-callback` opened from outside the auth session).
- **Gating / data needed:** none. **This is the Create.xyz dev "sitemap" page shipped as-is:** English only, not localized, not on-brand (white, system fonts), and it lists EVERY route name in the app as tappable buttons.

| # | Element | Type | Source | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | Back arrow + pill showing "/<missing path>" | icon button | `src/app/+not-found.tsx:128-140` (handler `:79-98`) | `router.back()` if possible, else `router.replace` to `../(tabs)/index.jsx` / `../` (can land on an odd/blank route) | |
| 2 | Title "Uh-oh! This screen doesn't exist (yet)." + subtitle `Looks like "/<path>" isn't part of your project. But no worries, you've got options!` | text | `src/app/+not-found.tsx:144-149` | developer-facing wording leaked to end users | |
| 3 | "Build it from scratch / Create Screen" card | button, only when running inside an iframe parent (web preview) | `src/app/+not-found.tsx:152-168` | `postMessage` to parent; **not visible on a phone** | |
| 4 | "Check out all your project's routes here ↓" + "MOBILE" list of route-name buttons (e.g. "Homepage", "health", "services", "welcome", "onboarding", …) | list of buttons | `src/app/+not-found.tsx:172-229` (navigate `:100-108`) | Each `router.push(url)`: exposes internal/unauthenticated screens to any user who hits a bad link | ⚠️ (can open internal screens directly) |

- **Empty / loading / error states:** none. **Back / dismiss behaviour:** back arrow (row 1) or iOS swipe back.

---

## 12. Error / offline / crash fallbacks

### Something went wrong (in-app ErrorBoundary) — `src/components/ErrorBoundary.jsx`
- **File:** `src/components/ErrorBoundary.jsx` · **Reached from:** any render throw inside the root Stack (`src/app/_layout.jsx:116`) or inside the onboarding wizard (`onboarding.jsx:1934`). Reports only the error class name via telemetry (`:51`).
| # | Element | Type | Source | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | Paw mark + "Something went wrong" [Algo salió mal] + "We hit a snag loading this screen. Your data is safe — let's give it another try." | text | `src/components/ErrorBoundary.jsx:24-30` | no stack trace / message shown | |
| 2 | "Try again" [Reintentar] | button | `src/components/ErrorBoundary.jsx:31` | resets the boundary and re-mounts children | |

### Startup / last-resort fallbacks — `__create/StartupErrorBoundary.tsx`
- **File:** `__create/StartupErrorBoundary.tsx` (wraps the app in every build via `index.tsx:60-65`; the dev-only `DeviceErrorBoundary` "Restart app" screen with `Updates.reloadAsync` is NOT used in production because `isDevelopmentLike` is false).
| # | Element | Type | Source | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | 🐾 emoji + "Something went wrong. Tap below to try again." + "Try Again" (English only) | screen + button | `__create/StartupErrorBoundary.tsx:126-130` | `setState({hasError:false})` re-mounts the app. Note it uses the 🐾 emoji (brand rule forbids) and hard-coded English | |
| 2 | "PawPi couldn't finish starting up. Please close and reopen the app." (when `renderRootComponent` itself throws) | screen | `__create/StartupErrorBoundary.tsx:77-82` | no button; user must kill the app | |
| 3 | "Diagnostic: <boot milestone code>" (small grey) | text | `__create/StartupErrorBoundary.tsx:57-68` | a short milestone string (e.g. `entrypoint:pets-fetch`), not a stack trace | |

### Offline banner — `src/components/OfflineBanner.jsx`
- **File:** `src/components/OfflineBanner.jsx` · **Reached from:** mounted at the root over every screen (`src/app/_layout.jsx:163`). **Gating:** only when `useIsOnline()` is false (NetInfo, `src/utils/connectivity`).
| # | Element | Type | Source | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | Dark-brown top strip "No internet connection — showing saved data" [Sin conexión a internet — mostrando datos guardados] | banner (a11y role alert, `pointerEvents:none`, not tappable) | `src/components/OfflineBanner.jsx:20-42` | Appears/disappears automatically with connectivity (test: airplane mode). Queries pause when offline (`wireQueryConnectivity`, `_layout.jsx:27`) | |

---

## 13. Root layout — providers, modals, notifications, deep links, updates

### Root layout — `src/app/_layout.jsx`
- **File:** `src/app/_layout.jsx` · **Reached from:** always (root).
- **Provider order (outermost → innermost):** `QueryClientProvider` → `GestureHandlerRootView` → `ErrorBoundary` → `Stack` (`headerShown:false`) ; siblings `AuthModal` (`:162`) and `OfflineBanner` (`:163`) (`src/app/_layout.jsx:113-166`). Outside it, `index.tsx` wraps the whole app in `StartupErrorBoundary`.
- **Stack screens declared:** index, welcome, auth, onboarding-photo, onboarding-photo-preview, vet-business-access, onboarding, pet-profile, follows, emergency-card, (tabs), business, service, **notifications (`presentation:"modal"`)**, search (card push), **messages (`presentation:"modal"`)**, chat, provider-messages, provider-chat, walk-live, walker-walks, sitter-visits, business-adoption (`:117-159`). Other file routes (events, forum-*, lost-found, wrapped, welcome-back, household, …) are auto-registered with default options.

| # | Behaviour | Source | Expected result | Risk |
|---|---|---|---|---|
| 1 | Splash stays up until auth store ready, then hides (`SplashScreen.hideAsync`) | `src/app/_layout.jsx:24,102-110` | Native splash (coral) → Welcome or tabs. 4 s hard fallback in `startupFallback.js` | |
| 2 | **Notification permission pre-prompt at every cold start, BEFORE login**: `initNotifications()` on mount | `src/app/_layout.jsx:55-59` → `src/utils/notifications.js:51-67,72-107` | If OS permission is not yet granted (undetermined OR denied) an in-app Alert appears (hard-coded English, not localized, not in en.json): title "🔔 Enable Reminders", body "PawPi can remind you about feeding, walks, medication, and photo checks so your pet's care routine stays on track.", buttons "Maybe later" (cancel) / "Enable reminders". "Enable reminders" → OS notification permission dialog (`requestPermissionsAsync`, `:94`). The alert re-appears on EVERY cold launch until permission is granted (memoized per process only). Android: creates channel "Reminders" | ⚠️ (OS permission) |
| 3 | Learns app-open hour for streak nudges | `src/app/_layout.jsx:58` | local only | |
| 4 | Push-token registration after auth, no prompt | `src/app/_layout.jsx:64-68` → `src/utils/registerPushToken.js:46-81` | If permission granted & real device: `POST /api/push-tokens {token,platform}`. Re-runs when the user id changes. Unregisters (`DELETE /api/push-tokens`) on logout | |
| 5 | Notification-tap routing (only when authenticated) | `src/app/_layout.jsx:73-76` → `src/utils/notificationDeepLink.js` | Reminder push → `/(tabs)/health?section=today|vet-record`; `nudge:"reminder_setup"` → `/(tabs)/more/reminders`; any other server push → `/notifications`. Cold-start tap is parked until EntryPoint calls `markNavigationReady()` | |
| 6 | Language override applied | `src/app/_layout.jsx:79-81` | `initLocaleFromStorage()`; default = phone language (ES-AR copy with voseo) | |
| 7 | Reminder + telehealth reminder sync | `src/app/_layout.jsx:84-97` | local notifications scheduled silently; telehealth sync polls `GET /api/me/bookings` only when authenticated | |
| 8 | Telemetry lifecycle (anonymous) | `src/app/_layout.jsx:40` | opt-out lives in Settings | |
| 9 | **Deep links**: URL scheme `pawpi://` (`app.json` `scheme:"pawpi"`) is handled by expo-router: `pawpi://<route>` opens that file route directly (no auth gate on the router level, e.g. `pawpi://onboarding`). `pawpi://auth-callback` is consumed only by the Google auth session (section 2). No universal links/`associatedDomains`, no `Linking.addEventListener` handlers in `src/` | `app.json`, `src/utils/auth/socialAuthShared.js:9` | | |
| 10 | **Expo Updates / "update available"**: `updates.enabled:true`, channel `production`, `runtimeVersion:"1.0.0"`, `fallbackToCacheTimeout:0` (`app.json`). **There is no in-app update prompt or `checkForUpdateAsync` call anywhere in `src/`**; the OTA bundle downloads in the background at launch and applies on the NEXT cold start (`expo-updates` is only imported by the dev-only `__create/DeviceErrorBoundary.tsx`). Store-update prompts do not exist either | `app.json`, `eas.json` | | |

---

## 14. System permission prompts the app can raise (inventory)

Declared usage strings (`app.json` `ios.infoPlist`, mirrored with ES translations in `locales/en.json` / `locales/es.json` for the OS dialog). Not declared / not used: App Tracking Transparency (`NSPrivacyTracking:false`, no `expo-tracking-transparency`), Contacts (`expo-contacts` is in package.json but no import in `src/`), HealthKit (stub only), speech (`expo-speech*` excluded from autolinking), `expo-media-library` (none).

| Permission | Exact usage string (EN) | First screen / trigger that raises it | Code |
|---|---|---|---|
| **Notifications** (custom in-app pre-prompt, then OS dialog; no Info.plist string) | In-app alert text: "PawPi can remind you about feeding, walks, medication, and photo checks so your pet's care routine stays on track." | **App cold start, even on the logged-out Welcome screen** (RootLayout effect). Later re-asks: Health > Reminders settings tab "enable notifications" button; Getting-started checklist `enableNotifications` | `src/app/_layout.jsx:55`; `src/utils/notifications.js:72-100`; `src/components/Health/Reminders/SettingsTab.jsx:53-60`; `src/hooks/useGettingStarted.js:136` |
| **Camera** (`NSCameraUsageDescription`) | "PawPi uses the camera so you can take photos of your pet for their profile, daily moments, health checks and vet records." | First: Onboarding photo screen -> "Open camera" tap (`ExpoCamera.Camera.requestCameraPermissionsAsync`). Later: Add-dog modal, Post composer, Poo/Vomit/General/Photo health checks, Vet-record Add-document camera, Preview "Retake", provider pickup QR scanner (auto-asks on open), and telehealth call (WebView getUserMedia) | `src/app/onboarding-photo.jsx:94`; `src/app/onboarding-photo-preview.jsx:87`; `src/components/Pets/AddDogModal.jsx:73`; `src/components/Feed/PostComposerModal.jsx:156,177`; `src/components/Health/Poo/PooTrackerModal.jsx:176`; `.../Vomit/VomitTrackerModal.jsx:179`; `.../GeneralCheck/GeneralCheckModal.jsx:234`; `.../PhotoCheck/PhotoCheckModal.jsx:113`; `.../PhotoCheck/PhotoCheckCaptureModal.jsx:154`; `.../VetRecord/AddDocumentModal.jsx:126`; `src/components/Providers/PickupScannerModal.jsx:14-19` |
| **Photo library** (`NSPhotoLibraryUsageDescription`) | "PawPi accesses your photo library so you can choose photos and documents for your pet's profile, posts, health records and chats." | First: Onboarding photo screen -> "Choose from gallery" (`requestMediaLibraryPermissionsAsync`, "limited" accepted). Later: Profile edit photo, Add-document, Poo/Vomit/General/Photo checks; chat/provider-chat attach use the picker directly | `src/app/onboarding-photo.jsx:158`; `src/app/onboarding-photo-preview.jsx:144`; `src/app/(tabs)/more/profile-edit.jsx:88`; `src/components/Health/VetRecord/AddDocumentModal.jsx:106`; `src/components/Health/Poo/PooTrackerModal.jsx:193`; `src/app/chat.jsx:70`; `src/app/provider-chat.jsx:88` |
| **Photos - add only** (`NSPhotoLibraryAddUsageDescription`) | "PawPi saves photos you create in the app, such as your pet's shareable daily-moment frame, to your photo library." | Declared in Info.plist; no explicit `saveToLibrary`/MediaLibrary call found in `src/` (would only prompt via the iOS share sheet "Save Image") | `app.json` |
| **Location, when in use** (`NSLocationWhenInUseUsageDescription`) | "PawPi uses your location to find nearby pet-friendly places, vets, walkers and meetups, to set a location on social walks, transport and events, and to share your live location while you drive a pet-taxi trip." | First automatic raise after login: **Services tab** (`ServicesDiscovery` effect on mount, plus "Search near me"). Others: Events, Nearby walks, Lost & Found, Adoption service, Walking service, Walker workspace (live `watchPositionAsync` GPS), Transport tracking, Business home, Map location picker. Foreground only; no background location | `src/components/Services/ServicesDiscovery.jsx:243,423`; `src/app/events.jsx:66`; `src/app/nearby-walks.jsx:59`; `src/app/lost-found.jsx:56`; `src/app/service/adoption.jsx:228`; `src/app/service/walking.jsx:108,161`; `src/app/walker-walks.jsx:79,85,146`; `src/app/transport-track.jsx:229`; `src/app/business/index.jsx:228`; `src/components/Map/MapLocationPicker.jsx:173` |
| **Microphone** (`NSMicrophoneUsageDescription`; Android `RECORD_AUDIO`) | "PawPi uses the microphone for audio in vet telehealth video consultations." | Telehealth call screen (WebView with `mediaCapturePermissionGrantType="grantIfSameHostElsePrompt"`; iOS asks camera AND mic) | `src/app/service/telehealth-call.jsx:55-60`; reached from `src/app/service/telehealth.jsx:186` |
| **Calendar** (`NSCalendarsFullAccessUsageDescription`, `NSCalendarsUsageDescription`) | "PawPi adds your pet's appointments, bookings and reminders to your calendar so you don't miss them." | First: an "add to calendar" action on a walk/vet routine (Health > Routines: WalkItem, RoutineCard, VetAppointmentRoutineModal, WalkCountdownCard), Booking form, Events, Transport. Shows a hard-coded English rationale alert first: "Calendar Access" / "PawPi can add walk blocks to your calendar so your time stays protected." [Not now / Allow calendar access]; then creates "PawPi - Walks" / "PawPi - Vet Appointments" calendars and events | `src/utils/calendarIntegration.js:45-76,139,178`; `src/components/Health/Reminders/WalkItem.jsx:20` |
| **Apple Health** (fake) | In-app only: "Apple Health Access / PawPi can use walk distance and activity data to help keep your pet's walk history accurate." then "Coming Soon" | Health > Walk tracking settings; no real HealthKit entitlement, always resolves false | `src/utils/healthKitIntegration.js:35-66`; `src/components/Health/WalkActivity/WalkTrackingSettings.jsx:8` |
| **Sign in with Apple** (system sheet, not a permission) | n/a | Welcome | section 2 |

---

## Observations worth a tester's eye (all derived from the code above)
1. Notification pre-prompt appears on the very first frame of a cold launch (even before login) and again every cold launch until granted; its copy is English-only.
2. Native Apple/Google sign-in shows no Terms/Privacy acceptance and the mobile app never calls `/api/legal/consent`; only the hosted email signup page records consent.
3. Hosted auth pages (signup/signin/forgot/reset) are English-only, unaffected by the app's ES locale.
4. `+not-found` is the dev sitemap page (route list exposed, English only).
5. `Loading...` (index.jsx:235), the AuthModal Back a11y label, the `StartupErrorBoundary`, handle format errors, notification/calendar rationale alerts are hard-coded English.
6. Onboarding failure alert prints raw `error.message`.
7. Onboarding handle step rejects 8 hard-coded "mock taken" handles (buddy, max, charlie, cooper, lucy, daisy, duke, molly) regardless of the server.
8. `welcome-back` is only reachable through a win-back notification row.

---

## Risky actions found in Part G
- `src/components/auth/SocialSignInButtons.jsx:57-64` — native "Continue with Apple" → `POST <BASE>/api/auth/callback/apple-native` (`src/utils/auth/socialAuth.js:106`); signs in or CREATES a real account with the tester's Apple ID, no Terms checkbox — 🔑 ⚠️.
- `src/components/auth/SocialSignInButtons.jsx:67-95` — "Continue with Google" → system browser `<BASE>/api/auth/mobile-start?provider=google` (`src/utils/auth/socialAuth.js:134-135`); signs in or CREATES a real account with a Google identity — 🔑 ⚠️.
- `../web/src/app/account/signup/page.jsx:324-330` (opened via `src/app/welcome.jsx:144-150`) — "Create account" submit creates a real account and `POST /api/legal/consent` — ⚠️.
- `../web/src/app/account/forgot-password/page.jsx:30` (opened via `src/app/welcome.jsx:169-183`) — "Send reset link" → `POST /api/account/forgot-password` sends a real email to the entered address — 📤.
- `../web/src/app/account/reset-password/page.jsx:50` — submit → `POST /api/account/reset-password` changes the account password — ⚠️.
- `src/app/onboarding.jsx:804-832` — "Create <name>'s profile": `POST /api/upload` (public photo), `POST /api/pets` (creates public pet profile/handle), `PATCH /api/user-profile`, and — when "Post as daily" was chosen — `POST /api/posts` (public daily moment "Meet <name>! 🐾") + `POST /api/onboarding/welcome` (seeds a "PawPi Welcome" paw interaction from the official account) — ⚠️ 🌍.
- `src/app/onboarding-photo-preview.jsx:257-292` — "Post as daily + use as profile photo": arms the public first-moment post that is published at Create profile (`src/app/onboarding.jsx:534-589`) — 🌍.
- `src/components/onboarding/UseDifferentAccountLink.jsx:30-43` — "Log out" (destructive) clears local onboarding drafts, unregisters the push token (`DELETE /api/push-tokens`), wipes Keychain session and the React Query cache — ⚠️.
- `src/app/index.jsx:167-175,201-209` and `src/app/auth/expo-web-success.jsx:52-60` — back arrow / "Start over" silently LOG OUT (`startOver`) — ⚠️.
- `src/app/welcome-back.jsx:67-73` — streak repair `POST /api/pets/:id/reengagement {action:"repair"}`, no confirmation, errors swallowed — ⚠️.
- `src/app/welcome-back.jsx:107-109` — "Don't send me these" `POST /api/pets/:id/reengagement {action:"opt_out"}`, no confirmation, no feedback — ⚠️ (changes notification preference).
- `src/app/_layout.jsx:55-59` / `src/utils/notifications.js:81-100` — startup "Enable reminders" triggers the OS notification permission dialog (then enables real push registration `POST /api/push-tokens` after login, `src/utils/registerPushToken.js:73`) — ⚠️.
- `src/utils/calendarIntegration.js:56-76,139,178` — "Allow calendar access" then creates "PawPi - Walks"/"PawPi - Vet Appointments" calendars and events in the tester's real calendar — ⚠️.
- `src/app/+not-found.tsx:172-229` — route-name buttons `router.push` any internal screen from a bad link — ⚠️ (unintended navigation to internal/unauthenticated screens).
- `src/app/vet-business-access.jsx:200-222` — gated "Create account" opens the real signup flow (real account creation) — ⚠️.
- No 💸 (money) controls exist in this area.


---

<!-- ===== PART A ===== -->

## Part A — Feed tab + global overlays

All paths are repo-relative to `anything/apps/mobile/` (e.g. `src/app/(tabs)/index.jsx:120`). EN label is from `src/i18n/locales/en.json`; ES in brackets where short. Many labels on the root screens (Notifications, Wrapped, Follows, PostDetailModal, PostCard counters) are HARD-CODED English and do not switch to Spanish; they are marked "(hard-coded EN)".

---

### Bottom tab bar (5 tabs) — `src/app/(tabs)/_layout.jsx` + `tabsConfig.js`
- **File:** `src/app/(tabs)/_layout.jsx`, `src/app/(tabs)/tabsConfig.js` · **Reached from:** always visible on every `(tabs)` screen (not shown on root-stack screens such as Notifications, Search, Messages, Events, pet-profile, `service/*`, which cover it).
- **Gating / data needed:** none (shown to any signed-in user). iOS renders Apple's native "Liquid Glass" tab bar (NativeTabs); Android renders a floating rounded pill (JS `<Tabs>`). **No tab has a numeric badge/dot** (no `tabBarBadge` anywhere) — the only unread badge in the app shell is the bell in the Feed header. The Feed tab's route name is `index`, Health `health`, Care `training`, Stores & Vets `services`, Profile `more`.
| # | Element (EN label / ES) | Type | Source | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | Feed / Inicio (house icon) | tab | `src/app/(tabs)/tabsConfig.js:18-24`, `src/app/(tabs)/_layout.jsx:88-94,158-173` | Opens the Feed screen (below). | |
| 2 | Health / Salud (heart-pulse icon) | tab | `src/app/(tabs)/tabsConfig.js:25-31` | Opens Health tab (`health.jsx`, other area). | |
| 3 | Care / Cuidado (paw icon) — route `training` | tab | `src/app/(tabs)/tabsConfig.js:32-38` | Opens the Care tab (`training.jsx`, other area). Label is "Care", not "Training". | |
| 4 | Stores & Vets / Tiendas y Veterinarias (stethoscope) — route `services` | tab | `src/app/(tabs)/tabsConfig.js:39-45` | Opens Services tab (other area). Android: leaving this tab pops its stack to root (`popToTopOnBlur`). | |
| 5 | Profile / Perfil — route `more` | tab | `src/app/(tabs)/tabsConfig.js:46-55`, `src/app/(tabs)/_layout.jsx:32-53,163-166` | Opens Profile (the active pet's social profile / More). iOS icon = `pawprint.circle` SF Symbol; Android icon = the active pet's round PHOTO with a coral ring when focused (falls back to initials/paw if no photo). | |
| 6 | Re-tap the already-active tab | tap on active tab | `src/app/(tabs)/_layout.jsx:62-65,169-171` | iOS: Apple standard behaviour (pops that tab's stack to its root). Android: only Services/More pop to root when you LEAVE them. | |
| 7 | Scroll down on a tab (iOS 26 only) | scroll gesture | `src/app/(tabs)/_layout.jsx:76-77` | `minimizeBehavior="onScrollDown"` → the native tab bar collapses/minimises while scrolling down and returns on scroll up. Feed scroll content passes behind the glass bar (`contentInsetAdjustmentBehavior="automatic"`, `src/app/(tabs)/index.jsx:294`). | |
- **On mount side effects (no UI):** `syncLocaleToServer()` + `syncTimezoneToServer()` (`_layout.jsx:183-187`); re-generates + schedules local OS reminder notifications from active routines and starts reminder-notification sync (`_layout.jsx:188-220`). On first run this can trigger no prompt by itself (permission prompts come from Getting-started "Turn on notifications").
- **Empty / loading / error states:** none specific.
- **Modals / sheets / alerts opened:** none.
- **Back / dismiss behaviour:** n/a. `Tabs` has `headerShown:false`; each tab renders its own header.

---

### Feed (Home) — `/(tabs)/index`
- **File:** `src/app/(tabs)/index.jsx` · **Reached from:** first tab; first screen after login/onboarding (entry redirect); Feed tab icon; also where Notifications/Search `router.back()` land.
- **Gating / data needed:** needs ≥1 pet (shows "Add your dog" in switcher and "your pup" as pet name otherwise; posting alerts "Please create your pet profile first."). The feed is **BeReal-style locked**: it unlocks per OWNER once ANY of the owner's dogs has posted today (`useFeedData` `feedUnlocked = ownerPostedToday || hasPostedToday`, `src/hooks/useFeedData.js:85-87`). Locked = blurred cards (see "Locked feed" section); unlocked = full feed (see "Unlocked feed"). Feed data = `GET /api/posts?limit&offset&viewerPetId` (Following first, then Suggested; `src/hooks/useFeedPosts.js:50`), suggestions = `GET /api/feed/suggestions`.
| # | Element (EN label / ES) | Type | Source | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | Feed header (PawPi logo, streak chip, Search / Messages / Bell icons, pet switcher pill) | header | `src/app/(tabs)/index.jsx:230` | Rendered by `FeedHeader` — see "Feed header" section. | |
| 2 | Pull-to-refresh on the feed | pull-to-refresh | `src/app/(tabs)/index.jsx:281-296` | Spinner (coral); refetches posts + today's daily update (`refetchPosts`, `refetchTodayDailyUpdate`). Works in locked AND unlocked state. | |
| 3 | Loading state "Loading posts… / Cargando posts…" | spinner | `src/app/(tabs)/index.jsx:232-240` | Shown while the feed query loads (and while pets list loads). | |
| 4 | Try again / Reintentar (feed failed to load) | button | `src/app/(tabs)/index.jsx:256-274` | Re-runs `refetchPosts()`. Only shown when the request failed AND nothing is cached. | |
| 5 | Getting-started card | card | `src/app/(tabs)/index.jsx:303` | See "Getting started card" section. | |
| 6 | Daily prompt card ("Today's pet moment") | card | `src/app/(tabs)/index.jsx:304-310` | See "Daily prompt card" section; its Post / View-today buttons open the composer / detail modal. | |
| 7 | Followed-pets milestone cards ("It's {name}'s Birthday!") | cards | `src/app/(tabs)/index.jsx:314` | Rendered only when UNLOCKED; see "Milestone event card". | |
| 8 | Locked feed vs unlocked feed | list | `src/app/(tabs)/index.jsx:321-341` | Locked → `LockedFeedOverlay`; unlocked → `UnlockedFeed` (sections below). | |
| 9 | "Uploading photo… / Subiendo foto…" pill | status overlay | `src/app/(tabs)/index.jsx:390-419` | Non-interactive brown pill shown above the tab bar while the daily photo/video uploads. | |
| 10 | Tap a pet's avatar/name header or its photo (single tap) | list item | `src/app/(tabs)/index.jsx:94-118` | `router.push("/pet-profile")` with the post's pet params (that pet's social profile, root stack → back returns to Feed). | |
| 11 | Tap a followed-business post | list item | `src/app/(tabs)/index.jsx:157-176` | Stashes the post in memory and `router.push("/service/provider-post", {providerId, postId})` (business post detail; paws + comments live there). Ignored if ids missing. | |
| 12 | Tap a "Discover a business" card | list item | `src/app/(tabs)/index.jsx:121-130` | `router.push("/service/provider", {slug})` (public business page). No-op if no slug. | |
| 13 | Tap an "Adopt me" card | list item | `src/app/(tabs)/index.jsx:136-151` | `router.push("/service/adoption", {listingId, providerId})` → that dog's listing; falls back to the adoption hub if ids missing. | |
| 14 | Delete post (confirm) | alert | `src/app/(tabs)/index.jsx:195-213` | Alert "Delete post?" / "This permanently removes the post. You can post a new daily photo afterwards." with Cancel / **Delete** (hard-coded EN). Delete → closes detail modal, `DELETE /api/posts/:id`, refetches feed + daily lock (deleting today's daily re-opens the composer). On failure Alert "Error / Could not delete: …". | 🗑️ |
- **Empty / loading / error states:**
  - Feed failed + nothing cached: paw mark, "Something went wrong. Please try again. / Algo salió mal. Intentá de nuevo." + "Try again" (index.jsx:241-275). Fetch error text is NOT leaked on this screen.
  - Unlocked + zero posts: 🐾 "No pet moments yet!" / "Be the first to share today's moment." (`src/components/Feed/UnlockedFeed.jsx:219-234`).
  - Locked + zero posts: 🐾 "No pet friends have posted yet" / "Be the first! Post {pet}'s daily moment to start today's feed." + "Post today's photo" button (`LockedFeedOverlay.jsx:56-95`).
  - Posting errors show native Alerts built in `useFeedData` (hard-coded EN): "Error – Please create your pet profile first.", "Already Posted – You've already posted a daily update today!", "Daily video – Video posting isn't available for you today 🐾 — share a photo instead!", and **"Error – Could not save: <raw server/upload error message>"** (`src/hooks/useFeedData.js:121,133,235,242`) — raw technical text CAN leak there.
- **Modals / sheets / alerts opened:** Post composer modal, Bark modal, Post detail modal (sections below), Pet picker sheet / Add-dog modal (via header), Moderation menu (via detail/bark modal), delete-post alert (row 14).
- **Back / dismiss behaviour:** Feed is a tab root; there is no back. Modals are `Modal` (pageSheet for composer/detail → swipe down or X; Android hardware back closes via `onRequestClose`). Opening a bark thread from the detail modal CLOSES the detail modal first (`index.jsx:377-380`); opening a profile from the detail modal also closes it (`:381-386`).

---

### Feed header — `FeedHeader`
- **File:** `src/components/Feed/FeedHeader.jsx` · **Reached from:** top of Feed tab (`src/app/(tabs)/index.jsx:230`). Also embeds the pet switcher (shared with Health: "PetSwitcher variant=pill").
- **Gating / data needed:** none. Bell badge number = reminder notifications (local) + pending care-access requests + unread server notifications (`bellBadgeCount`, lines 51-55); server unread only counts while server flag `NOTIF_V2_ENABLED` is on (`src/hooks/useNotifications.js:20-24`). Icon buttons have NO accessibility labels (icon-only).
| # | Element (EN label / ES) | Type | Source | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | "PawPi" wordmark + coral paw mark | static | `src/components/Feed/FeedHeader.jsx:78-81` | Not tappable. | |
| 2 | 🔥 streak chip ("🔥 N") | static chip | `src/components/Feed/FeedHeader.jsx:83`, `src/components/Health/StreakChip.jsx:11-21` | Shows the active pet's Care-Ring streak; renders nothing when streak is 0. Not tappable. | |
| 3 | Search icon (magnifier) | header icon | `src/components/Feed/FeedHeader.jsx:87-89` | `router.push("/search")` → Search & Discover screen (card push). | |
| 4 | Messages icon (speech bubble) | header icon | `src/components/Feed/FeedHeader.jsx:91-93` | `router.push("/messages")` → pet DM inbox (modal; covered by another section). Entry point only. | |
| 5 | Bell icon + red/coral count badge | header icon | `src/components/Feed/FeedHeader.jsx:95-118` | `router.push("/notifications")` → Notifications modal. Badge shows combined unread count (capped label via `bellBadgeLabel`), hidden at 0. | |
| 6 | Pet switcher pill (active pet avatar + name + chevron; "Add your dog / Agregá tu perro" if no pet) | button | `src/components/Feed/FeedHeader.jsx:122-124`, `src/components/Pets/PetSwitcher.jsx:63-92` | Opens "My Dogs" pet-picker sheet. | |
- **Empty / loading / error states:** badge simply hidden at 0; a failed unread-count poll returns 0 silently; polls every 60 s.
- **Modals / sheets / alerts opened:** Pet picker sheet (next section).
- **Back / dismiss behaviour:** n/a.

---

### My Dogs picker sheet → Add a dog modal — `PetPickerSheet` / `AddDogModal`
- **File:** `src/components/Pets/PetPickerSheet.jsx`, `src/components/Pets/AddDogModal.jsx` (also reached from the Health header and Profile "My Dogs" row — same component) · **Reached from:** Feed header pet pill (`src/components/Pets/PetSwitcher.jsx:98-103`).
- **Gating / data needed:** none; lists the account's real dogs (`usePetProfile`). Switching the active pet changes the whole app scope (feed viewer pet, daily-prompt pet, Health, etc.) but the feed LOCK is per owner.
| # | Element (EN label / ES) | Type | Source | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | Dim backdrop | tap-away | `src/components/Pets/PetPickerSheet.jsx:40-51` | Closes sheet. | |
| 2 | Dog row (avatar, name, breed; coral border + ✓ on active) | list item | `src/components/Pets/PetPickerSheet.jsx:100-139` | `setCurrentPet(id)` then closes. Feed/Health refetch for that dog; DailyPromptCard now reads that dog's name/posted state. | |
| 3 | "Add a dog / Agregar un perro" (dashed button) | button | `src/components/Pets/PetPickerSheet.jsx:145-166`, `PetSwitcher.jsx:22-25` | Closes the sheet then opens the Add-dog full-screen modal. | |
| 4 | Add-dog: X (top-left) | header icon | `src/components/Pets/AddDogModal.jsx:182-184` | Closes modal and clears the form (no confirm). | |
| 5 | Add-dog: "Add photo / Change photo" | button | `src/components/Pets/AddDogModal.jsx:225-244,89-108` | iOS ActionSheet: Cancel / Take photo / Choose from gallery; Android Alert with same options. Camera path asks camera permission (Alert on denial, lines 72-80); gallery uses 1:1 crop. | |
| 6 | Add-dog: Name* (text input) | text input | `src/components/Pets/AddDogModal.jsx:248-254` | Required; Save stays disabled until non-empty (`canSave`, line 160). | |
| 7 | Add-dog: Breed (searchable picker) | picker | `src/components/Pets/AddDogModal.jsx:257-262` | Opens `BreedPicker` (list + "Mixed breed" + custom). | |
| 8 | Add-dog: Gender Male / Female / Unknown | toggle chips | `src/components/Pets/AddDogModal.jsx:268-299` | Single select (coral when selected). | |
| 9 | Add-dog: Weight (decimal) + kg / lbs | text input + toggle | `src/components/Pets/AddDogModal.jsx:313-351` | Digits and "." only; unit defaults per locale. | |
| 10 | Add-dog: Birthday | date field | `src/components/Pets/AddDogModal.jsx:358-368` | Native date picker, max today; canonical YYYY-MM-DD. | |
| 11 | Add-dog: Notes | multiline input | `src/components/Pets/AddDogModal.jsx:373-380` | Free text. | |
| 12 | Add-dog: Save ✓ / Guardar | button | `src/components/Pets/AddDogModal.jsx:398-423`, `handleSave 110-157` | Uploads photo (`POST /api/upload`) then `POST /api/pets`; sets the new dog active; success Alert ("saved"), closes. Failure Alert "Could not save" (generic `addDog.errorBody`, no raw text). Name-missing Alert if empty. | ⚠️ creates a real pet record on the account |
- **Empty / loading / error states:** picker shows a coral spinner while the list loads; no explicit error row. Add-dog errors → generic Alert.
- **Modals / sheets / alerts opened:** Add-dog modal; camera permission alert; BreedPicker; DateField.
- **Back / dismiss behaviour:** backdrop tap / Android back closes the sheet; Add-dog X or Android back closes and clears.

---

### Getting started card — `GettingStartedCard`
- **File:** `src/components/Home/GettingStartedCard.jsx` (state in `src/hooks/useGettingStarted.js`, rules in `src/utils/gettingStarted.js`) · **Reached from:** top of Feed (`src/app/(tabs)/index.jsx:303`).
- **Gating / data needed:** needs an active pet. Shown until ALL 5 items are done (derived from real data), then a ~3.6 s celebration plays once and the card retires for good (AsyncStorage flag `pawpi.gettingStartedCelebrated`). A fully set-up account will not see it. Done items stay tappable.
| # | Element (EN label / ES) | Type | Source | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | % badge + "Getting started / Primeros pasos" + "N of 5 done" + progress bar | static | `src/components/Home/GettingStartedCard.jsx:78-113` | Display only. | |
| 2 | "Set up your dog's profile / Completá el perfil de tu perro" | list item | `src/components/Home/GettingStartedCard.jsx:49-51` | `router.push("/(tabs)/more/profile-edit")` (done = name + breed + age + gender≠unknown + weight). | |
| 3 | "Set your first reminder / Creá tu primer recordatorio" | list item | `src/components/Home/GettingStartedCard.jsx:52-54` | `router.push("/(tabs)/more/reminders")` (done = ≥1 routine). | |
| 4 | "Log your first meal / Registrá su primera comida" | list item | `src/components/Home/GettingStartedCard.jsx:55-57` | `router.push("/(tabs)/health")` (done = ≥1 food log). | |
| 5 | "Share your first post / Compartí tu primera publicación" | list item | `src/components/Home/GettingStartedCard.jsx:58-60` | Opens the Post composer modal (done = pet has ≥1 post). | |
| 6 | "Turn on notifications / Activá las notificaciones" | list item | `src/components/Home/GettingStartedCard.jsx:61-63`, `src/utils/notifications.js:72-97` | Shows Alert "🔔 Enable Reminders" (Maybe later / Enable reminders) → iOS system notification permission prompt; if granted, schedules the recurring daily-return local reminder. | ⚠️ triggers OS permission + schedules recurring local notifications |
| 7 | Celebration card "You're all set! 🎉" | static | `src/components/Home/GettingStartedCard.jsx:201-233` | Auto-dismisses after ~3.6 s. | |
- **Empty / loading / error states:** hidden when no pet. While celebration flag loads it assumes "already celebrated" (no flash). Individual reads that fail simply leave the item unticked.
- **Modals / sheets / alerts opened:** Post composer; "Enable Reminders" Alert (hard-coded EN) + OS permission dialog.
- **Back / dismiss behaviour:** Row 2/3 push onto the Profile (More) tab stack; Back returns to that tab's index rather than to Feed (known More-stack anchoring in `src/app/(tabs)/more/_layout.jsx`). Row 4 switches to Health tab.

---

### Daily prompt card ("Today's pet moment") — `DailyPromptCard`
- **File:** `src/components/Feed/DailyPromptCard.jsx` · **Reached from:** Feed top (`src/app/(tabs)/index.jsx:304-310`).
- **Gating / data needed:** per ACTIVE pet (`hasPostedToday`). Two states: not posted today / already posted today.
| # | Element (EN label / ES) | Type | Source | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | Title "Today's pet moment / Momento mascotero de hoy" + "What is {pet} up to right now? 🐶" | static | `src/components/Feed/DailyPromptCard.jsx:53-60` | Display only. | |
| 2 | "Post today's photo / Postear la foto de hoy" (camera icon, coral) | button | `src/components/Feed/DailyPromptCard.jsx:65-84` | Opens Post composer modal. Only shown when the active pet has NOT posted today. | |
| 3 | "Don't forget {pet}'s daily update!" sand strip | static | `src/components/Feed/DailyPromptCard.jsx:85-101` | Display only. | |
| 4 | "✨ Today's update posted / Momento de hoy posteado" + "Come back tomorrow…" | static | `src/components/Feed/DailyPromptCard.jsx:104-126` | Replaces the button once posted. | |
| 5 | "View today's post / Ver el post de hoy" (sage) | button | `src/components/Feed/DailyPromptCard.jsx:127-141`, `src/app/(tabs)/index.jsx:182-189` | Opens the Post detail modal on today's post (feed copy, or API copy if feed not yet refetched). | |
- **Empty / loading / error states:** n/a.
- **Modals / sheets / alerts opened:** Post composer; Post detail modal.
- **Back / dismiss behaviour:** n/a.

---

### Locked feed ("post to unlock") — `LockedFeedOverlay` + `PostCard locked`
- **File:** `src/components/Feed/LockedFeedOverlay.jsx`, `src/components/Feed/PostCard.jsx:276-428` · **Reached from:** Feed when the owner has not posted today.
- **Gating / data needed:** locked until ANY of the owner's dogs posts today's daily moment (or an existing daily is detected). Feed still loads and scrolls; photos are blurred and captions replaced by a grey bar. Everything on a locked card opens the composer — no paw/bark/share/profile/detail access. Followed-pet milestone cards are hidden while locked.
| # | Element (EN label / ES) | Type | Source | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | Card header (avatar, pet name, @handle, "by owner", tag chip, time) | list item | `src/components/Feed/PostCard.jsx:193-260` | Identity is visible; tap → opens the Post composer (NOT the profile). | |
| 2 | Blurred photo/video poster | list item | `src/components/Feed/PostCard.jsx:277-313` | Tap → Post composer. Under Reduce Transparency or no media: near-opaque sand wash instead of blur. | |
| 3 | Centre scrim: camera+lock icon, "See {pet}'s day / ¿Qué hizo {pet} hoy?", rotating subline (4 variants e.g. "Post today's moment to see what {pet} is up to 🐾") | static | `src/components/Feed/PostCard.jsx:319-391` | Text only. | |
| 4 | "Post today's moment / Postear el momento de hoy" (pulsing coral pill) | button | `src/components/Feed/PostCard.jsx:394-425` | Light haptic + opens the Post composer. | |
| 5 | Grey placeholder bar where the caption would be | list item | `src/components/Feed/PostCard.jsx:474-490` | Tap → Post composer. | |
| 6 | Zero-post state: 🐾 card + "Post today's photo" | button | `src/components/Feed/LockedFeedOverlay.jsx:56-111` | Opens Post composer. | |
- **Empty / loading / error states:** see Feed screen. The locked feed uses the same posts query, so on an outage the Feed-level error + Try again is shown.
- **Modals / sheets / alerts opened:** Post composer.
- **Back / dismiss behaviour:** n/a.

---

### Unlocked feed + Post card — `UnlockedFeed` / `PostCard`
- **File:** `src/components/Feed/UnlockedFeed.jsx`, `src/components/Feed/PostCard.jsx`, `PawablePhoto.jsx`, `FeedVideo.jsx` · **Reached from:** Feed when unlocked.
- **Gating / data needed:** unlocked (own dog posted today). Order = "PET FRIENDS' MOMENTS" list; Following posts first, then a "SUGGESTED FOR YOU" divider (shown only if there is followed content above it, `UnlockedFeed.jsx:74-106`). Provider / adoption / business suggestion cards are interleaved after every 4th post, max 3 (`src/utils/feed/interleaveSuggestions.js:18-19`). A pet's same-day posts from 2+ caregivers collapse into one DayCard; a lone daily is a normal PostCard (`UnlockedFeed.jsx:165-201`). Birthday/gotcha-day posts get a thicker coral frame, 🎂, a ribbon + confetti and a "Share this 🎉" button (`PostCard.jsx:172-177,449-468`).
| # | Element (EN label / ES) | Type | Source | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | "PET FRIENDS' MOMENTS / MOMENTOS DE AMIGOS PELUDOS" label | static | `src/components/Feed/UnlockedFeed.jsx:110-124` | Section label. | |
| 2 | "SUGGESTED FOR YOU / SUGERIDOS PARA VOS" divider | static | `src/components/Feed/UnlockedFeed.jsx:89-106` | Section label. | |
| 3 | Post card header (avatar, pet name, 🎂 / 🔥N, @handle, "by {owner}" (hard-coded EN), tag chip "Daily moment / Momento diario", relative time) | list item | `src/components/Feed/PostCard.jsx:193-260` | Tap → `/pet-profile` of that pet. | |
| 4 | Photo — single tap | image | `src/components/Feed/PostCard.jsx:440-447`, `src/components/Feed/PawablePhoto.jsx:74-95` | After a 260 ms wait (to rule out a double-tap) opens `/pet-profile` of that pet. | |
| 5 | Photo — double tap | gesture | `src/components/Feed/PostCard.jsx:108-113`, `PawablePhoto.jsx:76-82` | Big coral paw pops over the photo; sends a paw (idempotent: never un-paws; no-op if already pawed). `POST /api/posts/:id/paw`. | 📤 paw notification to the post's owner |
| 6 | Video post: tap | video | `src/components/Feed/FeedVideo.jsx:76-94,59-74` | Play/pause inline WITH SOUND (play-button overlay when idle). No autoplay on scroll. | |
| 7 | Video post: double tap | gesture | `src/components/Feed/PostCard.jsx:432-438`, `FeedVideo.jsx:76-83` | Same paw as photo double-tap. | 📤 |
| 8 | Caption (name bold + text, 2 lines) | button | `src/components/Feed/PostCard.jsx:493-507` | Opens Post detail modal. | |
| 9 | "N paws" paw button (hard-coded EN; fills coral when pawed) | button | `src/components/Feed/PostCard.jsx:520-538`, `handlePawPress 92-102`, `src/hooks/useFeedPosts.js:195-215` | Toggle: `POST /api/posts/:id/paw` to paw, `DELETE …/paw` to un-paw; optimistic count; disabled while pending. On failure Alert "Error / Could not save. Please try again.". | 📤 paw notification to the owner of a real user's post |
| 10 | "N barks" megaphone button (hard-coded EN) | button | `src/components/Feed/PostCard.jsx:540-548` | Opens the Bark (comments) bottom sheet for that post. | |
| 11 | Share icon (top-right of action row) | button | `src/components/Feed/PostCard.jsx:554`, `DailyShareButton.jsx:70-123` | Renders an off-screen 9:16 branded card of the photo and opens the iOS/Android share sheet (Instagram Stories, X, Messages, Save…). Silently does nothing if no photo or capture times out (5 s). | ⚠️ opens OS share sheet — nothing is sent unless the tester picks a target |
| 12 | Milestone day: "Share this 🎉 / Compartir esto 🎉" | button | `src/components/Feed/PostCard.jsx:459-467` | Same share flow as row 11. Only on birthday / gotcha-day posts. | ⚠️ |
| 13 | Milestone ribbon + confetti | decoration | `src/components/Feed/PostCard.jsx:450-455`, `MilestoneRibbon.jsx`, `Confetti.jsx` | Display only, not tappable. | |
| 14 | Unlocked zero-post empty state | static | `src/components/Feed/UnlockedFeed.jsx:219-234` | "No pet moments yet!". | |
- **Empty / loading / error states:** see Feed screen. Paw failure → Alert "Error / Could not save. Please try again." (`feed.errorSaveBody`).
- **Modals / sheets / alerts opened:** Post detail modal, Bark modal, OS share sheet.
- **Back / dismiss behaviour:** n/a (inline list).

---

### Day card (multi-caregiver day) — `DayCard`
- **File:** `src/components/Feed/DayCard.jsx` · **Reached from:** unlocked Feed (`src/components/Feed/UnlockedFeed.jsx:191-201`).
- **Gating / data needed:** only when ≥2 caregivers posted a daily moment for the same pet on the same day (otherwise a normal PostCard is shown, `UnlockedFeed.jsx:173-190`). Needs a household/caregiver account with 2+ posters to test.
| # | Element (EN label / ES) | Type | Source | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | Header: pet avatar, name, 🔥N, @handle, "{N} caregivers shared today 🐾", "Daily moment" chip, time | static | `src/components/Feed/DayCard.jsx:62-96` | Display only (not tappable, unlike PostCard header). | |
| 2 | Photo carousel | swipe (horizontal paging) | `src/components/Feed/DayCard.jsx:99-116` | Swipe between each caregiver's photo; dots (119-125) show position; caption/author below follow the active slide. | |
| 3 | Author + caption + paw/bark counters block | button | `src/components/Feed/DayCard.jsx:129-156` | Tap opens the Post detail modal for the currently shown slide's post. Counters (paw filled only if that post is pawed; bark count) are display-only here — pawing happens in the detail modal. | |
- **Empty / loading / error states:** returns null when no slides.
- **Modals / sheets / alerts opened:** Post detail modal.
- **Back / dismiss behaviour:** n/a.

---

### Business / Discover-a-business / Adopt-me cards — `BusinessPostCard`, `ProviderFeedCard`, `AdoptionFeedCard`
- **File:** `src/components/Feed/BusinessPostCard.jsx`, `ProviderFeedCard.jsx`, `AdoptionFeedCard.jsx` · **Reached from:** unlocked Feed (`src/components/Feed/UnlockedFeed.jsx:134-162`).
- **Gating / data needed:** unlocked feed only. Business post = a daily moment from a business the user FOLLOWS. Provider / adoption suggestions come from `GET /api/feed/suggestions` (published providers + available adoptable dogs, public fields only); none appear if the list is empty or the feed has <4 posts. All three are tap-to-open cards; they show no paw/comment buttons (counts are display-only).
| # | Element (EN label / ES) | Type | Source | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | Business post: header (logo, "BUSINESS YOU FOLLOW / NEGOCIO QUE SEGUÍS", name, @slug · time) | list item | `src/components/Feed/BusinessPostCard.jsx:57-109` | Opens `/service/provider-post` (business post detail). | |
| 2 | Business post: video (inline player) | video | `src/components/Feed/BusinessPostCard.jsx:112-119`, `FeedVideo.jsx` | Single tap play/pause with sound; DOUBLE tap opens the post detail (not a paw, `onDoubleTap={onPress}`). | |
| 3 | Business post: first image | image | `src/components/Feed/BusinessPostCard.jsx:120-127` | Opens post detail. | |
| 4 | Business post: caption + "N paws / N comments" row | button | `src/components/Feed/BusinessPostCard.jsx:131-171` | Opens post detail (paws/comments are done there). | |
| 5 | Provider suggestion card (dashed sage, "DISCOVER A BUSINESS / DESCUBRÍ UN NEGOCIO", logo, name, type, ★ rating or "New / Nuevo", chevron) | list item | `src/components/Feed/ProviderFeedCard.jsx:20-131` | Opens `/service/provider?slug=…` (public business page). | |
| 6 | Adoption suggestion card (dashed peach, "ADOPT ME / ADOPTAME", photo or dog icon, name, breed · age · gender · size, "at {shelter} · Free to adopt / fee", chevron) | list item | `src/components/Feed/AdoptionFeedCard.jsx:42-127` | Opens `/service/adoption?listingId&providerId` (that dog's listing). Fee shows e.g. "ARS 1500.00"; 0 → "Free to adopt". | |
- **Empty / loading / error states:** a failed suggestions fetch just yields no cards.
- **Modals / sheets / alerts opened:** none (navigation into `service/*` root stack; Back returns to Feed).
- **Back / dismiss behaviour:** root-level `service/` stack, so Back returns to the Feed scroll position.

---

### Milestone event card ("It's {pet}'s Birthday!") — `FollowedMilestones` / `MilestoneEventCard`
- **File:** `src/components/Feed/MilestoneEventCard.jsx` · **Reached from:** unlocked Feed (`src/app/(tabs)/index.jsx:314`).
- **Gating / data needed:** only appears when a pet the active pet FOLLOWS has a real birthday / adoption ("gotcha") day today (`GET /api/feed/milestones`). Likely absent during QA; needs a followed pet with today's date as birthday.
| # | Element (EN label / ES) | Type | Source | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | Card row (avatar or 🐾, "🎂 It's {name}'s Birthday!" / "🎉 It's {name}'s Gotcha Day!", "N years") | list item | `src/components/Feed/MilestoneEventCard.jsx:26-30,40-52` | `router.push("/pet-profile")` for that pet. | |
| 2 | "Send a paw 🐾 / Enviá una patita 🐾" | button | `src/components/Feed/MilestoneEventCard.jsx:53-64,32-36` | Pays one paw on that pet's post of today (`POST /api/posts/:id/paw`); button turns green "🐾 ✓" and is disabled. Only shown when that pet has posted today. | 📤 paw notification to a real user |
- **Empty / loading / error states:** renders nothing when there are no milestones.
- **Modals / sheets / alerts opened:** none.
- **Back / dismiss behaviour:** Back from pet profile returns to Feed.

---

### Post composer ("Daily update") — `PostComposerModal`
- **File:** `src/components/Feed/PostComposerModal.jsx` (submit handler: `handlePost` in `src/hooks/useFeedData.js:108-254`) · **Reached from:** Daily prompt "Post today's photo", every locked-feed CTA, Getting-started "Share your first post".
- **Gating / data needed:** needs an active pet and the pet must not have posted today (else Alert "Already Posted"). **Camera only — there is NO photo-library option** (`takePhoto` uses `launchCameraAsync`, 4:5 crop). A **video** button appears only for "lucky" users when `GET /api/posts/video-eligibility` returns `eligible: true` (≤15 s video; server re-checks). Sheet resets every time it opens.
| # | Element (EN label / ES) | Type | Source | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | X (step 1 header) | header icon | `src/components/Feed/PostComposerModal.jsx:240-242` | Closes the composer. | |
| 2 | Header title "Add a photo / Agregar una foto" (step 1) → "Daily update / Actualización diaria" (step 2) | static | `src/components/Feed/PostComposerModal.jsx:244-246` | Display. | |
| 3 | 🐾 heading "Today's pet moment / Momento del día" + subheading | static | `src/components/Feed/PostComposerModal.jsx:253-271` | Display. | |
| 4 | "🎉 You're one of today's lucky users!" banner | static | `src/components/Feed/PostComposerModal.jsx:276,35-74` | Shown only when video-eligible; explains a short video is allowed today. | |
| 5 | "Take a photo / Sacar una foto" | button | `src/components/Feed/PostComposerModal.jsx:278-296`, `takePhoto 155-174` | Asks camera permission (denied → Alert "Camera access needed / Please allow camera access in settings."); opens camera; on capture goes to step 2. Simulator has no camera. | |
| 6 | "Record a video / Grabar un video" + "Today only" chip | button | `src/components/Feed/PostComposerModal.jsx:301-340`, `takeVideo 176-195` | Only if eligible. Opens camera in video mode (15 s max); on capture goes to step 2 (looping muted preview). | |
| 7 | "‹ Back / Atrás" (step 2 header) | button | `src/components/Feed/PostComposerModal.jsx:229-238` | Returns to step 1 (media is kept until you retake). | |
| 8 | Camera chip on top-right of preview ("Change photo/video") | button | `src/components/Feed/PostComposerModal.jsx:378-396` | Returns to step 1 to retake. | |
| 9 | Caption "Add a caption for {pet} ✍️" (multiline, optional) | text input | `src/components/Feed/PostComposerModal.jsx:400-430` | Free text; no max length enforced here. | |
| 10 | "Post daily update 🐾 / Publicar actualización diaria 🐾" | button | `src/components/Feed/PostComposerModal.jsx:432-447`, `handleSubmit 197-201` | Closes the sheet immediately and uploads in the background: `POST /api/upload` (media) [+ thumbnail upload for video] then `POST /api/posts` {pet_id, image_url / video_url, caption, is_daily_update:true, post_date}. "Uploading photo…" pill shows; on success the feed refetches and UNLOCKS. | 🌍 publishes a public post (visible to followers + suggested feeds) and spends the user's one daily post |
- **Empty / loading / error states:** upload/post errors surface as Alerts after the sheet has already closed (see Feed screen "Posting errors"); the raw message can leak ("Could not save: …").
- **Modals / sheets / alerts opened:** camera permission Alert; iOS camera UI.
- **Back / dismiss behaviour:** pageSheet — swipe down / X / Android back closes (`onRequestClose`). Closing discards the draft.

---

### Post detail modal ("Pet moment") — `PostDetailModal`
- **File:** `src/components/Feed/PostDetailModal.jsx` · **Reached from:** tapping a post caption, "View today's post", a DayCard's author block (`src/app/(tabs)/index.jsx:333,363-387`).
- **Gating / data needed:** a post. Owner-only controls (Delete, edit caption, add caption) appear only on posts of ANY of the viewer's own pets (`canDelete/canEdit = ownsDetailPost`). Report/Block menu appears only on other people's posts. Title and many labels are hard-coded EN.
| # | Element (EN label / ES) | Type | Source | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | X (top-left) | header icon | `src/components/Feed/PostDetailModal.jsx:159-161` | Closes the modal. | |
| 2 | Title "Pet moment" (hard-coded EN) | static | `src/components/Feed/PostDetailModal.jsx:162-164` | Display. | |
| 3 | Trash icon (own posts only; a11y "Delete post") | header icon | `src/components/Feed/PostDetailModal.jsx:166-170`, `src/app/(tabs)/index.jsx:195-213` | Confirm Alert "Delete post?" → Delete → `DELETE /api/posts/:id`; closes modal, refetches feed + daily lock. | 🗑️ |
| 4 | Share icon | header icon | `src/components/Feed/PostDetailModal.jsx:172`, `DailyShareButton.jsx` | Branded story card + OS share sheet. | ⚠️ opens OS share sheet |
| 5 | "···" More options (other people's posts only) | header icon | `src/components/Feed/PostDetailModal.jsx:174-179` | Opens Report / Block sheet (see Moderation menu). | ⚠️ |
| 6 | Avatar + name + @handle + "by owner · time" + tag chip | button | `src/components/Feed/PostDetailModal.jsx:188-238` | Closes the modal and opens `/pet-profile` of that pet. | |
| 7 | Photo (double tap = paw) / video (tap play, double tap = paw) | image/video | `src/components/Feed/PostDetailModal.jsx:242-259,103-105` | Double tap paws (no-op if already pawed). | 📤 |
| 8 | Pencil next to caption (own posts) | icon button | `src/components/Feed/PostDetailModal.jsx:330-340` | Switches caption to an editor. | |
| 9 | "Add a caption ✍️" (own post with empty caption) | button | `src/components/Feed/PostDetailModal.jsx:346-362` | Opens the same editor (hard-coded EN). | |
| 10 | Caption editor (multiline, max 2000) | text input | `src/components/Feed/PostDetailModal.jsx:265-287` | Edits text. | |
| 11 | Cancel / Save (hard-coded EN; "Saving…") | buttons | `src/components/Feed/PostDetailModal.jsx:296-315`, `saveEditCaption 118-130` | Save → `PATCH /api/posts/:id` {caption} (`useUpdatePostCaption`); on error Alert "Couldn't save / Please try again." | 🌍 edits a public post's caption |
| 12 | Paw button "N paws" | button | `src/components/Feed/PostDetailModal.jsx:376-394`, `src/app/(tabs)/index.jsx:84-91` | Toggles paw (POST/DELETE `/api/posts/:id/paw`); the feed card's fill + count update together. | 📤 |
| 13 | "N barks" megaphone | button | `src/components/Feed/PostDetailModal.jsx:396-405` | Closes detail and opens the Bark sheet. | |
| 14 | "Barks (N)" preview list (avatar, @handle, text) | list | `src/components/Feed/PostDetailModal.jsx:409-463` | Read-only preview of comments (spinner while loading; 🐾 "No barks yet"). | |
| 15 | "Add a bark 🐾" | button | `src/components/Feed/PostDetailModal.jsx:464-480` | Closes detail and opens the Bark sheet. | |
- **Empty / loading / error states:** barks: spinner / "No barks yet" (hard-coded EN); bark-load failure shows the same "No barks yet" (no error UI).
- **Modals / sheets / alerts opened:** Delete alert, Moderation sheet, Bark sheet, share sheet, "Couldn't save" alert.
- **Back / dismiss behaviour:** pageSheet; swipe down / X / Android back. Navigating to profile or barks dismisses it first.

---

### Barks (comments) sheet — `BarkModal`
- **File:** `src/components/Feed/BarkModal.jsx` · **Reached from:** "N barks" button on a card or in the detail modal (`src/app/(tabs)/index.jsx:355-360`).
- **Gating / data needed:** a post. A "bark" is a public comment posted AS the active pet (shown as @handle). Own comments show a trash icon; others show the Report/Block menu.
| # | Element (EN label / ES) | Type | Source | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | Dim backdrop | tap-away | `src/components/Feed/BarkModal.jsx:101-112` | Closes the sheet. | |
| 2 | Post header (pet avatar, name, caption line, "N barks" chip) | static | `src/components/Feed/BarkModal.jsx:138-203` | Display. | |
| 3 | Comments list (avatar, @handle, date, text; spinner; 🐾 "Be the first to bark!") | list | `src/components/Feed/BarkModal.jsx:206-306` | Scrollable (max 280 pt). Date via `toLocaleDateString()` (device format). | |
| 4 | Trash icon on MY comment | icon button | `src/components/Feed/BarkModal.jsx:272-281`, `handleDeleteBark 50-66` | Alert "Delete comment? / This will remove your comment for everyone. This can't be undone." Cancel / Delete → `DELETE /api/posts/:id/barks/:barkId`. | 🗑️ |
| 5 | "···" on SOMEONE ELSE's comment | icon button | `src/components/Feed/BarkModal.jsx:282-290` | Report / Block sheet (targetType "bark"). | ⚠️ |
| 6 | Input "Leave a bark for {name}… / Dejale un ladrido a {name}…" | text input (multiline, max 90 pt) | `src/components/Feed/BarkModal.jsx:321-345` | Typing enables Send; disabled while sending. | |
| 7 | Send (paper-plane) | button | `src/components/Feed/BarkModal.jsx:346-366`, `handleSend 77-90` | `POST /api/posts/:id/barks` {text}; clears input; list + counts refresh. Error → Alert "Error / <server message or 'Could not save. Please try again.'>". | 🌍📤 public comment, notifies the post owner |
- **Empty / loading / error states:** spinner; "Be the first to bark!"; list-load failure falls through to the empty text (no error UI); send failure Alert may include the raw server message.
- **Modals / sheets / alerts opened:** delete-comment Alert; Moderation sheet.
- **Back / dismiss behaviour:** backdrop tap / Android back; keyboard-avoiding bottom sheet (80% max height).

---

### Report / Block menu — `ModerationMenu`
- **File:** `src/components/moderation/ModerationMenu.jsx` (API in `src/hooks/useModeration.js`) · **Reached from:** the "···" on other people's posts (detail modal), comments (bark sheet), events (Events screen); also used elsewhere in the app.
- **Gating / data needed:** never rendered on your own content; renders nothing if there is neither a target to report nor an author to block.
| # | Element (EN label / ES) | Type | Source | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | "···" trigger (a11y "More options / Más opciones") | icon button | `src/components/moderation/ModerationMenu.jsx:120-127` | Opens a bottom sheet. | |
| 2 | "Report / Reportar" | button | `src/components/moderation/ModerationMenu.jsx:148-155` | Switches sheet to the reason list. | |
| 3 | Reason rows: Spam, Harassment, Hate, Sexual, Violence, Other (title "Why are you reporting this?") | buttons | `src/components/moderation/ModerationMenu.jsx:15-24,172-194`, `submitReport 75-86` | `POST /api/reports` {target_type, target_id, reason}; sheet closes; Alert "Thanks for reporting / Our team will review this within 24 hours." Failure → Alert "Couldn't report" with the server message. Double-report is a no-op server-side. | ⚠️ sends a real report to the moderation queue |
| 4 | "Block user / Bloquear usuario" (red) | button | `src/components/moderation/ModerationMenu.jsx:156-164`, `confirmBlock 88-115` | Confirm Alert "Block this user?" (Cancel / **Block**) → `POST /api/blocks` {blocked_user_id}; Alert "User blocked / Their content will disappear from your app."; clears social caches so their posts vanish. | ⚠️ blocks a real account (mutual, hides messages/posts); undo is outside this area |
| 5 | "Cancel / Cancelar"; back chevron "‹" in reason list; dim backdrop | buttons | `src/components/moderation/ModerationMenu.jsx:165-170,174-179,130-134` | Closes / returns to actions. | |
- **Empty / loading / error states:** n/a.
- **Modals / sheets / alerts opened:** the sheet itself; confirm-block Alert; result Alerts.
- **Back / dismiss behaviour:** backdrop tap / Android back / Cancel.

---

### Share-card helpers (used by Feed, Memories, Wrapped, Weekly digest, pet profile) — `DailyShareButton`, `MemoryShareButton`, `ShareCardButton`, `ShareCardDeck`
- **File:** `src/components/Feed/DailyShareButton.jsx`, `MemoryShareButton.jsx`, `ShareCardButton.jsx`, `ShareCardDeck.jsx`, `Shareable*Card.jsx` · **Reached from:** the Share buttons listed on each screen. `ShareCardDeck` ("Share a card" sheet) is opened only from the pet profile (`src/app/pet-profile.jsx:19`), not from the Feed.
- **Gating / data needed:** none. All four: tap → an off-screen branded 9:16 card is mounted, waits for the photo to decode (5 s timeout, then silently aborts), is captured as PNG and handed to `expo-sharing` (OS share sheet). Any failure is a silent no-op — a tester may see "nothing happens". The Daily share is disabled while locked / when there is no photo.
| # | Element (EN label / ES) | Type | Source | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | Daily share icon / "Share this 🎉" pill | button | `src/components/Feed/DailyShareButton.jsx:70-104` | OS share sheet with the PNG. | ⚠️ |
| 2 | Memory share ("Share" / "Share slide" / "Share {name}'s week") | button | `src/components/Feed/MemoryShareButton.jsx:60-84` | OS share sheet with the card (always visible, no lock check). | ⚠️ |
| 3 | Share-deck "Share" (1080×1920) | button | `src/components/Feed/ShareCardButton.jsx:60-92` | OS share sheet; disabled (sand) when the stat is unavailable. | ⚠️ |
| 4 | Share-deck sheet: title "Share a card", X, card rows ("Locked" pill when stat unavailable) | modal | `src/components/Feed/ShareCardDeck.jsx:34-63` | Lists streak / week-in-walks / milestone / pet-of-the-day / care-recap cards built from real stats (`GET /api/pets/:id/share-stats`). | |
- **Empty / loading / error states:** unavailable cards show honest "unlock" hints, never fake numbers.
- **Modals / sheets / alerts opened:** OS share sheet.
- **Back / dismiss behaviour:** dismiss the share sheet to return.

---

### Notifications (bell) — `/notifications`
- **File:** `src/app/notifications.jsx` · **Reached from:** Feed header bell (`src/components/Feed/FeedHeader.jsx:95`); in-app push-tap fallback (`src/utils/notificationDeepLink.js:57-62` opens the inbox for server pushes). Registered as a **modal** (`src/app/_layout.jsx:136-139`).
- **Gating / data needed:** none. Merges 4 sources newest-first: pending care-access requests (vet/business asking to see records), recent vet notes (<14 days, active pet), real server notifications (`GET /api/notifications`: paw, bark, follow, welcome, pack/boop, bookings, adoption, walk-request, weekly_digest, winback, biz_*), and local reminder notifications. Screen title, "Mark all read", filter chips, timestamps ("5m ago") and empty text are hard-coded English; "Requests" and "Bookings" chips are translated. There is **no pull-to-refresh**.
| # | Element (EN label / ES) | Type | Source | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | X (top-left) | header icon | `src/app/notifications.jsx:614-616` | `router.back()` closes the modal. | |
| 2 | "Mark all read" (coral) | button | `src/app/notifications.jsx:620-624`, `handleMarkAllRead 590-593` | Marks local reminder notifications read and `POST /api/notifications/read` {all:true}; unread dots + header badge clear. | |
| 3 | Filter chips: All · Requests [Solicitudes] · Bookings [Reservas] · Walks · Feeding · Paws · Barks · Training | chips (horizontal scroll) | `src/app/notifications.jsx:42-51,645-671,518-530` | Client-side filter by type. Requests = access requests only; Bookings = the 4 booking types; Walks/Feeding/Training = local reminder types; Paws/Barks = social types. Other types (follow, adoption, digest) show only under All. | |
| 4 | Care-access request row ("{provider} wants access to {pet}'s records") | list item | `src/app/notifications.jsx:101-113,533-537` | `router.push("/(tabs)/more/data-access")` where the owner approves/denies. | |
| 5 | Vet-note row ("{vet} added a note to {pet}") | list item | `src/app/notifications.jsx:87-99,539-543` | `router.push("/(tabs)/health")` (Vet Record). | |
| 6 | Booking rows (requested / confirmed / declined / cancelled) | list item | `src/app/notifications.jsx:120-145,547-552` | Marks read (`POST /api/notifications/read` {ids}) then `router.push("/service/booking-summary", {id})`. | |
| 7 | Adoption application rows (under review / approved / declined) | list item | `src/app/notifications.jsx:150-162,553-558` | Marks read; `router.push("/service/adoption", {tab:"applications"})`. | |
| 8 | Walk-request rows (targeted / broadcast / accepted / taken) | list item | `src/app/notifications.jsx:167-186,559-561` | Accepted → booking summary (owner); others → `router.push("/walker-walks")` (walker workspace). | |
| 9 | Weekly-digest row ("{pet}'s Week") | list item | `src/app/notifications.jsx:191-211,562-564` | Marks read; opens `/weekly-digest`. | |
| 10 | Win-back row | list item | `src/app/notifications.jsx:216-235,565-567` | Marks read; opens `/welcome-back`. | |
| 11 | Follow row ("@user — New follower") | list item | `src/app/notifications.jsx:389,568-572` | Marks read; opens `/pet-profile` of the followed pet (`subject_ref`). | |
| 12 | Paw / bark / welcome / pack_invite / pack_accepted / boop / business (biz_*) rows | list item | `src/app/notifications.jsx:352-391,573-575` | Marks read, then `router.back()` (closes the modal; there is no post deep-link). | |
| 13 | Local reminder row (feeding, walk, medication, vaccine… with coloured "action" pill) | list item | `src/app/notifications.jsx:579-587,843-865`, `src/utils/notificationDeepLink.js:35-39` | Marks read; opens `/(tabs)/health?section=today` (vaccine / vet appointment → `section=vet-record`). | |
- **Empty / loading / error states:** spinner while loading with nothing to show (681-684); error: paw mark + "Couldn't load your notifications. Check your connection and try again." + Try again (685-708, `notifications-error`); empty: paw mark + "No new notifications yet / It's quiet here for now." (709-733). Unread rows have a coral dot and coral border.
- **Modals / sheets / alerts opened:** none (navigates away).
- **Back / dismiss behaviour:** X or swipe-down modal dismissal. NOTE: rows that push a route (booking, profile, etc.) navigate from inside the modal; verify on device whether Back returns to the Notifications modal or to the Feed.

---

### Search & Discover — `/search`
- **File:** `src/app/search.jsx` · **Reached from:** Feed header magnifier (`src/components/Feed/FeedHeader.jsx:87`). Registered as a normal card push (`src/app/_layout.jsx:145`).
- **Gating / data needed:** none. Query < 2 chars (after a 300 ms debounce) shows **Discover** (`GET /api/discover?limit=…`: popular profiles + popular moments); ≥ 2 chars shows **Search** (`GET /api/search?q=` → pets, businesses, owners). Search field auto-focuses (keyboard opens on entry).
| # | Element (EN label / ES) | Type | Source | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | ‹ Back chevron (a11y "Back") | header icon | `src/app/search.jsx:70-77` | `router.back()` to Feed. | |
| 2 | Title "Search & Discover / Buscar y descubrir" | static | `src/app/search.jsx:78-87` | Display. | |
| 3 | Search field "Search pets, breeds, owners, or businesses… / Buscá mascotas, razas, dueños o negocios…" | text input | `src/app/search.jsx:105-112` | Live search once ≥2 chars. | |
| 4 | Clear (X, a11y "Clear search") | icon button | `src/app/search.jsx:113-121` | Empties the query → back to Discover. | |
| 5 | PETS rows (avatar, name, breed • @handle) | list item | `src/app/search.jsx:238-249,43-44` | `router.push("/pet-profile", {petId})`. | |
| 6 | BUSINESSES rows (logo/store icon, name, provider type) | list item | `src/app/search.jsx:260-270,45-46` | `router.push("/service/provider", {slug})`. | |
| 7 | PET PARENTS (owners) rows | list item | `src/app/search.jsx:281-290` | NOT tappable (no onPress) — display only. | |
| 8 | Discover: POPULAR PROFILES rows (name, breed • by owner, ❤ paws/barks counts) | list item | `src/app/search.jsx:321-339` | Opens `/pet-profile`. | |
| 9 | Discover: POPULAR PET MOMENTS cards (horizontal scroll: photo, pet, caption, paw/bark counts) | list item | `src/app/search.jsx:350-430` | Tap opens that pet's `/pet-profile` (not the individual post). | |
- **Empty / loading / error states:** spinner; no results: 🔍 "No results / Try a different search term"; Discover empty: paw mark "Nothing here yet / Popular pets and moments will appear as the community grows". **No error UI** — a failed request renders as the empty state.
- **Modals / sheets / alerts opened:** none.
- **Back / dismiss behaviour:** chevron or iOS swipe-back to Feed; profiles pushed from here sit on the same back stack.

---

### Memories — `/memories`
- **File:** `src/app/memories.jsx` · **Reached from:** Profile tab → owner menu "Memories & Wrapped / Recuerdos y Wrapped" (`src/components/More/OwnerMenu.jsx:248-253`, `router` via `goMenu`). Not reachable from the Feed.
- **Gating / data needed:** active pet. "On this day" needs a post from the same calendar day in an EARLIER year (so brand-new accounts see the empty text). "Today's celebrations" appear only on the pet's birthday / gotcha day, or when the current streak is exactly 7/30/100/365 or total posts exactly 10/50/100/365 (`src/utils/memoriesWrapped.js`). Data = `GET /api/posts/history?petId=`.
| # | Element (EN label / ES) | Type | Source | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | ← Back arrow | header icon | `src/app/memories.jsx:48-50` | `router.back()`. | |
| 2 | Title "Memories / Recuerdos" | static | `src/app/memories.jsx:51` | Display. | |
| 3 | Coral banner "{pet}'s Wrapped" + "A beautiful year-in-review, made to share" | button | `src/app/memories.jsx:56-71` | `router.push("/wrapped")`. | |
| 4 | "TODAY'S CELEBRATIONS" milestone cards (emoji, title, subtitle) | static | `src/app/memories.jsx:74-91` | Display only. | |
| 5 | Milestone card "Share" | button | `src/app/memories.jsx:84-88`, `MemoryShareButton` | Branded card → OS share sheet. | ⚠️ |
| 6 | "ON THIS DAY / UN DÍA COMO HOY" memory cards (photo 240 pt, "N years ago", caption) | list | `src/app/memories.jsx:102-125` | Display only (photo not tappable). | |
| 7 | Memory card "Share" | button | `src/app/memories.jsx:114-123` | Branded card ("{pet} · N years ago") → OS share sheet. | ⚠️ |
- **Empty / loading / error states:** coral spinner while loading; empty: "No memories from this day yet — keep posting and they'll appear here next year. 🐾". No error UI.
- **Modals / sheets / alerts opened:** OS share sheet.
- **Back / dismiss behaviour:** arrow / swipe-back to the Profile menu.

---

### Wrapped — `/wrapped`
- **File:** `src/app/wrapped.jsx` · **Reached from:** Memories banner (`src/app/memories.jsx:58`).
- **Gating / data needed:** needs ≥ 3 distinct days with a post (`buildWrapped`, `src/utils/memoriesWrapped.js:146-165`); otherwise the "growing" empty state. All text on this screen is hard-coded English.
| # | Element (EN label / ES) | Type | Source | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | ← Back arrow | header icon | `src/app/wrapped.jsx:38-40` | `router.back()` to Memories. | |
| 2 | Title "{pet}'s Wrapped" | static | `src/app/wrapped.jsx:41-43` | Display. | |
| 3 | Slides (emoji, big stat, headline, label) — total posts, best streak, first post, top month, etc. | static cards | `src/app/wrapped.jsx:61-88` | Display only. | |
| 4 | "Share slide" per slide | button | `src/app/wrapped.jsx:75-85` | Branded card → OS share sheet. | ⚠️ |
- **Empty / loading / error states:** spinner; empty: 🌱 "Your Wrapped is growing" + "Keep posting daily moments — your Wrapped unlocks as the memories grow." (49-59). No error UI.
- **Modals / sheets / alerts opened:** OS share sheet.
- **Back / dismiss behaviour:** arrow → Memories.

---

### Weekly digest ("{pet}'s Week") — `/weekly-digest`
- **File:** `src/app/weekly-digest.jsx` · **Reached from:** only via a "weekly_digest" notification row in the bell (`src/app/notifications.jsx:562-564`) or a push that opens the inbox. There is no menu entry.
- **Gating / data needed:** active pet; the notification exists only after the Sunday weekly job runs (server). Data = `GET /api/pets/:id/weekly-digest`. Honest tone: quiet/empty weeks get warm headlines, zeros are shown as zeros.
| # | Element (EN label / ES) | Type | Source | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | ← Back arrow | header icon | `src/app/weekly-digest.jsx:70-72` | `router.back()`. | |
| 2 | Title "{pet}'s Week / La semana de {pet}" + coral hero headline (rich / quiet / empty variants) | static | `src/app/weekly-digest.jsx:73-85,51-56` | Display. | |
| 3 | Stat tiles: Walks, Ring days (n/7), Care actions, Day streak | static | `src/app/weekly-digest.jsx:89-112` | Display. | |
| 4 | BEST MOMENT photo + caption | static | `src/app/weekly-digest.jsx:116-124` | Only if the week has a best moment. | |
| 5 | FRIENDS' DOGS THIS WEEK avatar strip | static (horizontal scroll) | `src/app/weekly-digest.jsx:127-139` | Display only (not tappable). | |
| 6 | Upcoming birthday / gotcha-day line | static | `src/app/weekly-digest.jsx:142-151` | Display. | |
| 7 | "Share {pet}'s week" | button | `src/app/weekly-digest.jsx:154-156` | Branded card → OS share sheet. | ⚠️ |
| 8 | Switch "Push notification / Notificación push" | toggle | `src/app/weekly-digest.jsx:160-167`, `src/hooks/useWeeklyDigest.js:44-58` | `PUT /api/engagement/weekly-digest-prefs` {push_enabled}; default ON. | ⚠️ changes a persisted notification preference |
| 9 | Switch "Email" | toggle | `src/app/weekly-digest.jsx:168-175` | `PUT /api/engagement/weekly-digest-prefs` {email_enabled}; default OFF. Turning ON makes the server email the weekly recap to the account address. | ⚠️ opts the account into outbound email |
- **Empty / loading / error states:** spinner (testID `weekly-digest-loading`). **No error state:** if the digest request fails the screen renders the "What a week" hero with all zeros; prefs failures are silent.
- **Modals / sheets / alerts opened:** OS share sheet.
- **Back / dismiss behaviour:** arrow → back to the Notifications modal.

---

### Followers / Following list — `/follows`
- **File:** `src/app/follows.jsx` · **Reached from:** tapping the Followers / Following counts on a pet social profile (`src/app/pet-profile.jsx:213-222`). Root-stack screen (`src/app/_layout.jsx:126`). Not reachable from the Feed itself.
- **Gating / data needed:** params `petId`, `rel=followers|following` (defaults to followers; falls back to the active pet when `petId` absent). Follow toggles need an active (viewer) pet. Data = `GET /api/pets/:id/follows?rel=&viewerPetId=`. Title ("Followers"/"Following"), "Back", search placeholder, button labels are hard-coded EN.
| # | Element (EN label / ES) | Type | Source | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | ‹ Back | header button | `src/app/follows.jsx:185-193` | `router.back()` to the pet profile. | |
| 2 | Search "Search by name or @handle" | text input | `src/app/follows.jsx:222-229,58-66` | Client-side filter of the loaded list. | |
| 3 | Pet row (avatar, name, @handle) | list item | `src/app/follows.jsx:111-128,85-96` | `router.push("/pet-profile")` for that pet. | |
| 4 | "Follow" (coral) / "Following" (sand) paw toggle | button | `src/app/follows.jsx:131-157,68-83` | Optimistic flip; `POST /api/pets/:id/follow` {followerPetId} to follow, `DELETE` to unfollow; reverts on failure. Hidden on your own pet's row. | 🌍📤 follow is public and notifies the followed pet's owner |
| 5 | Try again (error) | button | `src/app/follows.jsx:247-253` | `refetch()`. | |
- **Empty / loading / error states:** loading shows nothing; error: "Something went wrong. Please try again." + Try again (243-254); empty: "No followers yet" / "Not following anyone yet" / "No matches" (163-167).
- **Modals / sheets / alerts opened:** none.
- **Back / dismiss behaviour:** back button / swipe-back.

---

### Events & meetups — `/events`
- **File:** `src/app/events.jsx` · **Reached from:** Community screen "Events" button (`src/app/(tabs)/more/community.jsx:174-175`). Not reachable from the Feed.
- **Gating / data needed:** none. On open it asks for foreground **location permission** (OS dialog, line 66) to filter nearby events; denied = unfiltered list. Data = `GET /api/events`. Shows an Apple/Google map with pins above the list when events have coordinates.
| # | Element (EN label / ES) | Type | Source | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | ← Back | header icon | `src/app/events.jsx:158-160` | `router.back()`. | |
| 2 | Title "Events & meetups / Eventos y encuentros" | static | `src/app/events.jsx:161-163` | Display. | |
| 3 | "+" (coral square) | header button | `src/app/events.jsx:164-170` | `router.push("/event-create")`. | |
| 4 | Map with event pins | map | `src/app/events.jsx:207-211` | Display. | |
| 5 | "···" Report/Block (not on own events) | icon button | `src/app/events.jsx:224-230` | Moderation sheet (targetType "event"). | ⚠️ |
| 6 | "RSVP / Asistir" ↔ "Going ✓ / Asisto ✓" | button | `src/app/events.jsx:245-258,89-108` | Toggles `POST /api/events/:id/rsvp` {status going/not_going}; attendee count updates. Un-RSVP also deletes the device-calendar entry. Failure Alert "Couldn't RSVP". | 📤🌍 your RSVP is visible to the host/attendee count |
| 7 | "Add to calendar / Añadir al calendario" (shown only when Going; becomes "Added to your calendar") | button | `src/app/events.jsx:259-270,112-129` | Writes the event into the device calendar (iOS calendar permission dialog); Alerts for success / "Calendar access" denied / couldn't add. | ⚠️ writes to the phone's calendar |
| 8 | "Directions / Cómo llegar" (when event has coordinates) | button | `src/app/events.jsx:271-280,46-54` | Opens Apple Maps (iOS) / Google Maps with the destination. | |
| 9 | "Cancel / Cancelar" (host only) | text button | `src/app/events.jsx:281-285,131-140` | Alert "Cancel this event?" → Keep / **Cancel event** → `DELETE /api/events/:id`. | 🗑️📤 cancels an event attendees may have RSVP'd to |
- **Empty / loading / error states:** spinner; error: calendar icon + "Something went wrong. Please try again." + Try again (176-193, `events-error`); empty: "No upcoming events near you." (194-204, `events-empty`).
- **Modals / sheets / alerts opened:** OS location + calendar permission dialogs; cancel-event Alert; moderation sheet.
- **Back / dismiss behaviour:** arrow / swipe-back to Community.

---

### Create an event — `/event-create`
- **File:** `src/app/event-create.jsx` (location UI in `src/components/Map/LocationField.jsx`, `MapLocationPicker.jsx`; date/time in `src/components/DateField.jsx`, `TimeField.jsx`) · **Reached from:** "+" on Events (`src/app/events.jsx:166`).
- **Gating / data needed:** none; Publish is disabled (peach) until Title + Date + Time are set.
| # | Element (EN label / ES) | Type | Source | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | ← Back | header icon | `src/app/event-create.jsx:93-95` | `router.back()` (discards the form). | |
| 2 | Title "Create an event / Crear un evento" | static | `src/app/event-create.jsx:96-98` | Display. | |
| 3 | "Event title" input | text input | `src/app/event-create.jsx:102-109` | Required. | |
| 4 | "What's it about?" description | multiline input | `src/app/event-create.jsx:110-118` | Optional. | |
| 5 | Date field | date picker | `src/app/event-create.jsx:122`, `src/components/DateField.jsx:69-71,104-105` | Tap toggles an inline native calendar; stores YYYY-MM-DD. Required. | |
| 6 | Time field | time picker | `src/app/event-create.jsx:125`, `src/components/TimeField.jsx:72` | Tap toggles a native time wheel; stores HH:MM (24 h). Required. | |
| 7 | Location row "Set location on map / Ubicación" | button | `src/app/event-create.jsx:130-135`, `src/components/Map/LocationField.jsx:91-117` | Opens a page-sheet map picker. | |
| 8 | Picker: X, "Done", map tap, address input "Enter an address", "My location" | controls | `src/components/Map/LocationField.jsx:139,148`, `MapLocationPicker.jsx:219-222,273,310` | Map tap drops a pin (address auto-fills by reverse geocode); typing an address moves the pin; "My location" asks location permission and pins you; Done saves, X discards. | |
| 9 | "Capacity (optional)" | numeric input | `src/app/event-create.jsx:138-146` | Optional max attendees. | |
| 10 | "Publish event / Publicar evento" | button | `src/app/event-create.jsx:148-164`, `submit 45-63` | `POST /api/events` {title, description, starts_at (ISO), lat, lng, location_name, address, capacity}; success → `router.back()` to Events (new event listed). Failure Alert "Couldn't create the event" + raw server message. | 🌍 publishes a public event visible to other users near it |
- **Empty / loading / error states:** button dims (60%) while saving; errors via Alert (may include raw server text).
- **Modals / sheets / alerts opened:** location picker page-sheet; native date/time pickers; location permission dialog.
- **Back / dismiss behaviour:** arrow / swipe-back; no unsaved-changes confirmation.

---

### Global overlays (always mounted over every screen) — `OfflineBanner`, `AuthModal`
- **File:** `src/components/OfflineBanner.jsx`, `src/utils/auth/useAuthModal.jsx` (mounted in `src/app/_layout.jsx:14-16`) · **Reached from:** automatic.
- **Gating / data needed:** Offline banner shows only while the device has no connectivity; the Auth modal opens only when the app asks for (re)authentication.
| # | Element (EN label / ES) | Type | Source | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | Brown top strip "No internet connection — showing saved data" | banner | `src/components/OfflineBanner.jsx:20-41` | Non-interactive (pointerEvents none); appears at the very top over any screen; disappears on reconnect. Test with Airplane mode. | |
| 2 | Auth modal: full-screen web sign-in/up + back arrow | modal | `src/utils/auth/useAuthModal.jsx:50-81` | Hosts the web auth flow; back arrow closes to Welcome; auto-closes on success. Not normally reachable from the Feed. | 🔑 sign-in / social login happens inside it |
- **Empty / loading / error states:** n/a.
- **Modals / sheets / alerts opened:** n/a.
- **Back / dismiss behaviour:** Android back / arrow closes the auth modal.

---

## Risky actions found in Part A

- `src/components/Feed/PostComposerModal.jsx:432-447` (via `src/hooks/useFeedData.js:144,223`) — "Post daily update 🐾" uploads media (`POST /api/upload`) then `POST /api/posts` — 🌍 publishes a public post to followers/suggested feeds and consumes the pet's one daily post (a test post on prod is visible to real users; deleting it via the detail-modal trash reopens the slot).
- `src/hooks/useFeedPosts.js:132-133` / `src/app/(tabs)/index.jsx:195-213` / `src/components/Feed/PostDetailModal.jsx:166-170` — Delete post (`DELETE /api/posts/:id`) — 🗑️ permanent.
- `src/components/Feed/PostDetailModal.jsx:296-315` — Save edited caption (`PATCH /api/posts/:id`) — 🌍 changes a public post.
- `src/components/Feed/PostCard.jsx:92-113,520-538`, `PostDetailModal.jsx:103-105,376-394`, `MilestoneEventCard.jsx:32-36,53-64` — paw / double-tap paw / "Send a paw" (`POST` and `DELETE /api/posts/:id/paw`) — 📤 notifies the post's real owner (can be toggled, but a notification may already be sent).
- `src/components/Feed/BarkModal.jsx:346-366` — send a bark (`POST /api/posts/:id/barks`) — 🌍📤 public comment as the active pet + notification to the post owner.
- `src/components/Feed/BarkModal.jsx:272-281` — delete own bark (`DELETE /api/posts/:id/barks/:barkId`) — 🗑️.
- `src/components/moderation/ModerationMenu.jsx:75-86,190` — Report reason (`POST /api/reports`) — ⚠️ files a real report with the moderation team.
- `src/components/moderation/ModerationMenu.jsx:88-115` — Block user (`POST /api/blocks`) — ⚠️ blocks a real account (hides both sides' content, messages); no undo in this area.
- `src/components/Feed/DailyShareButton.jsx:70-76`, `MemoryShareButton.jsx:60-65`, `ShareCardButton.jsx:60-66` — Share buttons (Feed card, detail, milestone, Memories, Wrapped, Weekly digest) — ⚠️ open the OS share sheet; harmless unless the tester completes a share to a real contact/app.
- `src/components/Home/GettingStartedCard.jsx:61-63` (`src/utils/notifications.js:72-97`) — "Turn on notifications" — ⚠️ triggers the iOS notification-permission prompt and schedules a recurring daily local reminder (permission decision is sticky once denied).
- `src/components/Pets/AddDogModal.jsx:133-142` — Add-dog Save (`POST /api/upload` + `POST /api/pets`) — ⚠️ creates a real pet record on the account and switches the active pet to it.
- `src/app/follows.jsx:68-83` — Follow / Following toggle (`POST/DELETE /api/pets/:id/follow`) — 🌍📤 public follow + notification to the followed pet's owner.
- `src/app/events.jsx:89-108` — RSVP (`POST /api/events/:id/rsvp`) — 📤🌍 visible attendee count/host notification.
- `src/app/events.jsx:112-129` — Add to calendar — ⚠️ writes into the device calendar (permission prompt).
- `src/app/events.jsx:131-140` — Host "Cancel event" (`DELETE /api/events/:id`) — 🗑️📤 removes an event others may have joined.
- `src/app/event-create.jsx:45-63` — Publish event (`POST /api/events`) — 🌍 public event visible to other users.
- `src/app/weekly-digest.jsx:160-175` — Push / Email switches (`PUT /api/engagement/weekly-digest-prefs`) — ⚠️ persisted notification preferences; Email ON opts the account into outbound email.
- `src/app/notifications.jsx:620-624` — "Mark all read" (`POST /api/notifications/read`) — low risk (clears unread state only); listed for completeness.
- `src/utils/auth/useAuthModal.jsx:50-81` — Auth modal (sign in/up web flow, may include social login) — 🔑 only appears on re-auth; not reachable from normal Feed use.
- `src/components/Feed/PostComposerModal.jsx:155-195` — camera permission prompt (take photo / record video) — ⚠️ OS permission request; denial path shows an Alert only (simulator has no camera).


---

<!-- ===== PART B ===== -->

## Part B — Dog social profile, Profile/More tab, Settings, account

All paths are repo-relative to `anything/apps/mobile/` (e.g. `src/app/pet-profile.jsx:246`). EN labels come from `src/i18n/locales/en.json`; ES in parentheses when short. Labels marked **(hard-coded EN)** are English literals in the JSX that do NOT change with the app language (a Spanish-mode tester will still see English there).

Risk legend: 💸 spends money · 📤 messages/notifies a real user · 🌍 posts publicly / visible to other real users · 🗑️ deletes data/account · 🔑 Apple/Google/social login · ⚠️ other irreversible/outbound action.

Quick map of how a tester gets around this area:
- Bottom tab "Profile" (`src/app/(tabs)/tabsConfig.js:55`) → `src/app/(tabs)/more/index.jsx` → renders `PetProfileScreen embedded` (section 1).
- The ☰ burger (top-right of the Profile tab) opens the Menu sheet (section 2) which reaches: My Dogs picker (3), Business (link only), Community (link only), My Hub (5), Dog Profile (7), Family & Caregivers (10), Lost & Found (14), Memories & Wrapped (link only), Reminders & Routines (link only), Settings (9), and the red "Reset App Data" (logout).
- Data Access (6) is reached from My Hub, from Health → Vet Record (`src/components/Health/HealthVetRecord.jsx:482`) and from Notifications (`src/app/notifications.jsx:535`).
- Edit Profile (8) is reached from Dog Profile's pencil, and from the Feed "Getting started" card (see note in section 8).
- Emergency Card (12) is reached from Health → Vet Record (`HealthVetRecord.jsx:492`), NOT from the Profile tab.
- Insurance Apply (13) is reached from Services → Insurance (`src/app/service/insurance.jsx:199`).
- Nutrition (15) has NO entry point in production (`SHOW_NUTRITION = false`, `src/app/(tabs)/health.jsx:36`).
- Household "Your dogs" (11) has NO entry point anywhere in code (orphan route).
- There is NO "export my data" feature anywhere in Settings or the menu. There is NO "Getting started" entry on the Profile tab (the card lives on the Feed: `src/app/(tabs)/index.jsx:303`).

---

### Profile tab (embedded dog social profile) and Pet profile (pushed) — `/(tabs)/more` (index) and `/pet-profile`

- **File:** `src/app/pet-profile.jsx` (embedded wrapper: `src/app/(tabs)/more/index.jsx`) · **Reached from:** (embedded) bottom tab "Profile" `src/app/(tabs)/tabsConfig.js:55`; (pushed, `?petId=`) tapping a pet from Search `src/app/search.jsx:44`, Followers/Following list `src/app/follows.jsx:87`, a notification `src/app/notifications.jsx:570`, a Feed card `src/app/(tabs)/index.jsx:97`, Feed milestone card `src/components/Feed/MilestoneEventCard.jsx:28`.
- **Gating / data needed:** Embedded mode shows the viewer's ACTIVE pet (needs ≥1 pet; with no pet the hero is blank and the grid shows the empty state). Pushed mode shows the pet in the `petId` param (own pet or someone else's). "Own pet" extras (Care Ring around the avatar, streak chip, milestone banner, "Share a card", Edit/Delete on posts) appear whenever the profile pet belongs to the viewer (`isOwnPet`, `pet-profile.jsx:92`) — in BOTH modes. Follow/Message appear only on someone else's pet AND when the viewer has an active pet (`canFollow`, `pet-profile.jsx:90`); the active pet is the "follower" identity. The tab is mounted lazily on first focus (`FirstFocusGate`, `more/index.jsx:46`).
- Embedded vs pushed differences: embedded = empty left spacer, title "Profile" (ES "Perfil"), ☰ burger top-right; pushed = "‹ Back" top-left, title "Pet profile" (ES "Perfil de la mascota"), "···" report/block menu top-right.

| # | Element (EN label) | Type | Source | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | "‹ Back" (pushed mode only) | button | `src/app/pet-profile.jsx:246` | `router.back()` to the previous screen | |
| 2 | ☰ burger (a11y "Open menu") (embedded only) | header icon | `src/app/pet-profile.jsx:265` → `src/components/More/OwnerMenu.jsx:105` | Opens the Menu sheet (section 2) | |
| 3 | "···" (a11y "More options") (pushed mode only; hidden on your own pet or when you have no active pet) | header icon | `src/app/pet-profile.jsx:269` → `src/components/moderation/ModerationMenu.jsx:120` | Opens Report / Block user sheet (rows 36-44) | ⚠️ |
| 4 | Pull-to-refresh | pull-to-refresh | `src/app/pet-profile.jsx:280` (`RefreshableScrollView refetch`) | Re-fetches GET /api/pets/:id/profile; spinner then fresh counts/posts | |
| 5 | Error card "Couldn't load this profile. Check your connection and try again." + "Try again" | button | `src/app/pet-profile.jsx:293-322` | Shown only if the fetch failed and nothing is cached; "Try again" refetches | |
| 6 | Care Ring segments (walk / moment / care) around the avatar (own pet only) | tappable SVG arcs | `src/app/pet-profile.jsx:348-355`, `src/components/Health/CareRing.jsx:87` | Tap the "moment" arc → Feed tab (`/(tabs)`); tap the "walk" or "care" arc → Health tab (`/(tabs)/health`) | |
| 7 | Pet avatar | image | `src/app/pet-profile.jsx:358/374` (`PetAvatar`) | Display only (photo, else initials/dog glyph). Not tappable | |
| 8 | Name / @handle / breed · age / "with {owner}" | text | `src/app/pet-profile.jsx:379-463` | Display only. Age is localized ("3 años", "~6 meses", "Under 1 month") | |
| 9 | Streak chip "🔥 N" (own pet, only when streak > 0) | chip | `src/app/pet-profile.jsx:395`, `src/components/Health/StreakChip.jsx:15` | Display only; hidden at 0 | |
| 10 | Milestone banner "🎂 {name}'s birthday is coming in N days" (own pet, only within 3 days of birthday / gotcha day) | banner | `src/app/pet-profile.jsx:401`, `src/components/Feed/MilestoneCountdownBanner.jsx:14` | Display only; hidden outside the window or with no date set | |
| 11 | "Share a card" (ES "Compartir una tarjeta") (own pet only) | button | `src/app/pet-profile.jsx:411` | Opens the Share-card deck sheet (section "Share-card deck" below) | |
| 12 | "Follow +" / "Following ✓" (ES "Seguir"/"Siguiendo") (others' pets only) | button | `src/app/pet-profile.jsx:476-503`, `src/hooks/usePetSocialProfile.js:62-66` | Optimistically toggles; POST /api/pets/:id/follow `{followerPetId: <your active pet>}` to follow, DELETE same URL to unfollow. Follower count +/-1. The pet's OWNER gets a "started following your pet" notification on a NEW follow (`web/src/app/api/pets/[id]/follow/route.js:84-91`) | 📤🌍 |
| 13 | "Message" (ES "Mensaje") (others' pets, only when owner id known) | button | `src/app/pet-profile.jsx:506-530`, `src/hooks/useDMs.js:43` | POST /api/dm-threads `{otherUserId}` creates/reuses a 1:1 thread, then pushes `/chat` with that owner (chat screen is another area). On failure it silently does nothing | 📤 |
| 14 | Stat "Daily posts" | stat pill | `src/app/pet-profile.jsx:539` | Display only | |
| 15 | Stat "Paws" / Stat "Barks" | stat pill | `src/app/pet-profile.jsx:540-546` | Display only | |
| 16 | Stat "Followers" (count) | stat pill (tappable) | `src/app/pet-profile.jsx:547-555` | `router.navigate('/follows?petId=…&rel=followers&petName=…')` → searchable followers list (follows.jsx = another area). No-op if no pet resolved yet | |
| 17 | Stat "Following" (count) | stat pill (tappable) | `src/app/pet-profile.jsx:556-563` | Same, `rel=following` | |
| 18 | "Daily moments" grid tile (3-up image grid, paw-count badge bottom-left) | list item | `src/app/pet-profile.jsx:583-594`, `src/components/social/MomentsGrid.jsx:54` | Opens the Post-detail sheet for that post (rows 20-35) | |
| 19 | Empty grid: "No daily posts yet" + "{name}'s daily moments will appear here." | empty state | `src/app/pet-profile.jsx:595-629` | Shown with zero posts; spinner while first load | |
| — | "About {name}" card (Breed / Age / Owner rows) | text | `src/app/pet-profile.jsx:634-672` | Display only; **(hard-coded EN)** "About", "Breed", "Age", "Owner" | |

**Post-detail sheet (opened from a grid tile)** — `src/components/Feed/PostDetailModal.jsx` (full-screen page sheet, title "Pet moment" **(hard-coded EN)**). Edit/Delete only when the post is on one of YOUR pets.

| # | Element | Type | Source | Action → expected result | Risk |
|---|---|---|---|---|---|
| 20 | "X" close | header icon | `PostDetailModal.jsx:159` | Closes the sheet | |
| 21 | Trash (a11y "Delete post") — own posts only | header icon | `PostDetailModal.jsx:167`, handler `src/app/pet-profile.jsx:182-205` | Alert **(hard-coded EN)** "Delete post?" / "This permanently removes the post." [Cancel / Delete]. Delete → DELETE /api/posts/:id, grid refetches, tile disappears; also reopens today's Daily composer on the Feed. Failure: Alert "Error — Could not delete: …" | 🗑️🌍 |
| 22 | Share icon (DailyShareButton) | header icon | `PostDetailModal.jsx:172`, `src/components/Feed/DailyShareButton.jsx:101` | Renders a branded PNG off-screen then opens the iOS share sheet (Instagram/WhatsApp/Save). Needs a photo; silent no-op if capture/sharing unavailable | 📤🌍 |
| 23 | "···" Report/Block (others' posts only) | header icon | `PostDetailModal.jsx:174` | Opens ModerationMenu (rows 36-44) for the post (`targetType="post"`); Block only offered if the post carries `user_id` | ⚠️ |
| 24 | Avatar + name row | button | `PostDetailModal.jsx:188`; handler `pet-profile.jsx:692` | On this screen only closes the sheet (no navigation) | |
| 25 | Photo / video (double-tap) | gesture | `PostDetailModal.jsx:243-259` | Double-tap = Paw (never un-paws). Video posts: tap-to-play inline | 📤🌍 |
| 26 | Pencil (a11y "Edit caption") / "Add a caption ✍️" (own posts) | button | `PostDetailModal.jsx:331 / 346` | Opens inline editor (TextInput `testID=edit-caption-input`, max 2000 chars) | |
| 27 | Caption editor: "Cancel" / "Save" | buttons | `PostDetailModal.jsx:296-315` | Save → PATCH /api/posts/:id `{caption}`; failure Alert "feed.saveFailedTitle/Body". Cancel discards | 🌍 |
| 28 | "N paws" | button | `PostDetailModal.jsx:376`; handler `pet-profile.jsx:157-172` | Toggles your paw: POST /api/posts/:id/paw (or DELETE to remove); count updates optimistically; post owner is notified | 📤🌍 |
| 29 | "N barks" | button | `PostDetailModal.jsx:396`; `pet-profile.jsx:688` | Closes this sheet and opens the Bark sheet (rows 30-34) | |
| 30 | Bark preview list ("Barks (N)", "No barks yet") | text | `PostDetailModal.jsx:418-463` | Display only | |
| 31 | "Add a bark 🐾" | button | `PostDetailModal.jsx:464` | Same as row 29 | |

**Bark (comment) sheet** — `src/components/Feed/BarkModal.jsx` (bottom sheet; opened via rows 29/31).

| # | Element | Type | Source | Action → expected result | Risk |
|---|---|---|---|---|---|
| 32 | Dim backdrop | button | `BarkModal.jsx:111` | Closes the sheet | |
| 33 | Bark text box "Leave a bark for {name}…" + send arrow | text input + button | `BarkModal.jsx:321-360` | Send (or keyboard "send") → POST /api/posts/:id/barks; comment appears publicly; post owner is notified. Blank text disables send. Failure Alert (feed.errorSaveTitle/Body) | 📤🌍 |
| 34 | Trash on YOUR own bark / "···" on others' barks | icon | `BarkModal.jsx:275` / `:283` | Trash → Alert "Delete comment?" "This will remove your comment for everyone. This can't be undone." [Cancel/Delete] → DELETE /api/posts/:id/barks/:barkId. "···" → Report (`targetType="bark"`) / Block | 🗑️ / ⚠️ |

**Share-card deck sheet ("Share a card")** — `src/components/Feed/ShareCardDeck.jsx` (own pet only, bottom sheet; data from GET /api/pets/:id/share-stats).

| # | Element | Type | Source | Action → expected result | Risk |
|---|---|---|---|---|---|
| 35a | "X" close | icon | `ShareCardDeck.jsx:39` | Closes the sheet | |
| 35b | Five card rows: "Milestone" (only on a birthday/gotcha day), "Week in walks" (needs ≥1 walk this week), "Streak" (needs streak>0), "PawPi pup" (needs a named pet), "Monthly care recap" (needs ≥1 closed-ring day this month). Unavailable ones show a grey "Locked" pill and a hint (e.g. "Log a walk this week to unlock") | list item | `ShareCardDeck.jsx:50-67`, rules `src/utils/shareLinks.js:33-52` | Display; available rows have a Share button | |
| 35c | "Share" (ES "Compartir") on an available card | button | `ShareCardDeck.jsx:59`, `src/components/Feed/ShareCardButton.jsx:72` | Renders a 1080x1920 story PNG off-screen (5 s timeout) and opens the iOS share sheet; the share title is the pet's public PawPi link. Silent no-op if capture fails | 📤🌍 |

**Report / Block menu (shared ModerationMenu)** — `src/components/moderation/ModerationMenu.jsx` (used on pushed pet profile, post detail, barks, and many other screens — documented once here).

| # | Element | Type | Source | Action → expected result | Risk |
|---|---|---|---|---|---|
| 36 | "Report" | list item | `ModerationMenu.jsx:151` | Switches the sheet to the reasons list | |
| 37 | "Block user" (only when the author's user id is known) | list item | `ModerationMenu.jsx:158-163` | Alert "Block this user?" "You won't see each other's posts, comments, walks, or messages, and neither of you can contact the other." [Cancel / Block] | ⚠️ |
| 38 | Block → "Block" (destructive) | alert button | `ModerationMenu.jsx:96-117` | POST /api/blocks `{blocked_user_id}`; Alert "User blocked — Their content will disappear from your app."; on the pushed pet profile the screen then goes `router.back()` (`pet-profile.jsx:274`) | ⚠️ |
| 39 | "Cancel" | list item | `ModerationMenu.jsx:166` | Closes the sheet | |
| 40 | Reasons prompt "Why are you reporting this?" (back row) | list item | `ModerationMenu.jsx:174-179` | Returns to the actions list | |
| 41 | Reason rows: "Spam or scam", "Harassment or bullying", "Hate speech", "Nudity or sexual content", "Violence or threats", "Something else" | list items | `ModerationMenu.jsx:182-192` | Immediately POST /api/reports `{target_type, target_id, reason}` (no extra confirm); Alert "Thanks for reporting — Our team will review this within 24 hours." Double report is a no-op. Failure: "Couldn't report" | ⚠️ |
| 42 | Backdrop tap | gesture | `ModerationMenu.jsx:129-132` | Dismisses | |

- **Empty / loading / error states:** Spinner (coral) in the grid while the first fetch runs; "No daily posts yet" empty card; a sand error card with "Try again" on fetch failure (`petProfile.loadError`); stats default to 0 while loading; hero shows placeholder name/handle/avatar from navigation params until data arrives. Follow/Message silently do nothing on failure (Message) or roll back the optimistic count (Follow). Raw technical text can leak only via `Alert "Error — Could not delete: <server message>"` (row 21) and the hard-coded-EN strings noted above.
- **Modals / sheets / alerts opened:** Menu sheet (section 2), Post-detail sheet, Bark sheet, Share-card deck, ModerationMenu — all documented above; Delete-post Alert (row 21).
- **Back / dismiss behaviour:** Embedded tab: no back button; switching to another tab pops the More stack back to this root (`more/index.jsx:35-41`). Pushed: "‹ Back" = `router.back()`; blocking a user also `router.back()`s. Sheets close with X / backdrop / Android back.

---

### Menu (☰ burger sheet, a.k.a. the former "More") — OwnerMenu

- **File:** `src/components/More/OwnerMenu.jsx` · **Reached from:** ☰ top-right of the Profile tab (`src/app/pet-profile.jsx:265`, embedded mode only).
- **Gating / data needed:** The "Business" section appears only if the account is also active staff of ≥1 provider (`useMyProviders`, `OwnerMenu.jsx:39-40`). Everything else always shows.
- Each navigation row first closes the sheet, then `router.push`es (`OwnerMenu.jsx:42-45`).

| # | Element (EN label) | Type | Source | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | ☰ (a11y "Open menu") | header icon | `OwnerMenu.jsx:105` | Slides up the Menu sheet titled "Menu" (ES "Menú") | |
| 2 | "X" (a11y "Close menu") | icon | `OwnerMenu.jsx:154` | Closes the sheet | |
| 3 | Dim area above the sheet | gesture | `OwnerMenu.jsx:127` | Closes the sheet | |
| 4 | "My Dogs" row ("Active: {name}" / "Add your first dog") | list item | `OwnerMenu.jsx:163` → `src/components/Pets/PetSwitcher.jsx:29` | Opens the My Dogs picker sheet (section 3) | |
| 5 | "BUSINESS" header + "Business" 🏪 (ES "Negocio") (provider staff only) | list item | `OwnerMenu.jsx:182-187` | `router.push("/business")` → Business home (another area) | |
| 6 | "COMMUNITY" → "Community" 🐕 (ES "Comunidad") | list item | `OwnerMenu.jsx:204-209` | `router.push("/(tabs)/more/community")` → forum list (link only; covered elsewhere) | |
| 7 | "YOUR ACCOUNT" → "My Hub" 🗂️ (ES "Mi centro") | list item | `OwnerMenu.jsx:224-229` | Opens My Hub (section 5) | |
| 8 | "Dog Profile" 🐾 (ES "Perfil del perro") | list item | `OwnerMenu.jsx:230-235` | Opens Dog Profile (section 7) | |
| 9 | "Family & Caregivers" 👨‍👩‍👧 (ES "Familia y cuidadores") | list item | `OwnerMenu.jsx:236-241` | Opens `/pet-sharing` (section 10) | |
| 10 | "Lost & Found" 🔍 (ES "Perdidos y encontrados") | list item | `OwnerMenu.jsx:242-247` | Opens `/lost-found` (section 14) | |
| 11 | "Memories & Wrapped" ✨ (ES "Recuerdos y Wrapped") | list item | `OwnerMenu.jsx:248-253` | `router.push("/memories")` (link only; covered elsewhere) | |
| 12 | "Reminders & Routines" 🔔 (ES "Recordatorios y rutinas") | list item | `OwnerMenu.jsx:254-259` | `router.push("/(tabs)/more/reminders")` → Routines + Settings tabs (link only; routines covered elsewhere) | |
| 13 | "Settings" ⚙️ (ES "Configuración") | list item | `OwnerMenu.jsx:260-265` | Opens `/(tabs)/more/settings` (section 9) | |
| 14 | "Reset App Data" (red, ES "Borrar datos de la app") | button | `OwnerMenu.jsx:267-286`, handler `:47-59` | **This is actually LOG OUT, with NO confirmation dialog.** Runs `clearAccountStorage()` (removes cached account/session data from AsyncStorage; KEEPS language, notification prefs, telemetry opt-out — `src/utils/accountStorage.js:23-24`), `setAuth(null)` (drops the token from SecureStore), then `router.replace("/welcome")`. It does NOT call any server endpoint and does NOT delete the account or any server data. To get back in the tester must sign in again (email or Apple/Google) | 🔑⚠️ |

- **Empty / loading / error states:** n/a (static list). The My Dogs row shows "Add your first dog" when the account has no pet. Logout never throws (errors still navigate to `/welcome`).
- **Modals / sheets / alerts opened:** My Dogs picker (3) → Add a dog (4). No Alert on logout.
- **Back / dismiss behaviour:** X, backdrop, or Android back closes the sheet. Destination screens return with their own back arrows to the Profile tab root (the burger sheet is closed).

---

### My Dogs picker (pet switcher sheet) — PetSwitcher + PetPickerSheet

- **File:** `src/components/Pets/PetSwitcher.jsx`, `src/components/Pets/PetPickerSheet.jsx` · **Reached from:** the "My Dogs" row in the Menu (`OwnerMenu.jsx:163`, `variant="row"`); the compact "pill" variant (avatar + dog name + chevron, `PetSwitcher.jsx:63`) is the same control used in Feed/Health headers (other areas) and opens this same sheet.
- **Gating / data needed:** none (with no dogs the pill reads "Add your dog" and the list is empty except "Add a dog").

| # | Element | Type | Source | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | "My Dogs" row (avatar, "My Dogs", "Active: {name}") or pill (avatar, dog name, ▼) | button | `PetSwitcher.jsx:29` / `:63` | Opens the bottom sheet "My Dogs" | |
| 2 | Dim backdrop | gesture | `PetPickerSheet.jsx:40-51` | Closes the sheet | |
| 3 | A dog row (avatar, name, breed; ✓ + coral border on the active one) | list item | `PetPickerSheet.jsx:100-102`, `handleSelect :26` | Sets that dog as ACTIVE (`setCurrentPet`, persisted) and closes the sheet; every tab (Feed, Health, Profile…) now follows that dog | |
| 4 | "+ Add a dog" (ES "Agregar un perro") | button | `PetPickerSheet.jsx:145-147` | Closes the picker and opens the Add a dog modal (section 4) | |

- **Empty / loading / error states:** coral spinner while the dog list loads; only the "Add a dog" button when there are none.
- **Modals / sheets / alerts opened:** Add a dog (4).
- **Back / dismiss behaviour:** backdrop / Android back closes. Known risk (memory): wrong-pet data after switching accounts is a React Query cache issue; after switching dogs the tester should confirm Profile, Feed header and Health all show the new dog's name.

---

### Add a dog (modal) — AddDogModal

- **File:** `src/components/Pets/AddDogModal.jsx` · **Reached from:** "Add a dog" in the My Dogs picker (`PetSwitcher.jsx:22-25`).
- **Gating / data needed:** none. Only Name is required.

| # | Element (EN label) | Type | Source | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | "X" (top-left) | header icon | `AddDogModal.jsx:182` | Clears the form and closes the modal (no confirm; unsaved data lost) | |
| 2 | "Add photo" / "Change photo" (ES "Agregar foto"/"Cambiar foto") | button | `AddDogModal.jsx:225-226`, `:89-108` | iOS: action sheet "📷 Take a photo" / "🖼️ Choose from gallery" / Cancel. Android: Alert "Add a photo — How would you like to add a photo?" with the same choices. Camera denied → Alert "Camera access needed — Please allow camera access in settings." Square crop (1:1) editor opens | |
| 3 | "Name *" text box (placeholder "e.g. Buddy") | text input | `AddDogModal.jsx:248` | Required; Save disabled while empty | |
| 4 | "Breed" search picker ("Search breeds…") | text input + list (BreedPicker) | `AddDogModal.jsx:259`, `src/components/BreedPicker.jsx:225-237` | Type to search the canonical breed list; rows: pinned "Mixed breed" (`:116`), matching breeds (`:125`), "Use “<typed text>”" custom entry (`:160`); empty: "No breeds match — you can still use what you typed." | |
| 5 | Gender chips "Male" / "Female" / "Unknown" (ES "Macho"/"Hembra"/"Sin especificar") | toggle chips | `AddDogModal.jsx:275-277` | Single select | |
| 6 | Weight number box (placeholder "0") + "kg" / "lbs" chips | text input + toggle | `AddDogModal.jsx:313-322, 328-330` | Digits and "." only; unit default follows locale | |
| 7 | "Birthday" date field (placeholder "Select date") | date picker (DateField) | `AddDogModal.jsx:358`, `src/components/DateField.jsx:71` | Tap opens an inline calendar (iOS) / calendar dialog (Android); future dates disallowed; stores `YYYY-MM-DD` | |
| 8 | "Notes" multiline ("Allergies, food preferences, medical conditions...") | text input | `AddDogModal.jsx:373` | Free text | |
| 9 | "Save" ✓ (ES "Guardar") | button | `AddDogModal.jsx:398-400`, `handleSave :110-157` | Empty name → Alert "Name needed — Please enter your dog's name." Otherwise uploads the photo (if any) then POST /api/pets `{name, breed, gender, weight, weight_unit, birthday, notes, avatar_url}`; the new dog becomes the ACTIVE dog; Alert "Saved — {name} is ready to go!"; modal closes. Error: "Could not save — Could not save. Please try again." | ⚠️🌍 |

- **Empty / loading / error states:** Save shows a spinner while uploading/saving; disabled until Name has text.
- **Modals / sheets / alerts opened:** action sheet / alert for photo source; success/error Alerts listed above.
- **Back / dismiss behaviour:** only the X (or Android back) closes; keyboard-avoiding layout; unsaved changes are discarded silently.

---

### My Hub — `/(tabs)/more/hub`

- **File:** `src/app/(tabs)/more/hub.jsx` · **Reached from:** Menu → "My Hub" (`OwnerMenu.jsx:224`).
- **Gating / data needed:** none; each card shows an empty state. All reads are owner-scoped. Title and most strings are **(hard-coded EN)**: "My Hub", "Who has access", "No one has access to your pets.", "Saved dogs", "No saved adoption listings."; only the third card is translated.

| # | Element | Type | Source | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | Back arrow | header icon | `hub.jsx:167` | `router.back()` | |
| 2 | Pull-to-refresh | pull-to-refresh | `hub.jsx:180` | Refetches access grants + saved dogs | |
| 3 | Card "Who has access" (count badge, chevron) | button | `hub.jsx:185-190` | `router.push("/(tabs)/more/data-access")` → Data Access (section 6) | |
| 4 | Up to 4 access rows ("<provider>" / "Access to <pet>" / badge "active") | list item (not tappable) | `hub.jsx:194-201` | Display only | |
| 5 | Card "Saved dogs" (count badge) | button | `hub.jsx:206-211` | `router.push("/service/adoption")` → Adoption listings (another area) | |
| 6 | Saved-dog rows (name, breed · shelter, status badge) | list item (not tappable) | `hub.jsx:215-224` | Display only | |
| 7 | Card "Businesses you follow" (ES via `storefront.follow.listTitle`) | button | `hub.jsx:229-234` | `router.push("/service/following")` (another area) | |
| 8 | Followed-business rows | list item (not tappable) | `hub.jsx:238-240` | Display only | |

- **Empty / loading / error states:** spinner while BOTH grants and favorites are loading; per-card empty text. Query errors are not shown (cards just look empty).
- **Modals / sheets / alerts opened:** none.
- **Back / dismiss behaviour:** back arrow → previous screen (Profile tab root).

---

### Data Access (who can see my pet's records) — `/(tabs)/more/data-access`

- **File:** `src/app/(tabs)/more/data-access.jsx` · **Reached from:** My Hub card (`hub.jsx:189`); Health → Vet Record (`src/components/Health/HealthVetRecord.jsx:482`); Notifications (`src/app/notifications.jsx:535`).
- **Gating / data needed:** needs an active pet (else "No pet selected — Add or choose a pet to manage who can see its records."). Provider requests come from vets/businesses that asked for access to the ACTIVE pet. Active list hides expired grants.

| # | Element (EN label) | Type | Source | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | Back arrow; title "Data Access" (ES "Acceso a datos") | header icon | `data-access.jsx:122` | `router.back()` | |
| 2 | Pull-to-refresh | pull-to-refresh | `data-access.jsx:182` | Refetches grants | |
| 3 | Blue reassurance box "You control who can see {pet}'s records…" | text | `data-access.jsx:187-211` | Display only | |
| 4 | "PENDING REQUESTS" cards: provider name "wants access to {pet}" + scope chips ("View medical records", "Add vet notes", "Add vaccinations", "Manage appointments", "View health logs", "Add health logs", "Messaging") | list item | `data-access.jsx:231-278`, scopes `:375-384` | Display with two buttons below | |
| 5 | "Approve" ✓ (ES "Aprobar") | button | `data-access.jsx:234-252` | PATCH /api/care-access/grants/:id `{action:"approve"}` — the provider IMMEDIATELY gains the listed scopes on this pet's medical record. No confirm dialog | ⚠️📤 |
| 6 | "Deny" ✗ (ES "Rechazar") | button | `data-access.jsx:253-275` | Alert "Deny request? — {provider} will not get access to {pet}." [Cancel / Deny] → PATCH `{action:"deny"}` | ⚠️ |
| 7 | "WHO HAS ACCESS" cards: "has access to {pet}", scope chips, "Granted <date>", "Access until <date>" | list item | `data-access.jsx:287-299`, `:440-443` | Display only | |
| 8 | "Revoke access" (ES "Revocar acceso") | button | `data-access.jsx:300-322` | Alert "Revoke access? — {provider} will immediately lose access to {pet}." [Cancel / Revoke] → PATCH `{action:"revoke"}` | ⚠️ |

- **Empty / loading / error states:** spinner while loading; "No pending requests." / "No one has access yet." empty rows; load failure shows terracotta text "Couldn't load access requests. Pull to refresh." Action failures: Alert "Something went wrong — <server message or 'Please try again.'>".
- **Modals / sheets / alerts opened:** Deny and Revoke confirmation Alerts (rows 6, 8).
- **Back / dismiss behaviour:** back arrow → previous screen (Hub / Vet Record / Notifications).

---

### Dog Profile (details of the active dog) — `/(tabs)/more/profile`

- **File:** `src/app/(tabs)/more/profile.jsx` · **Reached from:** Menu → "Dog Profile" (`OwnerMenu.jsx:230`).
- **Gating / data needed:** needs an active pet (otherwise shows "My Dog" and "Not set" values).

| # | Element | Type | Source | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | Back arrow; title "Dog Profile 🐾" (ES "Perfil del perro") | header icon | `profile.jsx:175` | `router.back()` | |
| 2 | Pencil (top-right) | header icon | `profile.jsx:181-185` | `router.push("/more/profile-edit")` → Edit Profile (section 8) | |
| 3 | Hero: photo (or dog glyph), name, breed | image/text | `profile.jsx:206-253` | Display only. Breed "Mixed Breed" is shown localized ("Mestizo") | |
| 4 | "PET INFORMATION" rows: Breed, Age, Gender, Weight, Birthday (or Adoption date) — "Not set" when empty | text | `profile.jsx:261-277` | Display only; dates in dd/MM/yyyy | |
| 5 | "NOTES & PREFERENCES" card | text | `profile.jsx:287-293` | Display only; empty copy "No extra notes yet. Add information about allergies…" | |
| 6 | "GROOMING" section: cards with groomer name, date, Before/After photo strips (64px thumbnails), coat/skin notes, "Products: …" | list/images | `profile.jsx:304-306, 316-447` | Display only (photos NOT tappable). Empty: "No grooming sessions yet. Book a groomer from Services → Grooming; …" | |

- **Empty / loading / error states:** centered spinner + "Loading profile..." while the pet loads; per-section empty text. No error state.
- **Modals / sheets / alerts opened:** none.
- **Back / dismiss behaviour:** back arrow → Profile tab root.

---

### Edit Profile (edit the active dog) — `/(tabs)/more/profile-edit`

- **File:** `src/app/(tabs)/more/profile-edit.jsx` (+ `src/components/Pets/BirthdayOrAgeField.jsx`) · **Reached from:** Dog Profile pencil (`profile.jsx:183`); also pushed directly by the Feed "Getting started" card (`src/app/(tabs)/more/_layout.jsx:3-10` comment).
- **Gating / data needed:** needs an active pet (otherwise "No pet profile found"). Save is disabled while Name is empty.

| # | Element (EN label) | Type | Source | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | Back arrow; title "Edit Profile" (ES "Editar perfil") | header icon | `profile-edit.jsx:316` | `router.back()` (unsaved edits lost, no prompt) | |
| 2 | "Change Photo" 📷 (ES "Cambiar foto") | button | `profile-edit.jsx:358-361`, `pickPhoto :86-108` | Asks photo-library permission (denied → Alert "Photo access needed — Allow photo library access to change your pet's photo."); opens the library with a 1:1 crop; chosen photo previews immediately (uploaded on Save) | |
| 3 | "Name *" (placeholder "e.g. Buddy") | text input | `profile-edit.jsx:381` | Required | |
| 4 | "Handle" (ES "Usuario", placeholder "e.g. buddy_adventures") | text input | `profile-edit.jsx:392` | The public @handle shown on the social profile and share cards; no-capitalize | 🌍 |
| 5 | "Breed" search picker | text input + list | `profile-edit.jsx:407` | Same BreedPicker as Add a dog | |
| 6 | Gender chips "Male"/"Female"/"Unknown" | toggle chips | `profile-edit.jsx:421-426` | Single select | |
| 7 | "Weight" number box + "kg"/"lbs" | text input + toggle | `profile-edit.jsx:464, 480-485` | Digits/"." only | |
| 8 | "Birthday": chips "I know the birthday" / "I'm not sure" **(hard-coded EN)** | toggle chips | `profile-edit.jsx:515`, `BirthdayOrAgeField.jsx:54` | Switches between a date picker and estimated age | |
| 9 | Birthday date field | date picker | `BirthdayOrAgeField.jsx:134` (DateField) | Inline calendar; no future dates | |
| 10 | "Estimated years" / "Estimated months" **(hard-coded EN)** (only when "I'm not sure") | text input | `BirthdayOrAgeField.jsx:97, 118` | Digits only | |
| 11 | "Adoption Date" date field (ES "Fecha de adopción") | date picker | `profile-edit.jsx:540` | Inline calendar; no future dates | |
| 12 | "Notes" multiline | text input | `profile-edit.jsx:559` | Free text | |
| 13 | "Save Changes" ✓ (ES "Guardar cambios") | button | `profile-edit.jsx:592-594`, `handleSave :135-262` | Uploads a new photo if changed, then PATCH /api/pets/:id `{name, handle, avatar_url, breed, gender, weight, weight_unit, birthday, adoption_date, notes[, age_years, age_months]}`; refreshes pets/weight caches; Alert "Success — Profile saved" then `router.back()`. Errors: Alert "Error — <server message or 'Could not save profile. Please try again.'>"; name blank: "Pet name is required" | 🌍⚠️ |

- **Empty / loading / error states:** spinner while loading the pet; "No pet profile found" if none. Error text can leak the raw server message (e.g. "Photo upload failed: …", handle-taken errors).
- **Modals / sheets / alerts opened:** photo-permission Alert, success/error Alerts, inline calendars.
- **Back / dismiss behaviour:** header back arrow; after a successful save it auto-returns.

---

### Settings — `/(tabs)/more/settings` (shared `AppSettings` component)

- **File:** `src/components/Settings/AppSettings.jsx` (route wrapper `src/app/(tabs)/more/settings.jsx`) · **Reached from:** Menu → "Settings" (`OwnerMenu.jsx:260`). The same component renders `mode="business"` at `src/app/business/settings.jsx` (business-mode notifications variant, last table).
- **Gating / data needed:** none for the pet-owner screen. Rows tagged *(server-gated)* only appear if the server returns them (notification v2 flag). Legal rows only appear when the URL env var is set — in the production EAS profiles they are all set (`eas.json:19-22,32-35`: https://www.pawpi.info/privacy | /terms | /eula | /support).
- Section order on screen: NOTIFICATIONS, WALK TRACKING, LANGUAGE, PRIVACY & DATA, SUPPORT, ACCOUNT, footer "PawPi v1.0.0 / Made with 🐾 for dog parents" (static text, `AppSettings.jsx:950-960`). Title "Settings ⚙️" (ES "Ajustes").

| # | Element (EN label) | Type | Source | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | Back arrow | header icon | `AppSettings.jsx:782-787` | `router.back()` to the previous screen | |
| 2 | NOTIFICATIONS: "Streak reminder" — "One friendly evening nudge when your ring is almost closed" (ES "Recordatorio de racha") | toggle | `AppSettings.jsx:319-325` | Saves locally (AsyncStorage `pawpi.notifPrefs.v1`); gates the on-device streak nudge. Default ON | |
| 3 | NOTIFICATIONS: "Care reminders" — "Your own feeding, walk and health reminders, plus a gentle tip…" (ES "Recordatorios de cuidado") | toggle | `AppSettings.jsx:319-325` | Same, gates on-device care reminders. Default ON | |
| 4 | *(server-gated)* "Booking updates", "Adoption updates", "Walker confirmations", "Lost pet alerts" (default ON) | toggle | `AppSettings.jsx:256-266, 329-367` | PUT /api/notification-prefs `{category, enabled}`; reverts the switch if the save fails | |
| 5 | *(server-gated)* "Weekly summary notification", "Occasional friendly notifications", "Occasional emails from PawPi" (promotional; default OFF) | toggle | `AppSettings.jsx:263-277, 329-367` | Same endpoint. Turning ON opts the user in to real pushes / marketing emails | ⚠️📤 |
| 6 | *(server-gated)* "Quiet hours" — "No phone notifications while you're resting…" | toggle | `AppSettings.jsx:375-382` | PUT /api/notification-prefs/quiet-hours `{enabled}` | |
| 7 | Quiet hours "From" − / + and "Until" − / + steppers (visible when Quiet hours is on) | button | `AppSettings.jsx:391-396, 405-410` | Each tap moves that hour by 1 (wraps 23→0) and saves; value shown via `formatHour` | |
| 8 | WALK TRACKING: "Apple Health" ("Automatic distance and step tracking", badge "COMING SOON") | list item | `AppSettings.jsx:823-825` → `src/components/Health/WalkActivity/WalkTrackingSettings.jsx:120` | Not available: Alert "Apple Health — coming soon — Apple Health tracking isn't available yet. For now, manual tracking works great." Selection is NOT stored | |
| 9 | WALK TRACKING: "Apple Watch" ("Real-time pace and heart rate", badge "COMING SOON") | list item | `WalkTrackingSettings.jsx:120` | Same Alert for Apple Watch | |
| 10 | WALK TRACKING: "Manual tracking" ("Enter walk details yourself") | list item | `WalkTrackingSettings.jsx:120` | Selects and stores manual (already the default; ✓ shown) | |
| 11 | LANGUAGE: "System default" / "English" / "Español" (ES "Predeterminado del sistema") | list item (radio) | `AppSettings.jsx:101-117` (`choose :87`) | Instantly switches the whole app language (✓ marks the choice); persists `pawpi:locale`; also PUT /api/user-profile/locale so emails match (`src/i18n/localePreference.js:54-65`) | |
| 12 | PRIVACY & DATA: "Account Privacy — Public" | static row | `AppSettings.jsx:857` | **Not interactive** (no handler): always shows "Public". Do not expect a toggle | |
| 13 | PRIVACY & DATA: "Help improve PawPi (anonymous)" — "Share anonymous usage and error data…" (ES "Ayudar a mejorar PawPi (anónimo)") | toggle | `AppSettings.jsx:180-186` (`onChange :142`) | Default ON. OFF → opt-out flow: queue cleared, one opt_out event sent, install id deleted, nothing more sent. ON → new random install id. Survives logout | |
| 14 | SUPPORT: "Help Center" → | link | `AppSettings.jsx:873` (`openHelpCenter :673`) | Opens https://www.pawpi.info/support in the browser (falls back to the email composer) | |
| 15 | SUPPORT: "Contact Us" → (ES "Contactanos") | link | `AppSettings.jsx:874` (`openContactUs :665`) | Opens the mail composer to support@pawpi.info, subject "PawPi support" (does not send until the user presses Send in Mail). If no mail app: Alert "Contact Us — Email us at support@pawpi.info" | 📤 |
| 16 | SUPPORT: "Privacy Policy" → | link | `AppSettings.jsx:875-882` | Opens https://www.pawpi.info/privacy in the browser; failure Alert | |
| 17 | SUPPORT: "Terms of Service" → | link | `AppSettings.jsx:883-890` | Opens https://www.pawpi.info/terms | |
| 18 | SUPPORT: "End User License Agreement (EULA)" → | link | `AppSettings.jsx:891-898` | Opens https://www.pawpi.info/eula | |
| 19 | ACCOUNT: "Delete account — Permanently delete your account and all data." (red) | button | `AppSettings.jsx:913-947` (`confirmDeleteAccount :640-661`) | Starts TWO Alerts: (1) "Delete account? — This permanently deletes your account and all your pets, health records, posts and other data. This cannot be undone." [Cancel / Delete account]; (2) "This is permanent — Are you absolutely sure? Your account and data will be erased." [Keep my account / Delete forever] | 🗑️ |
| 20 | "Delete forever" (2nd-alert destructive button) | alert button | `AppSettings.jsx:655`, `performDelete :622-638` | Row label becomes "Deleting…" (ES "Eliminando…"). DELETE /api/account → server runs `delete_my_account()`, irreversibly removing the account and all owner-scoped data (`web/src/app/api/account/route.js:12-33`). Then clears local account storage, drops the token and `router.replace("/welcome")`. Failure: Alert "Couldn't delete account — <server error / 'Failed to delete account'>" and the row is re-enabled | 🗑️🔑 |

- **Empty / loading / error states:** Notification toggles render with defaults until stored values load; server-gated rows are simply absent when the server doesn't offer them (no error). Switch failures roll back silently. There is no "export my data" and no "change password" here.
- **Modals / sheets / alerts opened:** walk-tracking "coming soon" Alert (rows 8-9), the two delete-account Alerts (19-20), Contact/legal failure Alerts.
- **Back / dismiss behaviour:** back arrow = `router.back()` (always, even from business mode).

**Business-mode variant of Settings** (`AppSettings mode="business"`, route `src/app/business/settings.jsx`, reached from Business home — only for provider-staff accounts). Hides the pet-owner NOTIFICATIONS block and WALK TRACKING; keeps Language, Privacy & Data, Support, Account (Delete account is identical and still deletes the whole account).

| # | Element | Type | Source | Action → expected result | Risk |
|---|---|---|---|---|---|
| B1 | "Notify my phone" group (default ON): "Walk & job requests", "New bookings", "Booking changes", "New orders", "New messages", "Adoption applications" | toggle | `AppSettings.jsx:501-507, 545-561` | Saves via `setBusinessCategoryEnabled` (PUT /api/notification-prefs); governs phone pushes only | |
| B2 | "Optional push" group (default OFF): "New reviews", "Payments & payouts" | toggle | `AppSettings.jsx:563-578` | Same | |
| B3 | "In-app only" group: "Post activity", "New followers" (bell icon, no switch; "Always shown in your notifications — never sent to your phone.") | info row | `AppSettings.jsx:509-521, 580-597` | Display only | |

---

### Family & Caregivers (pet sharing) — `/pet-sharing`

- **File:** `src/app/pet-sharing.jsx` (+ `src/components/Pets/CaregiverLogWalkModal.jsx`) · **Reached from:** Menu → "Family & Caregivers" (`OwnerMenu.jsx:236`).
- **Gating / data needed:** "People with access" tab acts on the ACTIVE pet (invite only works with an owned active pet). "Shared with me" lists other people's pets shared to this account. Status words "pending"/"active" are shown raw (not translated).

| # | Element (EN label) | Type | Source | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | Back arrow; title "Family & caregivers" | header icon | `pet-sharing.jsx:101` | `router.back()` | |
| 2 | Tab pills "People with access" / "Shared with me" (ES "Personas con acceso"/"Compartido conmigo") | tab | `pet-sharing.jsx:115-118` | Switches pane | |
| 3 | Role chips "Family" / "Caregiver" (intro: "Share {name} with someone you trust. Family co-manage everything; caregivers get a scoped, optionally expiring view.") | toggle chips | `pet-sharing.jsx:146-163` | Chooses the role used for the NEXT invite (default Family) | |
| 4 | "Search people by name or @handle" box (debounced 300 ms) | text input | `pet-sharing.jsx:169-176`, `src/hooks/useSearch.js:22` | GET /api/search?q=…; matching users appear as "@username  Invite" rows; spinner while fetching | |
| 5 | Search result row "@username — Invite" (ES "Invitar") | list item | `pet-sharing.jsx:181-185` (`handleInvite :79`) | **One tap sends the invite immediately, no confirmation**: POST /api/pet-caregivers `{petId, granteeUserId, granteeUsername, role}` creates a PENDING grant visible to that user in their "Shared with me" tab; Alert **(hard-coded EN)** "Invite sent — They'll get access once they accept." Duplicate → Alert "Error — This person already has a pending or active grant for this pet" | 📤⚠️ |
| 6 | "WHO HAS ACCESS" rows: "@grantee", "Family · co-manage"/"Caregiver · scoped view" · pending/active | list item | `pet-sharing.jsx:202-225` | Display only; "No one else has access yet." when empty | |
| 7 | Trash icon on a grant row | icon button | `pet-sharing.jsx:221` (`useRevokeGrant` → `usePetSharing.js:78`) | **No confirmation**: DELETE /api/pet-caregivers/:id — removes that person's access immediately | 🗑️⚠️ |
| 8 | "Shared with me" row: pet name, "from @owner · role · status" | list item | `pet-sharing.jsx:236-244` | Display; empty: "No pets have been shared with you yet." | |
| 9 | "Log a walk" (family role + active grant only) (ES "Registrar un paseo") | button | `pet-sharing.jsx:248-251` | Opens the Log-a-walk sheet (below) for that shared pet | |
| 10 | ✓ accept (pending grants) | icon button | `pet-sharing.jsx:272-274` | POST /api/pet-caregivers/:id/respond `{accept:true}` — you gain access to the owner's pet; row turns "active" | ⚠️ |
| 11 | ✗ decline (pending grants) | icon button | `pet-sharing.jsx:279-281` | POST …/respond `{accept:false}` | ⚠️ |
| 12 | "active" chip | text | `pet-sharing.jsx:288` | Display only | |

**Log-a-walk sheet (caregiver)** — `src/components/Pets/CaregiverLogWalkModal.jsx` (bottom sheet).

| # | Element | Type | Source | Action → expected result | Risk |
|---|---|---|---|---|---|
| 13 | "X" close | icon | `CaregiverLogWalkModal.jsx:83` | Closes the sheet | |
| 14 | "Duration (minutes)" (placeholder "e.g. 20") | text input | `CaregiverLogWalkModal.jsx:96` | Number pad | |
| 15 | "Notes (optional)" ("How was the walk?") | text input | `CaregiverLogWalkModal.jsx:109` | Multiline | |
| 16 | "Save walk" (ES "Guardar paseo") | button | `CaregiverLogWalkModal.jsx:120`, mutation `:24-46` | POST /api/health/walk-logs `{petId, durationMinutes, notes}` — writes a walk into the OWNER's pet record (the household sees it and the pet's Care Ring updates); Alert "Walk logged 🐾"; failure "Couldn't log the walk. Please try again." | ⚠️📤 |

- **Empty / loading / error states:** spinners while grants load; the two empty strings above. Hook Alerts ("Invite sent", "Error", "Could not respond.", "Could not revoke.") are **(hard-coded EN)**.
- **Modals / sheets / alerts opened:** Log-a-walk sheet; Alerts above.
- **Back / dismiss behaviour:** back arrow → Profile tab root.

---

### Your dogs / Household — `/household`  (ORPHAN: no code navigates here)

- **File:** `src/app/household.jsx` · **Reached from:** nothing — no `router.push('/household')` exists in the app (checked with a repo-wide search); only reachable by deep link `pawpi://household`. Mention to the tester only so they do not hunt for it.
- **Gating / data needed:** Family-streak card requires ≥2 OWNED dogs.

| # | Element | Type | Source | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | Back arrow; title "Your dogs 🏡" (ES "Tus perros 🏡") | header icon | `household.jsx:49` | `router.back()` | |
| 2 | "Family streak" switch (2+ owned dogs) | toggle | `household.jsx:72-76`, `src/hooks/useHousehold.js:29` | POST /api/household `{action:"family_streak_opt_in"/"..._opt_out"}`; subtitle shows "N days with every dog's ring closed 🔥" when on | |
| 3 | "TAP TO SWITCH" dog rows (avatar, name, "co-cared" tag, "N-day streak 🔥", ring ✓/○) | list item | `household.jsx:84-88` | Sets that dog as the active pet and `router.back()` | |

- **Empty / loading / error states:** spinner while loading; nothing is shown on error.
- **Modals / sheets / alerts opened:** none.
- **Back / dismiss behaviour:** back arrow, and automatically after picking a dog.

---

### Emergency Card — `/emergency-card?petId=`

- **File:** `src/app/emergency-card.jsx` · **Reached from:** Health → Vet Record "Emergency card" button (`src/components/Health/HealthVetRecord.jsx:492`, `testID=open-emergency-card` at `:1759`). NOT reachable from the Profile tab.
- **Gating / data needed:** a pet (param or active). Medical fields come from the Vet Record; empty ones read "Not recorded". Banner "This pet is marked LOST" appears when Lost mode is on.

| # | Element (EN label) | Type | Source | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | "‹ Back"; title "Emergency Card" (ES "Tarjeta de emergencia") | button | `emergency-card.jsx:156` | `router.back()` | |
| 2 | Red banner "This pet is marked LOST" (+ reward) | banner | `emergency-card.jsx:170-180` | Display only | |
| 3 | The card: avatar, name, "This dog has a home 💛", rows Species / Breed / Microchip / Blood type / Spay/neuter / Allergies / Conditions / Primary vet / Vet phone / Emergency contact / Emergency phone | text | `emergency-card.jsx:183-211` | Display only; footer "Organized for a real vet. PawPi does not diagnose." | |
| 4 | "Share card (image)" (ES "Compartir tarjeta (imagen)") | button | `emergency-card.jsx:213-221` (`shareCard :110`) | Snapshots the card (it contains the pet's medical details and emergency phone) and opens the iOS share sheet | 📤🌍 |
| 5 | "Printable tag QR" section: QR + selectable URL | image/text | `emergency-card.jsx:224-236` | Display; QR points to the PUBLIC page `<base>/p/tag/<token>` — anyone who scans it sees the tag page | 🌍 |
| 6 | "Show medical info on the public tag" | toggle | `emergency-card.jsx:242-245`, PATCH `src/hooks/useEmergencyCard.js:28` | PATCH /api/emergency-card `{show_medical_on_tag}` — when ON, the public tag page exposes medical info to anyone | 🌍⚠️ |
| 7 | "How can a finder reach you?" chips "Relay (private)" / "Phone" / "Email" / "None" | toggle chips | `emergency-card.jsx:253-261` | PATCH `{contact_mode}` immediately | 🌍 |
| 8 | Phone/Email text box (only for Phone/Email modes) | text input | `emergency-card.jsx:264-271` | On end-editing PATCH `{contact_value}` — this number/email becomes visible to finders on the public tag | 🌍 |
| 9 | "Share with a vet": Scope chips "Full"/"Basic" | toggle chips | `emergency-card.jsx:284-285` | Selects scope for the next link | |
| 10 | Expires chips "24 hours" / "7 days" / "No expiry" | toggle chips | `emergency-card.jsx:290-298` | Selects TTL for the next link | |
| 11 | "Create vet link" (ES "Crear enlace para vet") | button | `emergency-card.jsx:301-313`, POST `useEmergencyCard.js:44` | POST /api/emergency-card/links `{petId, scope, ttlHours}` creates a private-but-unauthenticated URL `<base>/p/card/<token>` (anyone with the link can read it until expiry/revoke); it appears in the list below. Double-tap guarded | 🌍⚠️ |
| 12 | Active-link rows ("Full · expires <date>" + URL) | list item | `emergency-card.jsx:320-335` | Tapping the URL opens the iOS share sheet (`Share.share({message: url})`) so the user can send it to someone | 📤🌍 |
| 13 | Trash on a link | icon button | `emergency-card.jsx:336-345` | Alert "Revoke link? — This link will stop working immediately." [Cancel / Revoke] → DELETE /api/emergency-card/links/:id | 🗑️ |

- **Empty / loading / error states:** "Loading…" text; "No pet selected" if no pet; "No active links." empty text. Failed PATCH/POST are silent (no error UI).
- **Modals / sheets / alerts opened:** Revoke Alert; iOS share sheets.
- **Back / dismiss behaviour:** "‹ Back" → Vet Record.

---

### Pet insurance — Apply — `/insurance-policy`

- **File:** `src/app/insurance-policy.jsx` · **Reached from:** Services → Insurance → plan "Apply/Buy" button (`src/app/service/insurance.jsx:195-201`, passes providerId, planId, petId, terms URL via query params). Not in the Profile area otherwise.
- **Gating / data needed:** only meaningful with a providerId (else Apply does nothing); the Services "Insurance" category is capability-gated (`src/constants/servicesCategories.js:28`). LEAD-GEN ONLY: there is no in-app payment.

| # | Element | Type | Source | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | Back arrow; title "Pet insurance" (+ plan name) | header icon | `insurance-policy.jsx:99` | `router.back()` | |
| 2 | "YOUR POLICIES" cards (plan, status Under review/Awaiting payment/Active/Lapsed/Cancelled **(hard-coded EN)**, policy no., premium) | list | `insurance-policy.jsx:116-161` | Display only; for "Awaiting payment" shows "Premium: {insurer} will contact you to arrange payment — there's no payment step here." | |
| 3 | Disclaimer text ("PawPi facilitates this application — {insurer} issues and underwrites the policy…") | text | `insurance-policy.jsx:173` | Display only | |
| 4 | "Read the insurer's terms" (only if the plan has a terms URL) | link | `insurance-policy.jsx:178-180` | Opens the insurer's terms URL in the browser | |
| 5 | Checkbox "I have read and accept the insurer's terms and disclaimer." | checkbox | `insurance-policy.jsx:190-192` | Toggles acceptance (Apply stays disabled until ticked) | |
| 6 | "Apply" (ES "Solicitar") | button | `insurance-policy.jsx:214-217`, `submit :68-83`, POST `src/hooks/useInsurance.js:60` | POST /api/insurance-policies `{plan_id, provider_id, pet_id, terms_accepted:true, terms_url}` — sends a real application/lead to the insurer provider. Alert "Application sent — The insurer will review and set your premium."; failure "Couldn't apply — <message>". No charge | ⚠️📤 |

- **Empty / loading / error states:** policies block hidden when none; no loading UI. Error Alert includes the raw server message.
- **Modals / sheets / alerts opened:** success/error Alerts.
- **Back / dismiss behaviour:** back arrow → Insurance list.

---

### Lost & Found — `/lost-found`

- **File:** `src/app/lost-found.jsx` · **Reached from:** Menu → "Lost & Found" (`OwnerMenu.jsx:242`).
- **Gating / data needed:** On open the screen asks for LOCATION permission (while-in-use) to find alerts within 25 km (`lost-found.jsx:52-65`); denying just lists unfiltered alerts. "My pet" tab acts on the ACTIVE pet. This feature notifies real users.

| # | Element (EN label) | Type | Source | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | Back arrow; title "Lost & Found" (ES "Perdidos y encontrados") | header icon | `lost-found.jsx:83` | `router.back()` | |
| 2 | Tab pills "Alerts near me" / "My pet" (ES "Alertas cerca mío"/"Mi mascota") | tab | `lost-found.jsx:95-107` | Switches pane | |
| 3 | Nearby alert card: red "LOST" badge, pet name, breed, "Last seen: <area>", notes, "Reward: …" | list item | `lost-found.jsx:126-162` | Display; empty: "No lost pets nearby — Hopefully it stays that way." | |
| 4 | "I've seen this pet" (ES "Vi a esta mascota") | button | `lost-found.jsx:154-158` | Opens the Report-a-sighting sheet (rows 7-9) | |
| 5 | "My pet" empty state: "{name} is safe" + hint "If they ever go missing, mark them lost to alert nearby users and followers." | text | `lost-found.jsx:169-176` | Display only | |
| 6 | "Mark as lost" (ES "Marcar como perdido") (disabled w/o an active pet) | button | `lost-found.jsx:177-185` | Opens the Mark-as-lost sheet (rows 10-16) | |
| 7 | "LOST MODE ON" card (pet, last seen) with "Found — resolve" | button | `lost-found.jsx:213-236`, hook `src/hooks/useLostFound.js:102` | POST /api/lost-reports/:id/resolve — clears lost mode; Alert "Welcome home! 🐾 — Lost mode cleared." (no confirmation first) | ⚠️🌍 |
| 8 | "SIGHTINGS (N)" list (note, "by @user") / "No sightings reported yet." | list | `lost-found.jsx:238-252` | Display only | |

**Report-a-sighting sheet** (`SightingModal`, page sheet, `lost-found.jsx:257-308`)

| # | Element | Type | Source | Action → expected result | Risk |
|---|---|---|---|---|---|
| 9 | "X" close | icon | `lost-found.jsx:272` | Closes | |
| 9b | Note box ("Saw them near the dog park, heading north...") | text input | `lost-found.jsx:280` | Required (send disabled when empty) | |
| 9c | "Send sighting" (ES "Enviar avistamiento") | button | `lost-found.jsx:289-293`, POST `useLostFound.js:79` | POST /api/lost-reports/:id/sightings `{note,…}` — the pet's owner gets a bell notification + phone push; Alert "Thank you! — The owner has been notified of your sighting." Do NOT use against a real person's lost-pet report | 📤⚠️ |

**Mark-as-lost sheet** (`MarkLostModal`, full screen, `lost-found.jsx:310-392`)

| # | Element | Type | Source | Action → expected result | Risk |
|---|---|---|---|---|---|
| 10 | "X" close | icon | `lost-found.jsx:339` | Closes (inputs not cleared) | |
| 11 | "Last-seen location" map (Apple Maps) — tap to drop a pin; "My location" button; address text box ("Enter an address" geocoder) | map/input | `lost-found.jsx:345`, `src/components/Map/MapLocationPicker.jsx:219-225, 273, 308` | Pin/coordinates saved with the report; "Tap the map to drop a pin" until set | |
| 12 | "Area / cross streets" | text input | `lost-found.jsx:347` | Shown publicly as "Last seen: …" | 🌍 |
| 13 | "Notes" ("Collar color, temperament, anything that helps...") | text input | `lost-found.jsx:355` | Shown publicly on the alert card | 🌍 |
| 14 | "Reward (optional)" ("e.g. $100") | text input | `lost-found.jsx:365` | Shown publicly | 🌍 |
| 15 | "Activate lost mode" (ES "Activar modo perdido") | button | `lost-found.jsx:373-377`, POST `useLostFound.js:55` | POST /api/lost-reports `{petId,lat,lng,lastSeenArea,notes,reward}` — publishes a public LOST alert (visible in other users' "Alerts near me") and notifies the pet's FOLLOWERS (bell + capped phone pushes: `web/src/app/api/lost-reports/route.js:130-152`). Alert "Lost mode on — Nearby users and followers have been alerted." The pet is also flagged LOST on its public tag/Emergency Card | 📤🌍⚠️ |

- **Empty / loading / error states:** red spinner while nearby alerts load; empty copy above; mutation failures show Alert "Error — <message>" (hard-coded EN titles, raw server message).
- **Modals / sheets / alerts opened:** Sighting sheet, Mark-lost sheet, Alerts above.
- **Back / dismiss behaviour:** back arrow → Profile tab root; sheets close via X.

---

### Nutrition — `/nutrition`  (NOT reachable in production)

- **File:** `src/app/nutrition.jsx` · **Reached from:** Health tab "Nutrition" button, which is compiled out (`SHOW_NUTRITION = false`, `src/app/(tabs)/health.jsx:36,111`). Only a deep link (`pawpi://nutrition`) opens it. Documented for completeness; a tester should NOT expect to find it.
- **Gating / data needed:** active pet.

| # | Element | Type | Source | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | Back arrow; title "Nutrition" (ES "Nutrición") | header icon | `nutrition.jsx:109` | `router.back()` | |
| 2 | Recall alert cards "Food recall alert" + "View the recall notice" link | list/link | `nutrition.jsx:128-155` | Link opens the recall URL in the browser | |
| 3 | Recall "X" dismiss | icon | `nutrition.jsx:147` | PATCH /api/recall-matches/:id (hides the alert) | |
| 4 | Brand ("Food brand"), Product ("Product / recipe"), Portion, Calories ("Target calories / day"), Notes | text input | `nutrition.jsx:166-194` | Free text; calories numeric | |
| 5 | Form chips "Dry" / "Wet" / "Raw" / "Mixed" | toggle chips | `nutrition.jsx:174` | Single select | |
| 6 | "Save plan" / "Update plan" (disabled until Brand has text) | button | `nutrition.jsx:201-202` | POST (new) or PATCH /api/nutrition-plans[/id]; Alert "Nutrition plan saved — You can update it anytime." / "Couldn't save the plan" | |

- **Empty / loading / error states:** none specific; disclaimer text always shown ("It does not diagnose or prescribe a diet…").
- **Modals / sheets / alerts opened:** save/error Alerts.
- **Back / dismiss behaviour:** back arrow.

---

### Link-only destinations reached from this area (documented by other parts)

| # | Destination | Entry in this area | Source | Notes |
|---|---|---|---|---|
| L1 | Community forum `/(tabs)/more/community` (+ thread/compose) | Menu → Community | `OwnerMenu.jsx:208` | Posting threads/votes are public (covered elsewhere) |
| L2 | Reminders & Routines `/(tabs)/more/reminders` (tabs "Routines" and "Settings" inside it) | Menu → Reminders & Routines | `OwnerMenu.jsx:258`, screen `src/app/(tabs)/more/reminders.jsx:127-135` | Header "Reminders & Routines" **(hard-coded EN)**; contents covered elsewhere |
| L3 | Memories & Wrapped `/memories` | Menu → Memories & Wrapped | `OwnerMenu.jsx:252` | Covered elsewhere |
| L4 | Business home `/business` | Menu → Business (staff only) | `OwnerMenu.jsx:186` | Covered elsewhere |
| L5 | Followers / Following list `/follows` | Profile stats (rows 16-17 of the Profile table) | `pet-profile.jsx:217-220` | Covered elsewhere |
| L6 | Chat `/chat` | Profile "Message" button | `pet-profile.jsx:103` | Covered elsewhere |
| L7 | Adoption `/service/adoption`, Following businesses `/service/following` | My Hub cards | `hub.jsx:210, 233` | Covered elsewhere |
| L8 | Feed "Getting started" card | NOT linked from the Profile tab (lives on Feed `src/app/(tabs)/index.jsx:303`); it deep-links into Edit Profile | `src/components/Home/GettingStartedCard.jsx` | Covered by the Feed part |

---

## Risky actions found in Part B

- `src/components/More/OwnerMenu.jsx:267-286` — red "Reset App Data" button is really **log out with no confirmation**: clears local account data + token, `router.replace("/welcome")`; no server call. 🔑 tester must sign in again (email or Apple/Google). Label is misleading — it does not erase the account.
- `src/components/Settings/AppSettings.jsx:622-661` (button `:913`, final confirm `:655`) — **Delete account** → `DELETE /api/account` (`delete_my_account()`): irreversibly deletes the account, all pets, health records, posts and other owner data, then logs out. Two confirmation Alerts. Never run on a real/demo account you want to keep (e.g. the App Review demo account). 🗑️🔑
- `src/app/pet-profile.jsx:476-503` — Follow / Unfollow another pet: `POST|DELETE /api/pets/:id/follow {followerPetId}`; the pet's owner receives a "started following your pet" notification on a new follow. 📤🌍
- `src/app/pet-profile.jsx:506-530` — Message: `POST /api/dm-threads {otherUserId}` opens a DM thread with a real user and routes to chat. 📤
- `src/components/Feed/PostDetailModal.jsx:376` / double-tap `:253` (handler `src/app/pet-profile.jsx:157`) — Paw/un-paw a post: `POST|DELETE /api/posts/:id/paw`; notifies the post owner. 📤🌍
- `src/components/Feed/BarkModal.jsx:346-360` — send a bark (public comment): `POST /api/posts/:id/barks`; notifies the post owner. 📤🌍
- `src/components/Feed/BarkModal.jsx:275` — delete own bark `DELETE /api/posts/:id/barks/:barkId`. 🗑️
- `src/components/Feed/PostDetailModal.jsx:307-315` — Save edited caption `PATCH /api/posts/:id` (public post text). 🌍
- `src/app/pet-profile.jsx:182-205` (trigger `PostDetailModal.jsx:167`) — Delete own post `DELETE /api/posts/:id` (also reopens today's Daily). 🗑️🌍
- `src/components/Feed/DailyShareButton.jsx:70-101` and `src/components/Feed/ShareCardButton.jsx:60-72` (deck `ShareCardDeck.jsx:59`) — render an image and open the iOS share sheet, sending the pet's photo/stats and public PawPi link to whichever app/person the tester picks. 📤🌍
- `src/components/moderation/ModerationMenu.jsx:182-192` — Report: `POST /api/reports {target_type,target_id,reason}` goes to the real moderation team on first tap (no confirm). ⚠️
- `src/components/moderation/ModerationMenu.jsx:96-117` — Block user: `POST /api/blocks {blocked_user_id}`; mutual, hides all content and messages between the two accounts; on the pushed pet profile it also exits the screen. ⚠️
- `src/components/Pets/AddDogModal.jsx:110-157` — Save new dog: `POST /api/pets` (+ photo upload) creates a real pet and makes it the active dog; creates a pet whose social profile other users can find/open. ⚠️🌍
- `src/app/(tabs)/more/profile-edit.jsx:135-262` — Save changes: `PATCH /api/pets/:id` (name, public @handle, photo, breed, weight, dates, notes) — changes what other users see on the public profile. 🌍⚠️
- `src/app/(tabs)/more/data-access.jsx:234 / 253 / 300` — Approve (`PATCH /api/care-access/grants/:id {action:"approve"}`, no confirm) grants a vet/provider read/write access to the pet's medical record; Deny / Revoke (`{action:"deny"|"revoke"}`) withdraw it. ⚠️📤
- `src/app/pet-sharing.jsx:181-185` (`handleInvite :79`) — tapping a search result instantly sends a family/caregiver invite: `POST /api/pet-caregivers {petId, granteeUserId, role}` (no confirmation); creates a pending grant visible to that user. 📤⚠️
- `src/app/pet-sharing.jsx:221` — trash icon revokes access instantly: `DELETE /api/pet-caregivers/:id` (no confirmation). 🗑️⚠️
- `src/app/pet-sharing.jsx:272-281` — Accept / Decline a received grant: `POST /api/pet-caregivers/:id/respond {accept}`. ⚠️
- `src/components/Pets/CaregiverLogWalkModal.jsx:120` — Save walk: `POST /api/health/walk-logs {petId,…}` writes into another owner's pet history and Care Ring. ⚠️📤
- `src/app/lost-found.jsx:373-377` — Activate lost mode: `POST /api/lost-reports {petId,lat,lng,lastSeenArea,notes,reward}` publishes a public LOST alert and notifies the pet's followers (bell + phone push; `web/src/app/api/lost-reports/route.js:130-152`); also marks the pet LOST on its public tag. 📤🌍⚠️
- `src/app/lost-found.jsx:289-293` — Send sighting: `POST /api/lost-reports/:id/sightings` notifies the lost pet's real owner. 📤⚠️
- `src/app/lost-found.jsx:226` — "Found — resolve": `POST /api/lost-reports/:id/resolve`, no confirmation, clears lost mode publicly. ⚠️🌍
- `src/app/emergency-card.jsx:242-245` — "Show medical info on the public tag": `PATCH /api/emergency-card {show_medical_on_tag}` exposes medical info on a public QR page. 🌍⚠️
- `src/app/emergency-card.jsx:253-271` — finder contact mode / phone / email: `PATCH /api/emergency-card {contact_mode|contact_value}`; the number/email becomes visible to anyone who scans the tag. 🌍
- `src/app/emergency-card.jsx:301-313` — Create vet link: `POST /api/emergency-card/links {petId,scope,ttlHours}` mints a URL anyone can open until expiry. 🌍⚠️
- `src/app/emergency-card.jsx:213 / 330` — Share card image / share vet link via iOS share sheet to a person of the tester's choosing. 📤🌍
- `src/app/emergency-card.jsx:336-345` — Revoke link `DELETE /api/emergency-card/links/:id` (confirmed by Alert). 🗑️
- `src/app/insurance-policy.jsx:214-217` — Apply: `POST /api/insurance-policies {plan_id,provider_id,pet_id,terms_accepted,terms_url}` sends a real application to an insurer (no payment in-app). ⚠️📤
- `src/components/Settings/AppSettings.jsx:263-277, 359-365` — promotional notification toggles ("Weekly summary notification", "Occasional friendly notifications", "Occasional emails from PawPi") → `PUT /api/notification-prefs`; ON opts the tester into real push/email. ⚠️📤
- `src/components/Settings/AppSettings.jsx:874` — Contact Us opens the Mail composer to support@pawpi.info; only sends if the tester presses Send. 📤
- `src/components/Settings/AppSettings.jsx:101-117` — language change also calls `PUT /api/user-profile/locale` (benign; changes the language of emails sent to this account). ⚠️ (minor)


---

<!-- ===== PART C ===== -->

## PART C — Health tab + Reminders & Routines (QA inventory)
Merged from five area sections below (A. Today, B. Track, C. Weight/Wellness/Walk/PhotoCheck/VetSummary/Insights, D. Vet Record, E. Reminders & Routines). Paths are relative to `anything/apps/mobile/`. Each area begins with its own cross-cutting notes (permissions, hidden/dead code). Final consolidated risk list is at the end.
**Headline facts for the tester:** Insights section and Nutrition button are hidden by flags (`SHOW_INSIGHTS=false`, `SHOW_NUTRITION=false`), so the Health section strip shows Today / Track / Vet Record. LifeStageCard, HouseholdLeaderboardCard, HealthReminders, the five `*Dashboard` loggers, legacy Medication/Vaccine/Preventive routine modals, UpcomingTab, ReminderCreationModal and DeleteConfirmationModal are not mounted anywhere (nothing to test). No fake/mock-looking sample data should be expected except where noted in each area.


---
## AREA: Health hub shell + Today

## Part C — Health tab shell + Health → Today (agent TODAY)

Conventions: all paths are relative to `anything/apps/mobile/`. EN text is resolved from `src/i18n/locales/en.json` (ES in `es.json`, shown only when short). "Hardcoded EN" means the string is NOT translated (stays English in the Spanish UI) — a tester on an ES device should flag these as i18n gaps.

Permission prompts a tester can hit in THIS area (iOS `infoPlist` in `app.json`):
- **Camera** — "PawPi uses the camera so you can take photos of your pet for their profile, daily moments, health checks and vet records." (Quick Check "Take photo", Add-a-dog photo, Photo-check reminder → see TRACK2.)
- **Photo library** — "PawPi accesses your photo library so you can choose photos and documents for your pet's profile, posts, health records and chats." (Quick Check "Choose photo", Add-a-dog gallery.) The app also shows its own pre-alert on denial: "Photo access needed / Photo access is needed to add a photo. You can still save the check without one." (`GeneralCheckModal.jsx:236-238`) or "Camera access needed / Please allow camera access in settings." (`AddDogModal.jsx:75`).
- **Calendar** — `NSCalendarsFullAccessUsageDescription`: "PawPi adds your pet's appointments, bookings and reminders to your calendar so you don't miss them." Preceded by an in-app rationale alert **"Calendar Access" / "PawPi can add walk blocks to your calendar so your time stays protected."** with buttons "Not now" / "Allow calendar access" (`src/utils/calendarIntegration.js:56-66`). Triggered by Walk countdown card → "Add to calendar".
- **Notifications** — NO prompt is raised from Today. Snooze and the Care Ring "streak-save" nudge only schedule LOCAL notifications silently and only if permission was already granted (`src/utils/notifications.js:245`, `src/utils/engagementNotifications.js:98`). The permission explainer ("🔔 Enable Reminders" / "Maybe later" / "Enable reminders", `src/utils/notifications.js:79-98`) is raised from the Reminders screen (other agent).
- **Location / Microphone** — not requested by anything on Health Today itself (Walk "Start walk" modal is TRACK2's area).

---

### Health tab shell (Health Hub) — `/(tabs)/health`
- **File:** `src/app/(tabs)/health.jsx` · **Reached from:** bottom tab bar "Health" (Expo Router tab). Also deep-linked from the Vet Summary readiness card (`/(tabs)/health?section=vet-record`, `src/components/Health/VetSummaryReadinessCard.jsx:54`), the Care Ring segment pills (`HealthToday.jsx:543`), and anything that pushes `?section=today|track|vet-record`.
- **Gating / data needed:** none to open. Content is mounted lazily the first time the tab is focused (`FirstFocusGate`, `health.jsx:233-238`) — first open shows a blank cream screen for an instant. Most cards need ≥1 pet (see Today). **Insights section is hidden** (`SHOW_INSIGHTS = false`, `src/constants/healthSections.js:10`) and **Nutrition header button is hidden** (`SHOW_NUTRITION = false`, `health.jsx:36`), so a tester will NOT see either; a `?section=insights` deep link is ignored (falls back to Today).
| # | Element (EN label from en.json, ES if short) | Type | Source (`path:line`) | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | "Health Hub" 🩺 (ES "Centro de Salud") | header title | `src/app/(tabs)/health.jsx:106-109` | Static title. | |
| 2 | Nutrition button ("Nutrition") | header button | `src/app/(tabs)/health.jsx:111-133` | **Not rendered in production** (flag off). If enabled: `router.push("/nutrition")`. | |
| 3 | Pet switcher pill (current pet avatar + name + chevron; shows "Add your dog" when no pet) | button | `src/app/(tabs)/health.jsx:138` → `src/components/Pets/PetSwitcher.jsx:63-93` | Opens "My Dogs" picker sheet (see **Pet picker sheet** below). | |
| 4 | Disclaimer box: "PawPi helps you track changes and prepare better conversations with your veterinarian. It does not diagnose or replace professional veterinary care." (ES "PawPi te ayuda a registrar cambios y a prepararte para mejores conversaciones con tu veterinario. No diagnostica ni reemplaza la atención veterinaria profesional.") | static text | `src/app/(tabs)/health.jsx:151-153` | Informational only. | |
| 5 | Section chip "Today" / ES "Hoy" (heart icon) | tab chip | `src/app/(tabs)/health.jsx:172-206`, def `src/constants/healthSections.js:14` | `setActiveSection("today")` → renders Health Today (below). Active chip = coral fill. | |
| 6 | Section chip "Track" / ES "Registrar" (activity icon) | tab chip | `src/app/(tabs)/health.jsx:178`, `healthSections.js:15` | Renders `HealthTrack` (TRACK agent). Fires anonymous funnel event `health_logging/track_open` (`health.jsx:55-57`). Track is wrapped in a shared vertical ScrollView with NO pull-to-refresh (`health.jsx:215-225`). | |
| 7 | Section chip "Vet Record" / ES "Historia clínica" (file icon) | tab chip | `src/app/(tabs)/health.jsx:178`, `healthSections.js:17` | Renders `HealthVetRecord` (VETREC agent; owns its own scroll + pull-to-refresh). | |
| 8 | Chip strip itself | horizontal scroll | `src/app/(tabs)/health.jsx:166-171` | Horizontal swipe (only 3 chips today so rarely needed). | |
| 9 | Deep-link `?section=` param | route param | `src/app/(tabs)/health.jsx:44-63` | If `section` ∈ {today, track, vet-record}, switches to it even if the screen is already mounted. Unknown/absent → Today. | |
- **Empty / loading / error states:** First focus: blank cream placeholder (`FirstFocusGate`). Each section owns its own loading/empty states. No error UI at shell level.
- **Modals / sheets / alerts opened:** Pet picker sheet / Add-a-dog modal (below).
- **Back / dismiss behaviour:** Tab root — no back button. Switching tabs and returning keeps the chosen section (component state) unless a `section` param changes.

### Pet picker sheet ("My Dogs") — `PetPickerSheet` (opened from the pet switcher, used app-wide)
- **File:** `src/components/Pets/PetPickerSheet.jsx` · **Reached from:** pet switcher pill in `src/app/(tabs)/health.jsx:138` → `src/components/Pets/PetSwitcher.jsx:64`.
- **Gating / data needed:** real pets of the logged-in owner only (no mock data). With zero pets only the "Add a dog" row shows.
| # | Element | Type | Source | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | Dim backdrop (tap outside sheet) | button | `src/components/Pets/PetPickerSheet.jsx:50` (TouchableOpacity `onPress={onClose}`) | Closes the sheet. | |
| 2 | "My Dogs" title (ES "Mis perros") | static | `src/components/Pets/PetPickerSheet.jsx:83` | — | |
| 3 | Pet row (avatar, name, breed, ✓ on active) | list item | `src/components/Pets/PetPickerSheet.jsx:26,102` | `setCurrentPet(id)` + close → every Health card below re-queries for the chosen pet. Switching pets should NOT show the previous pet's data (known past cache-bleed bug area — verify). | |
| 4 | "+ Add a dog" (ES "Agregar un perro") | button | `src/components/Pets/PetPickerSheet.jsx:146` | Closes picker and opens **Add a dog** modal. | |
- **Empty / loading / error states:** spinner while pets load; no error UI.
- **Modals / sheets / alerts opened:** Add a dog modal (below).
- **Back / dismiss behaviour:** Android back / swipe-down → `onRequestClose` closes.

### Add a dog modal — `AddDogModal`
- **File:** `src/components/Pets/AddDogModal.jsx` · **Reached from:** Pet picker sheet → "Add a dog" (`PetSwitcher.jsx:21-24,103`).
- **Gating / data needed:** none. Creating a pet is a real production write.
| # | Element (EN) | Type | Source | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | X (top-left close) | header icon | `AddDogModal.jsx:182` (`onPress={close}`) | Closes modal, form reset. | |
| 2 | Title "Add a dog" | static | `AddDogModal.jsx:188` | — | |
| 3 | Photo circle: "Add photo" / "Change photo" | button | `AddDogModal.jsx:226,242` (`handlePickPhoto`, lines 90-106) | iOS: ActionSheet "Cancel / 📷 Take a photo / 🖼️ Choose from gallery"; Android: alert "Add a photo — How would you like to add a photo?" with "Take a photo", "Choose from gallery", "Cancel". Take photo → **camera permission prompt** (denied → "Camera access needed / Please allow camera access in settings."). Gallery → **photo-library prompt**. Selected image shown as avatar (upload happens on Save). | ⚠️ |
| 4 | Name text input ("Name", placeholder "e.g. Buddy") | text input | `AddDogModal.jsx:249-253` | Required. | |
| 5 | Breed picker ("Breed") | searchable picker (BreedPicker) | `AddDogModal.jsx:258-262` | Pick from canonical list / "Mixed breed" / custom. | |
| 6 | Gender chips: Male / Female / Unknown (ES Macho/Hembra/Sin especificar) | toggle chips | `AddDogModal.jsx:266-277` | `setField("gender")`. | |
| 7 | Weight input + unit chips | text input + chips | `AddDogModal.jsx:303-330` | Numeric only (non-digits stripped); unit toggle. | |
| 8 | Birthday ("Birthday") | native date picker (DateField) | `AddDogModal.jsx:357-360` | Canonical YYYY-MM-DD. | |
| 9 | Notes ("Allergies, food preferences, medical conditions...") | multiline text input | `AddDogModal.jsx:372-378` | Free text. | |
| 10 | Save | button | `AddDogModal.jsx:399-418`, handler `108-156` | Disabled until Name filled. Empty name → alert "Name needed / Please enter your dog's name." Uploads photo (`POST /api/upload`) then `POST /api/pets`; makes the new pet the active pet; alert "Saved / {name} is ready to go!"; closes. Failure: "Could not save / Could not save. Please try again." | ⚠️ creates a real pet record (+ uploads photo; avatar may be visible on the public pet profile) |
- **Empty / loading / error states:** Save spinner while uploading/saving; generic error alert on failure (no raw error leaked — message is the fixed i18n body).
- **Modals / sheets / alerts opened:** inline alerts above.
- **Back / dismiss behaviour:** X or Android back → `close()` (form reset, no confirm-discard prompt).

---

### Health Today — section "Today" (`HealthToday`)
- **File:** `src/components/Health/HealthToday.jsx` · **Reached from:** Health tab → default section / "Today" chip (`src/app/(tabs)/health.jsx:67-68`).
- **Gating / data needed:** Needs an active pet (`currentPet`). Care-ring block (ring, insight, pack streaks, leagues, vet-summary readiness) renders only when `currentPet.id != null` (`HealthToday.jsx:537`). Reminder lists come from the pet's routines/reminders (store `remindersStore`, built by `loadRoutines(petId)`) plus vet appointments (`GET /api/vet-appointments?petId=`). **A brand-new pet with no routines/appointments sees only the Care Ring cards + the "All clear for now" card.** Section windows: Due Soon = time-sensitive items ≤ 1 h away (shows max 2 cards); Next Up = anything ≤ 6 h away (shows max 3); Upcoming = lead-time "heads-up" window; Overdue = past-due items of persistent types (wellness_check, medical_care, photo_check, vet_appointment); Snoozed = actively snoozed items (`src/utils/reminderSections.js`). Overdue/Snoozed auto-collapse when more than 5 items (`HealthToday.jsx:66,180,204`).
| # | Element (EN label from en.json, ES if short) | Type | Source (`path:line`) | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | Pull-to-refresh on the whole Today scroll | pull-to-refresh | `src/components/Health/HealthToday.jsx:517-518` (handler `117-134`) | Advances the section clock (items that just passed reclassify to Overdue), reloads the pet's routines, refetches dismissals / wellness / weight / medical-care / photo-check logs / vet-appointment reminders and the care ring. Spinner stops when done. | |
| 2 | Title "Health Today" (ES "Salud hoy") + long date (e.g. "Friday, October 16") | header | `HealthToday.jsx:524-533` | Static. | |
| 3 | Care Ring card | card | `HealthToday.jsx:537-545` | See **Care Ring card** section. Ring/segment taps → `router.push` (`seg==="moment"` → `/(tabs)` Feed tab; "walk"/"care" → `/(tabs)/health` i.e. stays here). | |
| 4 | Activity insight card | card | `HealthToday.jsx:548` | See section below. | |
| 5 | Pack streaks card | card | `HealthToday.jsx:552` | See section below. | 📤 |
| 6 | Care leagues card | card | `HealthToday.jsx:556` | See section below. | ⚠️ |
| 7 | Vet-summary readiness card | card | `HealthToday.jsx:560` | See section below. | |
| 8 | "Overdue (N)" header row with chevron (ES "Vencidos (N)") | list item / expand toggle | `HealthToday.jsx:568-593` | Only when N>0. Toggles expand/collapse (user choice sticks; auto-collapsed if >5). | |
| 9 | Overdue card: icon, title, red "scheduled time" line | list item | `HealthToday.jsx:603-631` | Static (time via `formatScheduledTime`). | |
| 10 | Overdue primary action button — label depends on type: feeding "Log food", walk "Start walk", medication "Mark given", photo_check "Take photo", general_check "Start check", weight_check "Log weight", wellness_check = the routine's own `primaryAction` or "Start check", vet_appointment "View appointment", anything else "Complete" | button | `HealthToday.jsx:634-652`, label map `446-472` | `handleComplete(reminder)` (`211-314`). **Outcome by type:** vet_appointment → alert "✅ Done! / Vet appointment marked as completed" (does NOT open the appointment; only acknowledges). photo_check → opens PhotoCheckCaptureModal (TRACK2). wellness_check → opens WellnessLogModal (TRACK2). medical_care → alert "{title} / How did it go?" with options (vaccine: "{primaryAction or Add vet record}" / "Mark completed"; other care: "{primaryAction or Mark as given}" / "Something was off") + "Cancel"; "given/completed/add vet record" → `POST /api/health/medical-care-logs` then alert "✅ Saved / {title} logged" (or "{title} saved to vet record"); "Something was off" → Medical-care issue modal. feeding → alert "How did it go?" with "Log as usual" / "Something was off" / Cancel; "Log as usual" → `POST /api/health/food-logs` + alert "✅ Logged / {title} logged"; "Something was off" → Feeding issue modal. **Every other type (walk, general_check, weight_check, medication, water, etc.)** → immediately marks the reminder complete + alert "✅ Done! / {title} marked as complete" **without opening any logger and without writing a log** (e.g. "Start walk" / "Start check" / "Log weight" here just tick it off). Save failure: "Could not save / We couldn't save this entry. Please try again." | ⚠️ writes health logs (food / medical-care) |
| 11 | Overdue "Skip" button (X icon) | button | `HealthToday.jsx:653-671`, handler `383-394` | Durable skip: `POST /api/health/reminder-dismissals` {petId, routineId, reminderType, instanceKey, scheduledDate}; item disappears (also after app restart). Failure: "Could not skip / We couldn't skip this reminder. Please try again." No confirmation prompt, no undo. | ⚠️ |
| 12 | "Snoozed (N)" header row (clock icon, ES "Pospuestos (N)") | expand toggle | `HealthToday.jsx:685-710` | Only when ≥1 active snooze. Same collapse rule as Overdue. | |
| 13 | Snoozed card: icon, title, "{scheduled} · snoozed until {until}" (ES "… pospuesto hasta …") | list item | `HealthToday.jsx:720-754` | Static. | |
| 14 | Snoozed primary action (same labels/behaviour as #10) | button | `HealthToday.jsx:757-775` | `handleComplete(reminder)` — same outcomes as #10. | ⚠️ |
| 15 | Snoozed "Skip" button | button | `HealthToday.jsx:776-794` | Same as #11 and also clears the snooze. **Label is hardcoded EN "Skip"** (`HealthToday.jsx:792`) — Overdue's one is translated ("Omitir"). | ⚠️ |
| 16 | "Due Soon" (ES "Pronto") header + coral count badge | header | `HealthToday.jsx:805-831` | Count badge shows the full number but only the first 2 cards are rendered (`slice(0, 2)`, line 832). | |
| 17 | Countdown cards (Feeding / Walk / Vet appointment / generic) | cards | `HealthToday.jsx:475-514`, `832` | See **Countdown cards** sections below. | |
| 18 | "Upcoming" (ES "Próximos") header + terracotta count badge | header | `HealthToday.jsx:838-864` | Heads-up section for lead-time reminders (e.g. "1 day before"). | |
| 19 | Heads-up cards | cards | `HealthToday.jsx:867-875` | See **Heads-up card**. | |
| 20 | "Next Up" (ES "Siguiente") header | header | `HealthToday.jsx:881-900` | Section for up to 3 actionable items in the next 6 h. | |
| 21 | "Manage routines >" link (ES "Gestionar rutinas") | link | `HealthToday.jsx:901-914` (`router.push("/(tabs)/more/reminders")`) | Opens the Reminders/Routines screen (REMINDERS agent). | |
| 22 | Next Up card: icon, title, "scheduled time · relative time" (e.g. "7:00 PM · in 2 hours" — relative text is hardcoded EN: "in X min", "in N hours", "N min overdue", "now", `src/data/remindersData.js:94-116`) | list item | `HealthToday.jsx:934-959` | Static. | |
| 23 | Next Up action button (same label map as #10) | button | `HealthToday.jsx:961-978` | `handleComplete(reminder)` — same outcomes as #10 (note: a walk here is just ticked off, the real "Start walk" flow only exists on the Due Soon walk card). | ⚠️ |
| 24 | Empty state card 📅 "All clear for now" / "No reminders scheduled in the next few hours" (ES "Todo en orden por ahora" / "No hay recordatorios en las próximas horas") + "Manage routines >" link | empty state | `HealthToday.jsx:987-1043` (link `1011-1024`) | Shown only when ALL of Next Up / Due Soon / Overdue / Snoozed / Upcoming are empty. Link opens Reminders screen. | |
- **Empty / loading / error states:** No pet → no care-ring block and reminders list is empty → "All clear" card only (and the header switcher says "Add your dog"). No dedicated loading skeleton; cards appear as queries resolve. Errors are shown only via the alerts listed (fixed i18n text). The medical-care issue save error alert is **hardcoded EN** ("Could not save" / "We couldn't save this entry. Please try again.", `HealthToday.jsx:345-348`). Raw `res.statusText` is thrown into `console.error` only, never shown.
- **Modals / sheets / alerts opened:** SnoozeModal, MedicalCareIssueModal, FeedingIssueModal, PhotoCheckCaptureModal (TRACK2), WellnessLogModal (TRACK2), Quick Check (GeneralCheckModal quick mode, via Care Ring), VetAppointmentDetailModal (via vet countdown card), plus the alerts documented in rows #10/#11.
- **Back / dismiss behaviour:** Section of a tab; no back. All modals close with their X / Android back. After any save the reminder's card disappears from the lists (store `completeReminder` + cache invalidation). Anything done here also fills the Care Ring "Care" segment live.

---

### Care Ring card ("Rex's day") — `CareRingCard` + `CareRing`
- **File:** `src/components/Health/CareRingCard.jsx`, ring graphic `src/components/Health/CareRing.jsx` · **Reached from:** top of Health Today (`HealthToday.jsx:539`).
- **Gating / data needed:** ≥1 pet. State from `GET /api/pets/{petId}/care-ring?day=YYYY-MM-DD` (`src/hooks/useCareRing.js:29`); three segments Walk / Moment / Care. Streak line needs a live streak > 0. "Restore your streak" only when the server says `repair_available`. Quick-check block hidden if Care already done today, or rest day, or paused.
| # | Element (EN label, ES if short) | Type | Source (`path:line`) | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | Title "{name}'s day" (ES "El día de {name}") / "Today's ring" when no name | header | `CareRingCard.jsx:102` | Static. | |
| 2 | Ring graphic (3 arcs, centre 🐾 / 🎉 / 🌙 and "N/3") | tappable arcs | `CareRing.jsx:87` (arc `onPress`) → `HealthToday.jsx:542-544` | Tap an arc → `onPressSegment(seg)`: Moment arc → Feed tab (`/(tabs)`); Walk or Care arc → `router.push("/(tabs)/health)"` (no visible change, you are already there). When the 3rd segment closes: one-time pop animation + success haptic. | |
| 3 | Status line: "Start {name}'s day — a walk, a photo, a little care." / "One more thing to finish {name}'s day." / "{name}'s day is complete 🎉" / "Rest day — {name}'s streak is safe." / "Paused — {name}'s streak is safe until {date}." | text | `CareRingCard.jsx:96-99,107` | Static. | |
| 4 | "{N} of 3" progress; "{name}'s streak is safe — 🔥 {count}" | text | `CareRingCard.jsx:108-110` | Static. | |
| 5 | "🔥 Restore your streak" + "Missed a day? Bring your 🔥 {count} streak back — no harm done." | button | `CareRingCard.jsx:116-123` | `POST /api/pets/{petId}/care-ring` {action:"repair_streak"}; ring refetches, the button disappears. No confirmation. (ES "Recupera tu racha") | |
| 6 | Pill "Walk" / "Moment" / "Care" (✓ prefix when done) (ES Paseo / Momento / Cuidado); a11y labels "Log a walk to fill this segment." / "Post today's moment to fill this segment." / "Log any care action to fill this segment." | button ×3 | `CareRingCard.jsx:128-142` | Same routing as the arcs (#2). | |
| 7 | "＋ Log a quick check-in" + hint "A quick guided look at {name} — eyes, ears, skin, mood and more. Two taps if all's well." (ES "Registrar un chequeo rápido") | button | `CareRingCard.jsx:167-177` | Opens the **Quick Check** sheet (below). Hidden when Care is done / rest day / paused. | |
| 8 | After saving a quick check: "Logged ✓" + **"Undo"** (ES "Registrado ✓" / "Deshacer") | text + link | `CareRingCard.jsx:152-165`, handler `65-74` | Undo → `DELETE /api/health/general-checks?id=<id>` removing the just-saved check (Care segment may re-open). Failure is silent. | 🗑️ |
| 9 | "Taking a rest day?" (switch-role link) / when on: "It's not a rest day" (ES "¿Tomas un día de descanso?" / "No es un día de descanso") | toggle | `CareRingCard.jsx:196-206` | `POST /api/pets/{petId}/care-ring` {action:"set_rest", day, rest_day} → ring shows calm "resting" state (🌙, all arcs sage), streak protected. | |
| 10 | "Pause for a while" (ES "Pausar por un tiempo") | link | `CareRingCard.jsx:207-209` | Toggles the pause box. | |
| 11 | Pause box: hint "Away for a bit? Pick a day to resume — the streak stays safe." + date field "Pause {name}'s ring" | native date picker (DateField) | `CareRingCard.jsx:213-229` | Date must be after today (min date = today; same-day/past ignored). Choosing a date → `POST …/care-ring` {action:"set_pause", paused_until} and box closes. | |
| 12 | "Resume now" (ES "Retomar ahora") — shown only while paused (replaces #9/#10) | link | `CareRingCard.jsx:191-194` | `POST …/care-ring` {action:"set_pause", paused_until:null}. | |
- **Hidden background behaviour:** `maybeScheduleStreakSave` (`CareRingCard.jsx:79-93`) can silently schedule ONE evening local notification when today's ring is one segment from closing and a streak is at risk (needs notifications already granted; no prompt).
- **Empty / loading / error states:** No data → ring shows 3 empty arcs and "Start … day" copy. Mutation failures are silent (no alert).
- **Modals / sheets / alerts opened:** Quick Check sheet (#7).
- **Back / dismiss behaviour:** n/a (inline card).

### Quick Check sheet (light guided check, from Care Ring) — `GeneralCheckModal` with `mode="quick"`
- **File:** `src/components/Health/GeneralCheck/GeneralCheckModal.jsx` (quick branch lines 383-815; the full 8-step wizard branch from line ~815 is the TRACK agent's) · **Reached from:** Care Ring "＋ Log a quick check-in" (`CareRingCard.jsx:181-187`); the same modal in full mode is opened from Health → Track (not here).
- **Gating / data needed:** Care segment not already done. Shows the 2 most-overdue areas out of Eyes / Ears / Teeth & Mouth / Skin & Fur / Paws / Face / Mood / Energy (`QUICK_SUGGESTION_COUNT = 2`, `src/data/generalCheckData.js:133`, rotation `getSuggestedAreas` 197+; never-checked first, then oldest, those done today last). Areas are frozen at open.
| # | Element (EN label, ES if short) | Type | Source (`path:line`) | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | Title "Quick Check" (ES "Chequeo rápido") | header | `GeneralCheckModal.jsx:437` | — | |
| 2 | X close (a11y "Back") | header icon | `GeneralCheckModal.jsx:439-445` | Closes and discards answers (no confirm). | |
| 3 | "Today's check: {Area} and {Area}" + "Mark how each area looks — usual or something changed. Not a diagnosis; it helps prepare vet conversations." | text | `GeneralCheckModal.jsx:449-452` | Static. | |
| 4 | Per area: emoji, label, description (e.g. "Eyes — Check for clarity, discharge, redness") | text | `GeneralCheckModal.jsx:478-495` | Static. | |
| 5 | "Looks usual" (ES "Se ve normal") | radio button | `GeneralCheckModal.jsx:501-523` | Marks area usual (clears any "changed" tags). Starts UNANSWERED — nothing is pre-selected. | |
| 6 | "Something changed" (ES "Algo cambió") | radio button | `GeneralCheckModal.jsx:526-548` | Marks area changed and reveals #7. | |
| 7 | "What changed? (select all that apply)" chips: Redness, Swelling, Discharge, Bad smell, Limping, Excessive licking, Hair loss, Wound, Other | multi-select chips | `GeneralCheckModal.jsx:556-590` | Toggle each tag. | |
| 8 | "Add photo (optional)" → "Take photo" button | button | `GeneralCheckModal.jsx:613-636` | **Camera permission prompt**; takes photo (quality 0.8), uploads to the PRIVATE medical bucket for this pet via `POST /api/upload` (`visibility: private`, `petId`), thumbnail appears. Denied: alert "Photo access needed / Photo access is needed to add a photo. You can still save the check without one." Upload failure: "Could not add the photo. Please try again." Shows "Uploading photo…" row while busy. Only offered after the area is answered. | ⚠️ uploads a (medical) photo |
| 9 | "Choose photo" button | button | `GeneralCheckModal.jsx:639-662` | **Photo-library permission prompt**; same upload as #8. | ⚠️ |
| 10 | Thumbnail ✕ (a11y "Remove photo") | button | `GeneralCheckModal.jsx:682-694` | Removes the photo from the draft only (the uploaded file is not deleted from storage). | |
| 11 | Notes input (placeholder "Any additional observations...") | multiline text input | `GeneralCheckModal.jsx:705-722` | Free text, saved joined into the check's notes. | |
| 12 | Safety note: "Photos can help track changes over time. For pain, swelling, wounds, discharge, or symptoms that continue, contact your veterinarian." | static | `GeneralCheckModal.jsx:762` | — | |
| 13 | Hint "Answer the suggested areas to save" (ES "Revisá las zonas sugeridas para guardar") | text | `GeneralCheckModal.jsx:786` | Visible until every suggested area is answered. | |
| 14 | "Save" / "Saving…" (ES "Guardar") | button | `GeneralCheckModal.jsx:788-804`, `handleComplete` 303-360 | Disabled until all suggested areas answered. `POST /api/health/general-checks` (status per area + `areas` JSON incl. changes/notes/photo keys). Success: Care segment fills (ring may celebrate 🎉); if ≥1 area was "changed" an alert "Quick check saved / 1 area with changes noted. Continue monitoring and contact your vet if needed." (or "{N} areas …") with OK, then the sheet closes; if none changed it just closes. Card now shows "Logged ✓ / Undo". Failure: alert "Error / Could not save. Please try again." and the sheet stays open. | ⚠️ writes a health record |
- **Empty / loading / error states:** If history is still loading it falls back to the first 2 areas (Eyes, Ears).
- **Modals / sheets / alerts opened:** OS permission prompts + alerts above.
- **Back / dismiss behaviour:** X / Android back → discard.

---

### Activity insight card — `ActivityInsightCard`
- **File:** `src/components/Health/ActivityInsightCard.jsx` · **Reached from:** Health Today (`HealthToday.jsx:548`). Data: `GET /api/pets/{petId}/activity-insight` (`src/hooks/useActivityInsight.js:19`).
- **Gating / data needed:** renders nothing if the server returns no insight kind. Copy is always positive: "{name} was more active than {N}% of {breed}s his age this week 🎉" / "{name}'s most active week in a month — {N} walks! 🎉" / "{name} added {N} more walks than last week — nice work! 🐾" / "{name} is keeping the walks going this week 🐾" / "A short walk would be a lovely way to start {name}'s week 🐾".
| # | Element | Type | Source | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | 📈 insight sentence + footer "A friendly activity trend, not medical advice. Chat with your vet about health questions." | static card (no touch targets) | `ActivityInsightCard.jsx:44-52` | None — read-only. Note the cohort sentence hardcodes "his age" (not gender-neutral). | |
- **Empty / loading / error states:** absent card (no skeleton). **Back / dismiss:** n/a.

### Pack streaks card — `PackStreaksCard`
- **File:** `src/components/Health/PackStreaksCard.jsx` · **Reached from:** Health Today (`HealthToday.jsx:552`). API: `GET/POST /api/pets/{petId}/pack-streaks` (`src/hooks/usePackStreaks.js:19,31`).
- **Gating / data needed:** always renders. Needs a real second user's @handle to create a pack; "Boop" shown only when the server says `boop_available`; "Accept" only for invites addressed to you.
| # | Element (EN label, ES if short) | Type | Source (`path:line`) | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | Title "Pack streaks 🐾" + sub "Keep the flame going with a dog friend" (ES "Rachas en manada") | header | `PackStreaksCard.jsx:55-56` | — | |
| 2 | Active pack row: "🔥 {N} days · {partner pet name}" (+ "Your best run with {name}: {N} days 🎉") | list item | `PackStreaksCard.jsx:59-72` | Shows another real user's pet name. | |
| 3 | "👉 Boop" button | button | `PackStreaksCard.jsx:73-82`, handler `46-54` | `POST /api/pets/{petId}/pack-streaks` {action:"boop", pack_id}; inline note "Boop sent! 🐾" or "No boop needed right now 🎉". Sends a nudge to the friend's owner (server-side notification). | 📤 |
| 4 | Invite row "{name} invited you to a pack streak" + "Accept" | button | `PackStreaksCard.jsx:85-97` | `POST …/pack-streaks` {action:"accept", pack_id} → pack becomes active (friend's side updates). No confirmation. | 📤 |
| 5 | "Waiting for {name} to accept…" | text | `PackStreaksCard.jsx:100-104` | Pending outgoing invite. | |
| 6 | Empty text "Start a pack streak with a friend — you both close your ring the same day to build a shared flame." | text | `PackStreaksCard.jsx:106-108` | Shown when no active packs and no invites. | |
| 7 | Text input "friend's @handle" (ES "@usuario del amigo") | text input | `PackStreaksCard.jsx:112-121` | No auto-capitalize/correct. Blank → Start does nothing. | |
| 8 | "Start" button (ES "Empezar") | button | `PackStreaksCard.jsx:122-129`, handler `34-44` | `POST …/pack-streaks` {action:"request", partner_handle} → sends an invite to that user. Failure: inline "Couldn't start that pack — check the @handle." (the raw server error is not shown). | 📤 |
| 9 | Inline note line | text | `PackStreaksCard.jsx:131` | Shows boop/request result text. | |
- **Empty / loading / error states:** above. **Modals:** none. **Back / dismiss:** n/a.
- **QA caution:** testing #3/#4/#8 contacts real production users unless both accounts are yours (use the demo accounts).

### Care leagues card — `LeaderboardCard`
- **File:** `src/components/Health/LeaderboardCard.jsx` · **Reached from:** Health Today (`HealthToday.jsx:556`). API: `GET /api/pets/{petId}/leaderboard?flavor=friends|breed|neighborhood`, `POST …/leaderboard` {action:"set_area", opt_in, area} (`src/hooks/useLeaderboard.js:19,30-33`).
- **Gating / data needed:** Breed / Nearby boards are density-gated server-side — too few dogs shows a note and the friends board instead. Nearby needs a one-time coarse-area opt-in.
| # | Element (EN label, ES if short) | Type | Source (`path:line`) | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | Title "Care leagues 🏆" + "Weekly XP from care effort — not likes" | header | `LeaderboardCard.jsx:38-39` | — | |
| 2 | Tabs "Friends" / "Breed" / "Nearby" (ES Amigos / Raza / Cerca) | segmented tabs | `LeaderboardCard.jsx:41-55` | `setFlavor` → refetch that board. | |
| 3 | Gated note "Not enough dogs of this breed yet — showing your friends board." / "Not enough dogs near you yet — showing your friends board." | text | `LeaderboardCard.jsx:57-59` | Informational. | |
| 4 | Opt-in block: "Add a coarse area (like a neighborhood) to see nearby dogs. We never share your home address." + input "e.g. Palermo" + "Opt in" (ES "Sumarme") | text input + button | `LeaderboardCard.jsx:61-82` | Shown on the Nearby tab while no board and not gated. "Opt in" with non-blank text → `POST …/leaderboard` {action:"set_area", opt_in:true, area}; stores your neighborhood-level area server-side for matching nearby dogs. Blank text → nothing. | ⚠️ saves/shares a coarse location area |
| 5 | Rows "#rank  Name · you   N XP" | list item | `LeaderboardCard.jsx:89-98` | Shows OTHER real users' dog names. | |
| 6 | Tier line "🥇 Gold league ⬆️ — you moved up! 🎉" (Silver 🥈 / Bronze 🥉) | text | `LeaderboardCard.jsx:100-105` | — | |
| 7 | Empty "Log a walk, close your ring, or give a friend a paw to earn XP this week." and footer "XP = walks, ring closes, care actions, and paws you give. Effort, never popularity." | text | `LeaderboardCard.jsx:85-87,108` | — | |
- **Empty / loading / error states:** empty copy above; fetch errors show nothing. **Modals:** none. **Back / dismiss:** n/a.

### Vet-summary readiness card — `VetSummaryReadinessCard`
- **File:** `src/components/Health/VetSummaryReadinessCard.jsx` · **Reached from:** Health Today (`HealthToday.jsx:560`). API: `GET /api/pets/{petId}/vet-summary-readiness`, `GET /api/pets/{petId}/share-stats?day=` (`useHealthReinforcement.js:106`, `useShareStats.js:18`).
| # | Element (EN label, ES if short) | Type | Source (`path:line`) | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | Monthly recap "🗓️ {name}'s care was {N}% this month 🎉" or "Let's build {name}'s care story this month 🐾" | text | `VetSummaryReadinessCard.jsx:36-43` | Only once the month has ≥1 elapsed day. | |
| 2 | Title "{name}'s vet summary is building 📋"; level text ("Start logging and … gets richer." / "Nice — the more you log, the better … vet summary." / "Amazing — … vet summary is looking thorough! 🎉"); progress bar; "{filled} of {total} areas started" | text/progress | `VetSummaryReadinessCard.jsx:45-52` | Static. | |
| 3 | "View Vet Summary →" (ES "Ver resumen veterinario") | link | `VetSummaryReadinessCard.jsx:54-63` | `router.push({pathname:"/(tabs)/health", params:{section:"vet-record"}})` → switches to the Vet Record section (VETREC agent). Does not itself share/export. | |
- **Empty / loading:** defaults to "0 of 4", level "start". **Modals:** none.

---

### Countdown card (generic) — `CountdownCard` (Due Soon, for types other than feeding / walk / vet appointment)
- **File:** `src/components/Health/Reminders/CountdownCard.jsx` · **Reached from:** Health Today → Due Soon (`HealthToday.jsx:505-512`); used for medical_care, wellness_check, photo_check, general_check, weight_check, medication, etc.
- **Gating / data needed:** a time-sensitive reminder within 1 h of its time (or past due for non-persistent types). medical_care and wellness_check types have no icon config so they show 📌.
| # | Element (EN label) | Type | Source (`path:line`) | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | Red badge "TIME-SENSITIVE" (**hardcoded EN**) | badge | `CountdownCard.jsx:69-71` | Shown if `timeSensitive`. | |
| 2 | Big countdown ("in 25 min" / "now" / "N min overdue" — hardcoded EN), scheduled time, title, description | text | `CountdownCard.jsx:77-119` | Auto-refreshes every 60 s. | |
| 3 | Primary button — label = reminder `primaryAction` else type default ("Take photo", "Start check", "Log weight", "Mark as given", else "Done") | button | `CountdownCard.jsx:158-181` (handler `146-154`) | medical_care: calls `onComplete(reminder,{action:"given"})` (vaccine: `"add_vet_record"`) → `POST /api/health/medical-care-logs`, alert "✅ Saved / {title} logged" (vaccine: "{title} saved to vet record"). Other types: `onComplete(reminder)` (outcomes as Overdue #10: photo → capture modal, wellness → wellness modal, others just tick off with "✅ Done!" alert). | ⚠️ |
| 4 | Secondary button (medical_care only): vaccine → "Mark completed"; other → "Something was off" (**hardcoded EN**) | button | `CountdownCard.jsx:183-208` (`135-143`) | "Mark completed" → logs status completed (alert "✅ Saved / {title} logged"). "Something was off" → opens Medical-care issue modal. | ⚠️ |
| 5 | "Snooze" (**hardcoded EN**) | button | `CountdownCard.jsx:210-234` | Opens SnoozeModal. | |
- **Empty/error:** n/a. **Modals opened:** SnoozeModal, MedicalCareIssueModal, PhotoCheckCaptureModal / WellnessLogModal (TRACK2). **Back:** n/a.

### Feeding countdown card — `FeedingCountdownCard`
- **File:** `src/components/Health/FeedingCountdownCard.jsx` · **Reached from:** Due Soon, type "feeding" (`HealthToday.jsx:476-483`).
| # | Element (EN label, ES if short) | Type | Source (`path:line`) | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | "TIME-SENSITIVE" badge (ES "URGENTE") | badge | `FeedingCountdownCard.jsx:109-127` | — | |
| 2 | 🍽️ countdown, scheduled time, meal title, notes, pet name | text | `FeedingCountdownCard.jsx:131-192` | Auto-refresh 60 s. | |
| 3 | "Log as usual" / "Logging…" (ES "Registrar como siempre") | button | `FeedingCountdownCard.jsx:198-221`, mutation `47-77` | `POST /api/health/food-logs` (appetite normal, finished meal, notes "Logged as usual"); alert "✅ Logged / {title} logged". Failure: "Error / Could not save. Please try again." **Code-read observation to verify on device:** `onSuccess` also calls `onComplete(reminder)` (`:67`) with no action, and `HealthToday.handleComplete` answers feeding with the "How did it go?" choice dialog (`HealthToday.jsx:236-244`) — so a SECOND dialog may pop up after the success alert; choosing "Log as usual" there would write a duplicate food log, and Cancel leaves the card in place. | ⚠️ writes a food log |
| 4 | "Something was off" (ES "Algo estuvo raro") | button | `FeedingCountdownCard.jsx:224-243` | Opens the **Feeding issue modal**. Same `onComplete(reminder)` follow-up caveat after save (`handleIssueSaved`, `:80-83`). | |
| 5 | "Snooze" (ES "Posponer") | button | `FeedingCountdownCard.jsx:246-269` | Opens SnoozeModal. | |
- **Modals opened:** FeedingIssueModal (own instance, `:271-277`), SnoozeModal.

### Walk countdown card — `WalkCountdownCard`
- **File:** `src/components/Health/WalkActivity/WalkCountdownCard.jsx` · **Reached from:** Due Soon, type "walk" (`HealthToday.jsx:485-492`). All strings on this card are **hardcoded EN**.
| # | Element | Type | Source (`path:line`) | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | "TIME-SENSITIVE" badge, 🚶 countdown, scheduled time, walk name, "{pet} · {N} min · {pace}" | text | `WalkCountdownCard.jsx:92-156` | Auto-computed from the routine (defaults 30 min / "normal"). | |
| 2 | "Add to calendar" | small button | `WalkCountdownCard.jsx:159-188` (`addWalkToCalendar` call at :161) → `src/utils/calendarIntegration.js:205-261` | Flow: rationale alert "Calendar Access / PawPi can add walk blocks to your calendar so your time stays protected." ("Not now"/"Allow calendar access") → **iOS Calendar permission prompt** → creates/uses a device calendar "PawPi - Walks" and adds a BUSY block titled "Busy" (repeating if the routine repeats); alert "Added to calendar / Walk block added to your calendar[ as a repeating event]." Errors: "Permission needed / Calendar access is required to add walk events.", "Calendar unavailable …", "Error / Could not add walk to calendar. Please try again." | ⚠️ writes to the phone's calendar (may sync to iCloud/Google and be visible to calendar sharees) |
| 3 | "Start walk" | button | `WalkCountdownCard.jsx:194-215` | Opens `StartWalkModal` (TRACK2 area — live walk / GPS flow); on finish opens `PostWalkFeedbackModal` (TRACK2); on its completion the reminder is ticked and alert "✅ Walk completed! / {walk name} has been logged". | |
| 4 | "Log manually" | button | `WalkCountdownCard.jsx:218-238`, `65-72` | Ticks the reminder complete (`onComplete`) and alert "Reminder dismissed / Log this walk manually from Health → Track when ready" — **no walk is logged**. (Because `onComplete` → `handleComplete` default branch also fires "✅ Done! / {title} marked as complete", two alerts may stack.) | |
| 5 | "Snooze" | button | `WalkCountdownCard.jsx:241-261` | Opens SnoozeModal. | |
- **Modals opened:** StartWalkModal, PostWalkFeedbackModal (not documented here — see TRACK2), SnoozeModal.

### Vet appointment countdown card — `VetAppointmentCountdownCard`
- **File:** `src/components/Health/VetAppointmentCountdownCard.jsx` · **Reached from:** Due Soon, type "vet_appointment" (`HealthToday.jsx:494-501`). Data: `GET /api/vet-appointments?petId=`.
| # | Element (EN label, ES if short) | Type | Source (`path:line`) | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | "TIME-SENSITIVE" badge (ES "URGENTE") | badge | `VetAppointmentCountdownCard.jsx:99-119` | — | |
| 2 | 🩺 countdown; "Today at 3:00 PM" / "Tomorrow at …" / "{date} at {time}"; title; 📍 clinic; reason (italic) | text | `VetAppointmentCountdownCard.jsx:122-205` | Auto-refresh 60 s. | |
| 3 | "View appointment" (ES "Ver turno") | button | `VetAppointmentCountdownCard.jsx:210-232` | Opens **Vet appointment detail modal**. | |
| 4 | "Snooze" (ES "Posponer") | button | `VetAppointmentCountdownCard.jsx:234-255` | Opens SnoozeModal (snooze held in the store's `snoozes` map, since appointments are not store reminders). | |
- **Modals opened:** VetAppointmentDetailModal (`:257-263`), SnoozeModal.

### Heads-up card ("Upcoming") — `HeadsUpReminderCard`
- **File:** `src/components/Health/Reminders/HeadsUpReminderCard.jsx` · **Reached from:** Health Today → "Upcoming" (`HealthToday.jsx:867-875`). A non-actionable early notice for lead-time reminders ("1 day before" etc.). Strings are **hardcoded EN**.
| # | Element | Type | Source (`path:line`) | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | Icon, title, "Due {scheduled time}" | text | `HeadsUpReminderCard.jsx:48-70` | Static. | |
| 2 | "Close" (X) | button | `HeadsUpReminderCard.jsx:75-95` → `HealthToday.jsx:399-409` | Acknowledges ONLY the early heads-up: `POST /api/health/reminder-dismissals` with instanceKey `{id}::early`; the real reminder still appears at its time. Failure alert "Could not dismiss / We couldn't dismiss this heads-up. Please try again." | |
| 3 | "Edit" (pencil) | button | `HeadsUpReminderCard.jsx:96-116` → `HealthToday.jsx:414-423` | `router.push({pathname:"/(tabs)/more/reminders", params:{editRoutineId}})` — opens the Reminders screen and auto-opens that routine's editor (REMINDERS agent). If no routineId, opens the Reminders screen plainly. | |
- **Back:** from Reminders, back returns to Health.

---

### Snooze modal — `SnoozeModal`
- **File:** `src/components/Health/Reminders/SnoozeModal.jsx` · **Reached from:** "Snooze" on any countdown card (`HealthToday.jsx:425-428,1046-1054`). All strings **hardcoded EN**.
| # | Element | Type | Source (`path:line`) | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | Title "Snooze Reminder" + reminder title/description | header | `SnoozeModal.jsx:66-106` | — | |
| 2 | X close | header icon | `SnoozeModal.jsx:72-84` | Closes without snoozing. | |
| 3 | "Snooze for:" options: "10 minutes", "30 minutes", "1 hour", "Tonight" (8:00 PM, or tomorrow 8 PM if already past), "Tomorrow" (9:00 AM next day) | list item ×5 | `SnoozeModal.jsx:120-146`, options `src/data/remindersData.js:444-450`, time math `src/store/remindersStore.js:286-302` | Moves the item to the **Snoozed (N)** section until that time, cancels the old local notification and schedules a new one at the snooze time (silent; no permission prompt); alert "⏰ Snoozed / {title} has been snoozed for {duration lowercase}". | |
| 4 | "Cancel" | button | `SnoozeModal.jsx:149-166` | Closes. | |
- **Back:** Android back / Cancel closes (`onRequestClose`).

### Medical-care "Something was off?" modal — `MedicalCareIssueModal`
- **File:** `src/components/Health/Reminders/MedicalCareIssueModal.jsx` · **Reached from:** "Something was off" on a medical-care countdown card, or the "How did it go?" dialog option (`HealthToday.jsx:247-249,325-328,1069-1077`). Title/buttons are **hardcoded EN**.
| # | Element | Type | Source (`path:line`) | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | Title "Something was off?" + reminder title | header | `MedicalCareIssueModal.jsx:98-102` | — | |
| 2 | X close | header icon | `MedicalCareIssueModal.jsx:104-116` | Closes without saving. | |
| 3 | Warning "⚠️ Contact your veterinarian if you notice concerning reactions or symptoms." | static | `MedicalCareIssueModal.jsx:133-138` | — | |
| 4 | "Was it given?" (ES "¿Se lo diste?") Yes / Partially / No (default Yes) | choice chips | `MedicalCareIssueModal.jsx:141-150`, chips `221-253` | Select one. | |
| 5 | "Any reaction?" (ES "¿Hubo alguna reacción?") No / Yes (default No) | choice chips | `MedicalCareIssueModal.jsx:152-160` | Select one. | |
| 6 | "Notes" textbox "What happened? (optional)" | multiline text input | `MedicalCareIssueModal.jsx:162-181` | Free text. | |
| 7 | "Save issue" | button | `MedicalCareIssueModal.jsx:183-197`, submit → `HealthToday.jsx:330-350` | `POST /api/health/medical-care-logs` with status "issue_reported" + {given, reaction}; reminder completed; modal closes; alert "Saved / Issue saved to medical care history". Failure: hardcoded-EN "Could not save / We couldn't save this entry. Please try again." | ⚠️ writes a medical-care record |
- **Back:** Android back / X closes (state resets on next open).

### Feeding issue modal ("What was different with this meal?") — `FeedingIssueModal`
- **File:** `src/components/Health/FeedingIssueModal.jsx` · **Reached from:** Feeding countdown card "Something was off" (`FeedingCountdownCard.jsx:271`) and Today's "How did it go?" → "Something was off" (`HealthToday.jsx:1088-1097`). Full-screen, translated.
| # | Element (EN label, ES if short) | Type | Source (`path:line`) | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | Title "What was different with this meal?" + "{meal} • {time} • {pet}" | header | `FeedingIssueModal.jsx:144-148` | — | |
| 2 | X close | header icon | `FeedingIssueModal.jsx:150-163` | Resets form, closes without saving. | |
| 3 | "Appetite": Low / Normal / High | chips | `FeedingIssueModal.jsx:179-215` | Select (default Normal). | |
| 4 | "Finished meal": Yes / Partially / No | chips | `FeedingIssueModal.jsx:225-261` | Select (default Yes). | |
| 5 | "Vomiting or reaction": No / Yes | chips | `FeedingIssueModal.jsx:271-317` | Select (default No). | |
| 6 | "Anything worth noting?" textbox "e.g., Only ate half, seemed uninterested, ate slowly…" | multiline text input | `FeedingIssueModal.jsx:331-352` | Free text. | |
| 7 | Amber info "Based on your logs, this may be worth monitoring if it continues. Contact your vet if you notice other symptoms." | conditional text | `FeedingIssueModal.jsx:357-376` | Appears when appetite=Low, vomiting=Yes or finished=No. | |
| 8 | "Save" / "Saving…" | button | `FeedingIssueModal.jsx:393-406`, mutation `45-96` | `POST /api/health/food-logs`; alert "✅ Logged / {title} logged with notes" (+ ". Based on your logs, this may be worth monitoring if it continues." for low appetite/vomiting); reminder completes; closes. Failure: "Error / Could not save. Please try again." | ⚠️ writes a food log |
- **Back:** Android back = same as X.

### Vet appointment detail modal — `VetAppointmentDetailModal`
- **File:** `src/components/Health/VetAppointmentDetailModal.jsx` · **Reached from:** "View appointment" on the vet countdown card (`VetAppointmentCountdownCard.jsx:257`). (Same modal is probably used from the Reminders screen — other agent.) Full-screen.
- **Gating / data needed:** a saved vet appointment. "Write a review" only for a **completed** appointment booked with a provider (`provider_id` set). "Mark as completed" hidden once completed.
| # | Element (EN label, ES if short) | Type | Source (`path:line`) | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | Title "🩺 Vet Appointment" + "Appointment details" | header | `VetAppointmentDetailModal.jsx:174-178` | — | |
| 2 | X close | header icon | `VetAppointmentDetailModal.jsx:180-193` | Closes (disabled while a save/delete is running). | |
| 3 | Banner: appointment title + "📅 {weekday, month day, time}" | text | `VetAppointmentDetailModal.jsx:211-229` | — | |
| 4 | Info rows: Clinic / Veterinarian / Reason / Notes (only those present) | static | `VetAppointmentDetailModal.jsx:233-245` | — | |
| 5 | "Write a review" (ES "Escribir una reseña") | button | `VetAppointmentDetailModal.jsx:316-334` | Opens **Write a review** modal (below). Only after a completed provider appointment and when not in note-entry mode. | 🌍 |
| 6 | "Mark as completed" (ES "Marcar como completado") | button | `VetAppointmentDetailModal.jsx:339-365`, `112-118` | First tap reveals the notes box; the button becomes "Confirm & mark completed". | |
| 7 | "Add visit notes (optional)" box, placeholder "e.g., Rabies vaccine administered, next visit in 1 year…" | multiline text input | `VetAppointmentDetailModal.jsx:276-295` | Free text appended to the appointment notes as "Visit notes: …". | |
| 8 | "Confirm & mark completed" | button | `VetAppointmentDetailModal.jsx:340-361` | `PUT /api/vet-appointments` {id, status:"completed", notes}; alert "✅ Completed / Appointment marked as completed and added to vet record"; modal closes and Today also shows "✅ Done! / Vet appointment marked as completed". Failure: "Error / {server message or Could not complete appointment}" (server error text can leak). | ⚠️ creates a vet-record entry |
| 9 | "Cancel" (note-entry mode only) | button | `VetAppointmentDetailModal.jsx:399-419` | Hides notes box, clears text. | |
| 10 | "Delete appointment" (trash, red) (ES "Eliminar turno") | button | `VetAppointmentDetailModal.jsx:370-396`, `120-132` | Alert "Delete appointment? / This will remove the appointment reminder. Past vet history will stay saved." with "Cancel" / "Delete appointment" (destructive) → `DELETE /api/vet-appointments?id=<id>`; alert "Deleted / Appointment has been removed"; closes. Failure: "Error / {server message or Could not delete appointment}". | 🗑️ |
- **Empty / loading / error:** buttons show a spinner while pending. **Back:** Android back closes.

### Write a review modal — `WriteReviewModal` (opened from vet appointment detail #5)
- **File:** `src/components/Providers/WriteReviewModal.jsx` · bottom sheet. Posts a review on the PROVIDER's public profile.
| # | Element (EN label, ES if short) | Type | Source (`path:line`) | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | Title "Write a review" (ES "Escribí una reseña") | header | `WriteReviewModal.jsx:95` | — | |
| 2 | X close | header icon | `WriteReviewModal.jsx:98` | Closes. | |
| 3 | Prompt "How was your visit to {provider}?" | text | `WriteReviewModal.jsx:117` | — | |
| 4 | Star rating 1-5 (a11y "Rate N stars") | button ×5 | `WriteReviewModal.jsx:133-135` | Sets rating. | |
| 5 | Textbox "Share a few words about your experience (optional)" | multiline text input | `WriteReviewModal.jsx:146-149` | Optional review text. | |
| 6 | "Submit review" (ES "Enviar reseña") | button | `WriteReviewModal.jsx:168-184`, handler `38-62` | No rating → alert "Pick a rating / Tap the stars to rate from 1 to 5." Else `POST /api/providers/{providerId}/reviews` {rating, body, pet_id}; alert "Thanks! / Your review has been posted."; closes. Failure: "Couldn't post review / {server message}". | 🌍 public review under the user's name |

---

### Streak chip — `StreakChip` (not on the Health tab, but part of the ring system)
- **File:** `src/components/Health/StreakChip.jsx` · **Reached from:** Feed header (`src/components/Feed/FeedHeader.jsx:83`) and the owner's own pet-profile header (`src/app/pet-profile.jsx:396`).
| # | Element | Type | Source | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | "🔥 {count}" pill | static chip (no press handler) | `StreakChip.jsx:20-26` | Hidden when streak is 0. Reflects the Care Ring streak; verify it matches the number inside the Care Ring card. | |

### Components that exist in the folder but are NOT mounted anywhere (nothing to test)
- `src/components/Health/LifeStageCard.jsx` (Auto / Puppy / Adult / Senior override via `POST /api/pets/{id}/life-stage`) — no import outside its own file/test; not reachable in the app.
- `src/components/Health/HouseholdLeaderboardCard.jsx` ("Your household 🏡") — not imported by any screen.
- `src/components/Health/HealthReminders.jsx` (Upcoming/Routines/Settings tabs) — removed from the Health tab (`health.jsx:8` comment); not reachable here.
- `mockReminders` in `src/data/remindersData.js:171` is defined but never imported (no mock data reaches the UI).

### Opened from Today but documented by other agents (do not duplicate)
- `PhotoCheckCaptureModal` (photo_check reminder action) — TRACK2.
- `WellnessLogModal` (wellness_check reminder action, incl. weight) — TRACK2.
- `StartWalkModal`, `PostWalkFeedbackModal` (walk card) — TRACK2.
- `HealthTrack` section / `GeneralCheckModal` full wizard — TRACK; `HealthVetRecord` — VETREC; Reminders screen (`/(tabs)/more/reminders`, `editRoutineId`) — REMINDERS.


---
## AREA: Track (loggers, Quick Check, Medications)

## Part C — Health › Track (HealthTrack dashboard + FoodWater / Pee / Poo / Vomit / GeneralCheck / Medication trackers)

Agent: TRACK. All paths are relative to `anything/apps/mobile/`. EN strings resolved from `src/i18n/locales/en.json`.

Area-wide notes (apply to every modal below, stated once):
- **Active pet:** every tracker writes for the currently selected pet (`useCurrentPet`). With no pet selected, Pee/Vomit show alert "Could not save. Please select a pet first."; the hook-based modals (Food, Poo, Quick Check) throw "No current pet selected" internally and the user sees the generic alert "Error / Could not save. Please try again."
- **Permission prompts a tester will hit here (iOS system dialogs, text from `app.json` infoPlist):**
  - Camera (Poo "Take Photo", Vomit "Add photo → Take Photo", Quick Check "Take photo"): *"PawPi uses the camera so you can take photos of your pet for their profile, daily moments, health checks and vet records."* (`app.json:29`)
  - Photo library (Poo "Choose Photo", Vomit "Choose from Library", Quick Check "Choose photo"): *"PawPi accesses your photo library so you can choose photos and documents for your pet's profile, posts, health records and chats."* (`app.json:30`)
  - If denied: Poo/Vomit show a plain alert ("Camera permission is required to take photos." / "Photo library permission is required."); Quick Check shows alert "Photo access needed — Photo access is needed to add a photo. You can still save the check without one."
  - No calendar, notification, push-scheduling or location prompt is triggered from anything in this area (the Medications "Enable reminders" switch only stores a flag, see §8).
- **No share / export / send-to-vet action exists in this area.** The only data leaving the device is the POST of the log to PawPi's own API and optional photo uploads (`POST /api/upload`, `visibility: "private"`, scoped to the pet; stored as a private key and shown back via the auth-gated `PrivateImage`).
- **No AI call** in this area. (Quick Check shows a greyed-out, locked "Ask AI about this photo" placeholder that does nothing.)
- **Raw English chips:** the option chips in Pee / Poo / Vomit / Food (e.g. `small`, `red/pink`, `bile/yellow`, `before meal`, `low`, `breakfast`) render the internal English value string (capitalised by CSS) and are NOT translated in ES. Section headings/buttons are translated.
- **Every "Log …" / Save button writes a real record to the production DB** for the selected pet. There is no delete/undo for Food/Pee/Poo/Vomit/Quick Check logs inside these modals (only Medications has Delete).
- **Unreachable code:** the five `*Dashboard.jsx` components in this folder are not imported by any screen (see §9) — a tester will never see them.

---

### Health › Track (section) — `HealthTrack` (component rendered by `src/app/(tabs)/health.jsx`)
- **File:** `src/components/Health/HealthTrack.jsx` · **Reached from:** Health bottom tab → section strip tab "Track" (`src/app/(tabs)/health.jsx:69-70`, strip defined in `src/constants/healthSections.js`); also via deep link `/(tabs)/health?section=track`.
- **Gating / data needed:** none for the list itself (no feature flag, no premium lock). Needs ≥1 pet for any tile to actually save. The "coming soon" mechanism exists but **no tile is currently coming-soon** (`HealthTrack.jsx:102`), so the "Soon" badge/alert never appears.
- Page header: title "Track health data"; subtitle "Choose what you'd like to track for {pet}" (`HealthTrack.jsx:286-291`). Two groups: "Everyday" (hint "Quick daily logs that fill {pet}'s Care Ring.") and "Health records" (hint "Care and medical history to share with your vet."). Footer info card: "Track changes over time to share meaningful data with your vet. The more you track, the better prepared you'll be for appointments." (`HealthTrack.jsx:317-327`). Not pull-to-refresh (plain `ScrollView`).

| # | Element (EN label / ES) | Type | Source | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | "Food & Water" — "Meals, treats, water, and appetite" / Comida y agua | list item (tile) | `src/components/Health/HealthTrack.jsx:48-54,217` | Opens **Food & Water modal** (§3) with initial type "food" (`:187-190`) | |
| 2 | "Bathroom & Digestion" — "Pee, poo, and vomit or digestive events" | list item (tile) | `src/components/Health/HealthTrack.jsx:55-61,217` | Opens the **Bathroom chooser sheet** (§2) (`:191-193`) | |
| 3 | "Walk & Activity" — "Activity level, duration, and intensity" | list item (tile) | `src/components/Health/HealthTrack.jsx:62-68,217` | Opens `WalkActivityModal` (documented by TRACK2; not here) (`:194-196`) | |
| 4 | "Weight" — "Track weight over time" | list item (tile) | `src/components/Health/HealthTrack.jsx:69-75,217` | Opens `WeightModal` (TRACK2) (`:197-199`) | |
| 5 | "Quick Check" — "Eyes, ears, skin, mood, energy, and behavior" | list item (tile) | `src/components/Health/HealthTrack.jsx:76-82,217` | Opens **Quick Check modal in full/wizard mode** (§7) (`:180-182`) | |
| 6 | "Medications & Care" — "Medications, vaccines, flea and tick prevention, supplements" | list item (tile) | `src/components/Health/HealthTrack.jsx:88-94,217` | Opens **Medications & Care modal**, tab "Medications" (§8) (`:183-186`) | |
| 7 | "Photo Check" — "Track visible changes by body area over time" | list item (tile) | `src/components/Health/HealthTrack.jsx:95-101,217` | Opens `PhotoCheckModal` body-area picker (TRACK2); choosing an area hands off to `PhotoCheckCaptureModal` (camera/photo, private upload + `POST /api/health/photo-checks`) (`:158-162,425-440`). Documented by TRACK2. | ⚠️ (photo upload, owned by TRACK2) |

- **Empty / loading / error states:** no data on this screen, so no empty state. Pet name falls back to "Your pet" if no pet loaded (`:127`). No errors can surface from the tile list itself.
- **Modals / sheets / alerts opened:** Bathroom chooser (§2), Food & Water (§3), Pee (§4), Poo (§5), Vomit (§6), Quick Check (§7), Medications & Care (§8) — all in this file; Walk Activity, Weight, Photo Check picker + capture belong to TRACK2. The (dead) coming-soon `Alert.alert("{label} — coming soon", …)` at `:170` is never reached today.
- **Back / dismiss behaviour:** Track is a section inside the Health tab (no back button); every modal returns here on close. No custom back handling.

---

### Bathroom & Digestion chooser — bottom sheet in `HealthTrack`
- **File:** `src/components/Health/HealthTrack.jsx:332-421` · **Reached from:** Track tile "Bathroom & Digestion" (`HealthTrack.jsx:191-193`).
- **Gating / data needed:** none.
- Slide-up transparent sheet (dark scrim). Title "What would you like to log?"; subtitle "Bathroom and digestion for {pet}".

| # | Element | Type | Source | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | X (close, a11y label "Close") | header icon | `src/components/Health/HealthTrack.jsx:359-364` | Closes the sheet, back to Track list | |
| 2 | "Pee" — "Frequency, color, and patterns" | list item | `src/components/Health/HealthTrack.jsx:379-415` (onPress `:381`, handler `:205-210`) | Closes sheet, opens **Pee modal** (§4) | |
| 3 | "Poo" — "Consistency, color, and changes" | list item | `src/components/Health/HealthTrack.jsx:379-415` | Closes sheet, opens **Poo modal** (§5) | |
| 4 | "Vomit / digestive event" — "Episodes and related symptoms" | list item | `src/components/Health/HealthTrack.jsx:379-415` | Closes sheet, opens **Vomit modal** (§6) | |

- **Empty / loading / error states:** none.
- **Modals / sheets / alerts opened:** Pee / Poo / Vomit modals.
- **Back / dismiss behaviour:** only the X (row 1) or Android hardware back (`onRequestClose`, `:336`). Tapping the dark scrim does NOT dismiss (backdrop is a plain `View`).

---

### Food & Water — "Log Food" / "Log Water" modal (`FoodWaterTrackerModal`)
- **File:** `src/components/Health/FoodWater/FoodWaterTrackerModal.jsx` · **Reached from:** Track tile "Food & Water" (`src/components/Health/HealthTrack.jsx:443-447`). (Also reachable from the unused `FoodWaterDashboard`, §9.)
- **Gating / data needed:** a selected pet. Full-screen `pageSheet` modal, always opens on the step "What would you like to log?" (`step` starts `"type"`, `:67`) even though `initialType="food"` is passed (it only sets the header title: "Log Food"; flips to "Log Water" after choosing water).
- API: `POST /api/health/food-logs` via `useLogFood` (`src/hooks/useHealthTracking.js:20`). Success invalidates food-logs, timeline and the **Care Ring** (`["care-ring", petId]`) so the ring's Care segment fills live.
- Flow: **Step 1 type** → (Food) **Step 2 quickChoice** → **Step 3 foodForm**; (Water) → **Step 4 waterForm**; success → **confirmation** (auto-closes after 1.5 s).

| # | Element (EN label / ES) | Type | Source | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | X (top-right) | header icon | `src/components/Health/FoodWater/FoodWaterTrackerModal.jsx:202-214` | `handleClose`: resets all fields and closes the modal (no "discard?" prompt, typed data is lost) | |
| 2 | "Food & Treats" — "Log meals, snacks, and treats" / Comida y premios | list item | `…/FoodWaterTrackerModal.jsx:275-318` | Sets type=food, goes to Step 2 "What did your pet eat?" | |
| 3 | "Water Intake" — "Track hydration and thirst" / Ingesta de agua | list item | `…/FoodWaterTrackerModal.jsx:320-363` | Sets type=water, header becomes "Log Water", goes to the water form (Step 4) | |
| 4 | "Same as usual" — "Regular meal, normal appetite, finished food" / Como siempre | button (one-tap log) | `…/FoodWaterTrackerModal.jsx:386-429` (handler `:103-128`) | IMMEDIATELY POSTs a food log with no further confirmation: meal type chosen by clock (before 11:00 = breakfast, 11:00-15:59 = lunch, 16:00+ = dinner), hard-coded foodName "Regular dog food", amount "1 cup" (0.5 cup for lunch), appetite normal, finished yes, vomiting false. Spinner while pending; then "Logged!" / "Food entry added to today's timeline" and auto-close after 1.5 s. Button disabled while pending. (Note for QA: the text "Regular dog food" is hard-coded for every pet species.) | ⚠️ writes real log, no undo |
| 5 | "Something changed" — "Different food, appetite, or behavior" / Algo cambió | button | `…/FoodWaterTrackerModal.jsx:431-461` | Goes to the detailed food form (Step 3) | |
| 6 | "← Back" (Step 2) | link | `…/FoodWaterTrackerModal.jsx:463-470` | Back to Step 1 type chooser | |
| 7 | Meal type chips: breakfast / lunch / dinner / snack / treat (default breakfast; raw English) | chip group (single select) | `…/FoodWaterTrackerModal.jsx:503-529` | Selects the meal type | |
| 8 | "Food name or type" (placeholder "e.g., Royal Canin, chicken and rice") | text input | `…/FoodWaterTrackerModal.jsx:545-559` | Free text; optional (no validation) | |
| 9 | "Amount" (placeholder "e.g., 1 cup, 5 treats") | text input | `…/FoodWaterTrackerModal.jsx:574-588` | Free text; optional | |
| 10 | "Appetite": low / normal / high (default normal) | chip group | `…/FoodWaterTrackerModal.jsx:604-629` | Selects appetite | |
| 11 | "Did your pet finish the food?": Yes / Partially / No (default Yes) | chip group | `…/FoodWaterTrackerModal.jsx:646-681` | Selects finished state. NOTE: API receives only a boolean (`finishedMeal === "yes"`), so "Partially" and "No" are both stored as not-finished (`src/hooks/useHealthTracking.js:29`) | |
| 12 | "Any vomiting, refusal to eat, or unusual behavior?": No / Yes (default No) | toggle pair | `…/FoodWaterTrackerModal.jsx:697-740` | Sets vomiting flag (sent as `vomitingOrReaction`). Does NOT create a separate vomit log | |
| 13 | "Notes (optional)" (placeholder "Anything different from usual?") | text input (multiline) | `…/FoodWaterTrackerModal.jsx:756-774` | Free text | |
| 14 | "Log Food Entry" / Registrar comida | button (submit) | `…/FoodWaterTrackerModal.jsx:778-805` (handler `:130-151`) | POSTs the food log with the chosen values; spinner while pending; success → "Logged!" confirmation then auto-close. No required fields. | ⚠️ writes real log |
| 15 | "← Back" (food form) | link | `…/FoodWaterTrackerModal.jsx:807-814` | Back to Step 2 (quick choice) | |
| 16 | "Water intake level": low / normal / high (default normal) | chip group | `…/FoodWaterTrackerModal.jsx:845-872` | Selects water level | |
| 17 | "More thirsty than usual?" No / Yes | toggle pair | `…/FoodWaterTrackerModal.jsx:889-935` | Local state only — Yes clears the "less thirsty" answer. **Not sent to the API** (water POST only sends `mealType:"water"`, `waterIntake`, `notes`, `:155-159`) | |
| 18 | "Less thirsty than usual?" No / Yes | toggle pair | `…/FoodWaterTrackerModal.jsx:952-998` | Same: local only, mutually exclusive with row 17, not persisted | |
| 19 | "Notes (optional)" (water) | text input (multiline) | `…/FoodWaterTrackerModal.jsx:1014-1032` | Free text | |
| 20 | "Log Water Intake" / Registrar agua | button (submit) | `…/FoodWaterTrackerModal.jsx:1036-1063` (handler `:153-170`) | POSTs `{mealType:"water", waterIntake, notes}` to `/api/health/food-logs`; success → "Logged!" / "Water intake logged successfully"; auto-close | ⚠️ writes real log |
| 21 | "← Back" (water form) | link | `…/FoodWaterTrackerModal.jsx:1065-1072` | Back to Step 1 type chooser | |

- **Empty / loading / error states:** no data is displayed (input-only). Loading: spinner replaces button label, button disabled. Error (HTTP failure): native alert "Error — Could not save. Please try again." (from `src/hooks/useHealthTracking.js:53`); modal stays on the same step with entries intact; raw server text is NOT shown (only console).
- **Modals / sheets / alerts opened:** confirmation screen is inline (check-mark, "Logged!", "Food entry added to today's timeline" / "Water intake logged successfully"). Only alert is the error alert above.
- **Back / dismiss behaviour:** X or swipe-down/hardware back (`onRequestClose`, `:182`) = full reset + close. In-modal "← Back" links step back one level. Closing during the 1.5 s confirmation is fine.

---

### Pee — "Log Pee" modal (`PeeTrackerModal`)
- **File:** `src/components/Health/Pee/PeeTrackerModal.jsx` · **Reached from:** Bathroom chooser › "Pee" (`src/components/Health/HealthTrack.jsx:456-459`). (Also from unused `PeeDashboard`, §9.)
- **Gating / data needed:** a selected pet. Full-screen `pageSheet`, opens on Step 1 "How was your pet's pee?".
- API: `POST /api/health/pee-logs` direct `fetch` (`PeeTrackerModal.jsx:85`), then refetches timeline + pee-logs. Unlike Food/Poo/Quick Check it does **not** invalidate the Care Ring query (ring may need a refresh to reflect a pee log).
- Has a "Saving…" full-body spinner state and a **concern warning screen** after detailed saves.

| # | Element (EN label / ES) | Type | Source | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | X (top-right) | header icon | `src/components/Health/Pee/PeeTrackerModal.jsx:233-246` | Resets & closes; disabled while saving | |
| 2 | "Same as usual" — "Normal volume, color, and no concerns" / Como siempre | button (one-tap log) | `…/PeeTrackerModal.jsx:420-454` (handler `:135-155`) | IMMEDIATELY POSTs frequency normal, volume normal, color yellow, all concern flags false. Shows "Saving…" then "Logged!" / "Pee entry added to today's timeline", auto-close 1.5 s | ⚠️ writes real log, no undo |
| 3 | "Something changed" — "Different color, difficulty, or other observations" | button | `…/PeeTrackerModal.jsx:456-484` | Opens the detailed form (Step 2 "Pee details") | |
| 4 | "Volume": small / normal / large (default normal; raw English) | chip group | `…/PeeTrackerModal.jsx:517-540` | Select volume | |
| 5 | "Color": pale / yellow / dark / red/pink / other (default yellow; raw English) | chip group | `…/PeeTrackerModal.jsx:561-590` | Select color. "red/pink" counts as a concern | |
| 6 | "Accident in house?" No/Yes | toggle pair | `…/PeeTrackerModal.jsx:605,627` | Sets accident flag | |
| 7 | "Difficulty peeing?" No/Yes | toggle pair | `…/PeeTrackerModal.jsx:665,687` | Sets flag — Yes triggers the URGENT warning after save | |
| 8 | "Pain or crying?" No/Yes | toggle pair | `…/PeeTrackerModal.jsx:725,747` | Sets flag — Yes triggers the URGENT warning after save | |
| 9 | "Blood visible?" No/Yes | toggle pair | `…/PeeTrackerModal.jsx:785,807` | Sets flag — Yes triggers the (non-urgent) warning | |
| 10 | "Increased thirst?" No/Yes | toggle pair | `…/PeeTrackerModal.jsx:845,867` | Sets flag (no warning effect) | |
| 11 | "Notes (optional)" (placeholder "Anything different from usual?") | text input (multiline) | `…/PeeTrackerModal.jsx:903-919` | Free text | |
| 12 | "Log Pee Entry" / Registrar pipí | button (submit) | `…/PeeTrackerModal.jsx:926-945` (handler `:157-185`) | POSTs the log. If NO concerns → "Logged!" confirmation, auto-close. If concerns (difficulty, pain, blood, or color red/pink) → warning screen (row 13) after the save has already succeeded | ⚠️ writes real log |
| 13 | "Got it, thanks" / Entendido, gracias (on warning screen) | button | `…/PeeTrackerModal.jsx:374-393` (handler `:187-194`) | Dismisses warning → "Logged!" confirmation → auto-close 1.5 s | |
| 14 | "← Back" (detailed form) | link | `…/PeeTrackerModal.jsx:948-955` | Back to Step 1 (quick choice) | |

- **Empty / loading / error states:** input-only. Loading = centered spinner + "Saving…" replacing the body. Errors use the **global `alert()`**: "Could not save. Please try again." (HTTP failure) or "Could not save. Please select a pet first." (no pet); form stays open. Raw server error text is only logged to console, not shown.
- **Modals / sheets / alerts opened:** inline warning screen. Urgent (difficulty/pain): title "Worth veterinary attention"; non-urgent: "Worth noting". Body for both: "This may be worth discussing with a veterinarian. Seek professional care if your dog seems unable to pee, is painful, or symptoms continue." (`PeeTrackerModal.jsx:346-371`). NOTE: log is already saved before the warning is shown.
- **Back / dismiss behaviour:** X / hardware back (`onRequestClose`, `:206`) resets & closes (the X is disabled while a save is in flight). On warning screen the X also closes.

---

### Poo — "Log Poo" modal (`PooTrackerModal`)
- **File:** `src/components/Health/Poo/PooTrackerModal.jsx` · **Reached from:** Bathroom chooser › "Poo" (`src/components/Health/HealthTrack.jsx:450-453`). (Also unused `PooDashboard`, §9.)
- **Gating / data needed:** a selected pet. Full-screen `pageSheet`; Step 1 "How was the poo?".
- API: `POST /api/health/poo-logs` via `useLogPoo` (`src/hooks/useHealthTracking.js:70`); invalidates poo-logs, timeline and the health graph/Care Ring (`invalidateHealthGraph`). Optional photo goes first to `POST /api/upload` (`visibility:"private"`, `petId`).

| # | Element (EN label / ES) | Type | Source | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | X (top-right) | header icon | `src/components/Health/Poo/PooTrackerModal.jsx:250` | Resets & closes (NOT disabled during save) | |
| 2 | "Same as usual" — "Normal consistency, color, and amount" | button (one-tap log) | `…/PooTrackerModal.jsx:403-441` (handler `:89-110`) | IMMEDIATELY POSTs amount medium, shape normal, color brown, no blood/mucus, effort none, no accident. "Logged!" then auto-close 1.5 s. Disabled while busy | ⚠️ writes real log, no undo |
| 3 | "Something changed" — "Different color, shape, or other observations" | button | `…/PooTrackerModal.jsx:446-473` | Opens detailed form "Poo details" | |
| 4 | "Amount": small / medium / large (default medium) | chip group | `…/PooTrackerModal.jsx:506-535` | Select | |
| 5 | "Shape / Consistency": hard / normal / soft / liquid (default normal) | chip group | `…/PooTrackerModal.jsx:550-580` | Select | |
| 6 | "Color": brown / yellow / green / black / red / other (default brown) | chip group | `…/PooTrackerModal.jsx:593-625` | Select (black, red = concern) | |
| 7 | "Blood visible?" No/Yes | toggle pair | `…/PooTrackerModal.jsx:637,659` | Sets blood flag (Yes = concern) | |
| 8 | "Mucus visible?" No/Yes | toggle pair | `…/PooTrackerModal.jsx:697,719` | Sets mucus flag (concern only if shape = liquid) | |
| 9 | "Effort / Straining": none / mild / strong (default none) | chip group | `…/PooTrackerModal.jsx:756-790` | Select. strong = concern. API only gets boolean `straining` (mild or strong) | |
| 10 | "Accident in house?" No/Yes | toggle pair | `…/PooTrackerModal.jsx:799,821` | Sets accident flag | |
| 11 | "Photo (optional)" hint "Add a photo if you want to compare changes over time" — "Take Photo" / Sacar foto | button | `…/PooTrackerModal.jsx:899-921` (handler `:175-190`) | Requests camera permission (system prompt, see top), opens camera (editing allowed, quality 0.8); photo preview replaces the buttons. Denied → alert "Camera permission is required to take photos." | ⚠️ camera; photo uploaded on submit |
| 12 | "Choose Photo" / Elegir foto | button | `…/PooTrackerModal.jsx:923-945` (handler `:192-208`) | Requests photo-library permission; opens library picker (editing allowed). Denied → alert "Photo library permission is required." | ⚠️ photo uploaded on submit |
| 13 | Remove-photo red X on preview | button | `…/PooTrackerModal.jsx:880` | Clears the chosen photo (local only) | |
| 14 | "Notes (optional)" | text input (multiline) | `…/PooTrackerModal.jsx:962` | Free text | |
| 15 | "Log Poo Entry" / Registrar caca | button (submit) | `…/PooTrackerModal.jsx:985-1008` (handler `:112-164`) | If a photo was chosen: uploads it first to `/api/upload` (private bucket, scoped to pet); if upload fails alert "Photo upload failed. Saving without a photo." and the log still saves without the photo. Then POSTs the log. No concerns → "Logged!"/auto-close; concerns (blood, color black/red, liquid+mucus, strong effort) → warning screen. Disabled while uploading/saving | ⚠️ writes real log + uploads photo (private) |
| 16 | "Got it, thanks" (warning screen) | button | `…/PooTrackerModal.jsx:357-375` (handler `:166-173`) | → "Logged!" confirmation → auto-close | |
| 17 | "← Back" (detailed form) | link | `…/PooTrackerModal.jsx:1012-1018` | Back to Step 1 | |

- **Empty / loading / error states:** input-only. Loading: submit button spinner (disabled). HTTP failure → native alert "Error — Could not save. Please try again."; form stays open with data. Photo permission/upload failures use the plain `alert()` texts above. Raw server errors never shown.
- **Modals / sheets / alerts opened:** inline warning screen: title "Worth noting"; body "This may be worth discussing with a veterinarian, especially if it continues, worsens, or comes with vomiting, pain, or low energy." (always the non-urgent style). Log is already saved when it appears. System permission prompts for camera/photos (see top).
- **Back / dismiss behaviour:** X / hardware back (`onRequestClose`, `:222`) resets & closes; unsaved photo/entries are discarded.

---

### Vomit — "Log Vomit / Digestive Event" modal (`VomitTrackerModal`)
- **File:** `src/components/Health/Vomit/VomitTrackerModal.jsx` · **Reached from:** Bathroom chooser › "Vomit / digestive event" (`src/components/Health/HealthTrack.jsx:462-465`). (Also unused `VomitDashboard`, §9.)
- **Gating / data needed:** a selected pet. Full-screen `pageSheet`; Step 1 "What happened?".
- API: `POST /api/health/vomit-logs` direct `fetch` (`VomitTrackerModal.jsx:105`); refetches timeline + vomit-logs (no Care Ring invalidation). Photo goes to `POST /api/upload` (`visibility:"private"`, `petId`) **immediately when picked**, before the log is saved.

| # | Element (EN label / ES) | Type | Source | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | X (top-right) | header icon | `src/components/Health/Vomit/VomitTrackerModal.jsx:311-322` | Resets & closes; disabled while saving | |
| 2 | "Vomited once" — "Normal energy, no other symptoms" / Vomitó una vez | button (one-tap log) | `…/VomitTrackerModal.jsx:495-528` (handler `:153-174`) | IMMEDIATELY POSTs 1 episode, appearance foam, relation unknown, appetite normal, energy normal, no diarrhea. "Logged!" / "Digestive event added to today's timeline", auto-close 1.5 s | ⚠️ writes real log, no undo |
| 3 | "Something changed / add details" — "Multiple episodes, blood, low energy, or other observations" | button | `…/VomitTrackerModal.jsx:531-560` | Opens detailed form "Vomit details" | |
| 4 | "Number of episodes": 1 / 2 / 3 / 4+ (default 1; 4+ saved as 4) | chip group | `…/VomitTrackerModal.jsx:591-596` | Select | |
| 5 | "Appearance": food / foam / bile/yellow / clear liquid / blood / other (default foam; raw English) | chip group | `…/VomitTrackerModal.jsx:645-648` | Select ("blood" chip turns red and triggers urgent warning) | |
| 6 | "Relation to food": before meal / after meal / unknown (default unknown) | chip group | `…/VomitTrackerModal.jsx:696-699` | Select | |
| 7 | "Appetite after vomiting": normal / reduced / refused food | chip group | `…/VomitTrackerModal.jsx:739-742` | Select ("refused food" = urgent warning) | |
| 8 | "Energy level": normal / low / very low | chip group | `…/VomitTrackerModal.jsx:791-794` | Select ("very low" = urgent, "low" = non-urgent warning) | |
| 9 | "Diarrhea also present?" No/Yes | toggle pair | `…/VomitTrackerModal.jsx:848,870` | Sets flag (Yes = non-urgent warning) | |
| 10 | "Photo (optional)" — dashed "Add photo" box (shows "Uploading…" during upload) / Agregar foto | button | `…/VomitTrackerModal.jsx:937-960` (handler `:229-235`) | Opens native alert "Add Photo — Choose a photo source" with buttons "Take Photo", "Choose from Library", "Cancel" (rows 11-13) | |
| 11 | Alert button "Take Photo" | alert button | `…/VomitTrackerModal.jsx:231` (`pickAndUpload(true)` `:172-227`) | Camera permission prompt → camera (editing allowed) → immediate private upload; thumbnail appears. Denied → alert "Camera permission is required to take photos." Upload failure → alert "Photo upload failed. You can still save without a photo." | ⚠️ camera + photo upload |
| 12 | Alert button "Choose from Library" | alert button | `…/VomitTrackerModal.jsx:232` | Photo-library permission → picker → immediate private upload; denied → "Photo library permission is required." | ⚠️ photo upload |
| 13 | Alert button "Cancel" | alert button | `…/VomitTrackerModal.jsx:233` | Dismisses chooser | |
| 14 | Trash icon on photo preview | button | `…/VomitTrackerModal.jsx:919-933` (handler `:237-239`) | Removes the photo from the form (the already-uploaded object stays on the server) | |
| 15 | "Notes (optional)" (placeholder "What else did you notice?") | text input (multiline) | `…/VomitTrackerModal.jsx:975-992` | Free text | |
| 16 | "Log Digestive Event" / Registrar evento digestivo | button (submit) | `…/VomitTrackerModal.jsx:998-1017` (handler `:241-269`) | POSTs the log (NOTE: button has no disabled/spinner state, the whole body switches to the "Saving…" spinner instead). Urgent concerns (blood, very low energy, refused food, ≥3 episodes) → red "May need veterinary attention"; non-urgent (low energy, diarrhea, 2 episodes) → "Worth monitoring"; otherwise "Logged!" | ⚠️ writes real log |
| 17 | "Got it, thanks" (warning screen) | button | `…/VomitTrackerModal.jsx:453-470` (handler `:271-278`) | → "Logged!" → auto-close | |
| 18 | "← Back" (detailed form) | link | `…/VomitTrackerModal.jsx:1020-1026` | Back to Step 1 | |

- **Empty / loading / error states:** input-only. Loading: centered spinner + "Saving…". Errors via global `alert()`: "Could not save. Please try again." or "Could not save. Please select a pet first."; photo errors as above. No raw server text shown.
- **Modals / sheets / alerts opened:** inline warning screen (body: "This may need veterinary attention, especially if repeated, severe, or combined with low energy, diarrhea, pain, or refusal to eat."); the "Add Photo" source alert; system camera/photo permission prompts.
- **Back / dismiss behaviour:** X / hardware back (`onRequestClose`, `:290`) resets & closes (X disabled while saving). Closing after a photo upload but before saving leaves an orphan private upload.

---

### Quick Check — wizard "Quick Check" modal (`GeneralCheckModal`, mode `full`)
- **File:** `src/components/Health/GeneralCheck/GeneralCheckModal.jsx` · **Reached from:** Track tile "Quick Check" (`src/components/Health/HealthTrack.jsx:474-477`, wizard/default mode). The same component is reused in `mode="quick"` by the Care Ring (`src/components/Health/CareRingCard.jsx:14` — launcher belongs to TODAY; the quick variant is documented in the second table below).
- **Gating / data needed:** a selected pet. Bottom sheet (90 % height, dark scrim), title "Quick Check". Eight body areas, each optional: Eyes, Ears, Teeth & Mouth, Skin & Fur, Paws, Face, Mood, Energy.
- API: `POST /api/health/general-checks` via `useLogGeneralCheck` (`src/hooks/useHealthTracking.js:171`); invalidates general-checks, timeline, Care Ring. Photos are uploaded immediately on pick to `POST /api/upload` (`visibility:"private"`, pet-scoped) and stored as keys.
- Header progress: "{n} of 8" (current area) and "{x} of 8 checked" (areas actually assessed) + progress bar.

| # | Element (EN label / ES) | Type | Source | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | X (top-right) | header icon | `src/components/Health/GeneralCheck/GeneralCheckModal.jsx:852-854` | `handleCloseModal`: discards everything entered, closes (no confirmation) | |
| 2 | Area stepper pills: 👁️ Eyes / 👂 Ears / 🦷 Teeth & Mouth / 🐾 Skin & Fur / 🐾 Paws / 😊 Face / 💭 Mood / ⚡ Energy (green check once assessed; horizontal scroll) | tab/pill row | `…/GeneralCheckModal.jsx:905-955` (onPress `:916`) | Jumps directly to that area (scrolls form back to top) | |
| 3 | "Looks usual" / Se ve normal (under "How does this look?"; hint "Optional — skip if you didn't check this area") | radio button | `…/GeneralCheckModal.jsx:1028-1077` (handler `:151-162`) | Marks area usual (clears any "what changed"); tapping it again un-answers the area | |
| 4 | "Something changed" / Algo cambió | radio button | `…/GeneralCheckModal.jsx:1079-1130` | Marks area changed and reveals the "What changed?" list; tap again to un-answer | |
| 5 | "What changed? (select all that apply)": Redness, Swelling, Discharge, Bad smell, Limping, Excessive licking, Hair loss, Wound, Other (with emoji) | checkbox list (multi-select; only visible when "Something changed") | `…/GeneralCheckModal.jsx:1148-1187` (onPress `:1155`, handler `:164-177`) | Toggles each change | |
| 6 | "Add photo (optional)" › "Take photo" / Tomar foto | button | `…/GeneralCheckModal.jsx:1205-1234` (handler `:229-281`) | Camera permission prompt → camera (no editing) → uploads privately → thumbnail appears with "Uploading photo…" spinner. Denied → alert "Photo access needed / Photo access is needed to add a photo. You can still save the check without one." Failure → alert "Could not add the photo. Please try again." | ⚠️ camera + photo upload |
| 7 | "Choose photo" / Elegir foto | button | `…/GeneralCheckModal.jsx:1235-1264` | Photo-library permission → picker → private upload (same alerts) | ⚠️ photo upload |
| 8 | Thumbnail X ("Remove photo") | button | `…/GeneralCheckModal.jsx:1310-1328` | Removes that photo from the area (server object remains) | |
| 9 | "Ask AI about this photo" 🔒 — "Coming soon — AI can help summarize visible changes, but it does not diagnose." | locked placeholder (faded; NOT pressable) | `…/GeneralCheckModal.jsx:1334-1376` | Nothing happens — display only, no AI call | |
| 10 | "Notes (optional)" (placeholder "Any additional observations...") | text input (multiline, per area) | `…/GeneralCheckModal.jsx:1391-1409` | Free text per area; all areas' notes are joined as "Area: note" lines into the single notes field on save (`:312-317`) | |
| 11 | "Back" | button (only from area 2 on) | `…/GeneralCheckModal.jsx:1451-1472` | Goes to previous area | |
| 12 | "Next" ▶ (areas 1-7) / "Complete" (area 8; "Saving…" while pending) | button | `…/GeneralCheckModal.jsx:1474-1502` (handlers `:289-295`, `:303-359`) | Next always advances (areas may stay unchecked). On the last area, Complete POSTs the check with only the assessed areas (unassessed = NULL). If ≥1 area was "changed": alert "Quick check saved — 1 area with changes noted. Continue monitoring and contact your vet if needed." (or "{n} areas with changes noted…") with OK, which closes the modal. If nothing was "changed": closes silently. Complete with ZERO areas assessed still POSTs an empty check (no validation). Button disabled while saving. | ⚠️ writes real record (+ private photo keys) |

- **Empty / loading / error states:** none (input-only). Saving: button shows "Saving…" and is disabled. HTTP failure → alert "Error — Could not save. Please try again."; modal stays open so the user can retry. Disclaimer always shown at the bottom: "Photos can help track changes over time. For pain, swelling, wounds, discharge, or symptoms that continue, contact your veterinarian." (`:1425-1436`).
- **Modals / sheets / alerts opened:** permission alert ("Photo access needed"), photo error alert, success alert ("Quick check saved"), system camera/photo prompts.
- **Back / dismiss behaviour:** X / hardware back (`onRequestClose`, `:814`) closes and resets all state. In-modal "Back" steps one area back; the stepper allows free navigation.

#### Quick Check — **quick mode** (`mode="quick"`, opened from the Care Ring, launcher owned by TODAY agent)
- **File:** same `GeneralCheckModal.jsx:383-811` · **Gating:** shows only today's 2 suggested areas (`QUICK_SUGGESTION_COUNT = 2`, frozen at open; falls back to Eyes + Ears if none passed). Each starts UNANSWERED; Save stays disabled until every suggested area is answered. Same API as the wizard; passes the created check back via `onSaved` so the Care Ring can offer Undo (TODAY agent).

| # | Element | Type | Source | Action → expected result | Risk |
|---|---|---|---|---|---|
| Q1 | X (a11y label "Back") | header icon | `src/components/Health/GeneralCheck/GeneralCheckModal.jsx:439-445` | Closes and discards | |
| Q2 | Header text "Today's check: {Area} and {Area}" + "Mark how each area looks — usual or something changed. Not a diagnosis; it helps prepare vet conversations." | label | `…/GeneralCheckModal.jsx:447-454` | Info only | |
| Q3 | "Looks usual" (per area card) | radio | `…/GeneralCheckModal.jsx:501-525` | Marks usual (no tap-to-unselect in this mode) | |
| Q4 | "Something changed" (per area card) | radio | `…/GeneralCheckModal.jsx:526-550` | Marks changed; reveals the 9 change chips | |
| Q5 | Change chips (Redness … Other) | checkbox chips | `…/GeneralCheckModal.jsx:566-594` | Toggle each change | |
| Q6 | "Take photo" / "Choose photo" (appear once an area is answered either way) | buttons | `…/GeneralCheckModal.jsx:612-663` | Same permission prompts + private upload as wizard rows 6-7 | ⚠️ camera / photo upload |
| Q7 | Thumbnail X ("Remove photo") | button | `…/GeneralCheckModal.jsx:681-699` | Removes photo | |
| Q8 | Per-area notes ("Any additional observations...") | text input | `…/GeneralCheckModal.jsx:705-722` | Free text | |
| Q9 | "Save" / "Saving…" (hint above it while disabled: "Answer the suggested areas to save") | button | `…/GeneralCheckModal.jsx:789-805` | Disabled until all suggested areas answered; then POST (same `handleComplete`), same "Quick check saved" alert if any area changed, then closes | ⚠️ writes real record |

- **Empty / loading / error / dismiss:** identical to the wizard (error alert "Could not save. Please try again."; `onRequestClose` closes).

---

### Medications & Care — modal with tabs Medications / Vaccines / Preventive (`MedicationModal`)
- **File:** `src/components/Health/Medication/MedicationModal.jsx` · **Reached from:** Track tile "Medications & Care" (`src/components/Health/HealthTrack.jsx:481-486`, opens on the Medications tab). Also reused by the Vet Record screen for vaccination/medication records (`src/components/Health/HealthVetRecord.jsx:2955`; that launcher belongs to VETREC).
- **Gating / data needed:** a selected pet (needs `petId`; without it the lists stay empty). Bottom sheet 90 % height. The `initialTab` is only read on first mount (the tab last used is kept if re-opened).
- APIs (all owner-scoped, real data, no seed): Medications `GET/POST/PATCH/DELETE /api/health/medications`; Vaccines `GET/POST/PATCH/DELETE /api/pet-vaccinations`; Preventive `GET/POST/PATCH/DELETE /api/health/preventive-treatments`. Edit and Delete act on records that already exist in the backend.

| # | Element (EN label / ES) | Type | Source | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | X (a11y label "Cancel") | header icon | `src/components/Health/Medication/MedicationModal.jsx:493-495` | Closes the modal (also `onRequestClose` `:464`); unsaved form is discarded | |
| 2 | Tab "Medications" / Medicamentos | tab | `…/MedicationModal.jsx:458,503-529` (handler `:270-274`) | Switch tab; closes any open add/edit form | |
| 3 | Tab "Vaccines" / Vacunas | tab | `…/MedicationModal.jsx:459,503-529` | Same | |
| 4 | Tab "Preventive" / Preventivos | tab | `…/MedicationModal.jsx:460,503-529` | Same | |
| 5 | Info banner "Follow your veterinarian's instructions for medication dose and schedule." (Medications tab only) | label | `…/MedicationModal.jsx:543-560` | Info only | |
| 6 | "Add medication" / "Add vaccine" / "Add preventive care" (coral button; hidden while form open) | button | `…/MedicationModal.jsx:403-421` (used `:562,672,736`; handler `:276-280`) | Opens the inline add form for the active tab | |
| 7 | Med form: "Medication name *" (ph "e.g., Carprofen"), "Dose" ("e.g., 25 mg"), "Frequency" ("e.g., Twice daily"), "Prescribed by" ("e.g., Dr. Smith"), "Notes" | text inputs | `…/MedicationModal.jsx:567-581` | Free text. Only name is required | |
| 8 | Vaccine form: "Vaccine name *" ("e.g., Rabies, DHPP"), "Date given" (date), "Due / expiration date" (date), "Vet clinic", "Notes" | text input + date pickers | `…/MedicationModal.jsx:677-691` (DateField `:681,684`) | Native date picker fields (canonical YYYY-MM-DD); name required | |
| 9 | Preventive form: "Product name *" ("e.g., Simparica Trio"), "Type" chips, "Frequency" ("e.g., Monthly"), "Last given" (date), "Next due" (date), "Notes" | text input + chips + date pickers | `…/MedicationModal.jsx:741-788` (DateField `:781,784`) | Name required; type defaults to "other" if none picked | |
| 10 | Preventive type chips: Flea prevention, Tick prevention, Heartworm prevention, Flea & Tick, Flea/Tick & Heartworm, Dewormer, Supplement, Other preventive (horizontal scroll, emoji) | chip group | `…/MedicationModal.jsx:752-774` (onPress `:757`) | Select treatment type | |
| 11 | "Enable reminders" bell switch (a11y role switch) | toggle | `…/MedicationModal.jsx:112-132` (used `:582,692,789`) | Sets `reminderEnabled` on the record. In this modal it only stores a flag via the API; no local notification, OS permission prompt or calendar entry is created here (no scheduling code in the file) | |
| 12 | "Cancel" (form) | button | `…/MedicationModal.jsx:425-430` | Closes form without saving | |
| 13 | "Save" (form) | button | `…/MedicationModal.jsx:431-437` (handlers `:294-314`, `:338-358`, `:373-394`) | Validates name (alert "Required — Please enter a name" / "Please enter a product name"), then POST (add) or PATCH (edit); form closes and list refreshes. Disabled while pending. Failure → alert titled "Required" showing the server/exception message or "Error" (raw text can leak) | ⚠️ writes real record |
| 14 | "Mark as completed" (on each CURRENT medication) | button | `…/MedicationModal.jsx:611-617` (handler `:316-324`) | Alert "Mark as completed — Mark {name} as completed? It moves to past medications." [Cancel / Mark as completed] → PATCH status=completed; item moves to "Past medications" | ⚠️ modifies record |
| 15 | "Edit" / Editar (each medication / vaccine / preventive card) | button | `…/MedicationModal.jsx:145-162` (via RowActions `:618-623,649-654,717-722,822-827`) | Opens the form pre-filled; Save PATCHes | |
| 16 | "Delete" / Eliminar (each card) | button | `…/MedicationModal.jsx:163-180`, confirm `:396-401` (calls `:620,651,719,824`) | Alert "Delete {name}? — This can't be undone." [Cancel / Delete (destructive)] → `DELETE /api/health/medications?id=…` / `/api/pet-vaccinations?id=…` / `/api/health/preventive-treatments?id=…`. No error alert if the delete fails | 🗑️ permanently deletes the record |

- **Empty / loading / error states:** loading = coral spinner per tab; empty texts: "No medications added yet" / "No vaccines added yet" / "No preventive care added yet" (shown only when the form is closed). Lists: "Current medications" and "Past medications" (dates range) for meds; vaccines show a status badge (Overdue / Due soon / Current) from the expiration date and "Given"/"Due"/clinic lines; preventives show type emoji+label, status badge (Overdue / Due soon / On schedule), Frequency / Last given / Next due. Fetch errors are silent (list simply stays empty); save errors → alert as in row 13.
- **Modals / sheets / alerts opened:** validation alert, save-error alert, "Mark as completed" confirm, "Delete" confirm, native date pickers (DateField).
- **Back / dismiss behaviour:** X or hardware back closes; switching tabs closes an open form without confirmation. When opened from Vet Record, closing also refreshes the vaccination list there (VETREC).

---

### Unreachable components (documented for completeness — a tester cannot reach these)
`FoodWaterDashboard`, `PeeDashboard`, `PooDashboard`, `VomitDashboard`, `GeneralCheckDashboard` (and `index.js` re-exports) in `src/components/Health/{FoodWater,Pee,Poo,Vomit,GeneralCheck}/` are not imported by any screen (only by each folder's `index.js`/tests). They read local mock data from `src/data/*.js` and each only has a "+" / stat-card button that opens the same tracker modal. If a QA checklist expects "today's count / last log / appetite-trend" cards on Track, those do not exist in the live app; Track only shows the tile list above.

---


---
## AREA: Weight / Wellness / Walk / Photo Check / Vet Summary / Insights

All paths are relative to `anything/apps/mobile/`. EN text is resolved from `src/i18n/locales/en.json` (ES in `es.json`, voseo). "Hardcoded EN" means the string is inline in JSX and has NO ES version (tester on an ES device will see English).

**Permission prompts a tester will hit in this area** (exact text from `app.json` infoPlist, lines 28-34):
- Camera (Photo Check "Take Photo", walker QR scan): "PawPi uses the camera so you can take photos of your pet for their profile, daily moments, health checks and vet records."
- Photo library (Photo Check "Choose from Gallery"): "PawPi accesses your photo library so you can choose photos and documents for your pet's profile, posts, health records and chats."
- Location When-In-Use (ONLY the walker workspace `walker-walks`, via `Location.requestForegroundPermissionsAsync`): "PawPi uses your location to find nearby pet-friendly places, vets, walkers and meetups, to set a location on social walks, transport and events, and to share your live location while you drive a pet-taxi trip."
- NO HealthKit / Apple Health / Watch permission text exists in `app.json`; the Apple Health / Apple Watch integration is a stub (`src/utils/healthKitIntegration.js` always returns "not available") so no HealthKit prompt can appear.
- Calendar prompt is NOT in this area (it belongs to `WalkCountdownCard` / Reminders, other agents).
- No push-notification prompt in this area.

**Reachability map (important for the tester):**
| Component | Reachable in production? | How |
|---|---|---|
| WeightModal | Yes | Health → Track → "Weight" tile (`src/components/Health/HealthTrack.jsx:197-199`, tile defined line 69-75) |
| WellnessLogModal | Yes, only if a Wellness-check reminder exists | Health → Today → tap Done/complete on a Wellness-check reminder (`src/components/Health/HealthToday.jsx:229-231`) |
| WalkActivityModal | Yes | Health → Track → "Walk & Activity" tile (`HealthTrack.jsx:194-196`) |
| StartWalkModal / PostWalkFeedbackModal | Yes, only if a Walk reminder exists | Health → Today → Walk countdown card → "Start walk" (`WalkCountdownCard.jsx:195`, other agent's card). StartWalkModal is also reused by the walker workspace `src/app/walker-walks.jsx:406` |
| WalkTrackingSettings | Yes | (a) inside the "Log walk manually" form; (b) More → Settings → "WALK TRACKING" (non-business accounts only; `src/components/Settings/AppSettings.jsx:805-826`) |
| PhotoCheckModal (area picker) + PhotoCheckCaptureModal | Yes | Health → Track → "Photo Check" tile (`HealthTrack.jsx:177-179`, 425-441); capture modal also from Today Photo-check reminders (`HealthToday.jsx:221-225, 1057`) |
| PhotoHistory | Yes | Health → Vet Record → "Photos" tab (`src/components/Health/HealthVetRecord.jsx:1614-1640`); also VetRecord/PhotoHistorySection.jsx (other agent) |
| VetSummaryDashboard card + VetSummaryModal | Yes | Health → Vet Record, card at top (`HealthVetRecord.jsx:1808`) |
| HealthInsights | **NO — hidden** | `SHOW_INSIGHTS = false` in `src/constants/healthSections.js:11`; the section strip only shows Today / Track / Vet Record, and `?section=insights` deep link is ignored |
| WeightDashboard, WalkActivityDashboard, PhotoCheckSchedule | **NO — dead code** | exported from index.js but never rendered anywhere |

---

### Weight (Track tile → modal) — `WeightModal`
- **File:** `src/components/Health/Weight/WeightModal.jsx` · **Reached from:** Health → Track → Everyday → "Weight" tile ("Track weight over time"), `src/components/Health/HealthTrack.jsx:197-199` (modal mounted line 489-492)
- **Gating / data needed:** needs a current pet (otherwise "Could not save. Please select a pet first."). Unit shown = the pet's own unit (`currentPet.weight_unit`), else metric unless device locale is US (line 77). No premium gate.
- Page-sheet modal, header title "Weight & Body Condition" (ES "Peso y condición corporal"). Two tabs: "Add entry" and "History".

| # | Element (EN label / ES) | Type | Source | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | X (close) in header | header icon | `src/components/Health/Weight/WeightModal.jsx:256` | Closes the sheet (disabled while saving). Form state is only reset after a successful save, so typed-but-unsaved values are still there if you reopen the modal | |
| 2 | Tab "Add entry" / "Agregar registro" | tab | `WeightModal.jsx:285` | Shows the form | |
| 3 | Tab "History" / "Historial" | tab | `WeightModal.jsx:306` | Shows list of last 20 weigh-ins (GET `/api/health/weight-logs?petId=…&limit=20`) | |
| 4 | "Current weight ({unit}) *" input, placeholder "e.g., 48.5" | text input (decimal-pad) | `WeightModal.jsx:394` | Free numeric text; required. `parseFloat` on save | |
| 5 | Body-shape chips: Very Thin 🦴 / Thin 🐕 / Ideal ✅ (default) / Overweight 🍖 / Obese 🎈 (ES Muy delgado / Delgado / Ideal / Sobrepeso / Obeso) | chip row (horizontal scroll) | `WeightModal.jsx:432` | Selects shape; an italic description under the row updates (e.g. Ideal: "Ribs felt with slight pressure; visible waist") | |
| 6 | "Notes (optional)" multiline, placeholder "Any observations or context..." | text input | `WeightModal.jsx:490` | Free text | |
| 7 | Dashed "Add photo (coming soon)" box | button (no-op) | `WeightModal.jsx:512` | Has NO onPress — tapping does nothing. Expected: nothing happens, no camera prompt | |
| 8 | "Save entry" / "Guardar registro" | button | `WeightModal.jsx:572` | Disabled (grey) until a weight is typed. POST `/api/health/weight-logs` `{petId, weight, weightUnit, bodyShapeEstimate, photoUrl:null, notes}`; shows "Saving..." spinner; on success form resets and the view jumps to the History tab with the new row; Today/Care Ring/timeline caches refresh | |
| 9 | Trash icon on each history row | button | `WeightModal.jsx:660` | Opens Alert (see below). On "Delete" → DELETE `/api/health/weight-logs?id=<id>` and the row disappears | 🗑️ |
| 10 | History row (weight + unit, date, body-shape emoji+label, notes box) | list item (read-only) | `WeightModal.jsx:610-721` | Not tappable | |

- **Empty / loading / error states:** History: spinner while loading; empty = scale icon + "No weight entries yet" (`WeightModal.jsx:743`). A failed history fetch is NOT distinguished — it also shows the empty text. Validation uses the JS `alert()` (not Alert.alert): "Please enter a weight" (line 115), "Could not save. Please select a pet first." (121), "Could not save. Please try again." (167). Raw server text is not shown (generic message only; server error is only console.logged).
- **Modals / sheets / alerts opened:** Delete Alert (line 185): title "Delete this entry?", body "This weight entry will be removed.", buttons "Cancel" / "Delete" (destructive). Delete failure Alert: "Couldn't delete" + e.message (can be the raw `Failed to delete entry`) or "Please try again." (line 202).
- **Back / dismiss behaviour:** X button or OS swipe/back (`onRequestClose` → `onClose`, line 216). No unsaved-changes prompt.
- **Notes for tester:** The vet-only fields (body condition score, target weight, muscle condition) exist as state but are NOT rendered — only weight, body shape and notes are in the UI. Weight saved here also feeds Vet Summary, Care Ring and the health timeline.

### Weight dashboard card — `WeightDashboard` (UNREACHABLE, dead code)
- **File:** `src/components/Health/Weight/WeightDashboard.jsx` · **Reached from:** nothing — only re-exported by `Weight/index.js`; not rendered by any screen (verified by grep). Reads local sample helpers from `@/data/weightData`, not the API.
- **Gating / data needed:** n/a — do not test; listed so the tester knows a "Weight & Body Condition" card with "+" and "Add first entry" does NOT exist in the live app.
| # | Element | Type | Source | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | "+" button / "Add first entry" / "Weight history — Tap to view full weight history" | buttons | `src/components/Health/Weight/WeightDashboard.jsx:115, 527, 642` | Would open WeightModal; never shown in production | |
- **Empty / loading / error states:** n/a. **Modals:** WeightModal. **Back / dismiss:** n/a.

---

### Wellness check log — `WellnessLogModal`
- **File:** `src/components/Health/WellnessCheck/WellnessLogModal.jsx` · **Reached from:** Health → Today → completing a reminder whose type is "wellness check" → `routeReminderLog` returns WELLNESS_MODAL (`src/utils/reminderLogFlow.js:46-47`) → `HealthToday.jsx:229-231`, modal mounted `HealthToday.jsx:1080-1085`
- **Gating / data needed:** requires a Wellness-check routine/reminder (created in Reminders; other agent) to appear in Today. One config-driven modal for 8 check types (`src/utils/wellnessLog.js:14-95`): Weight, Body condition, Mobility, Mood/Energy, Skin/Coat, Appetite/Hydration, General check, Custom. Title shown = the reminder's title (fallback "Wellness check").
- Fields depend on type:
  - Weight → number input + unit toggle kg / lbs (seeded from last weight log unit, default lbs).
  - Body condition → Under / Ideal / Over. Mobility → Normal / Slightly stiff / Stiff / Limping / Can't bear weight. Mood / Energy → Low / Normal / High. Skin / Coat → Healthy / Dry / Itchy / Redness / Hot spots / Other. Appetite / Hydration → Normal / Reduced / Increased / Not eating/drinking. General check → All good / Noticed something. Custom → free-text value.
  - **These option labels and the validation messages are hardcoded English (no ES).**

| # | Element (EN label) | Type | Source | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | X (close) | header icon | `src/components/Health/WellnessCheck/WellnessLogModal.jsx:180` | Closes; reminder stays in Today (nothing saved) | |
| 2 | Tab "Add entry" | tab | `WellnessLogModal.jsx:207` | Shows form | |
| 3 | Tab "History" | tab | `WellnessLogModal.jsx:228` | Shows last 20 entries for this check type (GET `/api/health/wellness-logs?petId=…&checkType=…&limit=20`, or `/api/health/weight-logs?…` for Weight) | |
| 4 | "Weight *" input, placeholder "e.g., 12.4" | text input (decimal-pad) | `WellnessLogModal.jsx:374` | Weight value | |
| 5 | Unit buttons "kg" / "lbs" | toggle | `WellnessLogModal.jsx:396` | Selects unit | |
| 6 | Option chips (per type, see above) with label "{Type} *" | chip row | `WellnessLogModal.jsx:457` | Single-select | |
| 7 | Free-text "Custom *" field, placeholder "Enter a value..." | text input | `WellnessLogModal.jsx:427` | Only for custom type | |
| 8 | Note box: "Notes (optional)" (becomes "Note *" when General check = Noticed something), placeholder "Any observations or context..." | text input | `WellnessLogModal.jsx:306` | Free text | |
| 9 | "Save entry" / "Guardar entrada" | button | `WellnessLogModal.jsx:329` | Validates (Alert "Almost there" + English message: "Please enter a valid weight" / "Please choose an option" / "Please enter a value" / "Please add a note about what you noticed"). Valid → POST `/api/health/wellness-logs` `{petId, checkType, notes, routineId, wellnessCheckItemIndex, loggedAt, valuesJson}` (Weight → POST `/api/health/weight-logs` `{petId, weight, weightUnit, notes}`); spinner "Saving..."; on success only THIS reminder instance is completed, tab jumps to History, and Today shows Alert "✅ Saved" / "{title} logged" (`HealthToday.jsx:322`) | |

- **Empty / loading / error states:** History spinner; empty = clipboard icon + "No entries yet". Failed history fetch silently shows the empty state. Save failure Alert "Could not save" / "We couldn't save this entry. Please try again." (line 136). No-pet Alert "Could not save" / "Please select a pet first." (line 103). Technical text does not leak (status code only logged).
- **Modals / sheets / alerts opened:** none besides the Alerts above. After a successful save the parent's "Saved" Alert appears over/after the modal.
- **Back / dismiss behaviour:** X / OS back → `onClose` (`setWellnessReminder(null)`), reminder not completed. The modal stays open on the History tab after save (it does not auto-close; user closes with X).

---

### Walk & Activity (Track tile → modal) — `WalkActivityModal`
- **File:** `src/components/Health/WalkActivity/WalkActivityModal.jsx` · **Reached from:** Health → Track → Everyday → "Walk & Activity" tile ("Activity level, duration, and intensity"), `HealthTrack.jsx:194-196`, mounted `HealthTrack.jsx:468-471`
- **Gating / data needed:** current pet needed to save (hook throws "No current pet selected" → generic Alert). Step 1 "quickChoice" = "Walk & Activity" / "What would you like to do?" with two big buttons. Step 2 "walkLog" = "Log Walk" form.

| # | Element (EN label / ES) | Type | Source | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | X (close) | header icon | `src/components/Health/WalkActivity/WalkActivityModal.jsx:136` | Resets the form and closes | |
| 2 | "Start walk — Begin tracking a walk now" / "Iniciar paseo" | button | `WalkActivityModal.jsx:201` | **Does NOT start a timer or create anything.** It only shows a green check "Walk started! Have fun!" for 1.5 s, then resets and closes the modal (no API call, no GPS, no log). Expected-behavior gap for QA: label promises tracking but nothing is tracked | |
| 3 | "Log walk manually — Enter walk details manually" | button | `WalkActivityModal.jsx:252` | Goes to the "Log Walk" form | |
| 4 | "Duration (minutes)" | text input (numeric, default 20) | `WalkActivityModal.jsx:326` | Integer; non-numeric becomes 0 | |
| 5 | "Distance (miles)" (ES label says "kilómetros") | text input (decimal, default 1.0) | `WalkActivityModal.jsx:354` | Decimal; non-numeric becomes 0. Sent with `distanceUnit:"miles"` regardless of language — ES label/unit mismatch (EN says miles, ES says km, payload is always miles) | |
| 6 | Pace chips: relaxed / normal (default) / active | chip row | `WalkActivityModal.jsx:386` | Selects pace; labels are raw lowercase keys capitalised (hardcoded EN) | |
| 7 | "Energy after walk": low / normal (default) / high | chip row | `WalkActivityModal.jsx:428` | Selects | |
| 8 | "Potty events" 💩 Poo 0/1/2/3 (hardcoded EN label) | segmented buttons | `WalkActivityModal.jsx:481` | Sets poo count | |
| 9 | "Potty events" 💦 Pee 0/1/2/3 | segmented buttons | `WalkActivityModal.jsx:521` | Sets pee count | |
| 10 | "Route (optional)", placeholder "e.g., Park loop, Trail run" | text input | `WalkActivityModal.jsx:562` | Free text | |
| 11 | "Notes (optional)", placeholder "Any observations?" | text input (multiline) | `WalkActivityModal.jsx:591` | Free text | |
| 12 | "Tracking settings" section | embedded component | `WalkActivityModal.jsx:631` | Renders WalkTrackingSettings (see its own section) | |
| 13 | "Log Walk" / "Registrar paseo" | button | `WalkActivityModal.jsx:636` | POST `/api/health/walk-logs` `{petId, durationMinutes, distance, distanceUnit:"miles", pace, energyAfter, pottyEvents:{poo,pee}, routeOrLocation, notes}`. Spinner on button; success → "Walk logged!" for 1.5 s then closes. Care Ring walk segment + timeline refresh | |
| 14 | "← Back" | link | `WalkActivityModal.jsx:665` | Back to the two-choice step | |

- **Empty / loading / error states:** no empty state. Save failure → Alert (title "Error", body "Could not save. Please try again.") from `useLogWalk` (`src/hooks/useHealthTracking.js:152-155`); the form stays open. Raw server error is only console-logged.
- **Modals / sheets / alerts opened:** none (WalkTrackingSettings is inline and may open its own Alert).
- **Back / dismiss behaviour:** X / OS back resets everything and closes; no unsaved-data prompt.

### Walk tracking settings (inline + Settings) — `WalkTrackingSettings`
- **File:** `src/components/Health/WalkActivity/WalkTrackingSettings.jsx` · **Reached from:** (a) bottom of the "Log Walk" form (`WalkActivityModal.jsx:631`); (b) More → Settings → "WALK TRACKING" section, hidden for business accounts (`src/components/Settings/AppSettings.jsx:805-826`)
- **Gating / data needed:** none. Apple Health and Apple Watch are always shown with a "COMING SOON" badge because `isHealthKitAvailable()` / `isAppleWatchConnected()` always return false (`src/utils/healthKitIntegration.js:9-27`). Selection is NOT persisted: `getTrackingPreference()` always returns "manual".

| # | Element (EN label / ES) | Type | Source | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | "Apple Health — Automatic distance and step tracking" + "COMING SOON" badge | list item (button) | `src/components/Health/WalkActivity/WalkTrackingSettings.jsx:120` | Alert: title "Apple Health — coming soon", body "Apple Health tracking isn't available yet. For now, manual tracking works great." (button OK). Nothing selected, no HealthKit permission prompt | |
| 2 | "Apple Watch — Real-time pace and heart rate" + "COMING SOON" badge | list item (button) | `WalkTrackingSettings.jsx:120` | Alert: "Apple Watch — coming soon" / "Apple Watch tracking isn't available yet. For now, manual tracking works great." | |
| 3 | "Manual tracking — Enter walk details yourself" (selected by default, green check) | list item (button) | `WalkTrackingSettings.jsx:120` | Stays selected; only a console log, nothing saved | |

- **Empty / loading / error states:** none. Tip box: "Tip: Apple Health and Watch tracking will be available soon. For now, manual tracking works great!"
- **Modals / sheets / alerts opened:** the two "coming soon" Alerts (line 56). The "Apple Health Access" / "Not now / Allow" rationale Alert in `healthKitIntegration.js:35-62` is unreachable today.
- **Back / dismiss behaviour:** n/a (embedded).

### Walk timer — `StartWalkModal`
- **File:** `src/components/Health/WalkActivity/StartWalkModal.jsx` · **Reached from:** Health → Today → Walk countdown card "Start walk" (`src/components/Health/WalkActivity/WalkCountdownCard.jsx:195, 266-272`, other agent's card); also the walker workspace `src/app/walker-walks.jsx:406`
- **Gating / data needed:** a Walk reminder in Today (owner flow) or an active walker session (walker flow). Timer starts counting the moment the sheet opens. Title "🚶 {walk name}" + pet name; default scheduled duration 30 min unless the reminder sets one.

| # | Element (EN label / ES) | Type | Source | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | X (close) | header icon | `src/components/Health/WalkActivity/StartWalkModal.jsx:187` | If any time elapsed: Alert (below). If 0 s elapsed: closes silently | |
| 2 | Countdown ring (mm:ss "remaining", "Time's up!" at 0), info box Scheduled duration / Elapsed time / Pace (raw lowercase value) | display | `StartWalkModal.jsx:226-317` | Updates every second; Pace shows raw "normal"/"relaxed"/"active" (hardcoded EN) | |
| 3 | "Pause" | button | `StartWalkModal.jsx:324` | Freezes timer | |
| 4 | "Resume" (replaces Pause when paused) | button | `StartWalkModal.jsx:353` | Resumes | |
| 5 | When time is up: card "Walk time is up — Did {pet} finish the walk?" with "Extend walk?" buttons "Extend 10 min" / "Extend 15 min" / "Extend 30 min" | buttons | `StartWalkModal.jsx:427` | Adds minutes back to the countdown and resumes | |
| 6 | "Notes (optional)", placeholder "Route, observations..." | text input | `StartWalkModal.jsx:478` | Free text passed to onWalkComplete | |
| 7 | "Finish Walk" | button | `StartWalkModal.jsx:501` | Calls `onWalkComplete({walk,startTime,durationMinutes,pace,notes})`. Owner flow → opens Post-walk feedback. Walker flow → PATCH finish (see walker section) | |

- **Empty / loading / error states:** none.
- **Modals / sheets / alerts opened:** Alert "Walk in Progress" / "Are you sure you want to cancel this walk? Progress will be lost." buttons "Keep Walking" (cancel) / "Cancel Walk" (destructive; closes with no log) (`StartWalkModal.jsx:139-149`).
- **Back / dismiss behaviour:** X and OS back both go through `handleClose` (confirm if elapsed > 0). Closing = discards the timer; nothing is saved.

### Post-walk feedback — `PostWalkFeedbackModal`
- **File:** `src/components/Health/WalkActivity/PostWalkFeedbackModal.jsx` · **Reached from:** after "Finish Walk" in the owner timer flow (`WalkCountdownCard.jsx:52-56, 275-280`)
- **Gating / data needed:** only appears after finishing a walk started from a Today walk reminder. Header "How was the walk?" with "{walk name} · {n} min".

| # | Element (EN label / ES) | Type | Source | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | X (close) | header icon | `src/components/Health/WalkActivity/PostWalkFeedbackModal.jsx:196` | Closes with NO confirmation; the finished walk is NOT logged and the reminder is not completed (data lost) | |
| 2 | "Normal walk — Everything went as expected" ✅ | big button | `PostWalkFeedbackModal.jsx:281` | One-tap save: POST `/api/health/walk-logs` (`startTime, durationMinutes, distance, distanceUnit:"miles", pace, energyAfter:"normal", pottyEvents:{0,0}, routeOrLocation, notes` — notes default to the English literal "Normal walk"). Spinner "Saving walk...", then "Walk logged!" / "Great job, {pet}!" with source line "✏️ Tracked manually", auto-closes after 1.5 s, Today reminder completes and parent Alert "✅ Walk completed!" / "{walk} has been logged" | |
| 3 | "Something was different — Log additional details" | big button | `PostWalkFeedbackModal.jsx:318` | Opens the detailed form | |
| 4 | "Energy after walk": Low / Normal / High | chip row | `PostWalkFeedbackModal.jsx:375` | Select | |
| 5 | "Pace": Relaxed / Normal / Active | chip row | `PostWalkFeedbackModal.jsx:418` | Select | |
| 6 | "Potty events" 💩 Poo 0-3 | segmented buttons | `PostWalkFeedbackModal.jsx:471` | Select | |
| 7 | "Potty events" 💦 Pee 0-3 | segmented buttons | `PostWalkFeedbackModal.jsx:511` | Select | |
| 8 | "Limping or stiffness" checkbox | toggle | `PostWalkFeedbackModal.jsx:549` | Toggles; appends English text "Limping or stiffness observed" to the saved notes; shows hint "Based on your logs, this may be worth monitoring if it continues." | |
| 9 | "Unusual behavior" checkbox | toggle | `PostWalkFeedbackModal.jsx:583` | Toggles; appends English text "Unusual behavior noted" | |
| 10 | "Additional notes", placeholder "Any other observations..." | text input | `PostWalkFeedbackModal.jsx:628` | Free text | |
| 11 | "Save Walk" / "Guardar paseo" | button | `PostWalkFeedbackModal.jsx:676` | Same POST `/api/health/walk-logs` with chosen values; success → confirmation then close | |
| 12 | "← Back" | link | `PostWalkFeedbackModal.jsx:709` | Returns to the two-choice step | |

- **Empty / loading / error states:** full-screen spinner "Saving walk..." while saving. Failure Alert: "Error" / "Could not save walk. Please try again." (`PostWalkFeedbackModal.jsx:100`). No raw server text.
- **Modals / sheets / alerts opened:** none.
- **Back / dismiss behaviour:** X or OS back = discard (see row 1). Tracking-source footer is always "Tracked manually" (HealthKit/GPS sources are not wired).

### Walk activity dashboard card — `WalkActivityDashboard` (UNREACHABLE, dead code)
- **File:** `src/components/Health/WalkActivity/WalkActivityDashboard.jsx` · **Reached from:** nothing (only exported from `WalkActivity/index.js`; uses sample data from `@/data/walkActivityData`). It has one "+" button (`WalkActivityDashboard.jsx:124`) that would open WalkActivityModal. Not visible in production; do not test.

---

### Walker's live route map (shares GPS) — `WalkerLiveMap` + walker workspace `walker-walks`
- **File:** `src/components/Health/WalkActivity/WalkerLiveMap.jsx` (map) · `src/app/walker-walks.jsx` (screen) · **Reached from:** a walker (staff of a walking provider) opens the Walks workspace from the business/walker area (route `/walker-walks`, header "Walks 🐾"). The map is rendered as `topContent` inside `StartWalkModal` (`walker-walks.jsx:406-422`).
- **Gating / data needed:** account must be active staff of a walking provider ("No walker workspace — You're not active staff of a walking provider yet" otherwise) AND have a booked walk or a pickup QR. Cannot be exercised from an ordinary owner account. This screen is only summarised here (walker marketplace is another agent's area), but it is the ONLY place in this area where location is shared.
- **DOES THIS SHARE LOCATION WITH ANYONE? YES.** After the walker taps Start (or scans a pickup QR) the device asks for the iOS When-In-Use location prompt (`walker-walks.jsx:79`). If granted, `Location.watchPositionAsync` (accuracy Balanced, every 5 s / 10 m) posts every point `{lat,lng,t}` to PATCH `/api/providers/{providerId}/walk-sessions/{sessionId}` with `{action:"track", points}` (`walker-walks.jsx:85-103`; hook `src/hooks/useProviders.js:916-935`). The PET OWNER sees that route live: `src/app/walk-live.jsx` polls GET `/api/pets/{id}/walk-sessions` every 5 s and draws it on a map. No server push notification is sent from these routes (grep found none). The walker's own map shows the same points (`WalkerLiveMap`). If the permission is denied the map shows "Location is off for this walk — the time still tracks, just no live map." and nothing is posted. There is no public/social sharing of the route.

| # | Element (EN label) | Type | Source | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | Back arrow | header icon | `src/app/walker-walks.jsx:254` | `router.back()` | |
| 2 | "Scan" (QR icon) | header button (only when a provider exists) | `walker-walks.jsx:272` | Opens the pickup scanner (CAMERA prompt via expo-camera `PickupScannerModal`); scanning an owner's valid QR (a) reads current GPS once (location prompt), (b) redeems the pickup: deducts one prepaid walk credit and creates an in-progress session, (c) starts live GPS tracking. Alerts: "No walks left" (409), "Invalid code" (401/403), "Couldn't scan" | 💸 ⚠️ 📤 |
| 3 | "Accept" on an "Incoming requests" / "Nearby now" request card | button | `walker-walks.jsx:560` (called at 318, 344) | Accepts an owner's walk request: creates a confirmed booking and opens a chat with the owner. Alerts "Walk accepted" / "No longer available" (409) / "Couldn't accept" | 📤 |
| 4 | "Walk history" row | link | `walker-walks.jsx:354` | `router.push("/walker-history")` | |
| 5 | "Start" on each booked-walk card (pet name, owner · date time, optional "Uses a walk" badge) | button | `walker-walks.jsx:492` | POST `/api/providers/{id}/pets/{petId}/walk-sessions` (check-in), opens the StartWalkModal with the live map, starts GPS sharing as above. Failure Alert "Couldn't start walk" | 📤 ⚠️ |
| 6 | Pull-to-refresh on the list | pull-to-refresh | `walker-walks.jsx:294` | Refetches bookings | |
| 7 | Live map card (Start / Now markers, line) — or notes "Waiting for the first GPS points…" / "Location is off for this walk — the time still tracks, just no live map." | display | `src/components/Health/WalkActivity/WalkerLiveMap.jsx:23-60` | Non-interactive map, re-fits as points arrive; hardcoded EN | |
| 8 | Inside StartWalkModal: "Finish Walk" | button | `StartWalkModal.jsx:501` → `walker-walks.jsx:181-201` | Stops GPS, PATCH `{action:"finish", duration_s, notes}`; Alert "Walk finished" / "The report was saved and added to the pet's health timeline." The finished walk report appears in the owner's pet health timeline | 📤 |
| 9 | Inside StartWalkModal: X → "Cancel Walk" | button | `StartWalkModal.jsx:187` → `walker-walks.jsx:203-206` | Stops local GPS tracking and closes. `handleCancel` makes NO API call, so the server session is not finished (it can stay "in progress" for the owner) | ⚠️ |

- **Empty / loading / error states:** spinner while loading; empty "No walker workspace" / "No walks booked — Booked walks from owners will appear here to check in." (`walker-walks.jsx:381-390`).
- **Modals / sheets / alerts opened:** StartWalkModal (documented above), PickupScannerModal (other agent's component), Alerts listed in rows.
- **Back / dismiss behaviour:** header back arrow; StartWalkModal X shows the "Walk in Progress" confirm.

### Owner's live walk viewer — `walk-live` (read-only, receives the walker's location)
- **File:** `src/app/walk-live.jsx` · **Reached from:** Services → walking screen "LIVE walk" button / recent walk report cards (`src/app/service/walking.jsx:256, 417`), More/Activity hub row "Live walk" (`src/components/Services/MyActivity.jsx:159`)
- **Gating / data needed:** a walk session for the current pet (in progress = live map; finished = walk report). Hardcoded EN: "Walk in progress" / "Walk report", "Walk not found — This walk is no longer available.", "Updating live — the route refreshes as {pet} walks."
| # | Element | Type | Source | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | Back arrow | header icon | `src/app/walk-live.jsx:60` | `router.back()` | |
| 2 | Map + Distance / Time / GPS points stats (+ report when finished) | display (polled every 5 s) | `walk-live.jsx:96-110` | Read-only; no buttons, no sharing | |
- **Empty / loading / error states:** spinner; "Walk not found" empty state. **Modals:** none. **Back:** back arrow only.

---

### Photo Check — body-area picker — `PhotoCheckModal`
- **File:** `src/components/Health/PhotoCheck/PhotoCheckModal.jsx` · **Reached from:** Health → Track → Health records → "Photo Check" tile ("Track visible changes by body area over time"), `HealthTrack.jsx:177-179`, mounted `HealthTrack.jsx:425-430`
- **Gating / data needed:** none. Because the Track screen passes `onSelectArea`, this modal works ONLY as a picker; its own legacy camera/preview steps (rows 4-8 below) are unreachable from the app (they only run when `onSelectArea` is absent). **All text in this modal is hardcoded English (no ES).** Title "Photo Check", heading "What do you want to photograph?", sub "Select a body area to track visible changes over time".

| # | Element (EN label) | Type | Source | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | Close X | header icon | `src/components/Health/PhotoCheck/PhotoCheckModal.jsx:227` | Closes the picker | |
| 2 | Eight area rows: Paws ("Any redness, swelling, cuts, limping, or excessive licking?"), Ears, Eyes, Teeth, Skin / Fur, Face, Full body, Other (each with its own prompt) | list items | `PhotoCheckModal.jsx:262` | Closes the picker and opens the Capture modal for that area (`HealthTrack.jsx:158-162`) | |
| 3 | Footer note "Photo Check helps you track visible changes over time. It does not diagnose or replace veterinary care." | info | `PhotoCheckModal.jsx:333` | Static | |
| 4 | (legacy, unreachable) back chevron | header icon | `PhotoCheckModal.jsx:210` | Steps back | |
| 5 | (legacy) "Take Photo" | button | `PhotoCheckModal.jsx:377` | Would request camera permission (JS `alert("Camera permission is required to take photos")` if denied) and launch camera | |
| 6 | (legacy) "Choose from Gallery" | button | `PhotoCheckModal.jsx:417` | Would request library permission (`alert("Photo library permission is required")`) | |
| 7 | (legacy) "Optional notes" | text input | `PhotoCheckModal.jsx:491` | Free text | |
| 8 | (legacy) "Save Photo Check" | button | `PhotoCheckModal.jsx:512` | Calls `onSave` prop; none supplied by the app so it does nothing | |

- **Empty / loading / error states:** none. **Modals opened:** PhotoCheckCaptureModal (next section). **Back / dismiss behaviour:** X / OS back closes.

### Photo Check — capture & save — `PhotoCheckCaptureModal`
- **File:** `src/components/Health/PhotoCheck/PhotoCheckCaptureModal.jsx` · **Reached from:** (a) after choosing an area in the picker (`HealthTrack.jsx:433-441`); (b) Health → Today → Photo-check reminder → complete (`HealthToday.jsx:221-226, 1057-1066`, passes `reminderId`, so the reminder auto-completes on save)
- **Gating / data needed:** a current pet. Header "{Area} Photo Check" (e.g. "Paws Photo Check"). **Almost all copy is hardcoded English (no ES)**; only the permission/error/saved Alerts are translated. **No AI/analysis call is made** — the photo is only uploaded and stored; there is no photo→AI endpoint in this component.
- Steps: capture → (optional skipConfirm) → notes.

| # | Element (EN label) | Type | Source | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | Close X | header icon | `src/components/Health/PhotoCheck/PhotoCheckCaptureModal.jsx:351` | Resets and closes; nothing saved | |
| 2 | "Take Photo" | button | `PhotoCheckCaptureModal.jsx:433` | iOS CAMERA permission prompt; if denied Alert "Camera Permission Required" / "Photo access is needed to add a photo. You can still save a note." Otherwise opens camera (quality 0.8, no editing); on capture moves to Notes step | |
| 3 | "Choose from Gallery" | button | `PhotoCheckCaptureModal.jsx:474` | iOS PHOTO-LIBRARY permission prompt (denied Alert "Photo Library Permission Required" with the same body text); picks one image | |
| 4 | "Skip photo" (under "Photo recommended for better comparison over time") | link | `PhotoCheckCaptureModal.jsx:531` | Goes to "Save without photo?" screen | |
| 5 | "Add Photo" (skip-confirm screen) | button | `PhotoCheckCaptureModal.jsx:594` | Back to capture step | |
| 6 | "Save Note Only" | button | `PhotoCheckCaptureModal.jsx:609` | Goes to Notes step with no photo. **Known failure path:** the save then POSTs `imageUrl:""` and the server rejects it with 400 "petId, bodyArea, and imageUrl are required" (`apps/web/src/app/api/health/photo-checks/route.js:29-33`); the app shows that raw string in an Alert (see error states). Expect this to fail | |
| 7 | "Change photo" (under preview) | link | `PhotoCheckCaptureModal.jsx:667` | Drops the photo and returns to capture step | |
| 8 | "Anything changed?" chips — per area, e.g. Eyes: No visible change / Redness / Discharge / Cloudy / Squinting / Other; Ears: … Smell / Scratching; Paws: … Swelling / Limping / Cracked pads; Teeth: Bad breath / Red gums / Tartar / Bleeding; Skin / Fur: Rash / Dry skin / Hair loss; Face/Full body/Other have their own sets | multi-select chips | `PhotoCheckCaptureModal.jsx:714` | Toggle on/off; selected chips are joined with "; " into the saved note | |
| 9 | "Notes (optional)", placeholder "Redness, swelling, discharge, smell, sensitivity, no change…" | text input | `PhotoCheckCaptureModal.jsx:751` | Free text appended after chips | |
| 10 | "Save Photo Check" (shows "Uploading..." then "Saving...") | button | `PhotoCheckCaptureModal.jsx:810` | 1) uploads the image to PRIVATE storage: POST `/api/upload` (multipart, `visibility:"private"`, `petId`) via `src/utils/useUpload.js`; 2) POST `/api/health/photo-checks` `{petId, bodyArea, imageUrl:<storage key>, notes}`; 3) refreshes Photo History, Care Ring, vet-summary readiness; completes the linked Today reminder (if any); Alert "✅ Saved" / "Photo check saved successfully", then closes | ⚠️ |

- **Empty / loading / error states:** spinner on Save button. Errors: Alert "Error" + `error.message` (`PhotoCheckCaptureModal.jsx:303-306`). **Raw technical text CAN leak here**: the message is the server's `error` string or the upload error (e.g. "petId, bodyArea, and imageUrl are required"), otherwise fallback "Could not save photo check. Please try again." Other Alerts: "Could not open camera. Please try again.", "Could not open gallery. Please try again.", "No pet selected".
- **Modals / sheets / alerts opened:** the iOS permission prompts (camera / photo library), the native camera and image picker, the Alerts above.
- **Back / dismiss behaviour:** X or OS back = discard, no confirm. The skip-confirm and notes steps have no back arrow except the explicit "Add Photo" / "Change photo" links.

### Photo History — `PhotoHistory`
- **File:** `src/components/Health/PhotoCheck/PhotoHistory.jsx` · **Reached from:** Health → Vet Record → "Photos" tab (`HealthVetRecord.jsx:1614-1640`, tab label "Photos"). Also embedded in the hidden Insights screen and `VetRecord/PhotoHistorySection.jsx` (other agent).
- **Gating / data needed:** needs ≥1 saved photo check; GET `/api/health/photo-checks?petId=…&limit=100`. Photos are loaded through the auth-gated private image streamer (`PrivateImage`).

| # | Element (EN label / ES) | Type | Source | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | Area header row: area name (Paws/Ears/Eyes/Teeth/Skin / Fur/Face/Full body/Other), "{n} photos • Last: {date}", chevron | list item (accordion) | `src/components/Health/PhotoCheck/PhotoHistory.jsx:217` | Expands/collapses a 2-column grid of that area's photos (date, time, notes up to 2 lines, "In Vet Summary" badge when flagged). Photos are NOT tappable (no full-screen view, no delete, no share) | |
| 2 | "Try again" (error box only) | button | `PhotoHistory.jsx:145` | Refetches | |
| 3 | "Compare over time — Coming soon: compare visible changes across photos side-by-side" | info card | `PhotoHistory.jsx:399-437` | Static placeholder (not a feature) | |

- **Empty / loading / error states:** spinner; error = "Something went wrong. Please try again." + "Try again"; empty = camera icon, "No photo checks yet" / "Start tracking visible changes by taking your first photo check". (The Vet Record tab itself shows its own empty text "No photo checks yet. Photo checks from paws, eyes, ears, skin, and more will appear here." when the count is 0.)
- **Modals / sheets / alerts opened:** none. **Back / dismiss:** n/a (inline; no long-press / swipe / delete).

### Photo Check schedule — `PhotoCheckSchedule` (UNREACHABLE, dead code)
- **File:** `src/components/Health/PhotoCheck/PhotoCheckSchedule.jsx` · **Reached from:** nothing (only exported in `PhotoCheck/index.js`). Local-state frequency chips (`PhotoCheckSchedule.jsx:161`), nothing persisted or scheduled. Do not test.

---

### Vet Summary card — `VetSummaryDashboard`
- **File:** `src/components/Health/VetSummary/VetSummaryDashboard.jsx` · **Reached from:** Health → Vet Record, card pinned above the three groups (`src/components/Health/HealthVetRecord.jsx:1808`); also deep link `?section=vet-record` from the readiness card (Today agent)
- **Gating / data needed:** a current pet. Reads GET `/api/vet-record/full-summary?petId&from&to` (last 7 days). **Card copy is hardcoded English (no ES):** "Vet Summary", "Prepare for your vet visit", "A real summary of {pet}'s recent logs to share with your veterinarian.", "Recent Activity (Last 7 Days)" with "📊 N logs / 📸 N photos / 💊 N medications", and "N thing(s) worth discussing with your vet" when health flags exist. Zero counts show as 0 (no mock data).

| # | Element | Type | Source | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | "Create Vet Summary" | button | `src/components/Health/VetSummary/VetSummaryDashboard.jsx:94` | Opens the Vet Summary modal | |

- **Empty / loading / error states:** counts silently 0 while loading/on error; no error text. **Modals opened:** VetSummaryModal. **Back:** n/a.

### Vet Summary — `VetSummaryModal` (builds + shares a report outside the app)
- **File:** `src/components/Health/VetSummary/VetSummaryModal.jsx` · **Reached from:** "Create Vet Summary" button above
- **Gating / data needed:** a current pet. Full-screen modal titled "Vet Summary · {pet name}" (ES "Resumen para el vet"). Data = GET `/api/vet-record/full-summary` for the chosen range (`src/hooks/useVetSummary.js`).

| # | Element (EN label / ES) | Type | Source | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | X (close) | header icon | `src/components/Health/VetSummary/VetSummaryModal.jsx:106` | Closes modal | |
| 2 | Range chips "7 days" (default) / "30 days" / "90 days" | chip row | `VetSummaryModal.jsx:117` | Re-queries the summary for that range | |
| 3 | Recap paragraph, "WORTH DISCUSSING WITH YOUR VET" flag cards, "LOGS IN THIS PERIOD" stats (food logs, stool, urination, vomit episodes, walks, photo checks, quick checks, weigh-ins), Walk pattern, Weight "a → b over n weigh-ins", MEDICATIONS "given/total", CONDITIONS & ALLERGIES | display | `VetSummaryModal.jsx:138-243` | Read-only, computed from the pet's real logs (`detectHealthFlags`, `buildRecap` in `src/utils/healthInsights.js`) | |
| 4 | Three "Question 1/2/3" inputs under "QUESTIONS FOR THE VET" | text inputs | `VetSummaryModal.jsx:252` | Free text, only included in the shared text (not stored) | |
| 5 | "Share with vet" / "Compartir con el vet" | button | `VetSummaryModal.jsx:265` (handler line 85-92) | Opens the native iOS share sheet (`Share.share`) with a plain-text, English-only report ("PawPi Vet Summary — {pet}", breed, period, worth-discussing flags, counts, weight trend, medications, conditions, allergies, the typed questions, disclaimer; builder `src/utils/vetSummaryText.js`). The user can send it to ANY app/contact (Messages, Mail, WhatsApp, AirDrop, copy). Nothing is sent by PawPi itself; cancelling the sheet is a silent no-op | ⚠️ 📤 |

- **Empty / loading / error states:** spinner while loading; error text "Couldn't load the summary. Pull the latest logs and try again." (static string, no raw error); with zero logs the recap/stat cards render with zeros (no dedicated empty illustration). Disclaimer box always shown: "PawPi helps you track changes and prepare better conversations with your veterinarian. It does not diagnose or replace professional veterinary care." (hardcoded EN).
- **Modals / sheets / alerts opened:** iOS share sheet only.
- **Back / dismiss behaviour:** X or OS back (`onRequestClose`, line 98). Typed questions are lost on close/reopen only if the component unmounts (state lives in the modal).

---

### Health Insights — `HealthInsights` (HIDDEN in production; contains hard-coded sample data)
- **File:** `src/components/Health/HealthInsights.jsx` · **Reached from:** Health tab section "Insights" (`src/app/(tabs)/health.jsx:72`) — but `SHOW_INSIGHTS = false` (`src/constants/healthSections.js:11`) so the chip is NOT rendered and `?section=insights` is ignored. **Tester action: confirm only "Today", "Track", "Vet Record" appear in the strip.** If Insights is ever visible, that is a bug.
- **Gating / data needed:** none — and that is the problem. Everything on this screen is fixed sample text, not the pet's data (e.g. "Lower appetite — 2 days this week", "Walk duration down −28%", "Weight stable 14.2 kg avg", "4 weeks in a row!", Data Completeness bars Food & Water 6/7 etc., four canned vet questions). This breaks the repo's "no fake/mock data" rule; the only real part is the embedded `PhotoHistory`.

| # | Element (EN label) | Type | Source | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | Period chips 7 Days / 30 Days (default) / 3 Months / 1 Year | chip row | `src/components/Health/HealthInsights.jsx:313` | Swaps between four hard-coded datasets | |
| 2 | Insight cards (e.g. "Lower appetite", "Poo consistency varied") "View details ›" | list items | `HealthInsights.jsx:355` | Opens the detail sheet | |
| 3 | "Prepare Vet Visit Report" | button | `HealthInsights.jsx:564` | Has NO onPress — does nothing | |
| 4 | "Export All Insights for Vet" | button | `HealthInsights.jsx:744` | Has NO onPress — does nothing (no export happens) | |
| 5 | Embedded Photo History (see section above) | embedded | `HealthInsights.jsx:740` | Real data | |

- **Empty / loading / error states:** none (static). Chart summary sentence ("You logged N of M days…") is hardcoded EN.
- **Modals / sheets / alerts opened:** Insight detail sheet.
- **Back / dismiss behaviour:** n/a.

### Insight detail sheet (Insights only, hidden)
- **File:** `src/components/Health/HealthInsights.jsx:783-874` · **Reached from:** tapping an insight card.
| # | Element | Type | Source | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | X (Close) | header icon | `src/components/Health/HealthInsights.jsx:824` | Closes sheet | |
| 2 | "Got it" | button | `HealthInsights.jsx:855` | Closes sheet | |
- **Empty / error:** n/a. **Back:** OS back (`onRequestClose`) closes.

---


---
## AREA: Vet Record

Path abbreviations used in the "Source" column are expanded to full repo-relative paths (relative to `anything/apps/mobile/`). All strings below are the EN text from `src/i18n/locales/en.json` (ES in brackets when short). The user-facing section label for this area is **"Vet Record" [ES: "Historia clínica"]**.

Permission prompts a tester will hit in this area (exact iOS Info.plist text from `app.json:28-34`):
- **Camera** (Add document → "Take a photo"): `NSCameraUsageDescription` = "PawPi uses the camera so you can take photos of your pet for their profile, daily moments, health checks and vet records." If denied, app Alert "Camera access needed" / "Allow camera access to take a photo of the document." (`src/components/Health/VetRecord/AddDocumentModal.jsx:128-131`).
- **Photo library** (Add document → "Choose a photo"): `NSPhotoLibraryUsageDescription` = "PawPi accesses your photo library so you can choose photos and documents for your pet's profile, posts, health records and chats." If denied, Alert "Permission needed" / "Allow photo access to attach a document." (`src/components/Health/VetRecord/AddDocumentModal.jsx:108-111`).
- **Files picker** (Add document → "Choose a file (PDF or image)"): iOS Files sheet, no permission prompt.
- **Location (when-in-use)** only if tester opens the map picker on the Rx fulfillment screen and taps "use my location": `NSLocationWhenInUseUsageDescription` = "PawPi uses your location to find nearby pet-friendly places, vets, walkers and meetups, to set a location on social walks, transport and events, and to share your live location while you drive a pet-taxi trip." (`src/components/Map/MapLocationPicker.jsx:173`).
- No calendar or push-notification prompt is triggered by anything in this area (the appointment detail modal that is reachable from the Visits tab belongs to agent TODAY: `VetAppointmentDetailModal`).
- Data leaving the app from this area: (1) Add document uploads the file to PawPi's private storage (`POST /api/upload`, visibility private) and then sends it to an AI reader (`POST /api/vet-record/documents/extract`, Claude vision on the server); (2) Documents tab "open" hands a short-lived signed URL to the system browser via `Linking.openURL`; (3) Emergency Card can share an image and create public/private links; (4) Share button leads to the Data Access screen where vet access is granted/revoked; (5) Prescription refill request / Rx fulfillment request notify a clinic/pharmacy.

---

### Vet Record (Health tab → "Vet Record" section) — `HealthVetRecord` (default export)
- **File:** `src/components/Health/HealthVetRecord.jsx` · **Reached from:** Health tab (`src/app/(tabs)/health.jsx:73` renders `<HealthVetRecord />` when section = `vet-record`); the section chip strip is built from `src/constants/healthSections.js:21` (label `health.vetRecord.title`); deep link `/(tabs)/health?section=vet-record` (`health.jsx:43`, also used by `src/components/Health/VetSummaryReadinessCard.jsx:57`); a vet-note notification tap opens the Health tab (`src/app/notifications.jsx:541`, `/(tabs)/health`, which defaults to the Today section; tester must tap the Vet Record chip).
- **Gating / data needed:** needs an active pet (`useCurrentPet`); no premium/role gate. With no pet: centered text "No pet selected" [ES "No hay mascota seleccionada"] (`src/components/Health/HealthVetRecord.jsx:680-697`). A pet with no records shows empty states only (no mock data). Editors (household members with Editor role) can also add records; rows show attribution "Added by {name} · {Owner|Editor} · {date}".
- **Page layout (top to bottom):** header (title + subtitle) → Add Record / Share buttons → "Scan or upload a document" → Emergency Card → blue access-control note → Vet Summary card (TRACK2's `VetSummaryDashboard`) + hint → three collapsible groups: Medical profile (collapsed by default), Next visit (expanded by default), Medical history (collapsed by default; 8 sub-tabs) → footer note.

| # | Element (EN label) | Type | Source (`path:line`) | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | Pull-to-refresh on the whole page | pull-to-refresh | `src/components/Health/HealthVetRecord.jsx:1650-1654` (handler `src/components/Health/HealthVetRecord.jsx:96-114`) | Invalidates queries `vet-record-summary`, `pet-medical-profile`, `vet-record-allergies/conditions/surgeries/lab-results/documents/notes`, `vet-appointments`, `pet-vaccinations` for the active pet. Open sections refetch right away; closed ones refetch when opened. Spinner in coral. | |
| 2 | Loading spinner "Loading vet record…" [ES "Cargando historia clínica…"] | state | `src/components/Health/HealthVetRecord.jsx:662-678` | Full-screen spinner while `GET /api/vet-record/summary?petId=` loads. | |
| 3 | Title "Vet Record" + subtitle "Complete medical history for {pet}" | text | `src/components/Health/HealthVetRecord.jsx:1657-1669` | Static. Subtitle uses the current pet's name. | |
| 4 | "Add Record" [ES "Agregar registro"] | button (coral) | `src/components/Health/HealthVetRecord.jsx:1679-1702` (handler `src/components/Health/HealthVetRecord.jsx:485-487`) | Opens the **Add Record sheet** (section below). | |
| 5 | "Share" [ES "Compartir"] | button | `src/components/Health/HealthVetRecord.jsx:1703-1728` (handler `src/components/Health/HealthVetRecord.jsx:481-483`) | `router.push("/(tabs)/more/data-access")` → the **Data Access** screen (documented below). Nothing is sent by this tap itself. | ⚠️ |
| 6 | "Scan or upload a document" [ES "Escaneá o subí un documento"] (camera icon, dashed) | button | `src/components/Health/HealthVetRecord.jsx:1734-1755` | Opens **Add document modal** (`setAddDocVisible(true)`). Does NOT switch tabs. | ⚠️ |
| 7 | "Emergency Card" [ES "Tarjeta de emergencia"] (heart icon) | button (coral) | `src/components/Health/HealthVetRecord.jsx:1758-1776` (handler `src/components/Health/HealthVetRecord.jsx:490-493`) | `router.push("/emergency-card?petId={id}")` → **Emergency Card** screen (documented below). No-op if no pet id. | |
| 8 | Blue note "You control what information is shared with your veterinarian." | info banner | `src/components/Health/HealthVetRecord.jsx:1779-1803` | Static, not tappable. | |
| 9 | Vet Summary card (+ hint "Create a Vet Summary to walk in with {pet}'s recent logs ready to share.") | embedded component | `src/components/Health/HealthVetRecord.jsx:1808-1819` | `<VetSummaryDashboard />` and its VetSummaryModal are documented by agent TRACK2 (share/export lives there). The hint is static text. | ⚠️ |
| 10 | Group header "Medical profile" [ES "Perfil médico"] (user icon, chevron) | collapsible header | `src/components/Health/HealthVetRecord.jsx:1822-1826`; component `src/components/Health/HealthVetRecord.jsx:560-614` | Tap toggles the group open/closed (`toggleSection`, `src/components/Health/HealthVetRecord.jsx:472-477`). Open = coral border + up chevron. Default collapsed. | |
| 11 | Profile empty state: "Medical profile not completed" / "Add your dog's vet, microchip, emergency contact, and insurance details." | empty state | `src/components/Health/HealthVetRecord.jsx:1838-1877` | Shown when no medical profile row AND no breed AND no current weight. | |
| 12 | "Complete Profile" [ES "Completar perfil"] (+ icon) | button | `src/components/Health/HealthVetRecord.jsx:1878-1900` | Opens **Edit Medical Profile modal**. | |
| 13 | Profile read-only rows: "Basic Information" (Breed, Age, Sex, Birthday, Adoption Date, Current Weight) and "Medical Details" (Spayed/Neutered, Microchip ID, Primary Vet, Primary Clinic, Vet Phone, Vet Email, Emergency Contact, Emergency Phone, Insurance, Policy Number), "Medical Notes" | info rows | `src/components/Health/HealthVetRecord.jsx:1904-2136` | Only non-empty fields render. Weight shows `{n} {unit}` (default "lbs" if unit missing, `src/components/Health/HealthVetRecord.jsx:1953`). Dates rendered via `formatDisplayDate`. Not tappable. | |
| 14 | "Edit Medical Profile" [ES "Editar perfil médico"] | button | `src/components/Health/HealthVetRecord.jsx:2138-2160` | Opens **Edit Medical Profile modal** pre-filled with `medicalProfileData`. | |
| 15 | Group header "Next visit" [ES "Próxima visita"] (calendar icon) | collapsible header | `src/components/Health/HealthVetRecord.jsx:2167-2171` | Toggle; default expanded. | |
| 16 | Next-visit card (title, "{date} at {time}", clinic, reason in italics) | info card | `src/components/Health/HealthVetRecord.jsx:2175-2226` | Shows the soonest scheduled appointment that is still in the future (computed `src/components/Health/HealthVetRecord.jsx:441-470`; same source as Today's countdown card, `GET /api/vet-appointments?petId=`). Time is forced 24h. Not tappable (no navigation). | |
| 17 | Next-visit empty state "No upcoming appointment" / "Schedule a vet visit so PawPi can remind you." | empty state | `src/components/Health/HealthVetRecord.jsx:2228-2232` | Shown when no future scheduled appointment. No button to schedule here. | |
| 18 | Group header "Medical history" [ES "Historial médico"] + "{n} items" badge (sum of all tab counts) | collapsible header | `src/components/Health/HealthVetRecord.jsx:2238-2243` | Toggle; default collapsed. Badge `count_one`/`count_other` ("1 item"/"N items"). | |
| 19 | Sub-tab chip "Vaccines" [ES "Vacunas"] (+ count) | tab chip | `src/components/Health/HealthVetRecord.jsx:2253-2318` (onPress `src/components/Health/HealthVetRecord.jsx:2261`, testID `history-tab-vaccines`) | Sets active sub-tab. Chips scroll horizontally. Count badge shown only when > 0. Default active tab = first non-empty tab in order Vaccines, Visits, Medications, Labs, Conditions, Notes, Documents, Photos (else Vaccines) until the owner taps one (`src/components/Health/HealthVetRecord.jsx:211-213`). | |
| 20 | Sub-tab chip "Visits & procedures" [ES "Visitas y procedimientos"] | tab chip | `src/components/Health/HealthVetRecord.jsx:68-77`, `src/components/Health/HealthVetRecord.jsx:2261` | Count = completed/past appointments + surgeries (`src/components/Health/HealthVetRecord.jsx:197-199`). | |
| 21 | Sub-tab chip "Medications" [ES "Medicamentos"] | tab chip | `src/components/Health/HealthVetRecord.jsx:2261` | Count = `summary.medicationsCount`. | |
| 22 | Sub-tab chip "Labs" [ES "Análisis"] | tab chip | `src/components/Health/HealthVetRecord.jsx:2261` | Count = `labResultsCount`. | |
| 23 | Sub-tab chip "Conditions & allergies" [ES "Condiciones y alergias"] | tab chip | `src/components/Health/HealthVetRecord.jsx:2261` | Count = allergies + conditions. | |
| 24 | Sub-tab chip "Notes" [ES "Notas"] | tab chip | `src/components/Health/HealthVetRecord.jsx:2261` | Count = `vetNotesCount`. | |
| 25 | Sub-tab chip "Documents" [ES "Documentos"] | tab chip | `src/components/Health/HealthVetRecord.jsx:2261` | Count = `documentsCount`. | |
| 26 | Sub-tab chip "Photos" [ES "Fotos"] | tab chip | `src/components/Health/HealthVetRecord.jsx:2261` | Count = `photoChecksCount`. | |
| 27 | **Vaccines tab** list: name, date given (or "Date not recorded"), "Expires {date}", "Lot {lot}", attribution | list (read-only) | `src/components/Health/HealthVetRecord.jsx:702-807` | From `usePetVaccinations` (`GET /api/pet-vaccinations?petId=`). Rows are NOT tappable: no edit/delete here. Spinner while loading; error "Couldn't load vaccinations. Pull to refresh." [ES "No se pudieron cargar las vacunas…"]; empty "No vaccinations yet" / "Add vaccine records to keep your dog's medical history complete." Add a vaccine through Add Record → "Medication, vaccine or preventive". | |
| 28 | **Visits tab** surgery row (procedure, date, "surgeon • clinic", attribution) | list item | `src/components/Health/HealthVetRecord.jsx:859-901` (onPress `src/components/Health/HealthVetRecord.jsx:861`) | Opens the **Surgery detail sheet** (`setSelectedSurgery`). | |
| 29 | **Visits tab** appointment row (stethoscope, title, "{date} at {time}", "vet • clinic", reason in italics) | list item | `src/components/Health/HealthVetRecord.jsx:903-977` (onPress `src/components/Health/HealthVetRecord.jsx:906`, testID `vet-visit-row`) | Opens `VetAppointmentDetailModal` (documented by agent TODAY; it can mark complete / delete). Shows only status = completed OR date before today (`src/components/Health/HealthVetRecord.jsx:822-828`). | |
| 30 | Visits tab empty state "No visits or procedures yet" / "Completed appointments, surgeries, and procedures will appear here." | empty state | `src/components/Health/HealthVetRecord.jsx:850-855` | Merged list sorted newest first. Surgery data only loads when this tab is active (`GET /api/vet-record/surgeries?petId=`). | |
| 31 | **Medications tab** empty card "No current medications" / "Add medications or supplements your dog is currently taking." | empty state | `src/components/Health/HealthVetRecord.jsx:985-992` | NOTE FOR TESTER: this card is rendered unconditionally (the tab never lists the owner's medications even when the tab badge shows a count > 0). Medications are added/managed through `MedicationModal` (agent TRACK). | |
| 32 | **Medications tab** Prescriptions block | embedded section | `src/components/Health/HealthVetRecord.jsx:995` | `<PrescriptionsSection petId>` — documented in its own section below. | 📤 |
| 33 | **Labs tab** row (test name, date, results line, attribution) | list item | `src/components/Health/HealthVetRecord.jsx:1009-1055` (onPress `src/components/Health/HealthVetRecord.jsx:1012`) | Opens the **Lab result detail sheet**. Empty: "No lab results yet" / "Upload or add bloodwork, imaging, or test results." (`GET /api/vet-record/lab-results?petId=`). | |
| 34 | **Conditions & allergies tab** "ALLERGIES" cards (allergen, "{level} Severity" pill, "Reaction: …", "Diagnosed: …", attribution) | list (read-only) | `src/components/Health/HealthVetRecord.jsx:1060-1165` | Not tappable; no edit/delete. Data: `GET /api/vet-record/allergies?petId=`. | |
| 35 | **Conditions & allergies tab** "CONDITIONS" cards (condition, status pill active=orange/other=green, "Diagnosed: …", notes, attribution) | list (read-only) | `src/components/Health/HealthVetRecord.jsx:1167-1266` | Not tappable. Data: `GET /api/vet-record/conditions?petId=`. Empty (both lists): "No conditions or allergies added" / "Add known allergies and diagnosed or monitored health conditions." (`src/components/Health/HealthVetRecord.jsx:1063-1070`). | |
| 36 | **Notes tab** "GENERAL SUMMARY" box ("{n} entries · last updated {date} by {name}") | info box | `src/components/Health/HealthVetRecord.jsx:1275-1320` | Derived from the notes list (not AI). Only when ≥1 note. | |
| 37 | **Notes tab** "Add to history" [ES "Agregar al historial"] (dashed, + icon) | button | `src/components/Health/HealthVetRecord.jsx:1323-1346` (testID `add-vet-note`) | Opens the **Add to history modal**. | |
| 38 | **Notes tab** note card: author ("You" or vet name), date, text, attribution | list item | `src/components/Health/HealthVetRecord.jsx:1355-1419` | Read-only text. Empty: "No history yet" / "Add a dated entry, or your vet's notes will appear here. History is append-only — entries are kept, not overwritten." (`GET /api/vet-record/notes?petId=`). | |
| 39 | **Notes tab** trash icon on a note | icon button | `src/components/Health/HealthVetRecord.jsx:1400-1406` (testID `delete-vet-note`; handler `src/components/Health/HealthVetRecord.jsx:387-416`) | Alert "Delete entry?" / "This permanently removes your history entry." Buttons: Cancel / Delete (destructive). Delete → `DELETE /api/vet-record/notes?id={id}`, then refetches notes + summary. On failure Alert "Error" / "Could not delete the entry." | 🗑️ |
| 40 | **Documents tab** "Add document" [ES "Agregar documento"] (dashed) | button | `src/components/Health/HealthVetRecord.jsx:1429-1452` (testID `add-document`) | Opens **Add document modal**. | ⚠️ |
| 41 | **Documents tab** filter chips: "All", "Vaccine", "Lab result", "Visit summary", "Invoice", "Other" | chip row | `src/components/Health/HealthVetRecord.jsx:1465-1507` (onPress `src/components/Health/HealthVetRecord.jsx:1478`, testIDs `doc-filter-*`) | Filters the list client-side by category (untagged rows count as Other). Chip row only appears when ≥1 document exists. | |
| 42 | **Documents tab** document row (file icon, name, date, category badge, attribution) | list item | `src/components/Health/HealthVetRecord.jsx:1516-1605` (onPress `src/components/Health/HealthVetRecord.jsx:1520`, handler `src/components/Health/HealthVetRecord.jsx:315-327`, testID `vet-document-row`) | Resolves the private storage key to a short-lived signed URL (`GET /api/media?key=…&json=1`) and calls `Linking.openURL` → opens the PDF/image in the system browser/viewer OUTSIDE the app. Failure is swallowed silently (nothing happens, no error shown). | ⚠️ |
| 43 | **Documents tab** trash icon on a document | icon button | `src/components/Health/HealthVetRecord.jsx:1598-1604` (testID `delete-document`; handler `src/components/Health/HealthVetRecord.jsx:329-359`) | Alert "Delete document?" / `Remove "{name}"?`. Cancel / Delete (destructive) → `DELETE /api/vet-record/documents?id={id}`; refetches documents + summary. Failure Alert "Error" / "Could not delete the document." (Server deletes the DB row only.) | 🗑️ |
| 44 | **Documents tab** empty state "No documents yet" / "Upload lab results, prescriptions, invoices, insurance papers, or vet reports." | empty state | `src/components/Health/HealthVetRecord.jsx:1509-1514` | Shown when no docs (or filter has none). | |
| 45 | **Photos tab** | embedded component | `src/components/Health/HealthVetRecord.jsx:1614-1642` | If `photoChecksCount` = 0: text "No photo checks yet. Photo checks from paws, eyes, ears, skin, and more will appear here." Else renders `PhotoHistory` (documented by agent TRACK2). | |
| 46 | Footer note "Keep all vet records in one place. Easily share medical history with new vets or specialists." | info | `src/components/Health/HealthVetRecord.jsx:2325-2345` | Static. | |

- **Empty / loading / error states:** Page-level spinner (row 2) only for the summary query. Every per-tab query (allergies, conditions, surgeries, labs, documents, notes, appointments, medical profile) has NO error UI: a failed request silently shows the tab's empty state (no raw error text leaks). Only Vaccines shows an explicit error message. Counts come from `GET /api/vet-record/summary?petId=` so a failing summary leaves all badges at 0.
- **Modals / sheets / alerts opened:** Add Record sheet; Allergy-or-condition chooser; Surgery detail sheet; Lab result detail sheet; `VetAppointmentDetailModal` (agent TODAY); Edit Medical Profile; Add document → Review proposal; Add to history; Add allergy/condition/surgery/lab form; `MedicationModal` (agent TRACK; opened with initial tab "medications" from Add Record, `src/components/Health/HealthVetRecord.jsx:2954-2964`, on close re-fetches `pet-vaccinations`). Alerts: delete note (row 39), delete document (row 43).
- **Back / dismiss behaviour:** This is a section inside the Health tab (no back button). Switching section chips in `health.jsx` leaves it. Every sheet closes with its X / Close button or system dismiss (`onRequestClose`). Sub-screens (Emergency Card, Data Access) use their own back arrow.

---

### Add Record sheet (bottom sheet) — inline `<Modal>` in `HealthVetRecord`
- **File:** `src/components/Health/HealthVetRecord.jsx:2348-2494` · **Reached from:** "Add Record" button (row 4).
- **Gating / data needed:** none (needs the Vet Record screen / active pet).

| # | Element (EN label) | Type | Source (`path:line`) | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | Title "Add Record" | text | `src/components/Health/HealthVetRecord.jsx:2386` | Static. | |
| 2 | X (close) | header icon | `src/components/Health/HealthVetRecord.jsx:2388-2400` | Closes the sheet. | |
| 3 | "Medication, vaccine or preventive" [ES "Medicamento, vacuna o preventivo"] | list item | `src/components/Health/HealthVetRecord.jsx:2408`, handler `src/components/Health/HealthVetRecord.jsx:505-522` (testID `add-record-medVaccine`) | Closes sheet, expands "Medical history", selects Medications tab, opens `MedicationModal` on its Medications tab (the modal's own tab chooser switches to Vaccines/Preventive; agent TRACK documents it). | |
| 4 | "Allergy or condition" [ES "Alergia o condición"] | list item | `src/components/Health/HealthVetRecord.jsx:2409-2413`, handler `src/components/Health/HealthVetRecord.jsx:525-527` (testID `add-record-allergyCondition`) | Closes sheet, opens the **Allergy-or-condition chooser** (no tab change yet). | |
| 5 | "Vet visit or note" [ES "Visita o nota veterinaria"] | list item | `src/components/Health/HealthVetRecord.jsx:2414-2418`, `src/components/Health/HealthVetRecord.jsx:508-511` (testID `add-record-vetVisitNote`) | Closes sheet, opens history → Notes tab, opens **Add to history modal**. | |
| 6 | "Surgery" [ES "Cirugía"] | list item | `src/components/Health/HealthVetRecord.jsx:2419`, `src/components/Health/HealthVetRecord.jsx:528-531` (testID `add-record-surgery`) | Closes sheet, History → Visits tab, opens **Add surgery form** (`AddVetRecordModal`, type surgery). | |
| 7 | "Lab result" [ES "Resultado de análisis"] | list item | `src/components/Health/HealthVetRecord.jsx:2420`, `src/components/Health/HealthVetRecord.jsx:532-535` (testID `add-record-lab`) | Closes sheet, History → Labs tab, opens **Add lab result form**. | |
| 8 | "Scan or upload a document" [ES "Escaneá o subí un documento"] | list item | `src/components/Health/HealthVetRecord.jsx:2421`, `src/components/Health/HealthVetRecord.jsx:512-515` (testID `add-record-document`) | Closes sheet, History → Documents tab, opens **Add document modal**. | ⚠️ |
| 9 | "Soon" badge | badge | `src/components/Health/HealthVetRecord.jsx:2466-2487` | Never visible: no entry sets `comingSoon`. | |

- **Empty / loading / error states:** none (static list of 6).
- **Modals / sheets / alerts opened:** see rows 3-8.
- **Back / dismiss behaviour:** X, Android back/system dismiss (`onRequestClose` `src/components/Health/HealthVetRecord.jsx:2353`). Tapping the dim background does NOT dismiss (no backdrop handler).

---

### Allergy-or-condition chooser (bottom sheet) — inline `<Modal>`
- **File:** `src/components/Health/HealthVetRecord.jsx:2496-2599` · **Reached from:** Add Record sheet → "Allergy or condition".
- **Gating / data needed:** none.

| # | Element (EN label) | Type | Source (`path:line`) | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | Title "Allergy or condition" | text | `src/components/Health/HealthVetRecord.jsx:2534` | Static. | |
| 2 | X (close) | header icon | `src/components/Health/HealthVetRecord.jsx:2536-2548` | Closes chooser. | |
| 3 | "Allergy" [ES "Alergia"] | list item | `src/components/Health/HealthVetRecord.jsx:2552`, `src/components/Health/HealthVetRecord.jsx:2557-2559`, handler `src/components/Health/HealthVetRecord.jsx:543-547` | Closes chooser, expands History → Conditions tab, opens **Add allergy form**. | |
| 4 | "Condition" [ES "Condición"] | list item | `src/components/Health/HealthVetRecord.jsx:2553`, `src/components/Health/HealthVetRecord.jsx:2557-2559` | Same, opens **Add condition form**. | |

- **Empty / loading / error states:** none.
- **Modals / sheets / alerts opened:** `AddVetRecordModal` (documented below).
- **Back / dismiss behaviour:** X or system dismiss (`src/components/Health/HealthVetRecord.jsx:2501`).

---

### Surgery detail sheet — inline `<Modal>`
- **File:** `src/components/Health/HealthVetRecord.jsx:2601-2751` · **Reached from:** Visits tab → tap a surgery row (row 28).
- **Gating / data needed:** a surgery row.

| # | Element (EN label) | Type | Source (`path:line`) | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | Procedure title + detail blocks: Date, Surgeon, Clinic, Complications, Recovery, Notes (blank ones hidden) | read-only | `src/components/Health/HealthVetRecord.jsx:2633-2725` | Display only. | |
| 2 | X (close) | header icon | `src/components/Health/HealthVetRecord.jsx:2643-2655` | Closes the sheet. | |
| 3 | "Close" [ES "Cerrar"] | button | `src/components/Health/HealthVetRecord.jsx:2727-2746` | Closes the sheet. | |

- **Empty / loading / error states:** none. No edit/delete controls exist.
- **Modals / sheets / alerts opened:** none.
- **Back / dismiss behaviour:** X, Close, or system dismiss (`src/components/Health/HealthVetRecord.jsx:2606`).

---

### Lab result detail sheet — inline `<Modal>`
- **File:** `src/components/Health/HealthVetRecord.jsx:2753-2895` · **Reached from:** Labs tab → tap a lab row (row 33).
- **Gating / data needed:** a lab-result row.

| # | Element (EN label) | Type | Source (`path:line`) | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | Test name + blocks: Date, Results, Ordered By, Notes | read-only | `src/components/Health/HealthVetRecord.jsx:2785-2869` | Display only. | |
| 2 | X (close) | header icon | `src/components/Health/HealthVetRecord.jsx:2795-2807` | Closes the sheet. | |
| 3 | "Close" | button | `src/components/Health/HealthVetRecord.jsx:2871-2890` | Closes the sheet. | |

- **Empty / loading / error states:** none. No edit/delete.
- **Modals / sheets / alerts opened:** none.
- **Back / dismiss behaviour:** X, Close, system dismiss (`src/components/Health/HealthVetRecord.jsx:2758`).

---

### Edit Medical Profile (form sheet) — `EditMedicalProfileModal`
- **File:** `src/components/Health/VetRecord/EditMedicalProfileModal.jsx` (wrapped in `src/components/KeyboardSafeFormModal.jsx`) · **Reached from:** Vet Record → "Complete Profile" (row 12) or "Edit Medical Profile" (row 14), mounted at `src/components/Health/HealthVetRecord.jsx:2911-2919`.
- **Gating / data needed:** active pet; pre-filled from `GET /api/pet-medical-profiles?petId=`. Saving writes to BOTH the shared `pets` record (breed, birthday, age, sex, weight → also shows on Dog Profile) and the medical profile (`src/components/Health/VetRecord/EditMedicalProfileModal.jsx:211-217`). It may also add a weight-log entry (Health → Track weight chart refreshes, `src/components/Health/VetRecord/EditMedicalProfileModal.jsx:219-224`).

| # | Element (EN label) | Type | Source (`path:line`) | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | Header title "Edit Medical Profile" + X close | header | `src/components/Health/VetRecord/EditMedicalProfileModal.jsx:484`, `src/components/KeyboardSafeFormModal.jsx:107` | X closes the modal, discarding edits. | |
| 2 | "Breed" input (placeholder "e.g., Golden Retriever") | text input | `src/components/Health/VetRecord/EditMedicalProfileModal.jsx:490-495` | Free text. | |
| 3 | "Birthday": toggle "I know the birthday" / "I'm not sure" (English only, hard-coded) | segmented toggle | `src/components/Health/VetRecord/EditMedicalProfileModal.jsx:507-516`; `src/components/Pets/BirthdayOrAgeField.jsx:36-83` (testIDs `birthday-known`/`birthday-unsure`) | Switches between a date picker and "Estimated years"/"Estimated months" number inputs. Initial state = unknown when the pet has no birthday. | |
| 4 | Birthday date field ("Select date") | date picker | `src/components/Pets/BirthdayOrAgeField.jsx:132-143` -> `src/components/DateField.jsx:69-111` | Tap opens inline native calendar; max date = today. Stored canonical YYYY-MM-DD. | |
| 5 | "Estimated years" / "Estimated months" | text input (number-pad) | `src/components/Pets/BirthdayOrAgeField.jsx:97-129` | Digits only. Saved only when "I'm not sure" is chosen (birthday then cleared, `src/components/Health/VetRecord/EditMedicalProfileModal.jsx:173-186`). | |
| 6 | "Adoption Date (optional)" | date picker | `src/components/Health/VetRecord/EditMedicalProfileModal.jsx:518-523` | Inline calendar (no max date). | |
| 7 | "Sex / Gender": "Male" / "Female" | segmented buttons | `src/components/Health/VetRecord/EditMedicalProfileModal.jsx:347-387` (testIDs `gender-male`, `gender-female`; onPress `src/components/Health/VetRecord/EditMedicalProfileModal.jsx:364`) | Selects sex (lowercase value stored). | |
| 8 | "Current Weight" (placeholder shows "ej., 65" even in EN) | text input (decimal) | `src/components/Health/VetRecord/EditMedicalProfileModal.jsx:525-532` | Must be > 0 if filled. | |
| 9 | "Weight Unit": "kg" / "lbs" | segmented buttons | `src/components/Health/VetRecord/EditMedicalProfileModal.jsx:389-428` (onPress `src/components/Health/VetRecord/EditMedicalProfileModal.jsx:405`) | Selects unit; default from device region unless pet already has a weight (then its unit / "lbs"). | |
| 10 | "Spayed / Neutered": "Spayed", "Neutered", "Not spayed/neutered", "Unknown" (English only) | 4-way selector | `src/components/Health/VetRecord/EditMedicalProfileModal.jsx:430-478` (onPress `src/components/Health/VetRecord/EditMedicalProfileModal.jsx:447`) | Selects status. | |
| 11 | "Spayed / Neutered Date (optional)" | date picker | `src/components/Health/VetRecord/EditMedicalProfileModal.jsx:538-543` | Inline calendar. | |
| 12 | "Microchip ID" | text input | `src/components/Health/VetRecord/EditMedicalProfileModal.jsx:544-549` | Free text. | |
| 13 | "Primary Veterinarian" (placeholder "e.g., Dr. Sarah Johnson", English only) | text input | `src/components/Health/VetRecord/EditMedicalProfileModal.jsx:550-555` | Free text. | |
| 14 | "Primary Clinic" (placeholder English only) | text input | `src/components/Health/VetRecord/EditMedicalProfileModal.jsx:556-561` | Free text. | |
| 15 | "Vet Phone" | text input (phone-pad) | `src/components/Health/VetRecord/EditMedicalProfileModal.jsx:562-568` | Free text. | |
| 16 | "Vet Email (optional)" | text input (email) | `src/components/Health/VetRecord/EditMedicalProfileModal.jsx:569-576` | Must match a basic email regex or save is blocked. | |
| 17 | "Emergency Contact Name" | text input | `src/components/Health/VetRecord/EditMedicalProfileModal.jsx:577-582` | Free text. | |
| 18 | "Emergency Contact Phone" | text input (phone-pad) | `src/components/Health/VetRecord/EditMedicalProfileModal.jsx:583-589` | Free text. | |
| 19 | "Insurance Provider" | text input | `src/components/Health/VetRecord/EditMedicalProfileModal.jsx:590-595` | Free text. | |
| 20 | "Insurance Policy Number" | text input | `src/components/Health/VetRecord/EditMedicalProfileModal.jsx:596-601` | Free text. | |
| 21 | "Medical Notes" (multiline) | text input | `src/components/Health/VetRecord/EditMedicalProfileModal.jsx:604-612` | Free text. | |
| 22 | "Save Medical Profile" [ES "Guardar perfil médico"] (shows "Saving…") | CTA button | `src/components/Health/VetRecord/EditMedicalProfileModal.jsx:485-487`, `src/components/KeyboardSafeFormModal.jsx:142`, handler `src/components/Health/VetRecord/EditMedicalProfileModal.jsx:134-235` | Validates (email, weight>0, dates) → on failure Alert "Validation Error" / "Please check the highlighted fields." with red inline English messages ("Please enter a valid email" etc.). On success `POST /api/pet-medical-profiles`, invalidates pets/weight/timeline caches, Alert "Success" / "Medical profile saved", then closes and the profile group refreshes. On server failure Alert "Error" / "Could not save medical profile. Please try again." | |

- **Empty / loading / error states:** CTA label switches to "Saving…" and is disabled while saving. Validation messages are hard-coded English (not translated). Red-bordered fields on error.
- **Modals / sheets / alerts opened:** Alerts "Validation Error", "Success", "Error" (above).
- **Back / dismiss behaviour:** X or system dismiss closes without saving (no discard confirmation).
- **Tester watch-outs:** `FormInput`, `FormSection`, `FormDateField`, `GenderSelector`, `WeightUnitSelector`, `SpayedNeuteredSelector` are components defined INSIDE the modal's render (`src/components/Health/VetRecord/EditMedicalProfileModal.jsx:237`, `src/components/Health/VetRecord/EditMedicalProfileModal.jsx:257`, `src/components/Health/VetRecord/EditMedicalProfileModal.jsx:311`, `src/components/Health/VetRecord/EditMedicalProfileModal.jsx:347`, `src/components/Health/VetRecord/EditMedicalProfileModal.jsx:389`, `src/components/Health/VetRecord/EditMedicalProfileModal.jsx:430`), so React may remount them on every keystroke — check whether the keyboard drops after typing a single character in a text field. EN placeholder for weight is Spanish ("ej., 65") — copy bug.

---

### Add document (page sheet) — `AddDocumentModal`
- **File:** `src/components/Health/VetRecord/AddDocumentModal.jsx` · **Reached from:** Vet Record top "Scan or upload a document" (row 6), Documents tab "Add document" (row 40), Add Record sheet "Scan or upload a document".
- **Gating / data needed:** active pet. Needs a picked photo/PDF and a non-empty Name to enable Save. Server-side AI reading only works when the server has the Anthropic key configured; otherwise shows the "dormant" message. Viewer-role household members get 403 on read.
- **Phases:** `form` → (save) → `reading` → `review` (opens Review sheet) | `dormant` | `empty` | `readError`.

| # | Element (EN label) | Type | Source (`path:line`) | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | X (close) in header; title "Add document" | header icon | `src/components/Health/VetRecord/AddDocumentModal.jsx:606-611` | `close()` resets form and closes. | |
| 2 | Dashed preview box "Add a photo or file of the paperwork" (shows photo thumbnail, or PDF chip with filename / "PDF selected") | button | `src/components/Health/VetRecord/AddDocumentModal.jsx:384-425` (testID `pick-document-photo`) | Opens chooser: iOS native action sheet with "Take a photo" / "Choose a photo" / "Choose a file (PDF or image)" / "Cancel" (`src/components/Health/VetRecord/AddDocumentModal.jsx:157-174`); Android Alert "Add the paperwork" / "How would you like to add this document?" (`src/components/Health/VetRecord/AddDocumentModal.jsx:176-185`). | |
| 3 | "Take a photo" [ES "Sacar una foto"] | button | `src/components/Health/VetRecord/AddDocumentModal.jsx:430`, `src/components/Health/VetRecord/AddDocumentModal.jsx:434-438`, handler `src/components/Health/VetRecord/AddDocumentModal.jsx:125-139` (testID `doc-take-photo`) | Asks Camera permission (see prompt text above), launches camera (quality 0.9). Result is previewed. Denied → Alert "Camera access needed". | |
| 4 | "Choose a photo" [ES "Elegir una foto"] | button | `src/components/Health/VetRecord/AddDocumentModal.jsx:431`, handler `src/components/Health/VetRecord/AddDocumentModal.jsx:105-122` (testID `doc-choose-photo`) | Asks Photo-library permission, opens library (images only). Denied → Alert "Permission needed". | |
| 5 | "Choose a file (PDF or image)" [ES "Elegir un archivo (PDF o imagen)"] | button | `src/components/Health/VetRecord/AddDocumentModal.jsx:432`, handler `src/components/Health/VetRecord/AddDocumentModal.jsx:142-154` (testID `doc-choose-file`) | Opens iOS Files picker (PDF/image); keeps real file name and mime type. No permission prompt. | |
| 6 | "Name" input (placeholder "e.g. Rabies certificate") | text input | `src/components/Health/VetRecord/AddDocumentModal.jsx:464-479` | Required. | |
| 7 | "Category" chips: Vaccine / Lab result / Visit summary / Invoice / Other (default Vaccine) | chip group | `src/components/Health/VetRecord/AddDocumentModal.jsx:485-512` (onPress `src/components/Health/VetRecord/AddDocumentModal.jsx:491`, testIDs `doc-category-*`) | Selects the category stored with the doc (and used by Documents-tab filter). | |
| 8 | "Date" (default today) | date picker | `src/components/Health/VetRecord/AddDocumentModal.jsx:518-529` | Inline calendar, max = today. | |
| 9 | Note "After saving, PawPi reads your document and suggests records you can review before adding." | info | `src/components/Health/VetRecord/AddDocumentModal.jsx:532-549` | Static disclosure that the file will be read by AI. | |
| 10 | "Save document" [ES "Guardar documento"] | CTA | `src/components/Health/VetRecord/AddDocumentModal.jsx:551-580`, handler `src/components/Health/VetRecord/AddDocumentModal.jsx:226-290` | Disabled until name + file picked. Sequence: (a) upload file to private storage `POST /api/upload` (visibility=private, petId) via `src/utils/useUpload.js`; (b) `POST /api/vet-record/documents` {petId,name,category,documentType,fileUrl,documentDate}; (c) refresh Documents list; (d) exchange key for signed URL `GET /api/media?key=…` and send it to `POST /api/vet-record/documents/extract` {petId,url,filename,mimeType} (server reads the file with Claude vision, writes nothing). Spinner replaces label. Any failure in (a)/(b) → Alert "Error" / "Could not save the document." | ⚠️ |
| 11 | Reading screen "Reading your document…" / "PawPi is looking for vaccines, meds, labs and more." | status screen | `src/components/Health/VetRecord/AddDocumentModal.jsx:333-355` | Full-sheet spinner while extraction runs; no cancel button (only X in header). | |
| 12 | Status screens: "Saved to Documents" ("Automatic reading isn't switched on yet. Your file is saved — you can add records by hand." — HTTP 503), "File saved" ("We couldn't pull structured details from this one…" — empty proposal), "File saved" ("We saved your file, but couldn't read it automatically…" — read error or URL signing failure) | status screen | `src/components/Health/VetRecord/AddDocumentModal.jsx:293-330`, `src/components/Health/VetRecord/AddDocumentModal.jsx:356-373`, `src/components/Health/VetRecord/AddDocumentModal.jsx:202-223` | Informational; file is already stored. | |
| 13 | "Done" [ES "Listo"] | button | `src/components/Health/VetRecord/AddDocumentModal.jsx:312-328` (testID `doc-status-done`) | Closes and resets the sheet. | |
| 14 | (non-empty proposal) | transition | `src/components/Health/VetRecord/AddDocumentModal.jsx:216-220`, `src/components/Health/VetRecord/AddDocumentModal.jsx:619-627` | Hides this sheet and presents the **Review proposal** sheet. | ⚠️ |

- **Empty / loading / error states:** see rows 10-13. Failure messages are friendly strings; no raw error text (the specific server error is swallowed in favor of "Could not save the document.").
- **Modals / sheets / alerts opened:** iOS ActionSheet / Android Alert picker; permission Alerts; `ReviewProposalModal`.
- **Back / dismiss behaviour:** X or system dismiss = `close()` (resets). After save the file is kept even if the tester dismisses during reading. The document is already saved before reading starts, so cancelling the review does not remove it.

---

### PawPi read your document (AI review sheet) — `ReviewProposalModal`
- **File:** `src/components/Health/VetRecord/ReviewProposalModal.jsx` · **Reached from:** Add document → save → AI finds ≥1 record.
- **Gating / data needed:** a non-empty AI proposal (any of vaccinations, medications, surgeries, lab results, allergies, conditions, visit notes). Nothing is written until the owner taps "Add".

| # | Element (EN label) | Type | Source (`path:line`) | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | Header "PawPi read your document" + X | header | `src/components/Health/VetRecord/ReviewProposalModal.jsx:247-253` | X = `onClose` (= `reset`): discards proposal, nothing added (the file stays in Documents). | |
| 2 | Subtitle "Review what we found. Nothing is added until you confirm." and AI note "PawPi's AI read your file to suggest these. Edit anything that's off." | info | `src/components/Health/VetRecord/ReviewProposalModal.jsx:260-282` | Static. | |
| 3 | Group headings: Vaccines, Medications, Surgeries, Lab results, Allergies, Conditions, Visit notes | headings | `src/components/Health/VetRecord/ReviewProposalModal.jsx:284-300` | Only groups that have proposed rows are shown. | |
| 4 | "Include" / "Skip" toggle per proposed record | toggle button | `src/components/Health/VetRecord/ReviewProposalModal.jsx:323-350` (testID `toggle-{id}`) | Flips include/skip; skipped cards fade and their inputs become read-only. | |
| 5 | Editable fields per record (e.g. Vaccines: Name, Date given, Expires, Clinic, Notes; Medications: Name, Dose, Frequency, Prescribed by, Start date, Notes; Surgeries: Procedure, Date, Surgeon, Clinic, Notes; Lab results: Test, Date, Results, Ordered by, Notes; Allergies: Allergen, Severity, Reaction, Diagnosed, Notes; Conditions: Condition, Status, Diagnosed, Notes; Visit notes: Vet, Date, Note) | text inputs | `src/components/Health/VetRecord/ReviewProposalModal.jsx:30-123` (field lists), `src/components/Health/VetRecord/ReviewProposalModal.jsx:353-381` | Pre-filled from AI; free-text (dates are plain text, not pickers — expect YYYY-MM-DD). | |
| 6 | "Add {n} record(s)" [ES "Agregar {n} registro(s)"] / "Nothing selected" when none included | CTA | `src/components/Health/VetRecord/ReviewProposalModal.jsx:400-431`, handler `src/components/Health/VetRecord/ReviewProposalModal.jsx:199-224` (testID `apply-records`) | For each included row sequentially POSTs to the existing add routes: vaccinations `POST /api/pet-vaccinations`, medications `POST /api/health/medications`, surgeries `POST /api/vet-record/surgeries`, labs `POST /api/vet-record/lab-results`, allergies `POST /api/vet-record/allergies`, conditions `POST /api/vet-record/conditions`, visit notes `POST /api/vet-record/notes`. Appends source marker "Digitized from uploaded document" to notes; a missing required date is replaced with today. Refreshes the affected queries + summary, then closes. If any fail: Alert "Error" / "Some records couldn't be added. Please try again." — the sheet still closes (failed rows are lost; successes stay). | ⚠️ |
| 7 | "Not now" [ES "Ahora no"] | text button | `src/components/Health/VetRecord/ReviewProposalModal.jsx:432-436` | Closes without adding anything. | |

- **Empty / loading / error states:** CTA shows spinner while applying; disabled when 0 included. No per-row error markers.
- **Modals / sheets / alerts opened:** the "Error" alert in row 6.
- **Back / dismiss behaviour:** X, "Not now", system dismiss (`src/components/Health/VetRecord/ReviewProposalModal.jsx:231`) all discard. Added records cannot be deleted from the Vet Record screen except notes (no delete UI for vaccines, meds, surgeries, labs, allergies, conditions on this screen).

---

### Add to history (page sheet) — `AddVetNoteModal`
- **File:** `src/components/Health/VetRecord/AddVetNoteModal.jsx` · **Reached from:** Notes tab "Add to history" (row 37) or Add Record → "Vet visit or note".
- **Gating / data needed:** active pet; owner or Editor.

| # | Element (EN label) | Type | Source (`path:line`) | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | X (close), title "Add to history" | header icon | `src/components/Health/VetRecord/AddVetNoteModal.jsx:84-89` | Resets and closes. | |
| 2 | "Date" (default today) | date picker | `src/components/Health/VetRecord/AddVetNoteModal.jsx:100-111` | Inline calendar, max today. | |
| 3 | "Note" multiline (placeholder "What happened? (symptoms, visit summary, questions for the vet…)") | text input | `src/components/Health/VetRecord/AddVetNoteModal.jsx:116-133` | Required. | |
| 4 | Footer "History is append-only: entries are kept with their date. Vets can add entries but can't edit or delete them — only you can." | info | `src/components/Health/VetRecord/AddVetNoteModal.jsx:135-137` | Static. | |
| 5 | "Add entry" [ES "Agregar entrada"] | CTA | `src/components/Health/VetRecord/AddVetNoteModal.jsx:139-163`, handler `src/components/Health/VetRecord/AddVetNoteModal.jsx:41-61` | Disabled until note + date set. `POST /api/vet-record/notes` {petId,noteDate,note}. Success: refreshes notes + summary and closes. Failure: Alert "Error" with the server's error message or "Could not save the entry." (server text may be shown verbatim). | |

- **Empty / loading / error states:** spinner in CTA while saving.
- **Modals / sheets / alerts opened:** error Alert (row 5).
- **Back / dismiss behaviour:** X or system dismiss resets and closes.

---

### Add allergy / condition / surgery / lab result (page sheet) — `AddVetRecordModal`
- **File:** `src/components/Health/VetRecord/AddVetRecordModal.jsx` · **Reached from:** Add Record sheet → Surgery / Lab result; Allergy-or-condition chooser → Allergy / Condition.
- **Gating / data needed:** active pet; owner or Editor. One reusable form; title and fields depend on type (`src/components/Health/VetRecord/AddVetRecordModal.jsx:25-88`).

| # | Element (EN label) | Type | Source (`path:line`) | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | X (close) + title: "Add allergy" / "Add condition" / "Add surgery" / "Add lab result" | header | `src/components/Health/VetRecord/AddVetRecordModal.jsx:179-185` | Resets and closes. | |
| 2 | **Allergy** fields: "Allergen *" (text), "Severity" chips Mild / Moderate / Severe (tap again to clear), "Reaction" (text), "Diagnosed date" (date), "Notes" (multiline) | form | `src/components/Health/VetRecord/AddVetRecordModal.jsx:26-45`, `src/components/Health/VetRecord/AddVetRecordModal.jsx:192-280` | Only Allergen is required. `POST /api/vet-record/allergies`. | |
| 3 | **Condition** fields: "Condition *" (text), "Status" chips Active (default) / Managed / Resolved, "Diagnosed date", "Notes" | form | `src/components/Health/VetRecord/AddVetRecordModal.jsx:46-65` | `POST /api/vet-record/conditions`. | |
| 4 | **Surgery** fields: "Procedure *", "Date *" (date), "Surgeon", "Clinic", "Notes" | form | `src/components/Health/VetRecord/AddVetRecordModal.jsx:66-76` | `POST /api/vet-record/surgeries`. | |
| 5 | **Lab result** fields: "Test name *", "Test date *" (date), "Results" (multiline), "Ordered by", "Notes" | form | `src/components/Health/VetRecord/AddVetRecordModal.jsx:77-87` | `POST /api/vet-record/lab-results`. | |
| 6 | Date fields | date picker | `src/components/Health/VetRecord/AddVetRecordModal.jsx:209-221` | Inline calendar, max = today (no future dates). | |
| 7 | Chip options | chip | `src/components/Health/VetRecord/AddVetRecordModal.jsx:224-255` (onPress `src/components/Health/VetRecord/AddVetRecordModal.jsx:231`) | Selects/deselects the value. | |
| 8 | "Save record" [ES "Guardar registro"] | CTA | `src/components/Health/VetRecord/AddVetRecordModal.jsx:282-311`, handler `src/components/Health/VetRecord/AddVetRecordModal.jsx:125-154` | Disabled until all required (*) fields filled. Success: closes and refreshes the allergies / conditions / surgeries / lab-results lists + summary counts. Failure: Alert "Error" / "Could not save the record. Please try again." | |

- **Empty / loading / error states:** spinner in CTA; required marked with " *".
- **Modals / sheets / alerts opened:** error Alert.
- **Back / dismiss behaviour:** X or system dismiss resets and closes.

---

### Prescriptions block (inside Medications tab) — `PrescriptionsSection`
- **File:** `src/components/Health/VetRecord/PrescriptionsSection.jsx` · **Reached from:** Vet Record → Medical history → Medications tab (`src/components/Health/HealthVetRecord.jsx:995`).
- **Gating / data needed:** only shows data when a real vet has issued a prescription to the pet (provider-side feature). Owner is read-only. Data: `GET /api/prescriptions?petId=`.

| # | Element (EN label) | Type | Source (`path:line`) | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | Heading "Prescriptions" [ES "Recetas"] | heading | `src/components/Health/VetRecord/PrescriptionsSection.jsx:70-75` | Static. | |
| 2 | Empty: "No prescriptions yet." | empty state | `src/components/Health/VetRecord/PrescriptionsSection.jsx:77-80` | Shown when none. While loading nothing is shown. | |
| 3 | Rx card: drug · strength, status (Active/Completed/Cancelled), "Prescribed by {clinic}", Dose, Frequency, Route, Duration, Quantity, Refills remaining, Instructions | card | `src/components/Health/VetRecord/PrescriptionsSection.jsx:82-113` | Display only. | |
| 4 | "Refill requested — awaiting the vet" | status text | `src/components/Health/VetRecord/PrescriptionsSection.jsx:115-119` | Shown if a pending refill request exists; hides the refill button. | |
| 5 | "Request refill" [ES "Pedir renovación"] | button | `src/components/Health/VetRecord/PrescriptionsSection.jsx:120-128` (testID `rx-refill-{id}`; handler `src/components/Health/VetRecord/PrescriptionsSection.jsx:44-66`) | Only for active Rx with refills remaining and none pending. Confirm Alert "Request a refill?" / "Ask {clinic} to refill {drug}." [Cancel / Request]. Request → `POST /api/rx-refill-requests` {prescription_id}; card then shows the pending line. Failure Alert "Couldn't request" / server message or "Try again." | 📤 |
| 6 | "Request fulfillment" [ES "Pedir preparación"] (truck icon) | button | `src/components/Health/VetRecord/PrescriptionsSection.jsx:129-142` (testID `rx-fulfill-{id}`) | Shown for active Rx with refills remaining. `router.push("/rx-fulfillment?prescriptionId=…&petId=…&drugName=…")` → **Rx fulfillment** screen. | |

- **Empty / loading / error states:** empty text only; fetch errors show nothing (no error text).
- **Modals / sheets / alerts opened:** refill confirm Alert; error Alert.
- **Back / dismiss behaviour:** n/a (inline).

---

### Emergency Card — `/emergency-card`
- **File:** `src/app/emergency-card.jsx` (data hooks `src/hooks/useEmergencyCard.js`) · **Reached from:** Vet Record → "Emergency Card" button (`src/components/Health/HealthVetRecord.jsx:492`), param `petId`; registered in `src/app/_layout.jsx:128`.
- **Gating / data needed:** a pet (falls back to the current pet). If none: "No pet selected" (`src/app/emergency-card.jsx:134-140`). Loads `GET /api/emergency-card?petId=`; missing medical fields show "Not recorded" [ES "No registrado"]. If the pet is flagged lost a dark-orange banner "This pet is marked LOST" (+ "Reward: …") shows. The QR and its public URL appear only when the card has a tag token.

| # | Element (EN label) | Type | Source (`path:line`) | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | "< Back" | header button | `src/app/emergency-card.jsx:156-159` | `router.back()` to Vet Record. | |
| 2 | Card preview: avatar, name, "This dog has a home 💛", Species, Breed, Microchip, Blood type, Spay/neuter, Allergies, Conditions, Primary vet, Vet phone, Emergency contact, Emergency phone, footer "Organized for a real vet. PawPi does not diagnose." | read-only card | `src/app/emergency-card.jsx:183-211` | Assembled from live medical profile/allergies/conditions. Not editable here (edit via Edit Medical Profile). | |
| 3 | "Share card (image)" [ES "Compartir tarjeta (imagen)"] | button | `src/app/emergency-card.jsx:213-221` (testID `share-card`; handler `src/app/emergency-card.jsx:110-124`) | Screenshots the card to a PNG and opens the iOS share sheet (Messages, Mail, AirDrop, Save Image …). Silent no-op if sharing unavailable. | 📤 |
| 4 | "Printable tag QR" QR code + selectable URL (`{base}/p/tag/{token}`) | read-only | `src/app/emergency-card.jsx:224-236` | Anyone scanning the QR sees the public tag page. No print button; the URL text is selectable. | 🌍 |
| 5 | Switch "Show medical info on the public tag" [ES "Mostrar información médica en la chapa pública"] | toggle | `src/app/emergency-card.jsx:239-246` (testID `toggle-medical`) | `PATCH /api/emergency-card` {petId, show_medical_on_tag}. ON exposes allergies/conditions (per card) on the public tag page to anyone with the QR/URL. Failure is silent (switch re-syncs from server). | 🌍 |
| 6 | "How can a finder reach you?": chips "Relay (private)", "Phone", "Email", "None" | chip group | `src/app/emergency-card.jsx:252-262` (testIDs `contact-*`) | `PATCH` {contact_mode}. Default "Relay (private)". Phone/Email mean the owner's number/email appears on the public tag page. | 🌍 |
| 7 | Phone number / Email address input (only for Phone/Email modes) | text input | `src/app/emergency-card.jsx:263-272` (testID `contact-value`) | Saved on blur/submit (`onEndEditing`) via `PATCH` {contact_value}. | 🌍 |
| 8 | "Share with a vet": Scope chips "Full" / "Basic" | chip | `src/app/emergency-card.jsx:284-285` (testIDs `scope-full`, `scope-basic`) | Chooses what a new link exposes (default Full). Local state only. | |
| 9 | Expires chips "24 hours" / "7 days" / "No expiry" | chip | `src/app/emergency-card.jsx:289-299` (testIDs `ttl-*`) | Chooses link lifetime (default 7 days). Local state only. | |
| 10 | "Create vet link" [ES "Crear enlace para vet"] | button | `src/app/emergency-card.jsx:301-313` (testID `create-link`) | `POST /api/emergency-card/links` {petId, scope, ttlHours}. A new row appears: "Full · expires {date}" + the URL (`{base}/p/card/{token}`). Disabled while pending (double-tap guard). No error message on failure. | 🌍 |
| 11 | Link URL (coral text) on each active link | link | `src/app/emergency-card.jsx:330-334` (testID `share-link-{id}`; handler `src/app/emergency-card.jsx:126-132`) | Opens the iOS share sheet with the URL as text. | 📤 |
| 12 | Trash icon on a link | icon button | `src/app/emergency-card.jsx:336-346` (testID `revoke-link-{id}`) | Alert "Revoke link?" / "This link will stop working immediately." [Cancel / Revoke (destructive)] → `DELETE /api/emergency-card/links/{id}`; link disappears. | 🗑️ |
| 13 | "No active links." | empty state | `src/app/emergency-card.jsx:315-318` | Shown when there are no links. | |

- **Empty / loading / error states:** "Loading…" text while fetching; "Not recorded" for blanks; mutations have no `onError`, so failures are silent (switch/chip simply does not change).
- **Modals / sheets / alerts opened:** iOS share sheet (rows 3, 11); revoke Alert (row 12).
- **Back / dismiss behaviour:** custom header back button only; stack screen (no tab bar).

---

### Rx fulfillment — `/rx-fulfillment`
- **File:** `src/app/rx-fulfillment.jsx` (hooks `src/hooks/useRxFulfillment.js`) · **Reached from:** Prescriptions block → "Request fulfillment" (`src/components/Health/VetRecord/PrescriptionsSection.jsx:132-136`), params `prescriptionId`, `petId`, `drugName`.
- **Gating / data needed:** an active, refillable prescription (created by a vet). Needs ≥1 pharmacy-capable provider; otherwise empty state. Payment rail is MercadoPago (`src/app/rx-fulfillment.jsx:96-105`).

| # | Element (EN label) | Type | Source (`path:line`) | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | Back arrow; title "Request fulfillment" + drug name | header | `src/app/rx-fulfillment.jsx:148-160` | `router.back()`. | |
| 2 | "YOUR FULFILLMENT ORDERS" order cards (pharmacy, status in English only: Requested/Accepted/Preparing/Ready/Out for delivery/Fulfilled/Cancelled, Delivery|Pickup · price) | cards | `src/app/rx-fulfillment.jsx:165-203` | Shown when orders exist for this Rx (`GET /api/rx-fulfillment-orders?petId=`). | |
| 3 | "Pay $xx.xx" [ES "Pagar"] on an order the pharmacy has priced and that is unpaid | button | `src/app/rx-fulfillment.jsx:188-200` (testID `rxf-pay-{id}`; handler `src/app/rx-fulfillment.jsx:93-132`) | `POST /api/payments/checkout` {provider_id, kind: product, amount_cents, rail: mercadopago, source_ref: rxf-{id}} then `PATCH /api/rx-fulfillment-orders/{id}`, then opens `checkoutUrl` in the browser (MercadoPago). HTTP 503 → Alert "Payments not available yet". Other failure → Alert "Couldn't start payment". | 💸 |
| 4 | "CHOOSE A PHARMACY" provider rows | list item | `src/app/rx-fulfillment.jsx:218-240` (testID `rxf-provider-{id}`) | Selects a pharmacy (highlight). Loading spinner; none → "No fulfillment providers available yet." | |
| 5 | "Delivery" / "Pickup" chips | toggle | `src/app/rx-fulfillment.jsx:242-257` (testIDs `rxf-method-*`) | Chooses method (default Delivery). | |
| 6 | "Delivery address" field → "Set location on map" | map picker | `src/app/rx-fulfillment.jsx:259-267` -> `src/components/Map/LocationField.jsx:93` | Opens full-screen map picker (pin, address text box that geocodes, "use my location" → location permission prompt), "Done" saves. Required for Delivery. | |
| 7 | "Request fulfillment" | CTA | `src/app/rx-fulfillment.jsx:270-285` (testID `rxf-submit`; handler `src/app/rx-fulfillment.jsx:73-91`) | Disabled until a pharmacy is chosen (and an address for Delivery). `POST /api/rx-fulfillment-orders` {prescription_id, provider_id, method, delivery_lat/lng/address}. Success Alert "Fulfillment requested" / "The pharmacy will confirm and set a price." Failure Alert "Couldn't request fulfillment" (+ server message). | 📤 |

- **Empty / loading / error states:** spinner while providers load; empty-provider text; errors via Alerts (server error text may be shown verbatim).
- **Modals / sheets / alerts opened:** map picker modal; Alerts above.
- **Back / dismiss behaviour:** header back arrow.

---

### Data Access (owner trust screen) — `/(tabs)/more/data-access`
- **File:** `src/app/(tabs)/more/data-access.jsx` (hooks `src/hooks/useCareAccessGrants.js`) · **Reached from:** Vet Record → "Share" (row 5, `src/components/Health/HealthVetRecord.jsx:482`); also More hub "Who has access" card (`src/app/(tabs)/more/hub.jsx:189`) and notification tap for access requests (`src/app/notifications.jsx:535`).
- **Gating / data needed:** active pet; list is empty until a provider (vet) requests/gets access. Pet-scoped.

| # | Element (EN label) | Type | Source (`path:line`) | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | Back arrow; title "Data Access" | header | `src/app/(tabs)/more/data-access.jsx:109-129` | `router.back()`. | |
| 2 | No pet: "No pet selected" / "Add or choose a pet to manage who can see its records." | empty state | `src/app/(tabs)/more/data-access.jsx:131-167` | Shown when no pet. | |
| 3 | Blue reassurance "You control who can see {name}'s records. Approve a request to grant access, and revoke it anytime." | info | `src/app/(tabs)/more/data-access.jsx:187-211` | Static. | |
| 4 | Pull-to-refresh | pull-to-refresh | `src/app/(tabs)/more/data-access.jsx:182-185` | Refetches grants. | |
| 5 | Error text "Couldn't load access requests. Pull to refresh." | error | `src/app/(tabs)/more/data-access.jsx:213-224` | Friendly text only. | |
| 6 | "PENDING REQUESTS" cards (provider name, "wants access to {pet}", scope chips such as "View medical records", "Add vet notes", "Add vaccinations", "Manage appointments", "View health logs", "Add health logs", "Messaging") | cards | `src/app/(tabs)/more/data-access.jsx:227-279`, `src/app/(tabs)/more/data-access.jsx:372-449` | Empty: "No pending requests." | |
| 7 | "Approve" [ES "Aprobar"] | button | `src/app/(tabs)/more/data-access.jsx:234-252` (handler `src/app/(tabs)/more/data-access.jsx:73-81`) | `PATCH /api/care-access/grants/{id}` {action: approve}. The vet immediately gains the listed access to the pet's record; moves to "Who has access". No confirmation dialog. Failure Alert "Something went wrong". | 📤 |
| 8 | "Deny" [ES "Rechazar"] | button | `src/app/(tabs)/more/data-access.jsx:253-275` (handler `src/app/(tabs)/more/data-access.jsx:83-94`) | Alert "Deny request?" / "{provider} will not get access to {pet}." [Cancel / Deny (destructive)] → PATCH action deny. | 📤 |
| 9 | "WHO HAS ACCESS" cards ("has access to {pet}", scope chips, "Granted {date}", "Access until {date}") | cards | `src/app/(tabs)/more/data-access.jsx:281-325` | Active, non-expired grants only. Empty: "No one has access yet." | |
| 10 | "Revoke access" [ES "Revocar acceso"] | button | `src/app/(tabs)/more/data-access.jsx:300-322` (handler `src/app/(tabs)/more/data-access.jsx:96-107`) | Alert "Revoke access?" / "{provider} will immediately lose access to {pet}." [Cancel / Revoke (destructive)] → PATCH action revoke. | 📤 |

- **Empty / loading / error states:** spinner while loading; empty rows per section; error text above.
- **Modals / sheets / alerts opened:** deny / revoke / error Alerts.
- **Back / dismiss behaviour:** header back arrow.

---

### Unused legacy components in `VetRecord/` (not rendered anywhere)
- **File:** `src/components/Health/VetRecord/InfoBox.jsx`, `PhotoHistorySection.jsx`, `QuickActions.jsx`, `RecentRecords.jsx`, `RecordCard.jsx`, `VetInformation.jsx`, `VetRecordHeader.jsx` · **Reached from:** nowhere — grep finds no importer outside their own files/`RecentRecords` → `RecordCard`. A tester will never see them. They contain hard-coded English placeholder content (e.g. "Happy Paws Veterinary Clinic", "Dr. Sarah Johnson", "(555) 123-4567") that would violate the no-mock-data rule if ever wired in.
- **Gating / data needed:** n/a (dead code).

| # | Element | Type | Source (`path:line`) | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | "Add Record" / "Share Records" buttons with no onPress | buttons | `src/components/Health/VetRecord/QuickActions.jsx:15`, `:44` | Dead: no handlers. | |
| 2 | Record card (Download icon) | list item | `src/components/Health/VetRecord/RecordCard.jsx:10-69` | Dead: no handler. | |
| 3 | "Schedule Appointment" over fake clinic data | button | `src/components/Health/VetRecord/VetInformation.jsx:68-86` | Dead: no handler, mock data. | |
| 4 | "Photo History" collapsible | button | `src/components/Health/VetRecord/PhotoHistorySection.jsx:10-36` | Dead: superseded by the Photos tab. | |

- **Empty / loading / error states:** n/a.
- **Modals / sheets / alerts opened:** none.
- **Back / dismiss behaviour:** n/a.

---


---
## AREA: Reminders & Routines

All paths below are relative to `anything/apps/mobile/` unless noted. EN strings resolved from `src/i18n/locales/en.json` (ES in brackets when short). Many strings in this area are **hard-coded English (not i18n)** — noted as "(hard-coded EN)". Where a string is `t("key", "default")`, the key exists in en.json.

## 0. Cross-cutting facts for the tester

### 0.1 How a user gets to "Reminders & Routines" (route `/(tabs)/more/reminders`, file `src/app/(tabs)/more/reminders.jsx`)
| # | Entry point | Source | Condition / notes |
|---|---|---|---|
| E1 | **Profile tab (More tab root) → ☰ menu button (top-right, a11y label `ownerMenu.openMenu`) → "🔔 Reminders & Routines"** | `src/components/More/OwnerMenu.jsx:105-118` (open), `:255-258` (item, `goMenu("/(tabs)/more/reminders")`) | The ☰ menu is rendered by `pet-profile.jsx:265` only in `embedded` mode (the Profile tab, `src/app/(tabs)/more/index.jsx`). Menu closes then pushes the route. |
| E2 | **Home feed "Getting started" card → item "Set your first reminder"** | `src/components/Home/GettingStartedCard.jsx:52-53` (`router.push("/(tabs)/more/reminders")`); label `gettingStarted.items.reminder` | Only visible while the activation checklist is not complete and the user has an active pet; item ticks when a routine exists (RoutinesTab invalidates `["routines", petId]` after create/delete, `RoutinesTab.jsx:72-78,218,244`). |
| E3 | **Health tab → Today → "Next Up" header → "Manage routines" ›** (two places) | `src/components/Health/HealthToday.jsx:902` (when there are Next-Up reminders) and `:1012` (empty-state variant, "Next Up" with nothing scheduled) — label `health.todayView.manageRoutines` = "Manage routines" [ES "Gestionar rutinas"] | Needs a pet. (HealthToday is another agent's area.) |
| E4 | **Health tab → Today → heads-up ("Upcoming") card → "Edit"** → opens the Reminders screen with `?editRoutineId=<id>`, which auto-opens that routine's edit modal | `src/components/Health/HealthToday.jsx:873` (`onEdit={handleEditHeadsUp}`), handler `:414-423`; card button `src/components/Health/Reminders/HeadsUpReminderCard.jsx:97` (TODAY agent file); consumer `src/app/(tabs)/more/reminders.jsx:33,133` → `RoutinesTab.jsx:168-175` | Only for early-reminder (lead-time) heads-ups that carry a `routineId`; without `routineId` it just opens the screen. |
| E5 | **Tap the local "reminder setup" nudge notification** ("A little help with {name}'s routine 🐾" / "Make {name}'s day a bit easier 🐾") | `src/utils/notificationDeepLink.js:21-23,50` (`data.nudge === "reminder_setup"` → `/(tabs)/more/reminders`); armed by `src/utils/engagementNotifications.js:205-300` | Local notification armed (max 2: ~day+1 and ~day+4, daytime) only for a pet with NO routine and with notification permission granted; cancelled once any routine exists. Copy: body1 "Pick a time for meals or walks and PawPi will remind you. It takes about 30 seconds." / body2 "Set a feeding, walk or vet reminder in a few taps — we'll take care of the rest." |
| — | There is NO entry from the Health "Track" tab, Settings screen or the bottom tab bar (grep for `/more/reminders` shows only the five above). | | |

### 0.2 Permission prompts a tester will hit (this area)
| Prompt | Where triggered | Exact text |
|---|---|---|
| **Notifications – PawPi explainer alert, then iOS system prompt** | At **app launch** (not inside this screen): `src/app/_layout.jsx:56` → `initNotifications()` → `requestNotificationPermissions()` `src/utils/notifications.js:73-97` (only when not already granted; memoized so it shows once per launch) | Title "🔔 Enable Reminders" / body "PawPi can remind you about feeding, walks, medication, and photo checks so your pet's care routine stays on track." / buttons "Maybe later" · "Enable reminders" (hard-coded EN) → then the standard iOS "“PawPi” Would Like to Send You Notifications" system dialog (no custom infoPlist string exists for notifications). |
| **Notifications – Settings tab "Enable" button** (shown only when permission is not granted) | `src/components/Health/Reminders/SettingsTab.jsx:254-266` → `:53-94` | Calls the iOS system prompt directly (`Notifications.requestPermissionsAsync`). If still not granted: alert "Permission Needed" / "To receive reminders, please enable notifications in your device settings." buttons "Maybe Later" · "Open Settings" (iOS opens app settings via `Notifications.openSettingsAsync`). If granted: alert "✅ Notifications Enabled". |
| **Calendar – PawPi rationale alert, then iOS system prompt** | First time a calendar write is attempted: Routine card "Add to calendar" (walks), Walk editor "Add to calendar", Vet Appointment "Add to phone calendar" toggle on save — `src/utils/calendarIntegration.js:41-79` (`requestCalendarPermission`) | Title "Calendar Access" / body "PawPi can add walk blocks to your calendar so your time stays protected." (hard-coded EN; the same wording is shown for vet appointments) / buttons "Not now" · "Allow calendar access" → iOS system dialog with the infoPlist string (`app.json` ios.infoPlist `NSCalendarsFullAccessUsageDescription` and `NSCalendarsUsageDescription`): **"PawPi adds your pet's appointments, bookings and reminders to your calendar so you don't miss them."** |
| Camera / photo library / location | **None are requested anywhere in this area.** The "Photo Check" routine only stores a schedule; it never opens the camera or uploads a photo (grep of `components/Health/Reminders/*` finds no image-picker/camera/location/share imports). | |

### 0.3 What the app does behind the scenes when a routine is saved (so the tester knows what to verify)
* **Create** a routine: `POST /api/routines` (JSON body: petId, type, isActive, title, description, feedingSchedule / walkSchedule / photoCheckDetails / medicalCareDetails / wellnessCheckSchedule, frequency, times, days, notificationEnabled, timeSensitive, notes) — `src/store/routinesStore.js:142-205`. **Update**: `PUT /api/routines` (`:285-365`) then cancels the routine's future local notifications and regenerates them, then `DELETE /api/health/reminder-dismissals?petId=&routineId=` to clear "heads-up closed" acks (`:464-476`). **Delete (soft)**: `DELETE /api/routines?id=<id>` (`:482-545`) + cancel future notifications + same dismissals clear + refetch `GET /api/routines?petId=` (`src/utils/routinesQuery.js:9-17`). **Pause/resume (Active switch)**: it is a `PUT /api/routines` with `isActive` flipped (`toggleRoutineActive`, `:549-594`) — paused routines stay listed but stop generating reminders (future ones are disabled/cancelled).
* **Reminders are generated client-side**: `generateRemindersFromRoutine(routine, daysAhead = 14)` (`src/utils/reminderGenerator.js:78`) → each occurrence in the next 14 days becomes a **separately scheduled local OS notification** via `scheduleReminderNotification` (`src/utils/notifications.js:241-300`, `Notifications.scheduleNotificationAsync`, DATE trigger, title "<type icon> <title>"; with an Early-reminder lead time the title is "<icon> Upcoming: <title>" and the body ends "Due <day/time>"). Silent skip if OS notification permission is not granted (no alert at that point) or the trigger is already in the past. The same scheduling re-runs on every app start (`src/app/(tabs)/_layout.jsx:188-217`) and on every pull-to-refresh of the Routines list (`routinesStore.loadRoutines` → `addRemindersFromRoutines`).
* **In-app notification rows** for due/overdue reminders are created every 60 s by `startReminderNotificationSync()` (`src/utils/reminderNotificationSync.js`).
* **Snooze / skip / done (for completeness — the buttons live on Health → Today, TODAY agent):** *Snooze* is purely local — `useRemindersStore.snoozeReminder` (`src/store/remindersStore.js:286-340`) writes an until-timestamp into the persisted `snoozes` map (AsyncStorage key `pawpi:reminderSnoozes`) and re-schedules the local notification; **no API call**. Options = `SNOOZE_OPTIONS` (10 min, 30 min, 1 hour, Tonight 20:00, Tomorrow 09:00). *Skip / Dismiss* and heads-up *Close* call `POST /api/health/reminder-dismissals` (body petId, routineId, reminderType, instanceKey, scheduledDate; heads-up Close uses the `<id>::early` key) — `src/hooks/useTodayReminders.js:231-262`. *Done* is completed by logging via the tracker flows (`utils/reminderLogFlow.js`, `hooks/useReminderAutoComplete.js`) which call the `/api/health/*` log endpoints (TRACK agents).
* Nothing in this area messages other users **except** editing/deleting a vet appointment that came from a provider booking (see §10) — the server then notifies the provider's team.

---

### Reminders & Routines (screen shell) — `/(tabs)/more/reminders`
- **File:** `src/app/(tabs)/more/reminders.jsx` · **Reached from:** E1–E5 above (More-tab Stack screen, `src/app/(tabs)/more/_layout.jsx:28`)
- **Gating / data needed:** none for the shell; the Routines tab needs an active pet (spinner while `useCurrentPet` loads). Optional query param `editRoutineId` (deep link) auto-opens that routine's edit modal once routines have loaded.
- Header and tab labels are **hard-coded English** (not translated).

| # | Element (EN label) | Type | Source | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1.1 | ← back arrow (top-left) | header icon | `src/app/(tabs)/more/reminders.jsx:88-93` | `router.back()` → returns to the previous screen (Profile menu / Health / Home) | |
| 1.2 | Title "Reminders & Routines" + subtitle "Set your pet's care schedule and reminder preferences" | text | `reminders.jsx:103,112` | static | |
| 1.3 | Tab "Routines" (Repeat icon) — default tab | tab | `reminders.jsx:127` (TabButton `:36-66`, onPress `:40`) | shows RoutinesTab (§2); active tab has coral underline | |
| 1.4 | Tab "Settings" (gear icon) | tab | `reminders.jsx:128` | shows SettingsTab (§11) | |

- **Empty / loading / error states:** handled inside each tab.
- **Modals / sheets / alerts opened:** none directly (see §2–§11).
- **Back / dismiss behaviour:** back arrow = `router.back()`; no unsaved-changes guard (each routine modal has its own X).

---

### Routines tab (list of routines + add button) — component `RoutinesTab`
- **File:** `src/components/Health/Reminders/RoutinesTab.jsx` (+ `RoutineCard.jsx`) · **Reached from:** "Routines" tab of §1
- **Gating / data needed:** active pet (header reads "<PetName>'s Routines"; if no name falls back to "Your pet"). Routines load via `GET /api/routines?petId=<id>` (`RoutinesTab.jsx:100-107` → `routinesStore.loadRoutines`). Walk routines with no enabled walk and Feeding routines with no enabled meal are **hidden** from the list (`RoutinesTab.jsx:117-140`; also `RoutineCard.jsx:161-227` hides empty Walk/Feeding/Photo/Wellness cards). Deleted routines are filtered out. **Vet-appointment "routines" never appear here** (the Vet Appointment modal writes to `/api/vet-appointments`, see §10).
- Strings in this tab are mostly **hard-coded English**; toasts/alerts use i18n.

| # | Element (EN label) | Type | Source | Action → expected result | Risk |
|---|---|---|---|---|---|
| 2.1 | Loading spinner + "Loading routines..." | loading state | `RoutinesTab.jsx:261-273` | shown while pet or routines load | |
| 2.2 | Pull-to-refresh on the list | pull-to-refresh | `RoutinesTab.jsx:277-281` (`RefreshableScrollView refetch={handleRefresh}`; handler `:194-198`) | `GET /api/routines?petId=` again, then **regenerates the next 14 days of reminders and re-schedules local notifications** for all active routines | ⚠️ re-schedules OS notifications |
| 2.3 | Header "<Pet>'s Routines" / "Set <Pet>'s care schedule so PawPi knows when to remind you" | text | `RoutinesTab.jsx:292,295` | static | |
| 2.4 | Empty state "📅 No routines yet — Set <Pet>'s care schedule so PawPi knows when to remind you" | empty state | `RoutinesTab.jsx:313-346` | shown when there are no valid routines | |
| 2.5 | Button "+ Create First Routine" (empty state only) | button | `RoutinesTab.jsx:347-363` (handler `:187-191`) | opens the routine-type chooser (§3); telemetry `routine_add` | |
| 2.6 | Floating "+" button (bottom-right; only when ≥1 routine) | FAB | `RoutinesTab.jsx:396-416` | opens the routine-type chooser (§3) | |
| 2.7 | Blue info box "💡 Routines automatically generate reminders. Turn them on/off anytime without losing your schedule" (only when ≥1 routine) | text | `RoutinesTab.jsx:368-391` | static | |
| 2.8 | **Routine card** — icon + title (e.g. "Feeding", "Walks", "Photo Check" + areas line, "Medical Care" + items line, wellness item names, "Vet…"), badge **ACTIVE / INACTIVE** | list item | `src/components/Health/Reminders/RoutineCard.jsx:229-328` (badge `:300-318`, labels `routineCard.active/inactive`) | display only. Type labels come from `ROUTINE_TYPE_CONFIG` in `src/data/routinesData.js:155-233` | |
| 2.9 | **Active/Inactive switch** on each card | toggle | `RoutineCard.jsx:321-327` → `RoutinesTab.jsx:177-185` | `PUT /api/routines` with `isActive` flipped. Off = card dims to 60%, Schedule/Next boxes hide, future local notifications for that routine are cancelled/disabled; On = future reminders regenerated and re-scheduled; also clears the routine's "heads-up closed" acks (`DELETE /api/health/reminder-dismissals?petId=&routineId=`). On failure: optimistic switch reverts and alert "Could not update routine. Please try again." | ⚠️ cancels/re-schedules OS notifications |
| 2.10 | "SCHEDULE" box (e.g. "Daily at 08:00, 20:00"…) | text | `RoutineCard.jsx:331-363` (`getScheduleSummary` in routinesData.js:238) | only when routine is active | |
| 2.11 | "NEXT" box (next reminder preview) | text | `RoutineCard.jsx:366-398` (`getNextReminderPreview`) | only when active and a next occurrence exists | |
| 2.12 | **"Add to calendar"** button (Walk routines only, when active) | button | `RoutineCard.jsx:402-433` (onPress `:404-409`) | For **every walk** in the routine: `addWalkToCalendar(walk, pet name)` → permission flow (§0.2) → creates/gets a device calendar named **"PawPi - Walks"** and **creates a new event titled "Busy"** (notes "Dog walk scheduled in PawPi", BUSY, private on iOS), recurring daily if the walk repeats "Every day" — weekdays/weekends/custom create a single one-off event. Alerts: "Added to calendar — Walk block added to your calendar[ as a repeating event]." per walk (so N alerts for N walks); "Permission needed — Calendar access is required to add walk events."; "Calendar unavailable"; "Error — Could not add walk to calendar. Please try again." (all hard-coded EN, `src/utils/calendarIntegration.js:178-222`). **No de-duplication: pressing again adds duplicate events.** | ⚠️ writes to device calendar (creates a calendar + events) |
| 2.13 | **"Edit Routine ›"** button | button | `RoutineCard.jsx:439-458` → `RoutinesTab.jsx:145-164` | opens the matching routine modal pre-filled (Feeding §4, Walk §5, Photo Check §6, Medical Care §8, Wellness §9). Legacy types are mapped: medication/vaccine/preventive → Medical Care modal; general_check/weight_check → Wellness modal | |
| 2.14 | **"Delete Routine"** (trash, coral) button | button | `RoutineCard.jsx:461-480` (handler `:37-50`) | Alert **"Delete this routine?"** — "This removes it and its future reminders. Past logs and history are kept." Buttons "Cancel" · **"Delete"** (destructive). Confirm → soft delete: `DELETE /api/routines?id=<id>`, cancels future local notifications, clears heads-up acks, refetches; toast alert "Routine deleted" (or "Could not delete routine. Please try again.") | 🗑️ deletes routine (soft delete; logs kept) |
| 2.15 | Toast alerts after saving from any modal | alert | `RoutinesTab.jsx:204-231` | "Routine created" / "Routine saved" (OS alert, OK button); failure "Could not save routine. Please try again." (note: modals close **before** the save result, so a failure alert appears after the modal is already gone) | |
| 2.16 | Deep-link auto-open (`?editRoutineId=`) | deep link | `RoutinesTab.jsx:166-175` | once routines have loaded, opens the edit modal of the matching routine exactly once | |

- **Empty / loading / error states:** spinner "Loading routines..." → list or empty state "No routines yet". If the routines fetch fails the store sets an error and shows the empty state (no phantom data, `routinesStore.js:116-120`); no dedicated error banner. Raw technical text does **not** reach the UI except via `console`; save/delete/update failures show the three generic i18n messages above.
- **Modals / sheets / alerts opened:** Routine-type chooser (§3); the six routine modals (§4–§10); delete confirm alert (2.14); success/error alerts.
- **Back / dismiss behaviour:** no back inside the tab; leaving the screen via ← (§1.1). The routine modals are full-screen/sheet `Modal`s closed by their X / Android back (`onRequestClose`) — **closing never asks about unsaved changes**.

---

### Create Routine (type chooser sheet) — `RoutineTypeSelector`
- **File:** `src/components/Health/Reminders/RoutineTypeSelector.jsx` · **Reached from:** "+" / "Create First Routine" in §2 (bottom sheet, 80% max height)
- **Gating:** none. Headline text is **hard-coded EN**.

| # | Element (EN label) | Type | Source | Action → expected result | Risk |
|---|---|---|---|---|---|
| 3.1 | Sheet title "Create Routine" / "Choose the type of care routine" | text | `RoutineTypeSelector.jsx:74,77` | static | |
| 3.2 | X (close) | button | `RoutineTypeSelector.jsx:80-92` | closes the sheet | |
| 3.3 | "🍽️ Feeding — Meal times, snacks, and food reminders" | list item | `RoutineTypeSelector.jsx:101-142` (types list `:23-30`; copy from `routinesData.js:156-161`) | closes sheet and opens Feeding modal (§4) | |
| 3.4 | "🚶 Walks — Walk schedule, social walks, and activity tracking" | list item | same (`routinesData.js:162-167`) | opens Walk modal (§5) | |
| 3.5 | "📸 Photo Check — Recurring photos of paws, ears, teeth, eyes, and more" | list item | same (`routinesData.js:168-173`) | opens Photo Check modal (§6) | |
| 3.6 | "💊 Medical Care — Medication, vaccines, flea/tick prevention, and supplements" | list item | same (`routinesData.js:174-179`) | opens Medical Care modal (§8) | |
| 3.7 | "⚖️ Wellness Check — Weight, body condition, mood, and quick health checks" | list item | same (`routinesData.js:180-185`) | opens Wellness modal (§9) | |
| 3.8 | "🩺 Vet Appointment — Scheduled vet visits and follow-ups" | list item | same (`routinesData.js:186-191`) | opens Vet Appointment manager (§10) — NOT a routine; no "Routine created" toast | |

- **Empty / loading / error states:** n/a.
- **Modals / sheets / alerts opened:** the chosen modal.
- **Back / dismiss behaviour:** X or Android back closes; tapping outside does not (no backdrop handler).

---

### Feeding Routine modal — `FeedingRoutineModal`
- **File:** `src/components/Health/Reminders/FeedingRoutineModal.jsx` · **Reached from:** type chooser "Feeding" (§3.3) or "Edit Routine" on a Feeding card (§2.13)
- **Gating / data needed:** pet (title uses pet name). New routine = 2 steps (count → details); editing jumps straight to details. Hard-coded English throughout except two alerts.

| # | Element (EN label) | Type | Source | Action → expected result | Risk |
|---|---|---|---|---|---|
| 4.1 | Step 1 sheet "🍽️ Feeding Routine — How many meals does <Pet> eat per day?" | text | `FeedingRoutineModal.jsx:258-262` | static (new routine only) | |
| 4.2 | X close (step 1) | button | `FeedingRoutineModal.jsx:264-276` | `onClose` | |
| 4.3 | "1 meal per day" / "2 meals per day" / "3 meals per day" | list item | `FeedingRoutineModal.jsx:280-303` (handler `:137-142`) | preloads defaults (1: Meal 12:00; 2: Breakfast 08:00 + Dinner 20:00; 3: Breakfast 08:00, Lunch 13:00, Dinner 19:00, all Every day, reminder on, time-sensitive on) and goes to details | |
| 4.4 | "Custom" | list item | `FeedingRoutineModal.jsx:305-329` | loads the 2-meal default and goes to details | |
| 4.5 | Header "🍽️ Create/Edit Feeding Routine — Set meal-specific schedules" | text | `FeedingRoutineModal.jsx:365-369` | static | |
| 4.6 | X close (details) | button | `FeedingRoutineModal.jsx:371-383` | closes modal, discards edits | |
| 4.7 | "Meals — Tap to expand" meal card header (name, "HH:MM • Every day/Weekdays/Weekends/Custom days") | accordion | `FeedingRoutineModal.jsx:429-458` (state `:104`) | expand/collapse a meal (one open at a time) | |
| 4.8 | Trash icon on a meal (shown when >1 meal) | button | `FeedingRoutineModal.jsx:466-473` (handler `:166-178`) | removes that meal from the draft immediately (no confirm; not saved until "Save"). If only 1 meal remains: alert **"Minimum meals" — "You need at least one meal per day."** | |
| 4.9 | "Meal Name" input (placeholder "e.g., Breakfast") | text input | `FeedingRoutineModal.jsx:496-511` | edits name | |
| 4.10 | "Time" (TimeField) | time picker | `FeedingRoutineModal.jsx:525-534` (`src/components/TimeField.jsx`) | opens native spinner; stores 24h "HH:MM" | |
| 4.11 | "Repeat": "Every day" / "Weekdays" / "Weekends" / "Custom days" | radio list | `FeedingRoutineModal.jsx:549-597` | sets meal frequency | |
| 4.12 | "Select Days" chips Mon…Sun (only with Custom days) | multi-toggle | `FeedingRoutineModal.jsx:601-660` (toggle `:180-190`) | toggles weekdays | |
| 4.13 | "Reminder enabled" switch | toggle | `FeedingRoutineModal.jsx:689-696` | off ⇒ that meal generates no reminder (and is hidden from the Routines list if all meals are off) | ⚠️ affects notification scheduling |
| 4.14 | "Time-sensitive" switch | toggle | `FeedingRoutineModal.jsx:714-721` | marks reminder as time-sensitive (high-priority notification / countdown card) | |
| 4.15 | "Notes (optional)" input (placeholder "e.g., Morning kibble with supplement") | text input | `FeedingRoutineModal.jsx:736-754` | multi-line notes | |
| 4.16 | "+ Add Another Meal" | button | `FeedingRoutineModal.jsx:762-783` (handler `:150-164`) | appends a "Snack" 15:00 meal and expands it | |
| 4.17 | **"Create Routine" / "Save Changes"** (fixed bottom) | button | `FeedingRoutineModal.jsx:799-811` (handler `:192-218`) | builds routine (title "Feeding", description "N meals per day"), calls parent `onSave` (→ `POST/PUT /api/routines`, §0.3) then closes. Then alert "Routine created"/"Routine saved". Schedules up to 14 days of local notifications | ⚠️ schedules OS notifications |

- **Empty / loading / error states:** no validation (can save with empty meal names, name falls back to "Meal N" display); save failure alert comes from parent ("Could not save routine. Please try again.").
- **Modals / sheets / alerts opened:** "Minimum meals" alert; TimeField native spinner.
- **Back / dismiss behaviour:** X / Android back closes without saving; no confirmation.

---

### Walk Routine modal — `WalkRoutineModal` (+ `WalkCountSelector`, `WalkItem`, selectors)
- **File:** `src/components/Health/Reminders/WalkRoutineModal.jsx`; sub-components `WalkCountSelector.jsx`, `WalkItem.jsx`, `FrequencySelector.jsx`, `CustomDaysSelector.jsx`, `DurationPaceSelector.jsx`, `ReminderSettings.jsx`, `SocialWalkToggle.jsx`, `SocialWalkSettings.jsx`; state hook `src/hooks/useWalkRoutineState.js`; defaults `src/constants/walkRoutineDefaults.js` · **Reached from:** type chooser "Walks" (§3.4) or "Edit Routine" on a Walks card
- **Gating / data needed:** pet; new routine = count step first. Labels mix i18n (`walkRoutine.*`, `walkItem.*`, `socialWalkSettings.*`, `frequencySelector.*`) and hard-coded EN (count sheet, Duration/Pace, Reminder enabled, Time-sensitive, Select Days, social toggle).

| # | Element (EN label) | Type | Source | Action → expected result | Risk |
|---|---|---|---|---|---|
| 5.1 | Count sheet "🚶 Walk Routine — How often does <Pet> usually walk?" | text | `WalkCountSelector.jsx:48-52` | static | |
| 5.2 | X close (count sheet) | button | `WalkCountSelector.jsx:54-66` | close | |
| 5.3 | "Once per day" / "Twice per day" | list item | `WalkCountSelector.jsx:70-93` → `WalkRoutineModal.jsx:45-54` | preloads defaults: 1 = "Walk" 12:00; 2 = "Morning walk" 07:30 + "Evening walk" 18:30 (Every day, 30 min, normal pace, social walk OFF) and opens details | |
| 5.4 | "Custom" | list item | `WalkCountSelector.jsx:95-115` | loads the 2-walk default, opens details | |
| 5.5 | Header "🚶 Create/Edit Walk Routine — Set <Pet>'s walk schedule" + X | text/button | `WalkRoutineModal.jsx:291-309` (X `:297-309`) | X closes without saving | |
| 5.6 | "Walks" list: each **WalkItem** collapsed shows "Walk N", name, "HH:MM · <repeat> · N min", "<pace> pace" | list item | `WalkItem.jsx:95-151` | summary | |
| 5.7 | Trash icon on a WalkItem (collapsed `:115-117` and expanded `:240-242`) | button | `WalkItem.jsx:115,240` → `WalkRoutineModal.jsx:67-115` | If it is the LAST walk: alert **"Delete Walk Routine?" — "This is the last scheduled walk. Deleting it will remove the Walk Routine and stop future walk reminders. Past completed walks will stay in your dog's history."** [Cancel / **Delete routine**] → `onDelete` → soft-deletes the whole routine (`DELETE /api/routines?id=`), modal closes. Otherwise alert **"Delete this walk?" — "This will remove future reminders for this scheduled walk. Past completed walks will stay in your dog's history."** [Cancel / **Delete walk**]. For an **existing routine, confirming immediately saves to the server** with a partial `PUT /api/routines` `{id, walkSchedule}` (no need to press Save), then alert "Walk deleted". For a new unsaved routine it only removes the draft item. Failure: alert "Error — Could not delete. Please try again." | 🗑️ deletes walk / routine (server-side immediately when editing) |
| 5.8 | "Edit walk details ⌄ — Repeat days, pace, social walk, notes" row | button | `WalkItem.jsx:154-198` | expands the walk editor | |
| 5.9 | "Walk name" input | text input | `WalkItem.jsx:270-285` | edits name | |
| 5.10 | "Walk time" TimeField | time picker | `WalkItem.jsx:297-304` | native spinner, 24h | |
| 5.11 | "Repeat": Every day / Weekdays / Weekends / Custom days | radio list | `FrequencySelector.jsx:32` (options `:8-13`) | sets frequency | |
| 5.12 | "Select Days" chips Mon–Sun (Custom days only) | multi-toggle | `CustomDaysSelector.jsx:32` (used `WalkItem.jsx:327-332`) | toggles days | |
| 5.13 | "Duration (min)" numeric input (placeholder 30) | text input | `DurationPaceSelector.jsx:32-37` | `parseInt(text) \|\| 30` — **clearing the field snaps it back to 30** | |
| 5.14 | "Pace": relaxed / normal / active | radio list | `DurationPaceSelector.jsx:62-70` | sets pace | |
| 5.15 | "Reminder enabled" switch | toggle | `ReminderSettings.jsx:37-41` | per-walk reminder on/off (walk with reminder off is not counted as active) | ⚠️ affects notification scheduling |
| 5.16 | "Time-sensitive" switch | toggle | `ReminderSettings.jsx:60-64` | priority flag | |
| 5.17 | "Offer as social walk" switch — "Allow friends or nearby pets to join" | toggle | `SocialWalkToggle.jsx:35-39` | sets `socialWalkEnabled` on the walk and reveals §5.18–5.24. **Only stored inside the routine's walk_schedule JSON; no code path in this screen calls `/api/social-walks` (that is the separate Create Walk screen).** Verify no social walk appears for other users after saving. | 🌍 (flag only — stored, no publish call found) |
| 5.18 | "Social Walk Settings" → "Visibility": "Friends only — Only mutual pet friends can see this walk" / "Nearby pets — Discoverable by pets in your area" | radio list | `SocialWalkSettings.jsx:63-108` | sets `visibility` | 🌍 (stored) |
| 5.19 | "Max pets (including yours)": 2 3 4 5 6 | chips | `SocialWalkSettings.jsx:128-153` | sets `maxPets` | |
| 5.20 | "Meeting area (general)" input (placeholder "e.g., Central Park, Downtown area"; help "Approximate area shown publicly for privacy") | text input | `SocialWalkSettings.jsx:175-189` | edits | 🌍 (stored) |
| 5.21 | "Exact meeting location (private)" input (help "Only shown to approved participants") | text input | `SocialWalkSettings.jsx:225-243` | edits | |
| 5.22 | "Approval required — Review join requests before accepting" switch | toggle | `SocialWalkSettings.jsx:289-294` | `approvalRequired` | |
| 5.23 | "Notes for guests (optional)" input | text input | `SocialWalkSettings.jsx:309-327` | edits | |
| 5.24 | "Calendar" section → **"Add to calendar"** | button | `WalkItem.jsx:423-447` (handler `:76-81`) | `addWalkToCalendar(walk, "your pet")` → calendar permission flow (§0.2) → creates/gets calendar **"PawPi - Walks"** and a new event titled "Busy" at the walk time, 30 min (or the chosen duration); repeating only for "Every day". Alert "Added to calendar". Works on unsaved drafts too; duplicates on repeat taps. | ⚠️ writes to device calendar |
| 5.25 | "Notes" input (placeholder "Route, preferences...") | text input | `WalkItem.jsx:465-483` | edits | |
| 5.26 | "Done editing ⌃" | button | `WalkItem.jsx:487-512` | collapses the walk editor | |
| 5.27 | "+ Add Another Walk" | button | `WalkRoutineModal.jsx:343-368` (handler `:62-65`) | appends a "Walk" at 15:00 | |
| 5.28 | "🔧 Debug: …" yellow box | debug text | `WalkRoutineModal.jsx:371-392` | **Developer debug status text is rendered to users** after delete actions (e.g. "Delete walk pressed (2 walks total)", "Saving to database (routine 12)", "Walk deleted successfully ✓"). Flag if seen in production. | |
| 5.29 | "REMOVE ROUTINE" section: hint "Deleting removes all future walk reminders, but past walk history stays saved." + **"Delete Walk Routine"** button (edit mode only) | button | `WalkRoutineModal.jsx:395-461` (button `:427-458`, handler `:206-227`) | Alert **"Delete Walk Routine?" — "This will remove all future walk reminders. Past completed walks will remain in your dog's history."** [Cancel / **Delete routine**] → `onDelete(id)` (soft delete via store), modal closes, parent shows "Routine deleted" | 🗑️ deletes routine |
| 5.30 | **"Create Routine" / "Save Changes"** (fixed bottom) | button | `WalkRoutineModal.jsx:473-491` (handler `:233-250`) | `onSave` routine (title "Walks", "N walk(s) per day") → `POST/PUT /api/routines`, close, parent alert; schedules local notifications | ⚠️ schedules OS notifications |

- **Empty / loading / error states:** deleting the last walk of an existing routine is the only way to reach an empty list; a routine with no enabled walk disappears from the Routines list. Delete-spinner replaces the delete button while deleting. Errors: "Error — Could not delete. Please try again." / "Could not delete routine. Please try again." / "Could not identify walk to delete".
- **Modals / sheets / alerts opened:** 3 delete confirms (5.7, 5.29); TimeField spinner; calendar permission flow (5.24).
- **Back / dismiss behaviour:** X / Android back closes without saving (no confirm). **Note:** walk deletions on an existing routine are persisted immediately and cannot be undone by closing.

---
### Photo Check Routine modal — `PhotoCheckRoutineModal`
- **File:** `src/components/Health/Reminders/PhotoCheckRoutineModal.jsx` (shell: `src/components/KeyboardSafeFormModal.jsx`) · **Reached from:** type chooser "Photo Check" (§3.5) or "Edit Routine" on a Photo Check card
- **Gating / data needed:** none beyond a pet. **This modal only schedules reminders — it does NOT open the camera, the photo library or any AI/upload service.** (The actual photo capture lives on Health → Track/Photo Check, TRACK2 agent.) Title/CTA/labels are hard-coded EN; subtitle and two alerts are i18n.

| # | Element (EN label) | Type | Source | Action → expected result | Risk |
|---|---|---|---|---|---|
| 6.1 | Header "📸 Create/Edit Photo Check — Visual health monitoring" | text | `PhotoCheckRoutineModal.jsx:357-362` (`health.photoCheck.subtitle`) | static | |
| 6.2 | X (close) | button | `KeyboardSafeFormModal.jsx:106-120` (a11y label "Close") | closes, discards edits | |
| 6.3 | "Body areas  <summary> ▼/▲" collapsible header (summary = up to two labels, else "N selected", else "Select areas") | accordion | `PhotoCheckRoutineModal.jsx:371-402` (summary `:347-354`) | expands/collapses the 8-area multi-select | |
| 6.4 | Area rows: 🐾 Paws, 👂 Ears, 👁️ Eyes, 🦷 Teeth, 🧴 Skin / Fur, 😊 Face, 🔍 Full Body, 📋 Other — each with "Recommended: Weekly / Every 2 weeks / Monthly" | multi-select list | `PhotoCheckRoutineModal.jsx:405-453` (areas `:35-84`, toggle `:242-262`) | toggles area (default selection "Paws"). In "Customize per area" mode a newly ticked area is seeded with its recommended cadence | |
| 6.5 | "Schedule" → "Use same schedule for all selected areas" | radio | `PhotoCheckRoutineModal.jsx:471-490` (handler `:289-299`) | one shared schedule | |
| 6.6 | "Customize per area" | radio | `PhotoCheckRoutineModal.jsx:491-511` | per-area schedule cards (initialised from the shared one) | |
| 6.7 | Shared **ScheduleBlock** (Date, Time, Frequency, Early reminder…) | composite | `PhotoCheckRoutineModal.jsx:521-529` | see §7 | ⚠️ drives notification time |
| 6.8 | "Reminder enabled" switch (shared) | toggle | `PhotoCheckRoutineModal.jsx:558-568` | off ⇒ no reminders for these areas | ⚠️ notification scheduling |
| 6.9 | "Time-sensitive" switch (shared) | toggle | `PhotoCheckRoutineModal.jsx:586-596` | priority flag | |
| 6.10 | "Notes (optional)" input (placeholder "What to look for...") | text input | `PhotoCheckRoutineModal.jsx:610-630` | notes | |
| 6.11 | "Custom Schedules": one card per selected area (icon, name, "<Cadence>[ · days] at HH:MM") header | accordion | `PhotoCheckRoutineModal.jsx:672-711` | expand/collapse | |
| 6.12 | Per-area ScheduleBlock | composite | `PhotoCheckRoutineModal.jsx:724-732` | see §7 | ⚠️ |
| 6.13 | Per-area "Reminder enabled" / "Time-sensitive" switches | toggle | `PhotoCheckRoutineModal.jsx:752-763`, `:782-793` | per area | ⚠️ |
| 6.14 | Per-area "Notes (optional)" input | text input | `PhotoCheckRoutineModal.jsx:807-826` | notes | |
| 6.15 | **"Create Routine" / "Save Changes"** (fixed bottom, blue) | button | `PhotoCheckRoutineModal.jsx:363-365` → `handleSave :301-343` | needs ≥1 area, else alert **"Select at least one photo check area."** Builds one entry per area; routine title "Photo Check", description "Photo check for N area(s)"; `onSave` → `POST/PUT /api/routines`; modal closes; parent toast; schedules local notifications ("📸 Photo Check…") | ⚠️ schedules OS notifications |

- **Empty / loading / error states:** all areas can be unticked (a "Select areas" summary shows and the Schedule section disappears) → Save then blocked by the alert in 6.15.
- **Modals / sheets / alerts opened:** DateField/TimeField native pickers (inside ScheduleBlock).
- **Back / dismiss behaviour:** X / Android back closes without saving.

---

### ScheduleBlock (shared scheduling UI) — `ScheduleBlock`, `CadenceFrequencySelector`, `DayChips`
- **Files:** `src/components/Health/Reminders/ScheduleBlock.jsx`, `CadenceFrequencySelector.jsx`, `DayChips.jsx` · **Reached from:** inside Photo Check (§6), Medical Care medication/supplement items (§8), Wellness Check items (§9)
- **Gating:** none. i18n keys `health.reminders.schedule.*` and `cadenceSelector.*`. Medical Care passes `hideTime` (dose times are edited separately) and a cadence list without "Once / Never".

| # | Element (EN label) | Type | Source | Action → expected result | Risk |
|---|---|---|---|---|---|
| 7.1 | "Date" (DateField) | date picker | `ScheduleBlock.jsx:231-239` (`src/components/DateField.jsx`) | opens inline native calendar; stores YYYY-MM-DD start/anchor date (empty ⇒ anchor = routine creation date) | |
| 7.2 | "Time" (TimeField; hidden when `hideTime`) | time picker | `ScheduleBlock.jsx:243-254` | native spinner, 24h "HH:MM" | |
| 7.3 | "Frequency  <current> ▼/▲" collapsible header | accordion | `ScheduleBlock.jsx:258-289` | toggles the cadence list | |
| 7.4 | Cadence options: Hourly, Daily, Weekly, Every 2 weeks, Monthly, Every 3 months, Every 6 months, Yearly, Custom, Once / Never | radio list | `CadenceFrequencySelector.jsx:83-97` (list `CADENCE_OPTIONS_FULL :48-59`, applied `ScheduleBlock.jsx:223-226`) | selecting collapses the list. Switching to Weekly/Every 2 weeks/Custom with no days seeds the day chips with the current preferred day | |
| 7.5 | Hourly → "Every": 2 / 4 / 6 / 8 / 12 hours pills | chips | `ScheduleBlock.jsx:302-325` | interval hours between occurrences | |
| 7.6 | Weekly / Every 2 weeks / Custom → "On these days" / "Days" chips Mon–Sun (multi-select) | chips | `ScheduleBlock.jsx:328-348`; `DayChips.jsx:44-69` | toggles weekdays. Hint for biweekly: "Repeats every other week, starting the week of the date above." | |
| 7.7 | Monthly / 3 / 6 months / Yearly / Once → hint ("Repeats on that day of the month, starting from the date above." / "Fires once on the date and time above.") | text | `ScheduleBlock.jsx:351-357` | static | |
| 7.8 | "Early reminder": At time · 5 min before · 15 min before · 30 min before · 1 hour before · 1 day before · 1 week before | chips | `ScheduleBlock.jsx:360-372` (options `:40-48`) | the **OS notification fires earlier** than the event (event time − lead); Today also shows a "heads-up" card; push title becomes "<icon> Upcoming: …" with body "Due <day time>" (`src/utils/notifications.js:136-300`) | ⚠️ changes notification time |

- **Empty / loading / error states:** n/a. **Modals:** native date/time pickers. **Back/dismiss:** n/a (embedded).

---

### Medical Care Routine modal (3 steps: list → pick type → item form) — `MedicalCareRoutineModal`
- **File:** `src/components/Health/Reminders/MedicalCareRoutineModal.jsx` · **Reached from:** type chooser "Medical Care" (§3.6) or "Edit Routine" on a Medical Care / legacy Medication / Vaccine / Preventive card
- **Gating / data needed:** none. One routine holds multiple "care items"; items are edited locally and only persisted by the bottom Save. Mostly hard-coded EN; 5 alerts are i18n (`medicalCare.*`).

**8A. List step**

| # | Element (EN label) | Type | Source | Action → expected result | Risk |
|---|---|---|---|---|---|
| 8.1 | Header "💊 Medical Care — Medications, vaccines, preventives, supplements" + X | text/button | `MedicalCareRoutineModal.jsx:251-255` (Header `:481-524`, X `:509-521`) | X closes modal without saving | |
| 8.2 | Yellow notice "⚠️ Follow your veterinarian's instructions for medication, vaccine, and preventive care schedules" | text | `MedicalCareRoutineModal.jsx:261-275` | static (medical disclaimer) | |
| 8.3 | Empty state "No medical care items yet — Add medications, vaccines, preventives, or supplements to keep track of care." | empty state | `MedicalCareRoutineModal.jsx:277-312` | when no items | |
| 8.4 | Item row: icon, name (or type label), "<Type> · <dose · times / Next due … / Monthly…>" | list item | `MedicalCareRoutineModal.jsx:529-570` (subtitle `:603-629`) | display | |
| 8.5 | Pencil icon on an item | button | `MedicalCareRoutineModal.jsx:571-584` | opens item form (8C) pre-filled | |
| 8.6 | Trash icon on an item | button | `MedicalCareRoutineModal.jsx:585-598` (handler `:201-214`) | Alert **"Delete care item?" — "This will remove this item from the Medical Care routine."** [Cancel / **Delete**] → removes from the draft only (persisted when you Save) | 🗑️ removes item (draft) |
| 8.7 | "+ Add care item" (dashed) | button | `MedicalCareRoutineModal.jsx:326-351` | goes to type picker (8B) | |
| 8.8 | **"Create Routine" / "Save Changes"** (disabled & greyed when 0 items) | button | `MedicalCareRoutineModal.jsx:363-382` (handler `:227-244`) | if 0 items alert "No care items — Add at least one care item before saving."; else `onSave` (title "Medical Care", "N care item(s)") → `POST/PUT /api/routines`, close, toast; schedules local notifications for dose times / due dates | ⚠️ schedules OS notifications |

**8B. "Add care item" type sheet** (bottom sheet; Android back returns to list)

| # | Element | Type | Source | Action → result | Risk |
|---|---|---|---|---|---|
| 8.9 | Header "Add care item — What type of care do you want to add?" + X | text/button | `MedicalCareRoutineModal.jsx:408-413` | X returns to the list | |
| 8.10 | Options: 💊 Medication · 💉 Vaccine · 🛡️ Flea / tick prevention · 🪱 Deworming · 🫀 Heartworm prevention · 🧪 Supplement · 📋 Other | list item | `MedicalCareRoutineModal.jsx:416-454` (options `:47-75`) | opens a blank item form of that type (8C) | |

**8C. Item form ("Care item details")** — fields depend on type

| # | Element (EN label) | Type | Source | Action → expected result | Risk |
|---|---|---|---|---|---|
| 8.11 | Header "<icon> <Type> — Care item details" + X | text/button | `MedicalCareRoutineModal.jsx:661-665` | X = cancel, back to list (draft discarded) | |
| 8.12 | Yellow safety note (per type): "Follow your veterinarian's instructions for medication dose and schedule." / "…vaccination schedule." / "…preventive care products and schedules." | text | `MedicalCareRoutineModal.jsx:673-691` | static | |
| 8.13 | Name input — label "Medication name" / "Vaccine name" / "Supplement name" / "Care name" / "Product / treatment name" (placeholders "e.g., Apoquel", "e.g., Rabies vaccine", "e.g., Omega 3", "e.g., Ear cleaning", "e.g., Bravecto") | text input (required) | `MedicalCareRoutineModal.jsx:694-719` | required | |
| 8.14 | Medication: "Dose" input ("e.g., 1 tablet") | text input | `MedicalCareRoutineModal.jsx:724-729` | | |
| 8.15 | Medication & Supplement: ScheduleBlock (Date / Frequency / days / interval / Early reminder; time hidden) | composite | `MedicalCareRoutineModal.jsx:734-741` (medication), `:863-870` (supplement) | see §7 (no "Once / Never") | ⚠️ |
| 8.16 | "Time(s)" TimeField(s) per dose; trash icon per extra time; "+ Add another time" (Hourly → single "Start time") | time pickers | `DoseTimes :1172-1251` (TimeField `:1203`, trash `:1213-1226`, add `:1229-1248`) | each time = a separate daily dose reminder | ⚠️ |
| 8.17 | Medication: "End date (optional)" DateField | date picker | `MedicalCareRoutineModal.jsx:747-753` | bounds the course (no reminders after) | |
| 8.18 | Medication/Supplement: "Instructions (optional)" ("e.g., Give with food") | text input | `MedicalCareRoutineModal.jsx:755-761`, `:917-923` | | |
| 8.19 | Vaccine: "Last given date (optional)", "Next due date" DateFields | date pickers | `MedicalCareRoutineModal.jsx:768-782` | | |
| 8.20 | Vaccine: "Vet clinic (optional)" ("Veterinarian or clinic name") | text input | `MedicalCareRoutineModal.jsx:784-789` | | |
| 8.21 | Vaccine: "Reminder timing": On due date · 1 week before · 2 weeks before · 1 month before | radio | `MedicalCareRoutineModal.jsx:791-806` | sets how early the reminder fires (default 1 week) | ⚠️ |
| 8.22 | Flea/tick, Deworming, Heartworm: "Last given date" | date picker | `MedicalCareRoutineModal.jsx:815-821` | | |
| 8.23 | Preventives: "Repeat interval": Monthly · Every 3 months · Every 6 months · Yearly · Custom | radio | `MedicalCareRoutineModal.jsx:823-839` | | ⚠️ |
| 8.24 | Preventives: "Next due date" | date picker | `MedicalCareRoutineModal.jsx:841-847` | | |
| 8.25 | Supplement: "Amount / dose" ("e.g., 1 chew") | text input | `MedicalCareRoutineModal.jsx:854-859` | | |
| 8.26 | Supplement: "When to give": "Linked to meal" / "Custom time" segments; with Linked: With breakfast · With dinner · With meal · Custom time | segmented/radio | `MedicalCareRoutineModal.jsx:872-915` | choosing "Custom time" flips to the time list | |
| 8.27 | Other: "Description" ("What kind of care is this?"); "Frequency" Daily · Weekly · Monthly · One time · Custom; "Date" and "Time" pickers | inputs | `MedicalCareRoutineModal.jsx:930-970` | | ⚠️ |
| 8.28 | "Reminder enabled" switch, "Time-sensitive" switch (all types) | toggle | `MedicalCareRoutineModal.jsx:985-997` (ToggleRow `:1253-1273`) | per item | ⚠️ |
| 8.29 | "Notes (optional)" ("Additional notes...") | text input | `MedicalCareRoutineModal.jsx:1000-1006` | | |
| 8.30 | "Cancel" | button | `MedicalCareRoutineModal.jsx:1020-1035` | back to list, draft discarded | |
| 8.31 | **"Save item"** | button | `MedicalCareRoutineModal.jsx:1036-1049` (handler `:646-652`) | blank name → alert **"Name required — Please enter a name for this care item."**; else adds/updates the item in the list (not yet persisted) | |

- **Empty / loading / error states:** see 8.3; save errors come from parent toast ("Could not save routine. Please try again.").
- **Modals / sheets / alerts opened:** delete-item alert, type sheet, item form, native pickers.
- **Back / dismiss behaviour:** X on list closes everything; X on the type sheet / item form steps back to the list; nothing is saved until the bottom "Create Routine / Save Changes".

---

### Wellness Check Routine modal — `WellnessCheckRoutineModal`
- **File:** `src/components/Health/Reminders/WellnessCheckRoutineModal.jsx` · **Reached from:** type chooser "Wellness Check" (§3.7) or "Edit Routine" on a Wellness / legacy General/Weight check card
- **Gating / data needed:** none. Mostly hard-coded EN; alerts i18n (`wellnessCheck.*`, `routines.*`).

| # | Element (EN label) | Type | Source | Action → expected result | Risk |
|---|---|---|---|---|---|
| 9.1 | Header "⚖️ Create/Edit Wellness Check — Track health changes over time" + X | text/button | `WellnessCheckRoutineModal.jsx:562-580` | X closes without saving | |
| 9.2 | Empty state "No wellness checks yet — Add weight, body condition, mobility, mood, or general checks to keep track of changes." | empty state | `WellnessCheckRoutineModal.jsx:587-622` | | |
| 9.3 | "Check Items — Tap to expand" item card header (icon, label, "HH:MM • <cadence>") | accordion | `WellnessCheckRoutineModal.jsx:664-720` | expand/collapse | |
| 9.4 | Trash on an item | button | `WellnessCheckRoutineModal.jsx:708-713` (handler `:321-473`) | **Not last item:** Alert "Remove this check? — This will stop future reminders for this check. Past wellness history will stay saved." [Cancel / **Remove check**] → when editing an existing routine it **immediately saves**: `PUT /api/routines` `{id, wellnessCheckSchedule}` and also calls parent `onSave` (second PUT + reschedule), alert "Check removed" (failure: "Could not remove check. Please try again."). Because the parent's save handler also runs, expect a second alert "Routine saved" and the modal closes itself afterwards (`RoutinesTab.jsx:204-225`). **Last item of an existing routine:** Alert "Delete Wellness Check Routine? — This is the last wellness check. Deleting it will remove future wellness reminders. Past wellness history will stay saved." [Cancel / **Delete routine**] → `deleteRoutine` store action (soft delete `DELETE /api/routines?id=`), toast "Routine deleted", modal closes (these two alerts are hard-coded EN). **Last item of a new unsaved routine:** silently clears the list. | 🗑️ deletes check / routine (server-side immediately when editing) |
| 9.5 | "Check Name" input (Custom check only; placeholder "e.g., Allergy check") | text input | `WellnessCheckRoutineModal.jsx:726-755` | required for Custom | |
| 9.6 | ScheduleBlock (Date, Time, Frequency, Early reminder) per item | composite | `WellnessCheckRoutineModal.jsx:759-767` | see §7 | ⚠️ |
| 9.7 | "Unit": kg / lbs (Weight check only) | segmented | `WellnessCheckRoutineModal.jsx:770-834` | | |
| 9.8 | "Reminder enabled" / "Time-sensitive" switches | toggle | `WellnessCheckRoutineModal.jsx:862-878`, `:896-912` | | ⚠️ |
| 9.9 | "Notes (optional)" (placeholder "What to look for...") | text input | `WellnessCheckRoutineModal.jsx:927-945` | | |
| 9.10 | "+ Add check item" (dashed) | button | `WellnessCheckRoutineModal.jsx:955-983` | opens the in-modal type picker (9.11) | |
| 9.11 | Overlay "Add check item — Choose what you want to track." rows: ✅ General check · ⚖️ Weight · 🫀 Body condition · 🚶 Mobility · 😊 Mood / Energy · 🧴 Skin / Coat · 💧 Appetite / Hydration · 📋 Custom; "Cancel" | list item/button | `WellnessCheckRoutineModal.jsx:1016-1113` (rows `:1064-1090`, Cancel `:1093-1110`; handler `:227-288`) | adds an item (weekly, Sunday 09:00, start today, reminder on, time-sensitive off) and expands it. Duplicate non-custom type → alert "Already Added — You already added this check.\nYou can edit its schedule or delete it first." | |
| 9.12 | **"Create Routine" / "Save Changes"** | button | `WellnessCheckRoutineModal.jsx:1000-1012` (handler `:475-519`) | no items → alert "No Items — Add at least one wellness check item."; custom without name → "Missing Name — Please enter a name for your custom check."; else `onSave` (title "Wellness Check") → `POST/PUT /api/routines`, close, toast; schedules notifications | ⚠️ schedules OS notifications |

- **Empty / loading / error states:** 9.2; inline error text state exists (`error`, set only on an exception while adding an item).
- **Modals / sheets / alerts opened:** type picker overlay, remove/delete alerts, native pickers. This modal is a full-screen non-transparent `Modal`.
- **Back / dismiss behaviour:** X / Android back closes without saving. Note a removal on an existing routine is persisted immediately.
- **Code-read watch-point (verify on device, not confirmed):** when editing, the modal reloads items from the list-shape `wellnessCheckItems` (`WellnessCheckRoutineModal.jsx:152-190`) reading `item.customName` and `item.weightUnit`, whereas the saved entries use the keys `name` and `unit` (`toWellnessScheduleEntry :78-99`). A Custom check's name and a Weight check's unit may therefore come back blank / default ("lbs") on re-edit — test: create a Custom check "Allergy check" and a Weight check in kg, save, reopen.

---
### Vet Appointments manager modal — `VetAppointmentRoutineModal`
- **File:** `src/components/Health/Reminders/VetAppointmentRoutineModal.jsx` · **Reached from:** type chooser "Vet Appointment" (§3.8). (There is no "Edit Routine" path to it: vet appointments are not routines and never show as cards in §2.)
- **Gating / data needed:** an active pet (`currentPet.id`). It is a self-contained manager: list of the pet's appointments + create/edit form. Backed by `GET/POST/PUT/DELETE /api/vet-appointments` (+ `?petId=` / `?id=`), **not** `/api/routines`; it never calls the parent `onSave`, so no "Routine created" toast. The same appointments feed Health → Vet Record / Today's countdown (`hooks/useVetAppointmentReminders.js` builds in-app reminders from them; I found no local-notification scheduling call in that hook). Headings/labels are mostly hard-coded EN; alerts and some placeholders are i18n (`health.reminders.vetAppt.*`).

| # | Element (EN label) | Type | Source | Action → expected result | Risk |
|---|---|---|---|---|---|
| 10.1 | Header "🩺 Vet Appointments — Manage upcoming vet visits" + X | text/button | `VetAppointmentRoutineModal.jsx:456-474` | X = close modal (same as bottom Close) | |
| 10.2 | Loading spinner | loading state | `VetAppointmentRoutineModal.jsx:481-485` | while `GET /api/vet-appointments?petId=` loads (`:87-98`) | |
| 10.3 | Empty state "🩺 No vet appointments yet — Add upcoming visits so PawPi can remind you and keep your dog's health history organized." | empty state | `VetAppointmentRoutineModal.jsx:926-962` | | |
| 10.4 | "Upcoming Appointments" list; card header (icon, title, "<date> • <time>", "📍 clinic") tap to expand ⌃/⌄ | accordion | `VetAppointmentRoutineModal.jsx:965-1078` | expands details: Veterinarian, Reason, Notes, Reminder (timing label or Enabled/Disabled) | |
| 10.5 | **"Edit"** (green) on an expanded appointment | button | `VetAppointmentRoutineModal.jsx:1178-1197` (handler `:293-309`) | loads it into the form below ("Edit Appointment") | |
| 10.6 | **"Delete"** (red) on an expanded appointment | button | `VetAppointmentRoutineModal.jsx:1198-1230` (handler `:366-414`, mutation `:235-267`) | Alert "Delete appointment?" — if it has a phone-calendar event: "Also remove this from your phone calendar?" with [Cancel / **Delete appointment only** / **Delete appointment and calendar event** (destructive)]; otherwise "This will remove the appointment reminder. Past vet history will stay saved." [Cancel / **Delete appointment**]. Confirm → `DELETE /api/vet-appointments?id=<id>` (soft delete + status cancelled), optionally `Calendar.deleteEventAsync`; alert "Deleted — Appointment removed". **If the appointment is linked to a provider booking (`provider_id`), the server notifies that provider's team ("cancel")** (`web/src/app/api/vet-appointments/route.js:396-423`) | 🗑️ deletes appointment · 📤 notifies provider team if booked via a provider · ⚠️ may delete calendar event |
| 10.7 | "+ Add appointment" (dashed) | button | `VetAppointmentRoutineModal.jsx:1241-1266` (handler `:286-291`) | opens a blank "New Appointment" form (list hides while the form is open) | |
| 10.8 | Form title "New Appointment" / "Edit Appointment" | text | `VetAppointmentRoutineModal.jsx:507-510` | | |
| 10.9 | "Appointment Title *" input (placeholder "e.g., Annual Checkup") | text input (required) | `VetAppointmentRoutineModal.jsx:523-538` | required | |
| 10.10 | "Date *" (DateField, inline calendar) | date picker (required) | `VetAppointmentRoutineModal.jsx:553-565` | required; stored YYYY-MM-DD | |
| 10.11 | "Time *" (TimeField, default 10:00) | time picker | `VetAppointmentRoutineModal.jsx:578-590` | | |
| 10.12 | "Clinic (optional)" ("Clinic name") | text input | `VetAppointmentRoutineModal.jsx:605-620` | | |
| 10.13 | "Veterinarian (optional)" ("Dr. name") | text input | `VetAppointmentRoutineModal.jsx:633-648` | | |
| 10.14 | "Reason for Visit (optional)" ("e.g., Annual checkup") | text input | `VetAppointmentRoutineModal.jsx:661-680` | | |
| 10.15 | "Notes (optional)" ("Additional notes...") | text input | `VetAppointmentRoutineModal.jsx:693-712` | | |
| 10.16 | "Reminder Timing": At time of appointment · 1 hour before · 1 day before (default) · 2 days before · 1 week before · Custom | radio | `VetAppointmentRoutineModal.jsx:727-765` (options `:40-47`) | sets reminder lead (note: "Custom" has no extra input in this modal) | ⚠️ |
| 10.17 | "Reminder enabled" switch | toggle | `VetAppointmentRoutineModal.jsx:794-804` | | ⚠️ |
| 10.18 | "Time-sensitive" switch | toggle | `VetAppointmentRoutineModal.jsx:823-833` | | |
| 10.19 | **"Add to phone calendar"** switch | toggle | `VetAppointmentRoutineModal.jsx:851-863` | when ON and you press Create/Update: calendar permission flow (§0.2), creates calendar **"PawPi - Vet Appointments"** and an event titled "Vet appointment for <Pet>" (30 min, location = clinic, notes include pet name, appointment title, reason, veterinarian, notes, "Managed by PawPi"). Turning it OFF when editing an appointment that already has an event **deletes that calendar event**. If permission denied: alert "Calendar Permission — Calendar access is needed to add this appointment. You can still save the reminder."; if unavailable: "Calendar Unavailable — Could not add to calendar, but the appointment will still be saved." | ⚠️ writes/deletes device calendar events |
| 10.20 | Form "Cancel" | button | `VetAppointmentRoutineModal.jsx:869-891` | discards form, back to the list | |
| 10.21 | Form **"Create" / "Update"** | button | `VetAppointmentRoutineModal.jsx:892-918` (validation `:323-340`, create mutation `:108-160`, update `:163-232`) | validation alerts ("Validation Error": "Appointment title is required" / "Date is required" / "Please select a valid date" / "Please select a time"). Create = (optional calendar event) then `POST /api/vet-appointments`; Update = `PUT /api/vet-appointments` (id + all fields). Success alert "Success — Appointment created / Appointment updated"; error alert "Error — Could not create/update appointment". **On Update of a provider-booked appointment the server pings the provider team ("reschedule")** (`web .../route.js:325-348`) since date/time are always sent. | ⚠️ calendar write · 📤 notifies provider team (provider-booked appts only) |
| 10.22 | Fixed bottom "Close" | button | `VetAppointmentRoutineModal.jsx:1287-1299` | `onClose` | |

- **Empty / loading / error states:** 10.2, 10.3; server error text (`error.error`) from the API is shown verbatim in the "Error" alert when present — a possible place for raw/English server text to leak.
- **Modals / sheets / alerts opened:** delete confirm (10.6), validation/success/error alerts, calendar permission flow, native date/time pickers. Full-screen `Modal` (non-transparent).
- **Back / dismiss behaviour:** Close / X / Android back closes the modal; an open form is discarded without confirmation.

---

### Settings tab (Reminder Settings) — `SettingsTab`
- **File:** `src/components/Health/Reminders/SettingsTab.jsx` · **Reached from:** "Settings" tab of §1
- **Gating / data needed:** none. Strings via `t("reminderSettings.*", default)` (keys exist in en.json). **The three preference switches are local UI state only** (`SettingsTab.jsx:37-41`): they are not persisted, not read by any scheduler and reset when the tab is re-opened — toggling them has no real effect (tester should expect no behaviour change).

| # | Element (EN label) | Type | Source | Action → expected result | Risk |
|---|---|---|---|---|---|
| 11.1 | Header "Reminder Settings — Customize how you receive reminders" | text | `SettingsTab.jsx:284,287` | | |
| 11.2 | Status card: green "Notifications Enabled — You'll receive reminders for your pet's care routine" or red "Notifications Disabled — Enable notifications to receive reminders" (reads OS permission on open) | status | `SettingsTab.jsx:199-270`, check `:44-51` | reflects `Notifications.getPermissionsAsync()`; not shown until the check returns | |
| 11.3 | **"Enable"** button (only when permission not granted) | button | `SettingsTab.jsx:254-266` (handler `:53-94`) | triggers the iOS notification permission prompt (first time only). Granted → alert "✅ Notifications Enabled — PawPi can now remind you about feeding, walks, medication, and photo checks so your pet's care routine stays on track." Denied/blocked → alert "Permission Needed — To receive reminders, please enable notifications in your device settings." [Maybe Later / **Open Settings** → iOS Settings app (`Notifications.openSettingsAsync`, iOS only)] | ⚠️ OS permission prompt / opens iOS Settings |
| 11.4 | "Send test notification (10s)" dark button | button | `SettingsTab.jsx:295-310` (handler `:104-135`) | **Only rendered in development builds (`__DEV__`) — should NOT appear in the live App Store/TestFlight build.** If seen in production, report it. When present: schedules a local notification "🔔 Test notification" in ~10 s; alert "Test scheduled…" | ⚠️ schedules a notification (dev only) |
| 11.5 | Blue card "How reminders work — PawPi can remind you about feeding, walks, medication, and photo checks so your pet's care routine stays on track. Routines you create automatically generate reminders." | text | `SettingsTab.jsx:313-339` | | |
| 11.6 | "PREFERENCES" → "Push Notifications — Receive notifications for reminders" switch (default ON) | toggle | `SettingsTab.jsx:355-362` | local state only — no effect | |
| 11.7 | "Time-Sensitive Alerts — Show prominent countdown for urgent reminders" switch (default ON) | toggle | `SettingsTab.jsx:364-374` | local state only — no effect | |
| 11.8 | "Sound & Vibration — Play sound and vibrate for reminders" switch (default ON) | toggle | `SettingsTab.jsx:376-383` | local state only — no effect | |
| 11.9 | Quiet Hours switch + "Configure Quiet Hours" row | toggle/button | `SettingsTab.jsx:385-430` (hidden by `SHOW_QUIET_HOURS = false`, `:40`) | **Hidden** — should not be visible; if visible it only shows a "coming soon" alert | |
| 11.10 | "SNOOZE" → "Default Snooze Duration — 10 minutes, 30 minutes, 1 hour, Tonight, Tomorrow" | static text | `SettingsTab.jsx:432-473` | informational only, not tappable | |
| 11.11 | Tip card "💡 Time-sensitive reminders will show countdown cards and appear at the top of your notifications" | text | `SettingsTab.jsx:476-499` | | |

- **Empty / loading / error states:** status card is absent until the permission check resolves; no error state.
- **Modals / sheets / alerts opened:** the permission alerts above.
- **Back / dismiss behaviour:** switch to the Routines tab or ← back.

---

### Present in the code but NOT reachable in the current UI (do not expect to see these)
Verified by grep: nothing imports/renders these on any reachable path.
| Component | File | Why unreachable | Notes |
|---|---|---|---|
| Medication / Preventive Care / Vaccine routine modals (legacy) | `src/components/Health/Reminders/MedicationRoutineModal.jsx`, `PreventiveCareRoutineModal.jsx`, `VaccineRoutineModal.jsx` | Mounted by `RoutinesTab.jsx:467-486`, but `handleEdit` remaps legacy types to Medical Care (`RoutinesTab.jsx:149-161`) and the type chooser does not offer them, so `selectedType` never equals medication/preventive/vaccine | Fields (for reference): Medication (name, dose, frequency, start/end dates, prescribed by, instructions, Reminder enabled/Time-sensitive, `MedicationRoutineModal.jsx:186-461`), Preventive (product, treatment type, last given/next due, repeat interval `:156-373`), Vaccine (name, last given/next due, vet clinic `:149-294`). |
| `UpcomingTab` (reminder inbox with Done ✓ / trash / Snooze) and `HealthReminders` wrapper | `src/components/Health/Reminders/UpcomingTab.jsx`, `src/components/Health/HealthReminders.jsx` | `health.jsx:8` says HealthReminders was removed; no importer remains; `reminders.jsx` only has Routines + Settings tabs | If ever shown: Done ✓ → `completeReminder`, trash → alert "Delete Reminder" (`UpcomingTab.jsx:226,239`), Snooze → SnoozeModal → local snooze (no API). |
| `ReminderCreationModal` (one-off reminder form) | `src/components/Health/Reminders/ReminderCreationModal.jsx` | no importer | would add a local reminder only |
| `DeleteConfirmationModal` | `src/components/Health/Reminders/DeleteConfirmationModal.jsx` | no importer (routine delete uses `Alert.alert` in `RoutineCard.jsx:37-50`) | generic title/message + "Delete"/"Cancel" |

(`CountdownCard`, `HeadsUpReminderCard`, `SnoozeModal`, `MedicalCareIssueModal` in the same folder belong to the TODAY agent.)

---

## 13. Code-read watch-points for the tester (things that look odd; verify on device)
1. **Walk delete persists immediately** (`WalkRoutineModal.jsx:134`) and **wellness "remove check" persists immediately** (`WellnessCheckRoutineModal.jsx:393`) — closing the modal afterwards does not undo it.
2. **"🔧 Debug: …" text box is visible to users** in the Walk modal after delete actions (`WalkRoutineModal.jsx:371-392`).
3. **Settings switches do nothing** (§11) and the dev "Send test notification" button must not exist in the live build.
4. **Modal closes before save result**: all routine modals call `onSave(...)` then `onClose()` synchronously, so a failed save shows the error alert after the form is gone and the user's input is lost.
5. **Custom wellness name / weight unit may not survive re-edit** (see §9 note).
6. **Calendar duplicates**: "Add to calendar" for walks creates a new event on every tap; walk events for weekdays/weekends/custom are one-off, only "Every day" repeats (`src/utils/calendarFormat.js:28-54`).
7. **Calendar rationale says "walk blocks"** even when triggered by a vet appointment (`calendarIntegration.js:54-56`).
8. Notification permission is asked at **app launch**, not when creating the first routine; if the user declined, routines save normally but **no local notifications are scheduled** (silent), and the only recovery path is Settings tab → "Enable" / iOS Settings.
9. Each routine pre-schedules **14 days** of local notifications (`reminderGenerator.js:78`); editing or toggling a routine cancels and re-creates them; iOS caps pending local notifications at 64, so many routines may not all schedule.

---


---
## Risky actions found in Part C

### Health hub shell + Today
- `src/components/Pets/AddDogModal.jsx:108-156` — Save creates a real pet (`POST /api/pets`) and uploads the avatar (`POST /api/upload`); avatar may be publicly visible, and the new pet becomes the active pet.
- `src/components/Health/CareRingCard.jsx:156` (handler `65-74`) — "Undo" after a quick check calls `DELETE /api/health/general-checks?id=<id>`; deletes the just-saved health record.
- `src/components/Health/GeneralCheck/GeneralCheckModal.jsx:613-662` — Quick Check "Take photo"/"Choose photo" uploads a medical photo to private storage (`POST /api/upload`, visibility private); triggers camera / photo-library permission prompts. No AI call here.
- `src/components/Health/GeneralCheck/GeneralCheckModal.jsx:788-804` — Quick Check Save writes a health record (`POST /api/health/general-checks`); also fills the Care Ring.
- `src/components/Health/PackStreaksCard.jsx:122-129` — "Start" sends a pack-streak invite to another real user by @handle (`POST /api/pets/{id}/pack-streaks`, action "request").
- `src/components/Health/PackStreaksCard.jsx:73-82` — "Boop" sends a nudge notification to a friend (`POST …/pack-streaks`, action "boop").
- `src/components/Health/PackStreaksCard.jsx:85-97` — "Accept" confirms a pack with another real user (`POST …/pack-streaks`, action "accept").
- `src/components/Health/LeaderboardCard.jsx:66-82` — "Opt in" stores a coarse neighbourhood/area string server-side to match nearby dogs (`POST /api/pets/{id}/leaderboard`, action "set_area"); boards show other users' dog names.
- `src/components/Health/WalkActivity/WalkCountdownCard.jsx:159-188` — "Add to calendar" writes an event to the device calendar (calendar permission; may sync to iCloud/Google).
- `src/components/Health/VetAppointmentDetailModal.jsx:370-396` — "Delete appointment" → `DELETE /api/vet-appointments?id=<id>` (destructive confirm dialog exists).
- `src/components/Health/VetAppointmentDetailModal.jsx:339-365` — "Confirm & mark completed" → `PUT /api/vet-appointments` status "completed"; also adds an entry to the vet record.
- `src/components/Providers/WriteReviewModal.jsx:168-184` — "Submit review" → `POST /api/providers/{providerId}/reviews`; publicly visible provider review.
- `src/components/Health/HealthToday.jsx:634-652, 757-775, 961-978` — reminder action buttons (Overdue / Snoozed / Next Up) write logs: `POST /api/health/medical-care-logs`, `POST /api/health/food-logs`; other types silently tick the reminder complete with no log.
- `src/components/Health/HealthToday.jsx:653-671, 776-794` — "Skip" is a durable dismissal (`POST /api/health/reminder-dismissals`) with no confirm and no undo.
- `src/components/Health/Reminders/MedicalCareIssueModal.jsx:183-197` — "Save issue" writes a medical-care record (`POST /api/health/medical-care-logs`, status issue_reported).
- `src/components/Health/FeedingIssueModal.jsx:393-406` and `src/components/Health/FeedingCountdownCard.jsx:198-221` — write food logs (`POST /api/health/food-logs`); possible duplicate-log/second-dialog after "Log as usual" (see Feeding countdown card row 3).
- `src/components/Health/Reminders/HeadsUpReminderCard.jsx:75-95` — "Close" writes a dismissal (`{id}::early`) via `POST /api/health/reminder-dismissals` (harmless, but persists).
- `src/components/Health/Reminders/SnoozeModal.jsx:124` — snooze cancels/reschedules a local device notification (no prompt).

### Track (loggers, Quick Check, Medications)
- `src/components/Health/FoodWater/FoodWaterTrackerModal.jsx:386-429` — "Same as usual" one-tap food log — immediately `POST /api/health/food-logs` with hard-coded "Regular dog food"/"1 cup" and no confirmation; fills the Care Ring on a production account; no undo in this UI.
- `src/components/Health/FoodWater/FoodWaterTrackerModal.jsx:778-805` and `:1036-1063` — "Log Food Entry" / "Log Water Intake" — `POST /api/health/food-logs` — permanent health record on the real pet.
- `src/components/Health/Pee/PeeTrackerModal.jsx:420-454` — "Same as usual" one-tap pee log — `POST /api/health/pee-logs`, no confirmation.
- `src/components/Health/Pee/PeeTrackerModal.jsx:926-945` — "Log Pee Entry" — `POST /api/health/pee-logs`.
- `src/components/Health/Poo/PooTrackerModal.jsx:403-441` — "Same as usual" one-tap poo log — `POST /api/health/poo-logs`, no confirmation.
- `src/components/Health/Poo/PooTrackerModal.jsx:985-1008` — "Log Poo Entry" — `POST /api/upload` (private, only if a photo was chosen) then `POST /api/health/poo-logs`.
- `src/components/Health/Poo/PooTrackerModal.jsx:899-945` — "Take Photo" / "Choose Photo" — camera / photo-library permission prompts; the image is uploaded to PawPi's private bucket on submit.
- `src/components/Health/Vomit/VomitTrackerModal.jsx:495-528` — "Vomited once" one-tap vomit log — `POST /api/health/vomit-logs`, no confirmation.
- `src/components/Health/Vomit/VomitTrackerModal.jsx:229-235,172-227` — "Add photo" (Take Photo / Choose from Library) — camera/library prompts; uploads the photo immediately (`POST /api/upload`, private, pet-scoped) even if the log is never saved.
- `src/components/Health/Vomit/VomitTrackerModal.jsx:998-1017` — "Log Digestive Event" — `POST /api/health/vomit-logs`.
- `src/components/Health/GeneralCheck/GeneralCheckModal.jsx:1205-1264` and `:612-663` — Quick Check "Take photo"/"Choose photo" — camera/library prompts; immediate private upload `POST /api/upload` (medical body-area photos).
- `src/components/Health/GeneralCheck/GeneralCheckModal.jsx:1474-1502` and `:789-805` — Quick Check "Complete" / "Save" — `POST /api/health/general-checks`; wizard allows saving an empty check with zero areas assessed.
- `src/components/Health/Medication/MedicationModal.jsx:163-180,396-401` — "Delete" on a medication / vaccine / preventive card — `DELETE /api/health/medications?id=`, `DELETE /api/pet-vaccinations?id=`, `DELETE /api/health/preventive-treatments?id=` — permanent ("This can't be undone."). Deleting a vaccine here removes it from the Vet Record too.
- `src/components/Health/Medication/MedicationModal.jsx:431-437` — "Save" (add/edit) — `POST`/`PATCH` on the three endpoints above; failure alert can expose raw server error text.
- `src/components/Health/Medication/MedicationModal.jsx:611-617` — "Mark as completed" — `PATCH /api/health/medications` status=completed (moves the medication to Past).
- `src/components/Health/Medication/MedicationModal.jsx:112-132` — "Enable reminders" switch — stores `reminder_enabled` on the record only; no OS notification is scheduled from this modal (QA should not expect a push/permission prompt here).
- `src/components/Health/HealthTrack.jsx:95-101` — "Photo Check" tile — opens the TRACK2-owned picker/capture flow (`POST /api/health/photo-checks`, private photo upload); listed here only because it is launched from this screen.

### Weight / Wellness / Walk / Photo Check / Vet Summary / Insights
- `src/components/Health/Weight/WeightModal.jsx:660` — trash icon on a weight-history row → Alert → DELETE `/api/health/weight-logs?id=<id>` — 🗑️ permanently deletes a weigh-in (affects vet summary and trends); confirm dialog "Delete this entry?" is the only guard.
- `src/components/Health/VetSummary/VetSummaryModal.jsx:265` (handler `:85-92`) — "Share with vet" → native iOS share sheet with an English plain-text export of the pet's name/breed, logs, weight, meds, conditions, allergies and typed questions — ⚠️ 📤 data leaves the app to whatever app/contact the tester picks (Messages, Mail, AirDrop…); do not send to a real contact during QA.
- `src/components/Health/PhotoCheck/PhotoCheckCaptureModal.jsx:810` — "Save Photo Check" → uploads the photo to private storage via POST `/api/upload` (`visibility:"private"`, `petId`) then POST `/api/health/photo-checks` — ⚠️ medical-type photo is uploaded; it is private (auth-gated streamer), not posted to any feed, and is not sent to any AI service in this code.
- `src/components/Health/PhotoCheck/PhotoCheckCaptureModal.jsx:609` — "Save Note Only" (no photo) — not dangerous but expected to FAIL: client sends `imageUrl:""` to POST `/api/health/photo-checks`, server returns 400 "petId, bodyArea, and imageUrl are required" and the Alert shows that raw technical text (`PhotoCheckCaptureModal.jsx:303-306`).
- `src/app/walker-walks.jsx:492` (Start) and `:272` (Scan → redeem) — walker starts a session and streams the device's GPS every ~5 s via PATCH `/api/providers/{id}/walk-sessions/{sessionId}` `{action:"track", points}`; also POST `/api/providers/{id}/pets/{petId}/walk-sessions` — ⚠️ 📤 shares live location with the pet's owner (visible in `walk-live`); the scan additionally 💸 consumes a customer's prepaid walk credit. Location + camera permission prompts. Walker-only, needs a walking provider account.
- `src/app/walker-walks.jsx:181-201` (Finish Walk) — PATCH `{action:"finish", duration_s, notes}` — 📤 writes a walk report into the pet's health timeline and shows it to the owner.
- `src/app/walker-walks.jsx:203-206` — Cancel Walk after starting — ⚠️ stops GPS locally but makes no API call, so the server session is not finished.
- `src/app/walker-walks.jsx:560` — "Accept" on an incoming/nearby walk request — 📤 creates a confirmed booking and opens a chat with the real owner.
- `src/components/Health/WalkActivity/StartWalkModal.jsx:145-148` — "Cancel Walk" (destructive) — 🗑️ discards the running timer and the walk with no log (local data only).
- `src/components/Health/WalkActivity/PostWalkFeedbackModal.jsx:196` — X on the feedback sheet closes without confirmation and discards the finished walk (nothing logged) — ⚠️ silent data loss (not a server delete).
- `src/components/Health/WalkActivity/WalkActivityModal.jsx:201` — "Start walk" shows "Walk started! Have fun!" but starts no tracking and writes nothing — not risky, but a misleading success message to verify and report.
- `src/components/Health/Weight/WeightModal.jsx:572`, `src/components/Health/WellnessCheck/WellnessLogModal.jsx:329`, `src/components/Health/WalkActivity/WalkActivityModal.jsx:636`, `PostWalkFeedbackModal.jsx:281/676` — Save buttons that write real health logs to the test pet's record (POST `/api/health/weight-logs`, `/api/health/wellness-logs`, `/api/health/walk-logs`); can only be removed again for weights (delete) — walk, wellness and photo-check entries have no delete control in the app, so use a throwaway/demo pet.
- Language/data-integrity findings for the report: Distance label says "kilómetros" in ES but payload is always `"miles"` (`useHealthTracking.js:128`); PhotoCheck modals, VetSummaryDashboard card, VetSummary share text and Wellness option labels are hardcoded English; HealthInsights is full of fake sample data (kept hidden by `SHOW_INSIGHTS=false`).

### Vet Record
- `src/components/Health/HealthVetRecord.jsx:1703` ("Share" button) / `src/app/(tabs)/more/data-access.jsx:234` — navigates to Data Access, where **Approve** (`PATCH /api/care-access/grants/{id}` action=approve, no confirmation) gives a real vet access to the pet's medical record; **Deny** (`src/app/(tabs)/more/data-access.jsx:253`) / **Revoke access** (`src/app/(tabs)/more/data-access.jsx:300`) (same endpoint, confirm Alert) cut a real vet's access. Notifies/affects real provider accounts.
- `src/components/Health/HealthVetRecord.jsx:1400` / `src/components/Health/HealthVetRecord.jsx:387-416` — trash icon on a history note: `DELETE /api/vet-record/notes?id={id}`; permanent, confirm Alert only.
- `src/components/Health/HealthVetRecord.jsx:1598` / `src/components/Health/HealthVetRecord.jsx:329-359` — trash icon on a document: `DELETE /api/vet-record/documents?id={id}`; permanent, confirm Alert only.
- `src/components/Health/HealthVetRecord.jsx:1520` / `src/components/Health/HealthVetRecord.jsx:315-327` — tapping a document row signs a URL (`GET /api/media?key=…&json=1`) and opens it in the system browser via `Linking.openURL`, outside the app.
- `src/components/Health/VetRecord/AddDocumentModal.jsx:551` / `src/components/Health/VetRecord/AddDocumentModal.jsx:226-290` — "Save document": uploads the picked photo/PDF to private storage (`POST /api/upload`, visibility private), creates the record (`POST /api/vet-record/documents`) and sends the file to an AI reader (`POST /api/vet-record/documents/extract`, Claude vision on the server). Use a non-sensitive sample document in production.
- `src/components/Health/VetRecord/AddDocumentModal.jsx:434-438` / `src/components/Health/VetRecord/AddDocumentModal.jsx:105-154` — camera / photo library / Files pickers (permission prompts; the chosen file is then uploaded on Save).
- `src/components/Health/HealthVetRecord.jsx:1734`, `src/components/Health/HealthVetRecord.jsx:1429`, `src/components/Health/HealthVetRecord.jsx:2421` — all entry points to the Add document modal (same upload + AI read).
- `src/components/Health/VetRecord/ReviewProposalModal.jsx:400` / `src/components/Health/VetRecord/ReviewProposalModal.jsx:199-224` — "Add {n} records": writes AI-proposed (editable) rows via `POST /api/pet-vaccinations`, `/api/health/medications`, `/api/vet-record/surgeries`, `/api/vet-record/lab-results`, `/api/vet-record/allergies`, `/api/vet-record/conditions`, `/api/vet-record/notes`. Partial failure still closes the sheet; vaccines/meds/surgeries/labs/allergies/conditions have no delete UI on this screen, so test data cannot be removed in-app.
- `src/components/Health/VetRecord/PrescriptionsSection.jsx:121` / `src/components/Health/VetRecord/PrescriptionsSection.jsx:44-66` — "Request refill": `POST /api/rx-refill-requests` sends a refill request to the prescribing clinic.
- `src/components/Health/VetRecord/PrescriptionsSection.jsx:130` / `src/app/rx-fulfillment.jsx:270` — "Request fulfillment": `POST /api/rx-fulfillment-orders` sends a request (incl. delivery address/lat/lng) to a real pharmacy provider.
- `src/app/rx-fulfillment.jsx:191` / `src/app/rx-fulfillment.jsx:93-132` — "Pay $xx.xx": `POST /api/payments/checkout` (rail mercadopago) then opens the MercadoPago checkout URL: real money.
- `src/app/emergency-card.jsx:213` — "Share card (image)": captures the Emergency Card PNG (contains microchip, vet phone, emergency contact phone) and opens the share sheet.
- `src/app/emergency-card.jsx:242` — "Show medical info on the public tag": `PATCH /api/emergency-card` {show_medical_on_tag}; exposes medical info on the public `/p/tag/{token}` page.
- `src/app/emergency-card.jsx:254`, `src/app/emergency-card.jsx:264` — finder contact mode Phone/Email + value: `PATCH /api/emergency-card`; publishes the owner's phone/email on the public tag page. "Relay (private)" lets strangers message the owner.
- `src/app/emergency-card.jsx:301` — "Create vet link": `POST /api/emergency-card/links`; creates a shareable `/p/card/{token}` URL (no login needed to open).
- `src/app/emergency-card.jsx:330` — tapping a link URL opens the iOS share sheet with the URL.
- `src/app/emergency-card.jsx:336` — revoke link: `DELETE /api/emergency-card/links/{id}` (confirm Alert).
- `src/components/Health/VetRecord/EditMedicalProfileModal.jsx:485` / `src/components/Health/VetRecord/EditMedicalProfileModal.jsx:134-235` — "Save Medical Profile": `POST /api/pet-medical-profiles`; overwrites shared pet fields (breed, birthday, age, sex, weight) visible on Dog Profile and can add a weight-log entry. Not outbound, but changes data other screens use.

### Reminders & Routines
- `src/components/Health/Reminders/RoutineCard.jsx:461-480` (handler `:37-50`) — **"Delete Routine"** → `DELETE /api/routines?id=<id>` (soft delete), cancels future local notifications, `DELETE /api/health/reminder-dismissals?petId=&routineId=` — 🗑️ removes the routine and its reminders (past logs kept).
- `src/components/Health/Reminders/WalkRoutineModal.jsx:67-115, 117-174` — trash on a walk → `PUT /api/routines {id, walkSchedule}` fired immediately (editing) — 🗑️ irreversible by closing the modal; last walk deletes the whole routine via the store.
- `src/components/Health/Reminders/WalkRoutineModal.jsx:427-458` — "Delete Walk Routine" → store `deleteRoutine` → `DELETE /api/routines?id=` — 🗑️.
- `src/components/Health/Reminders/WellnessCheckRoutineModal.jsx:321-473` — trash on a check → `PUT /api/routines {id, wellnessCheckSchedule}` immediately; last check → `DELETE /api/routines?id=` — 🗑️.
- `src/components/Health/Reminders/MedicalCareRoutineModal.jsx:585-598` — delete care item (draft only until Save) — 🗑️ (reversible by Cancel/close before saving).
- `src/components/Health/Reminders/FeedingRoutineModal.jsx:466-473` — remove meal (draft only) — 🗑️ low.
- `src/components/Health/Reminders/VetAppointmentRoutineModal.jsx:1198-1230` — **Delete appointment** → `DELETE /api/vet-appointments?id=<id>`; optional `Calendar.deleteEventAsync` — 🗑️ · 📤 server notifies the provider team (`biz_booking_change`, kind "cancel") when the appointment was booked through a provider; ⚠️ may delete a phone-calendar event.
- `src/components/Health/Reminders/VetAppointmentRoutineModal.jsx:892-918` — **Create / Update appointment** → `POST` / `PUT /api/vet-appointments` — 📤 Update of a provider-booked appointment notifies the provider team ("reschedule"); ⚠️ writes to the device calendar when "Add to phone calendar" is ON.
- `src/components/Health/Reminders/VetAppointmentRoutineModal.jsx:851-863` — "Add to phone calendar" toggle → creates calendar "PawPi - Vet Appointments" + event with pet name, title, reason, vet name, notes in the event body; turning it off when editing deletes the event — ⚠️ calendar write/delete (NSCalendars prompt).
- `src/components/Health/Reminders/RoutineCard.jsx:402-433` and `WalkItem.jsx:423-447` — "Add to calendar" (walks) → `Calendar.createCalendarAsync` ("PawPi - Walks") + `createEventAsync` ("Busy"), one alert per walk, duplicates on repeat taps — ⚠️ calendar write (NSCalendars prompt).
- `src/components/Health/Reminders/RoutineCard.jsx:321-327` — Active/Inactive switch → `PUT /api/routines` (isActive) + cancels or re-creates local notifications — ⚠️ notification scheduling.
- Every routine **Save** (Feeding `FeedingRoutineModal.jsx:799-811`, Walk `WalkRoutineModal.jsx:473-491`, Photo Check `PhotoCheckRoutineModal.jsx:363`, Medical Care `MedicalCareRoutineModal.jsx:363-382`, Wellness `WellnessCheckRoutineModal.jsx:1000-1012`) → `POST/PUT /api/routines` + schedules up to 14 days of local OS notifications (`src/utils/notifications.js:241-300`) — ⚠️ notification scheduling (silent if permission denied).
- `src/components/Health/Reminders/RoutinesTab.jsx:277-281` — pull-to-refresh re-schedules all notifications — ⚠️.
- `src/components/Health/Reminders/SettingsTab.jsx:254-266` — "Enable" → iOS notification permission prompt; "Open Settings" leaves the app — ⚠️ system permission / settings.
- `src/utils/notifications.js:73-97` (triggered at app launch, `src/app/_layout.jsx:56`) — "🔔 Enable Reminders" alert → iOS notification permission prompt — ⚠️ permission.
- `src/components/Health/Reminders/SettingsTab.jsx:295-310` — dev-only "Send test notification (10s)" (must be absent in production) — ⚠️.
- `src/components/Health/Reminders/SocialWalkToggle.jsx:35-39` + `SocialWalkSettings.jsx:63-327` — "Offer as social walk" (visibility Friends only / Nearby pets, public "Meeting area (general)") — 🌍 flag/fields are stored in the routine's walk_schedule JSON only; no call to `/api/social-walks` was found in this flow (grep), but verify that nothing appears publicly for other users after saving with it ON.


---

<!-- ===== PART D ===== -->

## PART D — Care (Training) tab + Community/forum + walks & social

All paths are repo-relative to `anything/apps/mobile/` unless they start with `../web/` (= `anything/apps/web/`). EN labels come from `src/i18n/locales/en.json`; ES in parentheses where short. "Hardcoded" = the string is in the JSX and is NOT translated (stays English when the app is in Spanish).

Quick map of how a tester gets to each screen (all verified in source):
- Care tab (bottom tab "Care" / ES "Cuidado", route `training`): `src/app/(tabs)/tabsConfig.js:30-37`.
- Community: Profile tab ("More") → owner menu → COMMUNITY → "Community" — `src/components/More/OwnerMenu.jsx:208` (`/(tabs)/more/community`). Not a tab.
- My Hub: Profile tab → owner menu → ACCOUNT → "My Hub" — `src/components/More/OwnerMenu.jsx:228`.
- Followers / Following list: tap the Followers / Following counts on a pet social profile — `src/app/pet-profile.jsx:213-221`.
- Buddy Walks (`/nearby-walks`) and New Walk (`/create-walk`): **NO in-app link found.** A repo-wide search finds `nearby-walks` only inside its own file and `src/telemetry/registry.js:78`; `/create-walk` is only pushed from Buddy Walks (`src/app/nearby-walks.jsx:182`). These two screens are only reachable by deep link / manual route (e.g. `pawpi://nearby-walks`) in the current build. If the tester cannot find them in the UI, that is expected, not a bug in the tester's navigation.
- Owner-side join-request approve/decline UI: **does not exist.** Hooks `useJoinRequests / useApproveJoinRequest / useDeclineJoinRequest` (`src/hooks/useSocialWalks.js:108-195`) are never imported by any screen.

---

### Care tab (Learn pane) — `TrainingScreen` / `training` tab

- **File:** `src/app/(tabs)/training.jsx` · **Reached from:** bottom tab "Care" (`src/app/(tabs)/tabsConfig.js:30`). Content is mounted only after the tab is first focused (`FirstFocusGate`, `training.jsx:578-583`), so the very first open can flash a blank cream screen for an instant.
- **Gating / data needed:** none to browse. Needs a current pet to save/undo completion (button disabled + 50% opacity without a pet, `training.jsx:551,558`). Progress is per pet (switching the active pet changes the ticks). Curriculum is static built-in content (`src/data/trainingCurriculum.js`): 8 programs, 41 sessions total (Puppy Essentials 6, Basic Obedience 6, Leash Manners 5, Reliable Recall 5, Impulse Control 5, Socialization & Confidence 5, Fun Tricks 5, Senior Dog Enrichment 4).
- Default pane is Learn unless opened with `?pane=hire` or a care `?category=` deep link (`training.jsx:79-88`).
- **i18n warning:** almost all Learn-pane text is hardcoded English ("Want a pro? Hire a trainer", "Your training journey 🏆", "Programs", "N of M sessions done", "Step-by-step", "Mark as completed", all program/session content). Only the Learn/Hire segment labels and the Walkers banner are translated.

| # | Element (EN label, ES) | Type | Source | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | Segment "Learn" (ES Aprender) | tab/segment | `src/app/(tabs)/training.jsx:217-241` (onPress 220) | Shows the Learn pane (training programs). Active segment gets the white pill. | |
| 2 | Segment "Hire" (ES Contratar) | tab/segment | `src/app/(tabs)/training.jsx:217-241` (onPress 220) | Switches to the Hire pane (walker banner + care-provider discovery). See next section. | |
| 3 | Banner "Want a pro? Hire a trainer" / "1:1 sessions, group classes, and multi-week programs" (hardcoded) | button (card) | `src/app/(tabs)/training.jsx:296-334` (onPress 298) | `router.push("/service/training")` → opens the provider trainer-service screen `src/app/service/training.jsx` (NOT documented in this part). | |
| 4 | "Your training journey 🏆" progress card, text "X of 41 sessions completed across 8 programs" (hardcoded) | static text | `src/app/(tabs)/training.jsx:337-355` | Display only. Number = sessions ticked for the current pet (starts at 0 of 41 for a new pet). | |
| 5 | Program card (emoji, title, difficulty badge Beginner/Intermediate, summary, progress bar, "N of M sessions done"); green check replaces chevron when all sessions done | list item | `src/app/(tabs)/training.jsx:123-190` (onPress 125; rendered 368-370) | Opens the "Program → session list" modal (next section) for that program. | |
| 6 | Screen scroll (no pull-to-refresh) | scroll | `src/app/(tabs)/training.jsx:286-294` | Plain ScrollView; there is no pull-to-refresh on this tab. | |

- **Empty / loading / error states:** No loading spinner, no error UI. If `GET /api/training/self-progress?petId=` fails, the list simply shows 0 completed (the query error is swallowed). No pet → progress shows 0 and the "Mark as completed" button is dimmed/disabled. Raw technical text can leak only via the save-error Alert (see Session detail).
- **Modals / sheets / alerts opened:** Program → session list modal; Session detail modal (both below).
- **Back / dismiss behaviour:** This is a tab root (no back arrow). Hardware/swipe back on a modal calls `onRequestClose` (`training.jsx:378, 461`).

---

### Care tab (Hire pane) — `training` tab, segment "Hire"

- **File:** `src/app/(tabs)/training.jsx:246-284` + shared `src/components/Services/ServicesDiscovery.jsx` (variant `landing`, header hidden, scoped to `CARE_CATEGORIES`) · **Reached from:** Care tab → segment "Hire", or deep link `?pane=hire` / `?category=walking|daycare|sitting|training|walker|sitter|trainer` (`training.jsx:44-88`).
- **Gating / data needed:** none. Provider list comes from the discovery endpoint (real providers only). Category chips limited to Walking, Daycare, Sitting, Training (`src/constants/servicesCategories.js:35-40`); the "Places" group does not appear here (`ServicesDiscovery.jsx:195`).
- ServicesDiscovery is shared with the Stores & Vets tab; its full inventory belongs to the Services part. Rows below list only what the Care hub exposes.

| # | Element (EN label, ES) | Type | Source | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | Coral banner "Walkers" / "Request a walk or find one now" (ES Paseadores / Pedí un paseo o encontrá uno ahora) | button (card) | `src/app/(tabs)/training.jsx:250-275` (onPress 252) | `router.push("/service/walking")` → Dog Walking screen (documented below). | |
| 2 | Filter button "Category" (shows "All" or chosen category / "N selected") with ✕ clear when active | button | `src/components/Services/ServicesDiscovery.jsx:622-632` (onPress 629) | Opens the "Choose a category" picker modal (items 8-9). The ✕ clears the selection (`clearCategories`, 406). | |
| 3 | Filter button "Area" ("All areas" / "Search near me" / searched place) | button | `src/components/Services/ServicesDiscovery.jsx:633-639` (onPress 638) | Opens the "Choose an area" picker (items 10-12). | |
| 4 | List / Map toggle ("List" / "Map"; ES Lista / Mapa) | segmented toggle | `src/components/Services/ServicesDiscovery.jsx:565-613` (onPress 587) | Switches between results list and a map of located providers. Shown only on iOS, phone-width (`showToggle`, 349); Android shows a placeholder, wide screens show a split view. | |
| 5 | Search box "Search services & places" (ES Buscá servicios y lugares) + ✕ clear | text input | `src/components/Providers/ProviderListControls.jsx:70-130`; wired at `src/components/Services/ServicesDiscovery.jsx:646-653` | Instant client-side filter of the already-loaded list by name / bio / type. | |
| 6 | Sort chips "Suggested / Top rated / Most reviewed" (+ "Nearest" once a location is known) | chips | `src/components/Providers/ProviderListControls.jsx:18-22,133-160`; `ServicesDiscovery.jsx:340-345` | Re-orders the list client-side. | |
| 7 | Chip "Open now" (ES Abierto ahora) | toggle | `src/components/Services/ServicesDiscovery.jsx:654-678` (onPress 656) | Toggles filtering to providers open right now; chip turns coral when on. | |
| 8 | Category picker option "All" | picker option | `src/components/Services/ServicesDiscovery.jsx:950-955` | Clears category selection; list shows every care provider. | |
| 9 | Category options "Walking / Daycare / Sitting / Training" (ES Paseos / Guardería / Cuidado / Entrenamiento), inside collapsible "Services" group | multi-select options | `src/components/Services/ServicesDiscovery.jsx:958-981` (onPress 974) | Multi-select: toggles each category; list becomes the union of selected capabilities. | |
| 10 | Area picker "Search a location" input ("City or neighborhood") | text input | `src/components/Services/ServicesDiscovery.jsx:1047-1060` (submit 1053) | Geocodes the typed place (network geocoder); on hit, list becomes radius-bound (25 km) around it; on miss shows "Location not found" (1065-1072). | |
| 11 | Area option "All areas" | picker option | `src/components/Services/ServicesDiscovery.jsx:1075-1080` | Removes any location filter. | |
| 12 | Area option "Search near me" | picker option | `src/components/Services/ServicesDiscovery.jsx:1081-1087` (onSelectNearMe 420) | Asks iOS location permission (foreground), then sorts/filters by distance. If denied, shows banner "Allow location to find places near you." (547-561). | |
| 13 | Result card (logo, name, capability tags, distance in km, rating) | list item | `src/components/Services/ServicesDiscovery.jsx:690-698,1390+` (openItem 488-509) | Opens provider storefront `router.push({pathname:"/service/provider", params:{slug}})`. Storefront contains booking / payment / messaging (outside this part). | |
| 14 | Map pins (map view) | map marker | `src/components/Services/ServicesDiscovery.jsx:141-153 (onMarkerPress 513)` | Highlights the matching card and raises the sheet; drilling in still requires tapping the card. Capped at 60 pins. | |
| 15 | "Clear filters" button in no-results state | button | `src/components/Services/ServicesDiscovery.jsx:718-732` | Resets category, area, search, Open now. | |
| 16 | "Try again" in load-error state | button | `src/components/Services/ServicesDiscovery.jsx:1560-1602` | Re-runs the discover query. | |

- **Empty / loading / error states:** Loading spinner (`discover-loading`, 770); empty "No providers yet" / "Trusted pet businesses are joining PawPi. Check back soon." (781); filtered-empty "No matches" + "Clear filters" (715-732); error "Couldn't load providers" / "Something went wrong. Pull down or tap retry." + "Try again" (1574-1601). Raw technical text should not leak.
- **Modals / sheets / alerts opened:** Category picker, Area picker (inline `PickerModal`s, `ServicesDiscovery.jsx:942-1090`); iOS location-permission prompt.
- **Back / dismiss behaviour:** Tab root; pickers close on backdrop tap.

---

### Programs — session list modal (Care tab → Learn)

- **File:** `src/app/(tabs)/training.jsx:374-455` (RN `Modal`, slide, full screen) · **Reached from:** tap a Program card (`training.jsx:125`).
- **Gating / data needed:** none (content is built in).

| # | Element | Type | Source | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | Back arrow (←) | header icon | `src/app/(tabs)/training.jsx:391-397` (onPress 393) | Closes the modal back to Programs list. | |
| 2 | Session row "N. <title>", "X min · Difficulty", green tick if done else empty circle | list item | `src/app/(tabs)/training.jsx:416-450` (onPress 419) | Opens the Session detail modal on top. | |

- **Empty / loading / error states:** none (static).
- **Modals / sheets / alerts opened:** Session detail modal.
- **Back / dismiss behaviour:** ← button or Android/hardware back (`onRequestClose` 378) closes it; the Program card list and its progress bar refresh from the cache.

---

### Session detail modal (Care tab → Learn)

- **File:** `src/app/(tabs)/training.jsx:457-571` (RN `Modal`, slide) · **Reached from:** tap a session row (`training.jsx:419`).
- **Gating / data needed:** needs a current pet to mark complete.

| # | Element | Type | Source | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | Close (X) | header icon | `src/app/(tabs)/training.jsx:474-480` (onPress 476) | Closes the session modal; returns to the session list. | |
| 2 | Objective "🎯 …", "Step-by-step" numbered steps, lightbulb tips box (hardcoded English content) | static text | `src/app/(tabs)/training.jsx:490-541` | Read-only instructions. | |
| 3 | Big button "Mark as completed" (coral) / when done "✓ Completed — tap to undo" (green) | button | `src/app/(tabs)/training.jsx:548-564` (onPress 550; handler 106-115) | Calls `POST /api/training/self-progress {petId, programKey, sessionKey, completed}` (`src/hooks/useSelfTraining.js:34-49`); on success the tick, the program bar and the overall counter update after refetch. Disabled while saving or with no pet. | |

- **Empty / loading / error states:** On failure an `Alert` titled "Error" with the server message or "Could not save progress." (`useSelfTraining.js:49`). No loading indicator beyond the button being disabled.
- **Modals / sheets / alerts opened:** none besides the error Alert.
- **Back / dismiss behaviour:** X or hardware back (`onRequestClose` 461) closes this modal only; the program modal stays open underneath.

---

### Dog Walking (owner) — `/service/walking`

- **File:** `src/app/service/walking.jsx` · **Reached from:** Care tab → Hire → "Walkers" banner (`src/app/(tabs)/training.jsx:252`). Also reachable from other places outside this part.
- **Gating / data needed:** walker list = published walker providers; needs ≥1 pet for any request (else alert "Add a pet first"). "Share pickup location" and "Find a walker now" use device location (iOS permission prompt).
- This is the screen that **notifies real walkers**. Test with care against production.

| # | Element (EN label, ES) | Type | Source | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | Back arrow | header icon | `src/app/service/walking.jsx:216-221` | `router.back()` to the Care tab. | |
| 2 | Messages icon (speech bubble) | header icon | `src/app/service/walking.jsx:231-244` (onPress 232) | Opens `/provider-messages` (owner↔provider inbox; outside this part). | |
| 3 | Coral banner "Walk in progress" / "{walker} is out with {pet} — tap to watch live" | button (card) | `src/app/service/walking.jsx:252-292` (onPress 254-259) | Only shown when a session for the active pet is `in_progress`. Opens `/walk-live?sessionId=<id>`. | |
| 4 | Status card "Waiting for a walker" / "Waiting for {walker}" with "Cancel" | button | `src/app/service/walking.jsx:295-303, 543-592` (onPress 574) | `handleCancelRequest` → `PATCH /api/walk-requests/{id}` (cancels your open request; `src/hooks/useProviders.js:1186-1192`). On failure Alert "Couldn't send request" + message. | ⚠️ |
| 5 | Dark card "Find a walker now" / "Alert available walkers near you" (ES Encontrá un paseador ahora) | button (card) | `src/app/service/walking.jsx:306-343` (onPress 307; handler 149-198) | Asks location permission, reads exact GPS, then `POST /api/walk-requests` with `target_provider_id:null, radius_km:5, when_type:"now"` → broadcast notification/push to up to 25 nearest available walkers within 5 km. Success Alert "Looking for a walker" / "We're notifying nearby available walkers. You'll be notified when one accepts." If location denied: Alert "Location needed" / "Turn on location so nearby walkers can find you." and nothing is sent. No pet: Alert "Add a pet first". | 📤 |
| 6 | Search box + sort chips ("Suggested / Top rated / Most reviewed") | text input / chips | `src/app/service/walking.jsx:354-361` (component `ProviderListControls`) | Client-side filter / re-order of walker cards. Shown only if ≥1 provider. | |
| 7 | Walker card (logo/footprint icon, name, rating, bio) | list item | `src/app/service/walking.jsx:445-516` (onPress 448; handler 89-94) | `router.push({pathname:"/service/provider", params:{slug, capability:"walker"}})` → walker storefront (booking flow, outside this part). | |
| 8 | Button under each card "Request a walk" (ES Pedir un paseo) | button | `src/app/service/walking.jsx:517-538` (onPress 519; testID `request-walk-<id>`) | Opens the "Request a walk" sheet (item 10). | |
| 9 | Past walk card ("RECENT WALKS", provider name, date, "N min · X mi", 💦/💩, notes) | list item | `src/app/service/walking.jsx:395-424, 709-749` (onPress 716) | `router.push({pathname:"/walk-live", params:{sessionId}})` → read-only walk report. | |
| 10 | Request-a-walk sheet: close (X) | button | `src/app/service/walking.jsx:630-632` | Dismisses the sheet without sending. | |
| 11 | Sheet text field "Anything the walker should know? (optional)" | text input | `src/app/service/walking.jsx:642-660` (testID `request-note-input`) | Free-text note sent to the walker. | |
| 12 | Sheet switch "Share my pickup location" / "Helps the walker find you." (default ON) | toggle | `src/app/service/walking.jsx:670-683` (testID `request-share-location`) | When ON, the exact GPS point is attached to the request (`pickup_lat/pickup_lng`). | ⚠️ |
| 13 | Sheet button "Send request" / "Sending…" (ES Enviar solicitud) | button | `src/app/service/walking.jsx:685-702` (onPress 686; handler 96-137; testID `request-submit`) | `POST /api/walk-requests` with `target_provider_id`, `when_type:"now"`, note, optional pickup coords → push/bell notification to that walker's staff (`walk_request_targeted`, `../web/src/app/api/walk-requests/route.js:215-225`). Success Alert "Request sent" / "We let the walker know. You'll be notified when they accept." and the "Waiting for a walker" card appears. Failure Alert "Couldn't send request" + server message. | 📤 |

- **Empty / loading / error states:** spinner while loading; "Couldn't load walkers" / "Something went wrong. Pull down to try again."; "No walkers available yet" / "Check back soon — walkers are joining PawPi."; filtered empty "No results" + "No matches for …". Pull-to-refresh refetches the walker list only.
- **Modals / sheets / alerts opened:** Request-a-walk bottom sheet (`walking.jsx:594-707`); Alerts listed above; iOS location permission.
- **Back / dismiss behaviour:** ← pops to the Care tab; sheet closes with X or hardware back.

---

### Community — `/(tabs)/more/community`

- **File:** `src/app/(tabs)/more/community.jsx` · **Reached from:** Profile tab → owner menu → COMMUNITY → "Community" (`src/components/More/OwnerMenu.jsx:208`). Registered in `src/app/(tabs)/more/_layout.jsx:24`.
- **Gating / data needed:** none to read. Blocked users' threads are hidden by the server (`../web/src/app/api/forum/threads/route.js:59`). Posting needs a user profile (always true for a logged-in user). The list is shared by ALL real users in production, so anything posted is public.

| # | Element (EN label, ES) | Type | Source | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | Back arrow (←) | header icon | `src/app/(tabs)/more/community.jsx:160` | `router.back()` → Profile tab menu. | |
| 2 | Calendar icon (testID `events-button`) | header icon | `src/app/(tabs)/more/community.jsx:173-188` (onPress 175) | `router.push("/events")` → Events screen (outside this part). | |
| 3 | Coral "+" (testID `compose-button`) | header icon / FAB | `src/app/(tabs)/more/community.jsx:189-202` (onPress 191) | `router.push("/forum-compose")` → New Discussion. | |
| 4 | Sort chips "Hot / New / Top" (ES Populares / Nuevos / Destacados) | tabs | `src/app/(tabs)/more/community.jsx:217-245` (onPress 221) | Re-queries `GET /api/forum/threads?sort=hot|new|top[&category=]`; selected chip turns coral. Default Hot. | |
| 5 | Category chips "All / Health / Food / Training / Behavior / General" (horizontal scroll) | tabs | `src/app/(tabs)/more/community.jsx:257-290` (onPress 266) | Filters threads by category (`category=` query). Default All. | |
| 6 | Thread card (score arrows, category pill, title, "🐾 author", 📣 comment count) | list item | `src/app/(tabs)/more/community.jsx:62-135` (onPress 67, testID `thread-<id>`) | `router.push("/forum-thread?id=<id>")` → Discussion. | |
| 7 | Vote ▲ on a thread card | button | `src/components/Forum/VoteControl.jsx:34-40` via `community.jsx:78-83,58-60` | `POST /api/forum/vote {targetType:"thread", targetId, value:1}`. Tapping it again clears (value 0). Score and arrow colour refresh after refetch. See "VoteControl" section. | 🌍 |
| 8 | Vote ▼ on a thread card | button | `src/components/Forum/VoteControl.jsx:54-60` | Same endpoint with value -1 (or 0 to clear). | 🌍 |
| 9 | Pull-to-refresh | gesture | `src/app/(tabs)/more/community.jsx:293-297` | Refetches the thread list. | |
| 10 | "Try again" button in error state | button | `src/app/(tabs)/more/community.jsx:317-335` (onPress 318) | `refetch()` of threads. | |

- **Empty / loading / error states:** Spinner while loading. Error: paw icon + "Something went wrong. Please try again." + "Try again" (so an outage does not look empty). Empty: "No discussions here yet." / "Be the first to bark!" (**hardcoded English**, `community.jsx:353,356`). Thread cards show author as "🐾 someone" if no username. Category pill text is translated via `community.category.*`.
- **Modals / sheets / alerts opened:** none on this screen.
- **Back / dismiss behaviour:** ← uses `router.back()` (returns to the Profile/More tab).

---

### New Discussion — `/forum-compose`

- **File:** `src/app/forum-compose.jsx` · **Reached from:** Community "+" button (`community.jsx:191`).
- **Gating / data needed:** Title is required; Post button is disabled until the title has text.
- **WARNING: Post publishes immediately to the shared public Community feed (all real users). There is no preview, confirmation, draft or edit afterwards in the UI.** Server also rejects objectionable text (422).

| # | Element (EN label, ES) | Type | Source | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | Back arrow (testID `compose-back`) | header icon | `src/app/forum-compose.jsx:63-69` (onPress 65) | `router.back()`; any typed text is discarded without a prompt. | |
| 2 | Category chips Health / Food / Training / Behavior / General (default General) | chips | `src/app/forum-compose.jsx:82-106` (onPress 86) | Selects the category. Labels are raw English keys (`{cat}`, line 103), NOT translated, unlike Community. | |
| 3 | "Title" field, placeholder "What's your question?" (ES ¿Cuál es tu pregunta?) | text input | `src/app/forum-compose.jsx:109-117` (testID `compose-title`) | Required. | |
| 4 | "Details (optional)" field, placeholder "Add more context..." | multiline text input | `src/app/forum-compose.jsx:119-128` (testID `compose-body`) | Optional body text. | |
| 5 | Button "Post" (ES Publicar) | button | `src/app/forum-compose.jsx:130-158` (onPress 132; handleSubmit 39-45; testID `compose-submit`) | `POST /api/forum/threads {title, body|null, category}` (`src/hooks/useForum.js:51`). On success → `router.back()` to Community and the new thread appears at the top of New/Hot. While sending shows a spinner. | 🌍 |

- **Empty / loading / error states:** Post disabled (grey) while title empty or request pending. Errors via `Alert` "Error" + server message (`useForum.js:63`), e.g. 422 "Your text contains language that isn't allowed. Please edit it and try again." or "Failed to create thread".
- **Modals / sheets / alerts opened:** error Alert only.
- **Back / dismiss behaviour:** ← or swipe-back; no unsaved-changes confirmation.

---

### Discussion (thread + comments) — `/forum-thread?id=`

- **File:** `src/app/forum-thread.jsx` · **Reached from:** a thread card in Community (`community.jsx:67`).
- **Gating / data needed:** a thread id. Blocked authors' threads/comments are filtered server-side (`../web/src/app/api/forum/threads/[id]/route.js:37,59`); commenting on a thread whose author has a block with you is refused by the API (`.../comments/route.js:47`).
- **No reply-to-comment UI** (comments are always posted with `parentCommentId: null`, line 53; indented rendering exists only for pre-existing replies). **No delete-thread/delete-comment UI** on this screen (hook `useDeleteThread` and the `moderation.deleteComment*` strings exist but are not used here).
- **Possible bug to note:** `ModerationMenu` is rendered with no `isOwn`, so the "···" menu also shows on the tester's OWN thread/comment (the code comment says it should be hidden). Reporting/blocking yourself may then return an error such as "You cannot block yourself" from `/api/blocks`.

| # | Element (EN label, ES) | Type | Source | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | Back arrow (testID `thread-back`), header title "Discussion" (ES Discusión) | header icon | `src/app/forum-thread.jsx:74-83` (onPress 76) | `router.back()` to Community. | |
| 2 | Thread vote ▲ / ▼ + score | buttons | `src/app/forum-thread.jsx:119-124` (testIDs `thread-vote-up/down/score`) | `POST /api/forum/vote {targetType:"thread", targetId, value}`. | 🌍 |
| 3 | Thread "···" (More options) | header icon | `src/app/forum-thread.jsx:136-141` | Opens ModerationMenu with Report + Block user (author known). See "ModerationMenu" section. Targets `forum_thread`. | 📤 |
| 4 | Comment vote ▲ / ▼ + score (per comment) | buttons | `src/app/forum-thread.jsx:188-193` (testIDs `comment-vote-<id>-up/down`) | `POST /api/forum/vote {targetType:"comment", targetId, value}`. | 🌍 |
| 5 | Comment "···" (per comment) | header icon | `src/app/forum-thread.jsx:202-207` | ModerationMenu for `forum_comment` (Report + Block). | 📤 |
| 6 | Composer field "Add a comment..." (ES Agregá un comentario...) | text input | `src/app/forum-thread.jsx:236-253` (testID `comment-input`) | Comment text; pinned above keyboard. | |
| 7 | Send (paper-plane) button | button | `src/app/forum-thread.jsx:254-272` (onPress 256; submitComment 49-56; testID `comment-submit`) | `POST /api/forum/threads/{id}/comments {body, parentCommentId:null}` (`useForum.js:71`). Field clears on success; comment appears in the list; thread's comment count increases in Community. Disabled when empty. | 🌍 |
| 8 | Pull-to-refresh | gesture | `src/app/forum-thread.jsx:87-91` | Refetches thread + comments. | |

- **Empty / loading / error states:** Spinner; thread missing/deleted/blocked → paw icon + "This discussion is no longer available."; no comments → "No comments yet — start the conversation."; header "N COMMENT(S)". Comment send errors → Alert "Error" + server message (e.g. 422 filter text) or "Could not comment." Vote failures are silent (no alert). Author shows "someone" if missing. Thread category is shown raw (English).
- **Modals / sheets / alerts opened:** ModerationMenu sheet + its Alerts; error Alert.
- **Back / dismiss behaviour:** ← `router.back()`; keyboard avoiding view pushes composer up.

---

### VoteControl (shared up/down arrows) — component

- **File:** `src/components/Forum/VoteControl.jsx` · **Reached from:** Community thread cards, Discussion thread and comments.
- **Gating / data needed:** none; idempotent per user.

| # | Element | Type | Source | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | Up chevron ▲ | button | `src/components/Forum/VoteControl.jsx:34-40` (cast 24) | Sends vote +1; if you already voted +1, sends 0 (clears). Arrow turns coral when active. | 🌍 |
| 2 | Down chevron ▼ | button | `src/components/Forum/VoteControl.jsx:54-60` | Sends -1; again clears. Arrow turns sage green when active. | 🌍 |
| 3 | Score number | text | `src/components/Forum/VoteControl.jsx:41-53` | Server-recomputed score after refetch (`POST /api/forum/vote`, `src/hooks/useForum.js:95`). | |

- **Empty / loading / error states:** none; failed votes give no feedback (score just does not change).
- **Modals / sheets / alerts opened:** none. **Back / dismiss:** n/a.

---

### ModerationMenu — Report / Block sheet (shared component)

- **File:** `src/components/moderation/ModerationMenu.jsx` · **Reached from:** the "···" icon on forum threads/comments (`forum-thread.jsx:136,202`), Buddy Walks cards (`nearby-walks.jsx:386`), and other UGC screens outside this part (chat, pet profile, events, provider posts, reviews, adoption, feed).
- **Gating / data needed:** renders nothing when `isOwn` is true or there is neither a reportable target nor a blockable author. On Buddy Walks it is **Report-only** (no `authorUserId` passed).

| # | Element (EN label, ES) | Type | Source | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | "···" trigger (a11y "More options") | icon button | `src/components/moderation/ModerationMenu.jsx:120-127` | Opens a bottom sheet (fade) with actions. | |
| 2 | Sheet row "Report" (ES Reportar) | button | `src/components/moderation/ModerationMenu.jsx:148-155` (onPress 153) | Switches the sheet to the reason list. | |
| 3 | Sheet row "Block user" (ES Bloquear usuario), red | button | `src/components/moderation/ModerationMenu.jsx:156-164` (onPress 162; confirmBlock 88-116) | Closes the sheet and shows Alert "Block this user?" (below). Only when an author id is known. | ⚠️ |
| 4 | Sheet row "Cancel" | button | `src/components/moderation/ModerationMenu.jsx:165-170` | Closes the sheet. | |
| 5 | Backdrop (tap outside) | gesture | `src/components/moderation/ModerationMenu.jsx:130-134` | Dismisses sheet. | |
| 6 | Reasons header "Why are you reporting this?" with ‹ back | button | `src/components/moderation/ModerationMenu.jsx:174-179` | Returns to the actions list. | |
| 7 | Reason rows: "Spam or scam", "Harassment or bullying", "Hate speech", "Nudity or sexual content", "Violence or threats", "Something else" | buttons | `src/components/moderation/ModerationMenu.jsx:17-24,180-193` (onPress 190; submitReport 75-86) | Immediately sends `POST /api/reports {target_type, target_id, reason}` (no extra confirmation). Success Alert "Thanks for reporting" / "Our team will review this within 24 hours." Failure Alert "Couldn't report" + message or "Please try again." Repeat reports of the same target are a harmless no-op. | 📤 |
| 8 | Alert "Block this user?" → "Block" (destructive) / "Cancel" | alert buttons | `src/components/moderation/ModerationMenu.jsx:90-114` | "Block" → `POST /api/blocks {blocked_user_id}`; success Alert "User blocked" / "Their content will disappear from your app." and the social caches (forum, posts, walks, DMs, events, providers) are refetched without that user. Body text: "You won't see each other's posts, comments, walks, or messages, and neither of you can contact the other." Failure Alert "Couldn't block". | ⚠️ |

- **Empty / loading / error states:** no spinner during the network call (sheet closes first); result comes via Alert. Error text is the server's `error` string or "Request failed" (`src/hooks/useModeration.js:15`).
- **Modals / sheets / alerts opened:** the sheet itself plus the 3 Alerts above.
- **Back / dismiss behaviour:** hardware back or backdrop closes (`onRequestClose` 129). No unblock control exists in this component or in these screens.

---

### My Hub — `/(tabs)/more/hub`

- **File:** `src/app/(tabs)/more/hub.jsx` · **Reached from:** Profile tab → owner menu → ACCOUNT → "My Hub" (`src/components/More/OwnerMenu.jsx:228`; registered `more/_layout.jsx:23`). (Not forum-related; it was listed with the Community files.)
- **Gating / data needed:** none. Shows the owner's care-access grants, saved adoption listings and followed businesses. All lists empty for a fresh account. Header title "My Hub" and the section titles "Who has access", "Saved dogs" and the row text are **hardcoded English**; only the "Businesses you follow" card is translated.

| # | Element | Type | Source | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | Back arrow | header icon | `src/app/(tabs)/more/hub.jsx:167-169` | `router.back()`. | |
| 2 | Card "Who has access" (count badge) | button (card header) | `src/app/(tabs)/more/hub.jsx:185-203` (onPress 189) | `router.push("/(tabs)/more/data-access")` → data-access screen (outside this part). Up to 4 grant rows shown below as read-only (provider name, "Access to {pet}", badge "active"). | |
| 3 | Card "Saved dogs" (count) | button | `src/app/(tabs)/more/hub.jsx:206-226` (onPress 210) | `router.push("/service/adoption")`. Up to 4 saved listings listed read-only. | |
| 4 | Card "Businesses you follow" (ES Negocios que seguís) | button | `src/app/(tabs)/more/hub.jsx:229-242` (onPress 233) | `router.push("/service/following")`. Up to 4 names listed read-only. | |
| 5 | Pull-to-refresh | gesture | `src/app/(tabs)/more/hub.jsx:180-183` (refetch 148-151) | Refetches grants and favourites only (not the followed list). | |

- **Empty / loading / error states:** spinner until grants+favourites both resolve; empty texts "No one has access to your pets.", "No saved adoption listings.", "You're not following any businesses yet." No error UI (failed queries look like empty).
- **Modals / sheets / alerts opened:** none. **Back / dismiss:** ← `router.back()`.

---

### Buddy Walks (discovery) — `/nearby-walks`

- **File:** `src/app/nearby-walks.jsx` · **Reached from:** **no in-app link found** (deep link only; see header note). Root stack screen.
- **Gating / data needed:** needs a current pet to send a join request (silently does nothing without one, `nearby-walks.jsx:95`). Asks for iOS foreground location on open (`nearby-walks.jsx:55-72`) to narrow results to ~25 km; if denied it lists all public walks. Walks of blocked users, hidden walks, own walks and past walks are excluded by the API.

| # | Element (EN label, ES) | Type | Source | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | Back arrow | header icon | `src/app/nearby-walks.jsx:158-171` | `router.back()`. | |
| 2 | Coral "+ Create" (ES Crear) (testID `create-walk-button`) | button | `src/app/nearby-walks.jsx:180-197` (onPress 182) | `router.push("/create-walk")`. | |
| 3 | Tab "Nearby" (globe) (ES Cerca) | tab | `src/app/nearby-walks.jsx:209-232` (onPress 211; testID `tab-nearby`) | Lists public walks (`GET /api/social-walks?visibility=nearby_pets[&lat&lng&radiusKm=25]`). | |
| 4 | Tab "Invited" (lock) (ES Invitados) | tab | `src/app/nearby-walks.jsx:233-256` (onPress 236; testID `tab-invited`) | Lists private walks you were invited to (`GET /api/social-walks?invited=true`). | |
| 5 | Walk card (name, "Hosted by {name}", date "Today/Tomorrow/Wed, …" at time, "{mins} min · {pace} pace", meeting area, "N spots available", guest notes in quotes) | card | `src/app/nearby-walks.jsx:322-500` | Display only. Exact coordinates are not shown. "FULL" badge when no spots (387-406). | |
| 6 | Walk card "···" (More options) | icon button | `src/app/nearby-walks.jsx:386` | ModerationMenu with **Report only** (`social_walk`); Block is not offered here. | 📤 |
| 7 | Card button "Request to join" (if host requires approval) / "Join walk" / disabled "Walk is full" (ES Pedir unirse / Unirme al paseo) | button | `src/app/nearby-walks.jsx:503-527` (onPress 504) | Opens the "Request to join" sheet (selectedWalk). Both labels open the same sheet and send the same request. | |
| 8 | Pull-to-refresh | gesture | `src/app/nearby-walks.jsx:260-267` | Refetches the active tab. | |

- **Empty / loading / error states:** spinner; empty Nearby "No walks nearby" / "Check back later or create your own social walk"; empty Invited "No invites yet" / "Private walks you're invited to will show up here". There is NO explicit error state (a failed fetch just shows nothing/spinner off).
- **Modals / sheets / alerts opened:** "Request to join" page-sheet (next).
- **Back / dismiss behaviour:** ← `router.back()`.

---

### Request to join — page sheet on Buddy Walks

- **File:** `src/app/nearby-walks.jsx:533-728` · **Reached from:** the card button on a walk (`nearby-walks.jsx:504`).
- **Gating / data needed:** current pet required; one pending request per walk/pet (server returns 400 "Join request already pending"); you cannot join your own walk; cannot join a full walk.

| # | Element (EN label, ES) | Type | Source | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | Close (X) | button | `src/app/nearby-walks.jsx:563-575` (onPress 564) | Closes the sheet, nothing sent. | |
| 2 | Walk summary box (name, date/time, duration/pace, meeting area or "Location TBD") | static text | `src/app/nearby-walks.jsx:587-629` | Read-only. | |
| 3 | "Message (optional)" field, placeholder "Say hello..." | multiline text input | `src/app/nearby-walks.jsx:631-661` | Optional text sent to the host. | |
| 4 | Button "Send Request" (paper-plane) (ES Enviar solicitud) | button | `src/app/nearby-walks.jsx:663-700` (onPress 664; handleJoinRequest 94-110) | `POST /api/social-walks/{id}/join-request {petId, message}` (`src/hooks/useSocialWalks.js:80`). Success Alert "Request sent!" / "The walk owner will review your request.", sheet closes, list refetches. Errors: Alert "Error" + server message ("Walk is full", "Join request already pending", "Cannot join your own walk", "Walk not found or not available"). | 📤 |
| 5 | Notice "The walk owner will review your request. You'll receive a notification with the exact meeting location if approved." | static text | `src/app/nearby-walks.jsx:702-723` | Informational. NOTE: the join-request API only inserts the row; its notification step is an unimplemented comment (`../web/src/app/api/social-walks/[id]/join-request/route.js:114-115`) and no mobile screen can approve or decline. So the host is not notified in the app and approval is not possible from the UI. | |

- **Empty / loading / error states:** button shows spinner + dims while pending; errors as above.
- **Modals / sheets / alerts opened:** success/error Alerts.
- **Back / dismiss behaviour:** X or swipe-down / hardware back (`onRequestClose` 538).

---

### New Walk — `/create-walk`

- **File:** `src/app/create-walk.jsx` · **Reached from:** Buddy Walks "+ Create" (`nearby-walks.jsx:182`) — which itself has no in-app entry.
- **Gating / data needed:** needs a current pet. "Create walk" is disabled until: pet exists, walk name non-empty, date AND time chosen, and — for **Public** walks — a map pin has been dropped (`create-walk.jsx:66-71`). Private walks need no pin. The app does not block past dates; the walk simply never shows in discovery (API lists future walks only).
- **WARNING:** A **Public** walk is stored with visibility `nearby_pets`, listed in every nearby user's "Nearby" tab, with its pin, meeting label and notes visible to strangers (hint text: "Anyone searching for walks nearby can find this."). Defaults: max 4 pets, host approval required (server defaults, `../web/src/app/api/social-walks/route.js`). **Private** walks are visible only to invitees (they appear under their "Invited" tab). The API creates no push notification for invitees (the code only inserts invite rows). Text is run through the content filter (error text is lost; the app shows a generic Alert).

| # | Element (EN label, ES) | Type | Source | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | Back arrow (testID `create-walk-back`), title "New Walk" (ES Nuevo paseo) | header icon | `src/app/create-walk.jsx:116-134` (onPress 118) | `router.back()`; entered data is discarded without prompt. | |
| 2 | "Walk name", placeholder "Morning park loop" (ES Nombre del paseo) | text input | `src/app/create-walk.jsx:142-150` (testID `walk-name-input`) | Required. | |
| 3 | "Date" field | date picker (native) | `src/app/create-walk.jsx:155-156` (`src/components/DateField.jsx:70-71`; testID `walk-date`) | Tap opens/closes the native date picker; stores `YYYY-MM-DD`. Required. | |
| 4 | "Time" field | time picker (native) | `src/app/create-walk.jsx:159-160` (`src/components/TimeField.jsx:71-72`; testID `walk-time`) | Native time picker, `HH:MM`. Required. | |
| 5 | Toggle "Public" (globe) (ES Público) (default selected) | toggle | `src/app/create-walk.jsx:167-176` (onPress 169; testID `toggle-public`) | Selects public visibility; hint "Anyone searching for walks nearby can find this."; invitee section hidden. | 🌍 |
| 6 | Toggle "Private" (lock) (ES Privado) | toggle | `src/app/create-walk.jsx:177-186` (onPress 179; testID `toggle-private`) | Selects private visibility; hint "Only people you invite can see this walk."; shows "Invite people" section. | |
| 7 | Meeting-point map ("Tap the map to drop a pin"), draggable marker, pinned readout (address or "Pinned · lat, lng") | map picker | `src/app/create-walk.jsx:195-196`; `src/components/SocialWalks/WalkMapPicker.jsx` → `src/components/Map/MapLocationPicker.jsx:267-282` (tap 132-138, drag 280) | Tap drops/moves the pin; drag to adjust. Pin is required for Public walks and is sent as `lat/lng`. | 🌍 |
| 8 | Button "My location" (crosshair) (ES Mi ubicación) (testID `walk-map-picker-locate`) | button | `src/components/Map/MapLocationPicker.jsx:309-331` (onPress 310; handler 170-195) | Asks iOS location permission, centres the map on and pins the device's current location. If denied, nothing happens (no message). | |
| 9 | "Place label", placeholder "Place label (e.g. Dog run, east gate)" | text input | `src/app/create-walk.jsx:197-204` (testID `location-name-input`) | Free text sent as both `locationName` and `meetingArea`; shown to all viewers of a public walk. | 🌍 |
| 10 | "Invite people" search, placeholder "Search by name or @handle" (private only) | text input | `src/app/create-walk.jsx:207-221` (testID `invite-search-input`) | After 300 ms and ≥2 chars calls `GET /api/search?q=` (`src/hooks/useSearch.js:22`); spinner while searching; lists matching owners. | |
| 11 | Search result row (@username, full name, check when selected) | list item | `src/app/create-walk.jsx:239-261` (onPress 245; testID `invite-result-<id>`) | Toggles that real user as invitee. | 📤 |
| 12 | Selected invitee chip "@user ✕" | chip | `src/app/create-walk.jsx:223-237` (onPress 228; testID `invitee-chip-<id>`) | Removes the invitee. | |
| 13 | "Notes for guests (optional)", placeholder "Bring water, friendly dogs only..." | multiline text input | `src/app/create-walk.jsx:266-275` (testID `walk-notes-input`) | Free text shown on the walk card to everyone who can see it. | 🌍 |
| 14 | Button "Create walk" (ES Crear paseo) (testID `create-walk-submit`) | button | `src/app/create-walk.jsx:278-304` (onPress 280; handleCreate 81-101) | `POST /api/social-walks {petId, walkName, scheduledAt(ISO), visibility:"nearby_pets"|"private", lat, lng, locationName, meetingArea, notesForGuests, inviteUserIds}` (`src/hooks/useSocialWalks.js:11`). Success → `router.back()` to Buddy Walks (no success message); public walk becomes visible to other users nearby; private walk inserts invite rows for each invitee. Failure → Alert "Error" / "Could not create social walk. Please try again." | 🌍 📤 |

- **Empty / loading / error states:** submit dims until valid; spinner while creating; only the generic failure Alert. No "my walks" list or cancel/delete exists in any screen found, so a created walk cannot be edited or removed from the app.
- **Modals / sheets / alerts opened:** native date/time pickers; iOS location permission; error Alert.
- **Back / dismiss behaviour:** ← or swipe-back; no discard confirmation.

---

### Shared map components — `MapLocationPicker`, `MapLocationView`, `LocationField`

- **Files:** `src/components/Map/MapLocationPicker.jsx` (interactive picker; used via `WalkMapPicker` in New Walk), `src/components/Map/MapLocationView.jsx` (read-only map; used by Walk live and by Services/events/transport), `src/components/Map/LocationField.jsx` (form row that opens the picker in a sheet; used by checkout, events, Rx forms, vet-business forms — none in this part). `src/components/SocialWalks/WalkMapPicker.jsx` is a thin wrapper (value/onChange passthrough).
- **Gating:** Apple Maps on iOS (`PROVIDER_DEFAULT`, no API key). Location permission only requested by "My location" (picker) or by the parent screen.

| # | Element | Type | Source | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | Map tap | gesture | `src/components/Map/MapLocationPicker.jsx:267-274` (handleMapPress 132) | Drops/moves the pin and calls `onChange({lat,lng})`. After 450 ms the pin is reverse-geocoded (network geocoder) and the address line shown. | |
| 2 | Pin drag | gesture | `src/components/Map/MapLocationPicker.jsx:276-281` | Moves the pin. | |
| 3 | "My location" | button | `src/components/Map/MapLocationPicker.jsx:309-331` | See New Walk item 8. | |
| 4 | Address field "Enter an address" (only when `showAddress`, NOT used in New Walk) | text input | `src/components/Map/MapLocationPicker.jsx:218-245` (submit/blur 223-224) | Forward-geocodes and moves the pin; miss shows "Couldn't find that address" (247-255). | |
| 5 | LocationField row "Set location on map" | button | `src/components/Map/LocationField.jsx:91-117` (onPress 93) | Opens a full-screen sheet with the picker. | |
| 6 | LocationField sheet ✕ / "Done" (ES Listo) | buttons | `src/components/Map/LocationField.jsx:137-154` | ✕ discards; Done writes `{lat,lng,address}` back to the form. | |
| 7 | MapLocationView (read-only) | map | `src/components/Map/MapLocationView.jsx:114-166` | Shows markers and a coral route polyline; scroll/zoom disabled unless `interactive`. | |

- **Empty / loading / error states:** no valid points → "No location set" box (MapLocationView `map.noLocation`, lines 91-111); picker with no pin → "Tap the map to drop a pin". Geocoder failures are swallowed.
- **Modals / sheets / alerts opened:** LocationField sheet; iOS permission prompt.
- **Back / dismiss behaviour:** n/a (embedded).

---

### Live walk / Walk report (owner) — `/walk-live`

- **File:** `src/app/walk-live.jsx` · **Reached from:** Dog Walking → live banner or a "Recent walks" card (`src/app/service/walking.jsx:254-259, 415-419`, always with `sessionId`), and from Services "My Activity" live-walk row (`src/components/Services/MyActivity.jsx:159`).
- **WARNING / probable bug:** the My Activity row calls `router.push("/walk-live")` **without a `sessionId`**, so it should land on "Walk not found / This walk is no longer available." Navigate via Dog Walking instead to see a real walk.
- **Gating / data needed:** a walk session of the active pet, created by a walker (check-in or QR pickup); an `in_progress` walk shows LIVE, a `finished` one shows the report. Owner view only: this screen does **not** share the owner's location or send anything — it is read-only, polling `GET /api/pets/{id}/walk-sessions` every 5 s (`src/hooks/useProviders.js:825-840`). All text on this screen is **hardcoded English**.

| # | Element | Type | Source | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | Back arrow | header icon | `src/app/walk-live.jsx:59-64` | `router.back()`. | |
| 2 | Header "Walk in progress" / "Walk report", sub-line walker name · pet, red "LIVE" pill | static | `src/app/walk-live.jsx:65-77, 293-319` | Display. | |
| 3 | Route map (Start pin, "Now"/"End" pin, coral polyline), non-interactive | map | `src/app/walk-live.jsx:122-176` (`MapLocationView`) | Re-fits as new GPS points arrive. Fewer than 2 points → grey box "Waiting for the first GPS points…" or "No route was recorded for this walk." | |
| 4 | Stats tiles "Distance (mi)", "Time (min)", "GPS points" | static | `src/app/walk-live.jsx:178-223` | Display. | |
| 5 | Summary card (Potty 💦 Pee / 💩 Poo / None recorded; Notes; "This walk was added to your pet's Health timeline.") | static | `src/app/walk-live.jsx:225-273` | Shown only when finished. | |
| 6 | Footer "Updating live — the route refreshes as {pet} walks." | static | `src/app/walk-live.jsx:94-105` | Shown while live. | |

- **Empty / loading / error states:** spinner while loading; "Walk not found" / "This walk is no longer available." when the id is missing or not in the pet's sessions; no explicit network-error state.
- **Modals / sheets / alerts opened:** none.
- **Back / dismiss behaviour:** ← `router.back()`.

---

### Followers / Following list — `/follows`

- **File:** `src/app/follows.jsx` · **Reached from:** tapping the Followers or Following count on a pet social profile (`src/app/pet-profile.jsx:213-221`, `router.navigate('/follows?petId=…&rel=followers|following&petName=…')`). Root-stack screen (`src/app/_layout.jsx:126`).
- **Gating / data needed:** `petId` (falls back to the active pet) and `rel`. The Follow/Following toggle appears only when the viewer has an active pet and the row is not that pet itself.
- **Hardcoded English:** title "Followers"/"Following", "Back", search placeholder, "Follow"/"Following", empty texts.

| # | Element | Type | Source | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | "‹ Back" | header button | `src/app/follows.jsx:185-193` | `router.back()` to the pet profile. | |
| 2 | Search "Search by name or @handle" | text input | `src/app/follows.jsx:222-229` (testID `follows-search`) | Client-side filter of the loaded list by pet name / handle. No matches → "No matches". | |
| 3 | Row (avatar, pet name, @handle) | list item | `src/app/follows.jsx:111-128` (onPress 113; openProfile 85-96; testID `follow-row-<id>`) | `router.push` to `/pet-profile` with petId, name, handle, avatar, owner name → that pet's social profile. | |
| 4 | Coral "Follow" / sand "Following" button with paw icon | toggle button | `src/app/follows.jsx:130-157` (onPress 133; toggleFollow 68-83; testID `follow-toggle-<id>`) | Optimistically flips, then `POST /api/pets/{id}/follow` (follow) or `DELETE` (unfollow) with `{followerPetId}`. A NEW follow sends a notification to that pet's owner ("started following your pet", `../web/src/app/api/pets/[id]/follow/route.js:93-100`). On failure the button silently reverts (no message). Not shown for your own pet. | 📤 |

- **Empty / loading / error states:** loading shows nothing; error → "Something went wrong. Please try again." + "Try again" (retry `refetch`, A-33 fix, lines 239-254); empty "No followers yet" / "Not following anyone yet" (or "No matches" while searching). No pull-to-refresh.
- **Modals / sheets / alerts opened:** none.
- **Back / dismiss behaviour:** custom "Back" button → `router.back()`.

---

### Walker workspace (walker/business accounts only; live location sharing) — `/walker-walks`

- **File:** `src/app/walker-walks.jsx` · **Reached from:** business mode (`src/app/business/index.jsx:623`, `src/app/business/bookings.jsx:334`) and a notification tap (`src/app/notifications.jsx:561`). Not reachable from a normal owner account.
- **Gating / data needed:** the account must be active staff of a walking provider ("No walker workspace" / "You're not active staff of a walking provider yet." otherwise). Listed here because it is the only screen that **streams the device's live GPS to another real user** (the pet owner watches it on Walk live).
- Its timer modal (`StartWalkModal`, `src/components/Health/WalkActivity/StartWalkModal.jsx`), `WalkerLiveMap` and `PickupScannerModal` are documented with the Health / business parts.

| # | Element (EN label, ES) | Type | Source | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | Back arrow | header icon | `src/app/walker-walks.jsx:253-258` | `router.back()`. | |
| 2 | "Scan" (QR) (ES Escanear) (testID `walker-scan-pickup`) | button | `src/app/walker-walks.jsx:270-290` (onPress 272; handleScanned 140-179) | Opens the QR scanner; scanning an owner's pickup code reads GPS, redeems it (**spends one prepaid walk credit**), creates an in_progress session and starts GPS tracking. Alerts: "No walks left", "Invalid code", "Couldn't scan". | 💸 ⚠️ |
| 3 | "Accept" on an Incoming request / Nearby now card (testID `accept-request-<id>`) | button | `src/app/walker-walks.jsx:559-580` (onPress 560; handleAccept 210-234) | Accepts the owner's walk request: creates a confirmed booking and opens a chat with the owner. Alert "Walk accepted"; 409 → "No longer available". | 📤 |
| 4 | "Walk history" row (testID `walker-history-link`) | link | `src/app/walker-walks.jsx:353-374` | `router.push("/walker-history")`. | |
| 5 | Booking card "Start" (ES Empezar) | button | `src/app/walker-walks.jsx:491-509` (onPress 492; handleStart 120-136) | Creates the live walk session (check-in) and starts posting the device's GPS point every ~5 s / 10 m to the owner via `useTrackWalk` (`watchPositionAsync`, lines 85-104), opens the timer modal. Failure Alert "Couldn't start walk". | 📤 ⚠️ |
| 6 | Finish inside the timer modal | button | `src/app/walker-walks.jsx:181-201` (handleComplete) | Stops tracking, saves the report (duration, notes) and writes it to the pet's health timeline; Alert "Walk finished" / "The report was saved and added to the pet's health timeline." | ⚠️ |

- **Empty / loading / error states:** spinner; "No walker workspace" and "No walks booked" / "Booked walks from owners will appear here to check in." empty cards. If location permission is denied, time still tracks but the map shows a "no map" note.
- **Modals / sheets / alerts opened:** StartWalkModal, PickupScannerModal, the Alerts above.
- **Back / dismiss behaviour:** ← `router.back()`; closing the timer modal early calls `handleCancel` (stops GPS tracking without finishing).

---

## Risky actions found in Part D

- `src/app/forum-compose.jsx:132` ("Post") — `POST /api/forum/threads` — publishes a thread to the shared Community feed visible to all real users; no confirmation, no in-app edit/delete. 🌍
- `src/app/forum-thread.jsx:256` (comment send) — `POST /api/forum/threads/{id}/comments` — public comment on a real user's thread. 🌍
- `src/components/Forum/VoteControl.jsx:36,56` (used at `community.jsx:78`, `forum-thread.jsx:119,188`) — `POST /api/forum/vote` — changes a public score on real users' posts/comments (reversible by re-tapping). 🌍
- `src/components/moderation/ModerationMenu.jsx:190` (reason rows) — `POST /api/reports` — sends a report immediately (no confirm); server alerts admins via in-app bell and email (`../web/src/app/api/utils/adminAlert.js`). Used on forum threads/comments and Buddy Walks cards. 📤
- `src/components/moderation/ModerationMenu.jsx:96-100` ("Block" in the confirm Alert) — `POST /api/blocks {blocked_user_id}` — mutual hide of posts/comments/walks/DMs and contact block with a real user; no unblock control in these screens. ⚠️
- `src/app/forum-thread.jsx:136,202` — the Report/Block menu is also shown on the tester's own thread/comment (no `isOwn` passed); blocking/reporting yourself will error or file a self-report. ⚠️ (QA note)
- `src/app/create-walk.jsx:280` ("Create walk") — `POST /api/social-walks` — a Public walk (visibility `nearby_pets`) is listed to strangers nearby with its pin, place label and notes; a Private walk makes it visible to chosen real users. Cannot be edited or cancelled from the app. 🌍 📤
- `src/app/create-walk.jsx:245` (invitee results) + `:280` — invitees are real users found via `GET /api/search`; creating the walk adds them as invitees (`social_walk_invites`). 📤
- `src/app/nearby-walks.jsx:664` ("Send Request") — `POST /api/social-walks/{id}/join-request` — sends a join request with the tester's pet and optional message to a real walk host. 📤
- `src/app/follows.jsx:133` — `POST` / `DELETE /api/pets/{id}/follow` — a new follow notifies the other pet's owner ("started following your pet"). 📤
- `src/app/service/walking.jsx:307` ("Find a walker now") — `POST /api/walk-requests` (broadcast, `radius_km:5`) — notifies up to 25 nearby real walkers with the tester's exact GPS. 📤
- `src/app/service/walking.jsx:686` ("Send request") — `POST /api/walk-requests` with `target_provider_id` — notifies that walker's staff; optional pickup GPS (switch default ON, line 596). 📤
- `src/app/service/walking.jsx:574` ("Cancel" on waiting card) — `PATCH /api/walk-requests/{id}` — cancels a live request that a walker may already have seen. ⚠️
- `src/app/(tabs)/training.jsx:250-252` / `src/components/Services/ServicesDiscovery.jsx:488-509` — navigation into `/service/walking`, `/service/training` and `/service/provider` storefronts, where booking / payment flows live (outside this part; treat as 💸 when tested).
- `src/app/walker-walks.jsx:272,140-179` (Scan) — redeems a prepaid walk pack credit via the pickup-QR redeem endpoint and starts a live session. 💸 ⚠️ (walker accounts only)
- `src/app/walker-walks.jsx:560` ("Accept") — accepts a walk request, creates a confirmed booking and opens a chat with the owner. 📤 (walker accounts only)
- `src/app/walker-walks.jsx:85-104,492` ("Start") — streams device GPS every ~5 s to the owner's live view via the walk-session track endpoint. 📤 ⚠️ (walker accounts only)
- Low-risk writes (not flagged): `src/app/(tabs)/training.jsx:550` `POST /api/training/self-progress` (own progress only).

## Coverage gaps / notes for the author of the final inventory
- `/service/training` (target of the Care tab "Want a pro? Hire a trainer" banner), `/service/provider`, `/provider-messages`, `/events`, `/pet-profile`, `/service/adoption`, `/service/following`, `/(tabs)/more/data-access`, `/walker-history`: link targets only; not inventoried here.
- `StartWalkModal`, `WalkerLiveMap`, `PickupScannerModal` (used by Walker workspace): referenced, not inventoried (Health / business parts).
- `ServicesDiscovery.jsx` is documented only for the controls the Care hub exposes; its full inventory (Stores & Vets, places group, wide-screen split view, bottom sheet map) belongs to the Services-tab part.


---

<!-- ===== PART E ===== -->

## Part E — Stores & Vets tab and consumer-side Pet Services

All paths below are relative to `anything/apps/mobile/` unless noted. i18n keys live in `src/i18n/locales/en.json` / `es.json`.
Navigation note: every `src/app/service/*` screen lives in a root-level stack (`src/app/service/_layout.jsx:14`, `headerShown:false`) that presents OVER the tab bar; "back" returns to whichever tab opened it.

---

### Stores & Vets tab (shell: Discover | My Activity) — `/(tabs)/services`
- **File:** `src/app/(tabs)/services.jsx` · **Reached from:** bottom tab bar, tab labelled "Services" / "Stores & Vets" (`src/app/(tabs)/tabsConfig.js` + `_layout.jsx`). Mounted lazily on first focus via `FirstFocusGate` (`services.jsx:127-133`).
- **Gating / data needed:** none to see the shell. Fires anonymous funnel event `services/services_tab` on mount (`services.jsx:24-26`). Default pane = Discover.
| # | Element (EN label from en.json, ES if short) | Type | Source (`path:line`) | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | "Discover" / "Descubrir" segment (`services.segDiscover`) | tab (segmented) | `src/app/(tabs)/services.jsx:57-84` | Sets pane=discover → renders `ServicesDiscovery variant="landing" showHeader={false}` (section "Discovery body" below). Selected segment has white card background. | |
| 2 | "My Activity" / "Mi actividad" segment (`services.segActivity`) + coral numeric badge | tab (segmented) | `src/app/(tabs)/services.jsx:57-107` | Sets pane=activity → renders `MyActivity` (section below). Badge = unread provider-message count (`useUnreadCount`), only shown when > 0. | |

- **Empty / loading / error states:** shell has none of its own; each pane owns its states (below).
- **Modals / sheets / alerts opened:** none from the shell.
- **Back / dismiss behaviour:** tab root; no back arrow. Switching tabs keeps state of the pane (pane state is local `useState`).

---

### Discover (unified providers + pet-friendly places) — `ServicesDiscovery` (variant `landing` in the tab, variant `screen` at `/service/discover`)
- **File:** `src/components/Services/ServicesDiscovery.jsx` (shared body); route wrapper `src/app/service/discover.jsx:8-18` · **Reached from:** (a) Services tab → "Discover" segment (`src/app/(tabs)/services.jsx:116`); (b) pushed `/service/discover[?category=<key>]` (deep link; legacy aliases veterinary/shops/groomer/walker/sitter/trainer/pharmacy resolve via `src/constants/servicesCategories.js:59-82`; a care key such as `walking` falls back to "All" on this hub). The Care tab (`training.jsx`) reuses this same component with Care categories (not documented here).
- **Gating / data needed:** none. Asks for device location permission once on mount (`ServicesDiscovery.jsx:243`) – iOS dialog "Allow While Using App"; list waits up to 3 s for the answer (`:104`) then loads unlocated. Data: `GET /api/services/discover` (`src/hooks/useServicesDiscover.js:34`). Live prod may be empty if no providers/places seeded. Map engine = Apple Maps on iOS only; Android/web show a "Map coming soon" placeholder and the List/Map toggle is hidden (`:152`, `:349`). Wide screens (iPad/web) show list + map side-by-side with no toggle.
| # | Element (EN label from en.json, ES if short) | Type | Source (`path:line`) | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | Back arrow (a11y "Back") — only when `variant="screen"` and header shown | header icon | `ServicesDiscovery.jsx:918-924` | `router.back()` → previous screen. Not present in the tab (header hidden, `services.jsx:116`). | |
| 2 | "List" / "Map" segmented toggle (`discover.viewList`/`viewMap`) — narrow iOS screens only | tab (segmented) | `ServicesDiscovery.jsx:565-611` | Switches between full list and full-screen Apple-Map with a draggable bottom sheet (snap 25/55/90%) holding the same results. | |
| 3 | Category filter button "All" / label / "N selected" (`discover.filterCategory`) | button | `ServicesDiscovery.jsx:624-632` | Opens the Category picker modal (rows 17-21). | |
| 4 | Category button small "x" Clear (`discover.clear`) — only when ≥1 category chosen | button | `ServicesDiscovery.jsx:630` (`FilterButton` `:1128-1131`) | Clears all selected categories → "All". | |
| 5 | Area filter button "All areas" / place name / "Search near me" (`discover.byArea`) | button | `ServicesDiscovery.jsx:633-639` | Opens the Area picker modal (rows 22-25). | |
| 6 | Search field "Search services & places" (`discover.searchUnifiedPlaceholder`) | text input | `src/components/Providers/ProviderListControls.jsx:100-102` (rendered `ServicesDiscovery.jsx:645-652`) | Live client-side name filter; also matches service-type words (e.g. "vet", "veterinaria", "cafe") via `extraText` (`ServicesDiscovery.jsx:321-333`). | |
| 7 | Search "x" (a11y "Clear search" `providers.clearSearch`) — only with text typed | button | `ProviderListControls.jsx:110-111` | Empties the search box. | |
| 8 | Sort chips "Suggested / Top rated / Most reviewed" (+ "Nearest" once device/searched coordinates exist) | tab (chips) | `ProviderListControls.jsx:126-147`; `PROVIDER_SORTS` `:18-21`; nearest added `ServicesDiscovery.jsx:340-346` | Re-sorts list client-side (rating desc, review count desc, nearest by `distance_km`). | |
| 9 | "Open now" toggle (`discover.openNow`) | toggle | `ServicesDiscovery.jsx:654-677` | Hides providers PROVEN closed from `hours_json`; places (no hours) and providers without hours stay. | |
| 10 | Result card (provider or place): name, category/capability pills, RatingBadge ("New" if no reviews), "N km away", chevron | list item | `ServicesDiscovery.jsx:1390-1520` (`ResultCard`), handler `openItem` `:488-509` | PLACE → `router.push /service/place?id=<id>`. PROVIDER with any storefront capability (vet, telehealth, groomer, walker, sitter, daycare, trainer, shop, pharmacy) → `/service/provider?slug=<slug>`. Provider with ONLY adoption → `/service/adoption?providerId=<id>`; ONLY insurance → `/service/insurance`; ONLY transport → `/service/transport`. Also highlights the card/pin. | |
| 11 | Map pin (Apple Maps, max 60 pins) | map marker | `ServicesDiscovery.jsx:513-516`, `DiscoverMap` `:1331-1388` | Highlights pin's card, hoists it to top of list, raises bottom sheet to 55%. Drill-in only by tapping the card. | |
| 12 | Map pan/zoom | gesture | `ServicesDiscovery.jsx:520-524` | After 400 ms debounce, narrows list + pins to the visible region (map/split layouts only). Footnote "N of M shown on map" / "No results have a location yet". | |
| 13 | Pull-to-refresh on list | pull-to-refresh | `ServicesDiscovery.jsx:687`, `:803-809`, `:890-896` | Refetches `/api/services/discover`. | |
| 14 | "Clear filters" (`discover.clearFilters`) on "No matches" empty state | button | `ServicesDiscovery.jsx:719-733` | Resets categories, area, open-now, search text, sort, viewport. | |
| 15 | "Try again" (`common.retry`) on error state | button | `ServicesDiscovery.jsx:1590-1602` | Refetches discover. | |
| 16 | Location-denied banner "Allow location to find places near you." | banner (info) | `ServicesDiscovery.jsx:545-562` | Shown if permission denied; informational only. | |
| **Category picker modal** (`discover.categoryPickerTitle` "Choose a category") |||||
| 17 | "All" pill (`discover.cat.all`) | button | `ServicesDiscovery.jsx:950-955` | Clears category selection (picker stays open). | |
| 18 | "Services" group header with count + chevron (`discover.groupServices`) | button (collapse) | `ServicesDiscovery.jsx:959-965` | Collapses/expands service pills. | |
| 19 | Service pills (Stores & Vets hub): Vet, Telehealth, Grooming, Shop, Adoption, Transport, Insurance | toggle (multi-select) | `ServicesDiscovery.jsx:968-976`; list `src/constants/servicesCategories.js:21-29` | Toggles category (union filter, client-side); picker stays open for multi-select. | |
| 20 | "Places" group header + pills: Restaurants, Cafés, Bakeries, Breweries, Bars, Parks, Hotels, Markets | button/toggle | `ServicesDiscovery.jsx:983-1000`; `servicesCategories.js:43-52` | Same as above for pet-friendly places. | |
| 21 | Backdrop tap / close | dismiss | `ServicesDiscovery.jsx:1195-1210` (`PickerModal`) | Closes picker. | |
| **Area picker modal** (`discover.areaPickerTitle` "Choose an area") |||||
| 22 | "City or neighborhood" input (`discover.searchLocationPlaceholder`) | text input | `ServicesDiscovery.jsx:1046-1060` | Submit (keyboard "search") → `geocodeLocation` (OpenStreetMap Nominatim, `src/utils/geocoding`). Hit: sets coords, radius-bounds to 25 km, sorts Nearest, closes picker, recenters map. Miss: red "Location not found". | |
| 23 | "All areas" row | list item | `ServicesDiscovery.jsx:1075-1080` | Clears nearMe/location; closes picker. | |
| 24 | "Search near me" row (`discover.searchNearMe`) | list item | `ServicesDiscovery.jsx:1081-1087`, handler `:420-441` | Requests location permission; if granted attaches device lat/lng and sorts Nearest; if denied shows the denied banner. | |
| 25 | Backdrop tap | dismiss | `ServicesDiscovery.jsx:1013` | Closes picker. | |

- **Empty / loading / error states:** loading = coral spinner (`discover-loading`, `:768-773`); error = "Couldn't load providers / Something went wrong. Pull down or tap retry." + "Try again" (`:774-775`, `:1559-1602`); no data at all = "No providers yet / Trusted pet businesses are joining PawPi. Check back soon." (`:776-783`); filter produced nothing = "No matches / No providers match your search or filters." + "Clear filters". Errors are generic (no raw technical text).
- **Modals / sheets / alerts opened:** Category picker and Area picker (inline above, rows 17-25); iOS system location-permission prompt (on mount and on "Search near me"). No Alert.alert.
- **Back / dismiss behaviour:** tab variant has no back; `/service/discover` variant uses `router.back()`.

---

### My Activity (owner hub) — `MyActivity` (pane in Services tab; also pushed at `/service/activity`)
- **File:** `src/components/Services/MyActivity.jsx`; wrapper `src/app/service/activity.jsx:15-53` · **Reached from:** Services tab → "My Activity" segment (`services.jsx:118`); push `/service/activity` (header "Activity / Your messages and active bookings" with back arrow `activity.jsx:33-39`).
- **Gating / data needed:** logged-in owner. Rows appear only when data exists (see Gating column). Reads: `GET /api/me/bookings` (primary), unread count, shop orders, shop subscriptions, saved places, and – only with a current pet – walk sessions, daycare stays, sitting visits (`MyActivity.jsx:79-89`). Pull-to-refresh via `RefreshableScrollView` (`:147`) refetches all.
| # | Element (EN label from en.json, ES if short) | Type | Source (`path:line`) | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | "Live walk in progress / Follow your dog's walk live" (coral-bordered) — only when a walk session is `in_progress` | list item | `MyActivity.jsx:152-160` | `router.push("/walk-live")` → live walk map (documented in another part). | |
| 2 | "Messages" – subtitle "N unread" or "No messages yet", numeric badge | list item | `MyActivity.jsx:164-175` | `router.push("/provider-messages")` → owner/provider chat inbox. | |
| 3 | "Pending requests" section rows (`activity.pendingRequests`): "<Provider> · <Pet>", "<service> · <date>", chip "Pending" — only if ≥1 booking with status `requested` | list item | `MyActivity.jsx:181-188`, `UpcomingBookingRow` `:329-347` | Opens `openBooking` (`:63-71`): telehealth booking WITH a session → `/service/telehealth`; everything else → `/service/booking-summary?id=<id>`. | |
| 4 | "Upcoming" rows (max 5; chip Confirmed etc.) | list item | `MyActivity.jsx:195-202`, `:329-347` | Same routing as row 3. Empty text "No active bookings yet". | |
| 5 | "Daycare stays – N active" (badge) — only if ≥1 active stay (booked/checked_in) | list item | `MyActivity.jsx:207-214` | `router.push("/service/daycare")`. | |
| 6 | "Sitting visits – N active" — only if ≥1 non-completed/cancelled visit | list item | `MyActivity.jsx:220-227` | `router.push("/sitter-visits")`. | |
| 7 | "Saved places – Your pet-friendly favorites" — only if ≥1 saved | list item | `MyActivity.jsx:233-239` | `router.push("/service/places")`. | |
| 8 | "My orders" – "N orders" / "No orders yet" | list item | `MyActivity.jsx:244-255` | `router.push("/service/shop")` (shop screen, orders view). | |
| 9 | "Auto-reorder" – "N active" / "No active plans" | list item | `MyActivity.jsx:256-267` | `router.push("/service/shop")` (same screen; subscriptions section). | |
| 10 | "Past & others (N)" header with chevron | button (collapse) | `MyActivity.jsx:278-294` | Expands/collapses past list (collapsed by default). If zero: static "Past & others / No past bookings". | |
| 11 | Past rows (max 5): "<Provider> · <Pet>", "Past · <date>" (or just date for cancelled/declined), status chip | list item | `MyActivity.jsx:296-300`, `PastBookingRow` `:354-380` | `router.push /service/booking-summary?id=<id>`. | |
| 12 | "See all (N)" – only when > 5 past | link | `MyActivity.jsx:302-315` | `router.push("/service/past-bookings")`. | |

- **Empty / loading / error states:** loading = spinner `activity-loading` while the bookings query loads (`:135-143`); sections each have friendly empty rows; no explicit error UI (failed queries just show empty counts). Cancelled/declined future bookings are folded into Past with a muted chip (`:96-104`). Status chip text: Requested/Confirmed/Completed/Declined/Cancelled (`BookingStatusChip.jsx:11-17`).
- **Modals / sheets / alerts opened:** none.
- **Back / dismiss behaviour:** pane in tab – none; pushed `/service/activity` – back arrow `router.back()`.

---

### Shared widget: Provider list controls / Rating badge / Booking status chip
- **File:** `src/components/Providers/ProviderListControls.jsx`, `RatingBadge.jsx`, `BookingStatusChip.jsx` · **Reached from:** Discover, `/service/places`, other provider lists (rows documented once under "Discover" rows 6-8).
- **Gating / data needed:** none.
- RatingBadge shows ★ average + review count, or the word "New" (`rating.new`) when there are no reviews (`RatingBadge.jsx:27`); not interactive. BookingStatusChip is a non-interactive coloured pill.
- **Empty / loading / error states:** n/a. **Modals:** none. **Back:** n/a.


---

### Provider storefront (business profile) — `/service/provider?slug=<slug>[&capability=<cap>]`
- **File:** `src/app/service/provider.jsx` · **Reached from:** Discover result card (`ServicesDiscovery.jsx:508`), My claims row (`src/app/service/my-claims.jsx:65-70`), Following list row (`src/app/service/following.jsx:23`), other service lists. Public profile loaded from `GET /api/providers/public/<slug>` (`src/hooks/useProviders.js:112`).
- **Gating / data needed:** a published provider; if not found shows "Provider not found / This provider isn't available right now." (hard-coded English, `provider.jsx:539-552`). Which tabs/CTAs appear depends on the provider's capabilities and data (`src/constants/storefrontTabs.js`): Services tab only if the provider has services; Products tab if shop/pharmacy or any products; Adoption tab only if capability `adoption` AND ≥1 listing; Posts tab only if ≥1 post; Locations tab for bookable providers with locations; Reviews and About always. Order: shop+bookable = Services, Adoption, Products, Posts, Reviews, Locations, About; shop only = Products, Adoption, Posts, Reviews, About; bookable = Services, Adoption, Posts, Reviews, Locations, About. The provider may override order (`storefront_section_order`). Message / Follow need login. Booking/checkout need an active pet. Fires funnel `services/provider_view` (`provider.jsx:121`).
| # | Element (EN label from en.json, ES if short) | Type | Source (`path:line`) | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | Back arrow + provider name in glass header | header icon | `src/app/service/provider.jsx:511-519` | `router.back()`. | |
| 2 | Cover image (if set) | image | `provider.jsx:564-590` | Display only. | |
| 3 | StoreHeader: logo, name, handle, bio, RatingBadge, "Open now"/"Closed" pill, "from $X" | display | `src/components/Providers/StorefrontPanels/StoreHeader.jsx:64-175` | Display only (open-now from first location hours). | |
| 4 | Rating summary (stars + count) | button | `StoreHeader.jsx:95-105` → `provider.jsx:601` | Switches to the Reviews tab. | |
| 5 | Instagram chip (only when `instagram_url` set) | link | `StoreHeader.jsx:120-125` | `Linking.openURL(instagram_url)` → opens Instagram app/browser. | ⚠️ |
| 6 | "Is this your business?" ClaimCTA card (only when `claim_status==="unclaimed"`, i.e. seeded directory entries) — button "Claim it" / "Retry claim" / "Claim submitted"(disabled) | button | `src/components/Providers/ClaimCTA.jsx:94-120` (rendered `provider.jsx:609-611`) | Logged out: Alert "Sign in to claim your business." [Sign in / Cancel]. Logged in: opens the Claim modal (see "Claim this business modal"). | 📤 |
| 7 | "Follow" / "Following" button | toggle | `src/components/Providers/ProviderFollowButton.jsx:44-75` (rendered `provider.jsx:625`) | Logged out: Alert "Sign in to follow this business" [Sign in]. Logged in: `POST /api/providers/<id>/follow` (or `DELETE` to unfollow); error Alert "Couldn't update. Please try again." Follower sees business posts in feed. | 🌍 |
| 8 | "Message" (a11y "Message provider") | button | `provider.jsx:626-670` | Starts/opens a chat thread: `POST /api/threads {providerId}` then `router.push /provider-chat?threadId&providerName&ownerUserId`. Creates a real thread visible to the provider (no message sent until the user types one in the chat). | 📤 |
| 9 | Storefront tab bar (Services / Adoption / Products / Posts / Reviews / Locations / About); hidden if only 1 tab | tab | `provider.jsx:970-1017` | Switches active panel (panels stay mounted, hidden). | |
| 10 | Pull-to-refresh (whole page) | pull-to-refresh | `provider.jsx:556-557` | Refetches profile (+ adoption listings if shown). | |
| **Services tab** (`ServicesPanel`) |||||
| 11 | Service row (name, description, price, duration, image, "Featured" badge) | list item | `src/components/Providers/StorefrontPanels/ServicesPanel.jsx:104-108` → `provider.jsx:285-298` | Opens BookingFormModal with that service preselected (never shows the capability chooser). Row tappable only because `onPressService` is passed. | 💸 (leads to booking) |
| 12 | "Book" button on a service row | button | `ServicesPanel.jsx:83-96` | Same as row 11. | 💸 |
| 13 | Walk packages card (walker providers with packages only): balance text "You have N walks with X" | display | `src/components/Providers/WalkPackagesSection.jsx:30-50` | Display only. Balance from `GET /api/providers/<id>/walk-credits`. | |
| 14 | "Show QR" (only if balance > 0 and owner has a pet) | button | `WalkPackagesSection.jsx:51-54` → `provider.jsx:380` | Opens WalkPickupQRModal. | |
| 15 | "Schedule with my pack" (balance > 0 and pet) | button | `WalkPackagesSection.jsx:72-75` → `provider.jsx:178-183` | Opens BookingFormModal for `walker` in pay-with-credit mode (no checkout; one credit is spent at pickup). | 📤 |
| 16 | Package "Buy" ("Single walk" / "N walks", "$X per walk") | button | `WalkPackagesSection.jsx:124-138` → `provider.jsx:184-205` | No pet: Alert "Add a pet first". Else `POST /api/pets/<petId>/walk-package-checkout {provider_id, walk_package_id, rail:"mercadopago"}` then `Linking.openURL(checkoutUrl)` → **MercadoPago payment in browser/app; real money moves if the user completes it**. Failure: Alert "Couldn't start checkout" + server message. No confirm dialog before leaving the app. | 💸 |
| **Products tab** (`StorefrontBrowse`, shared cart) |||||
| 17 | "Order again" rail cards (only if the buyer has past orders with this store whose products are still available) | list item | `src/components/Providers/StorefrontPanels/StorefrontBrowse.jsx:72-86` | Opens product detail sheet (row 24). | |
| 18 | "Search this store" field | text input | `StorefrontBrowse.jsx:112-117` | Client-side filter on products. | |
| 19 | Category chips ("All" + categories) | tab (chips) | `StorefrontBrowse.jsx:133-138` | Filters grid. | |
| 20 | Product card (image, name, price, "-N%" badge, "Featured", "N in stock"/"Sold out") | list item | `StorefrontBrowse.jsx:177`, `ProductGridCard` `:189-322` | Opens product detail sheet. | |
| 21 | Heart on card (a11y "Favorite") | toggle | `StorefrontBrowse.jsx:243-245` | Toggles local-only favourite (in-memory Set, not saved to server). | |
| 22 | "+" quick-add on card (a11y "Add to cart") + qty badge | button | `StorefrontBrowse.jsx:283-286` → `provider.jsx:405` | Adds 1 to the local cart (clamped to stock). No server call yet. | |
| 23 | Empty: "This store hasn't listed any products yet." | empty state | `StorefrontBrowse.jsx:165` | | |
| 24 | Product detail sheet (page-sheet modal): back arrow, carousel, Favorite, "Read more/Read less", stock, "Delivery & pickup options shown at checkout", "-" (Remove one), "Add to cart" / "In cart · N" | modal | `provider.jsx:834-877`; `ProductDetail.jsx:77-197` | Back (`provider.jsx:851-853`) closes. "Add to cart" `ProductDetail.jsx:182-183` +1; "Remove one" `:173` -1. Local cart only. | |
| 25 | Floating cart bar "Checkout · $total" (appears when cart has lines) | button | `src/components/Providers/StorefrontPanels/StorefrontCheckout.jsx:45-55` → `provider.jsx:705-713` | Opens the Checkout sheet (row 26). | |
| 26 | Bottom bar "Shop" button (shop providers) | button | `provider.jsx:729-756` | Switches to Products tab. | |
| **Checkout sheet** (`StorefrontCheckoutSheet`) |||||
| 27 | Close (X, a11y "Close") | header icon | `StorefrontCheckout.jsx:115-117` | Closes sheet; cart kept. | |
| 28 | "Pickup" / "Delivery" chips | tab (chips) | `StorefrontCheckout.jsx:126-134` | Selects fulfilment. Pickup shows "Pick up at <store>". | |
| 29 | Delivery address field ("Delivery address") — delivery only | text input / location search | `StorefrontCheckout.jsx:182-186` (`LocationField`) | Required for delivery; Pay stays disabled until non-empty. | |
| 30 | "Pay · $total" | button | `StorefrontCheckout.jsx:190-205` → `src/hooks/useStorefrontCart.js:66-122` | No pet: Alert "Add a pet first / Set up a pet to check out." Else `POST /api/pets/<petId>/shop-checkout {provider_id, items[{product_id,quantity}], rail:"mercadopago", fulfillment_type, shipping_address}` then `Linking.openURL(checkoutUrl)` → **MercadoPago**; Alert "Complete your payment – Finish paying in MercadoPago… not confirmed until your payment goes through." Cart is cleared and sheet closes. If server returns no URL: Alert "Payment couldn't start… nothing was charged". Failure: Alert "Couldn't check out" + server message. Order stays PENDING until MercadoPago webhook. | 💸 |
| **Posts tab** |||||
| 31 | Stat row Posts · Paws · Barks · Followers | display | `provider.jsx:417-420`; `StorefrontPanels/BusinessStatRow.jsx:13-38` | Display only. | |
| 32 | Post tile (image + comment-count badge) | list item | `StorefrontPanels/PostsPanel.jsx:28-40,74` | `router.push /service/provider-post?providerId&postId`. Empty: "No posts yet / This business's posts will appear here." | |
| **Adoption tab** |||||
| 33 | Dog card (grid) | list item | `provider.jsx:451-465` (`DogProfileCard` from `src/components/adoption/AdoptionListingViews.jsx`) | Opens `ListingDetailModal` (see "Adoption listing detail / apply modal"). | |
| **Reviews tab** |||||
| 34 | "Leave a review" (coral button) — ONLY when the owner has a completed booking with this provider | button | `StorefrontPanels/ReviewsPanel.jsx:25-45` → `provider.jsx:309-320,475` | Opens WriteReviewModal. Else text "No reviews yet. After a completed appointment you can be the first to leave one." (hard-coded English `ReviewsPanel.jsx:52-55`). Review cards are read-only. | 🌍 |
| **Locations tab / About tab** |||||
| 35 | Location cards (address, phone) | display | `StorefrontPanels/LocationsPanel.jsx:13-37` | Display only (not tappable). | |
| 36 | About text + link chips: Website, Instagram, Facebook, Google Maps | link | `StorefrontPanels/AboutPanel.jsx:68-95` | `Linking.openURL(url)` → leaves the app. Empty: "No additional details yet." | ⚠️ |
| **Bottom action bar** |||||
| 37 | "Book" / "Book · from $X" (a11y "Book appointment") — ONLY for bookable providers that list ZERO services | FAB-style button | `provider.jsx:762-789` → `openBooking` `:268-277` | If several bookable capabilities → capability chooser modal (row 38); else opens BookingFormModal. | 💸 |
| 38 | Capability chooser: "What would you like to book?" with options Vet/Grooming/Telehealth/Walking/Sitting/Daycare/Training | modal list | `provider.jsx:909-961` (testID `storefront-cap-choose-<cap>`) | Picks capability → BookingFormModal. Backdrop tap closes. | |

- **Empty / loading / error states:** spinner while loading (`provider.jsx:522-524`); not-found card (hard-coded English); each tab hides itself if empty; API errors on profile → not-found card.
- **Modals / sheets / alerts opened:** Booking form (below), Checkout sheet (rows 27-30), Product detail (row 24), WriteReviewModal, Claim modal, ListingDetailModal (adoption), WalkPickupQRModal, capability chooser.
- **Back / dismiss behaviour:** header arrow `router.back()`; system swipe-back also works. Modal sheets dismiss via their own close/back.

---

### Booking form (modal) — `BookingFormModal` (+ `BookingSlotPicker`)
- **File:** `src/components/Providers/BookingFormModal.jsx`, `src/components/Providers/BookingSlotPicker.jsx` · **Reached from:** storefront service row / "Book" (`provider.jsx:797-811`); may also be used by other service screens (vet.jsx / grooming.jsx etc. – see their sections).
- **Gating / data needed:** requires an active pet (`useCurrentPet`); without one the inline note "You don't have an active pet yet…" shows and Confirm raises Alert "No active pet". Fires funnel `booking_start` on open and `booking_done` on success.
- **Behaviour by capability:** slot-based (vet, groomer, trainer, telehealth) use a month calendar + discrete slots from `GET /api/providers/<id>/availability`; others (walker, sitter, daycare) use free-form Date + Time fields. If provider has both in-person and telehealth, a "Modality" toggle appears.
| # | Element (EN label from en.json, ES if short) | Type | Source (`path:line`) | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | Close (X, a11y "Close") | header icon | `src/components/KeyboardSafeFormModal.jsx:107-109` | Closes modal and resets the form. | |
| 2 | Title "Book with <provider>", subtitle "For <pet>" | display | `BookingFormModal.jsx:380-385` | | |
| 3 | Preselected service banner "Booking: <service> · $price" (when opened from a service row) | display | `BookingFormModal.jsx:421-436` | Selector collapsed. | |
| 4 | Service chips: "General" + each service "name · $price" (when nothing preselected; auto-selected if exactly 1 service) | toggle chips | `BookingFormModal.jsx:437-467` (testID `booking-service-<id>`) | Chooses `service_id`; price/payment policy drives the CTA amount and payment note. | |
| 5 | Payment note (only when service `payment_policy` is `deposit` or `full` and amount > 0): "A deposit/Payment of $X is required… You'll be sent to MercadoPago to pay — if it's declined, you're refunded automatically." | info | `BookingFormModal.jsx:470-490` | Warns that Confirm will go to MercadoPago. | 💸 |
| 6 | In-person note (`payment_policy` none): "No online payment — just request the booking and pay <provider> in person." | info | `BookingFormModal.jsx:496-512` | | |
| 7 | Location chips: "Any" + each location (only if provider has locations) | toggle chips | `BookingFormModal.jsx:515-541` | Sets `provider_location_id`. | |
| 8 | Modality chips "In person" / "Video call" (only when slot capability AND provider also has telehealth) | toggle chips | `BookingFormModal.jsx:549-574` | Switches capability between in-person and `telehealth`; clears slot. | |
| 9 | Month calendar prev/next arrows (a11y "Previous month"/"Next month") | button | `BookingSlotPicker.jsx:107-122` | Changes month; refetches availability. | |
| 10 | Day cell (disabled when no slots) | button | `BookingSlotPicker.jsx:158-165` | Selects day; shows its time slots. Empty: "No available slots for this month"; before picking: "Pick a date to see available times". | |
| 11 | Time-slot chip | button | `BookingSlotPicker.jsx:232-233` | Selects slot (start/end). | |
| 12 | Date field / Time field (non-slot capabilities: walker, sitter, daycare) | native picker | `BookingFormModal.jsx:596,601` (testID `booking-date`/`booking-time`) | Sets `appointment_date` (YYYY-MM-DD) / `appointment_time` (HH:MM). | |
| 13 | Notes ("Describe symptoms or special needs…") | text input (multiline) | `BookingFormModal.jsx:609-625` | Free text sent to provider. | |
| 14 | Recurring chip ("Repeat every 6 weeks" for grooming; "Repeat weekly (pack walk)" for walking) — only for those capabilities | toggle | `BookingFormModal.jsx:629-659` (testID `booking-recurrence`) | Sets `recurrence_rule` (FREQ=WEEKLY;INTERVAL=6/1). | 📤 |
| 15 | "Add to calendar" toggle | toggle | `BookingFormModal.jsx:666-694` (testID `booking-add-calendar`) | On confirm, writes an event to the phone calendar (asks iOS calendar permission); never blocks the booking. | |
| 16 | CTA: "Reserve appointment · $X" (slot types) / "Confirm <noun> · $X" (others); "Sending…" while pending. Disabled until a slot is chosen (slot types) | button | `BookingFormModal.jsx:387-399` → `handleConfirm :231-374` | Validations: no pet → Alert "No active pet"; no slot → Alert "Pick a time"; no date/time → Alert "Pick a date and time". Then: (a) **payment required** (`deposit`/`full` policy and not pay-with-credit): `POST /api/payments/checkout {provider_id, service_id}` (server computes amount) → creates order; then `POST /api/providers/<id>/book` with `order_id`; then Alert "Almost done — complete payment" and `Linking.openURL(checkoutUrl)` → **MercadoPago**; if no URL: Alert "Payment couldn't start… nothing was charged" (the booking row already exists unpaid). (b) **pay-with-credit walk**: `POST /book` with `pay_with_credit:true`; Alert "Walk scheduled – … One credit is used at pickup." (c) **no payment**: `POST /book`; Alert "Request sent! <provider> will confirm your <noun> soon." Errors: Alert "Couldn't book" + server message. The provider is notified of a new booking request; owner sees it as "Pending" in My Activity. | 💸 📤 |

- **Empty / loading / error states:** slot picker shows spinner then "No available slots for this month"; booking errors shown via Alert with the raw server message (can be technical).
- **Modals / sheets / alerts opened:** system Alerts listed in row 16; iOS calendar permission prompt; MercadoPago opened via `Linking` (external browser/app).
- **Back / dismiss behaviour:** X closes and resets; Android hardware back = `onClose`.

---

### Write a review (modal) — `WriteReviewModal`
- **File:** `src/components/Providers/WriteReviewModal.jsx` · **Reached from:** storefront Reviews tab "Leave a review" (`provider.jsx:880-886`, only with a completed booking).
- **Gating / data needed:** completed booking with this provider; server enforces one review per booking.
| # | Element (EN label from en.json, ES if short) | Type | Source (`path:line`) | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | Close | header icon | `WriteReviewModal.jsx:98-99` | Closes (disabled while submitting). | |
| 2 | Star buttons 1-5 (a11y "Rate N stars") | button | `WriteReviewModal.jsx:133-135` | Sets rating. | |
| 3 | Body field "Share a few words about your experience (optional)" | text input | `WriteReviewModal.jsx:146-150` | Optional text. | |
| 4 | "Submit review" | button | `WriteReviewModal.jsx:168-184` → `handleSubmit :38-60` | Rating 0 → Alert "Pick a rating". Else `POST /api/providers/<id>/reviews {rating, body, pet_id}`; success Alert "Thanks! Your review has been posted." and closes; error Alert "Couldn't post review" + server message. The review is shown publicly on the business page. | 🌍 |

- **Empty / loading / error states:** spinner on submit button; errors via Alert. **Back:** Close button / hardware back (`onRequestClose`).

---

### Claim this business (modal) — `ClaimModal` inside `ClaimCTA`
- **File:** `src/components/Providers/ClaimCTA.jsx:134-296` · **Reached from:** storefront ClaimCTA button (unclaimed directory listings only).
- **Gating / data needed:** logged in; business `claim_status==="unclaimed"`; no pending claim by this user.
| # | Element (EN label from en.json, ES if short) | Type | Source (`path:line`) | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | Close (X) | header icon | `ClaimCTA.jsx:187` | Closes. | |
| 2 | Method chips "Business phone / Business email / Document" (tap again to deselect) | toggle chips | `ClaimCTA.jsx:202-231` | Chooses verification method. | |
| 3 | "Anything else? (optional)" note (max 500 chars) | text input | `ClaimCTA.jsx:241-259` | Free text for reviewers. | |
| 4 | "Send claim" | button | `ClaimCTA.jsx:262-284` → `useOpenClaim` (`src/hooks/useProviderClaims.js:44-60`) | `POST /api/providers/<id>/claim {method, note}`; success Alert "Claim submitted – We'll review your claim…" and the CTA becomes disabled "Claim submitted"; errors: 409 "already claimed"/"claim already pending", 404 "no longer available", else "Please try again in a moment." (title "Couldn't submit claim"). Goes to a human reviewer; a request only, no ownership change until approved. | 📤 ⚠️ |

- **Empty / loading / error states:** spinner on button. **Back:** X / swipe-down (pageSheet).

---

### Walk pickup QR (modal, owner side) — `WalkPickupQRModal`
- **File:** `src/components/Providers/WalkPickupQRModal.jsx` · **Reached from:** storefront Services tab "Show QR" (walker with prepaid credits) `provider.jsx:897-905`; also elsewhere that shows a pack balance.
- **Gating / data needed:** owner has a pet and ≥1 prepaid walk credit with that walker.
| # | Element | Type | Source | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | Close (a11y "Close") | button | `WalkPickupQRModal.jsx:54` (testID `walk-pickup-qr-close`) | Closes. | |
| 2 | QR code + text "Show this to your walker at pickup — scanning it starts the walk and uses one credit." + "N walks left with X" | display | `WalkPickupQRModal.jsx:74-98` (token from `GET /api/pets/<petId>/walk-pickup-token?provider_id=`) | Walker scanning it (walker-side `PickupScannerModal`, `src/app/walker-walks.jsx:30`) starts the walk and spends one credit. Not scanned by the owner. | ⚠️ |
| 3 | "Tap to retry" (on token error) | button | `WalkPickupQRModal.jsx:77` | Refetches the token. | |

- **Back:** Close / hardware back. (`PickupScannerModal.jsx` is the WALKER's camera scanner – provider-side, not documented here.)

---


---

### Businesses you follow — `/service/following`
- **File:** `src/app/service/following.jsx` · **Reached from:** More hub row (`src/app/(tabs)/more/hub.jsx:233`).
- **Gating / data needed:** logged in; shows businesses the user followed (`GET /api/providers/following`, `src/hooks/useProviders.js:1927`).
| # | Element | Type | Source | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | Back arrow | header icon | `src/app/service/following.jsx:40` | `router.back()`. | |
| 2 | Business row (testID `following-row`) | list item | `following.jsx:70-71` → `:21-24` | `router.push /service/provider?slug=<slug>` (storefront). Rows without slug do nothing. | |

- **Empty / loading / error states:** empty = "You're not following any businesses yet." + "Businesses you follow appear here." (testID `following-empty`); spinner while loading.
- **Modals:** none. **Back:** `router.back()`.

---

### My claims — `/service/my-claims`
- **File:** `src/app/service/my-claims.jsx` · **Reached from:** NO in-app link found in `src` (only via deep link / direct route; the claim modal text refers to it: "You'll see the status in 'My claims'"). Registered in `src/telemetry/registry.js:98`.
- **Gating / data needed:** logged in; `GET /api/providers/claims/mine` (`src/hooks/useProviderClaims.js:34`).
| # | Element | Type | Source | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | Back arrow | header icon | `my-claims.jsx:32-37` | `router.back()`. | |
| 2 | Claim row (business name + status chip Pending review/Approved/Rejected/Withdrawn) | list item | `my-claims.jsx:64-85` | `router.push /service/provider?slug=<provider_slug>` (does nothing if slug missing). | |
| 3 | Pull-to-refresh | pull-to-refresh | `my-claims.jsx:61-62` | Refetches. | |

- **Empty / loading / error states:** empty = "No claims yet / Found your business in the PawPi directory? Open its profile and tap 'Claim it'."; spinner; no explicit error UI.
- **Modals:** none. **Back:** `router.back()`.

---

### Past bookings (full history) — `/service/past-bookings`
- **File:** `src/app/service/past-bookings.jsx` · **Reached from:** My Activity "See all (N)" (`MyActivity.jsx:302-304`).
- **Gating / data needed:** `GET /api/me/bookings` past list; uses the same `PastBookingRow` as My Activity.
| # | Element | Type | Source | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | Back arrow (a11y "Back") | header icon | `past-bookings.jsx:40-41` | `router.back()`. | |
| 2 | Past/closed booking rows (title "<Provider> · <Pet>", date, status chip) | list item | `past-bookings.jsx:66-70` (rows from `MyActivity.jsx:354-380`) | `router.push /service/booking-summary?id=<id>`. | |
| 3 | Pull-to-refresh | pull-to-refresh | `past-bookings.jsx:61-62` | Refetches bookings. | |

- **Empty / loading / error states:** spinner (`past-bookings-loading`); empty "No past bookings" (`past-bookings-empty`).
- **Modals:** none. **Back:** `router.back()`.

---

### Booking summary (read-only booking detail) — `/service/booking-summary?id=<bookingId>`
- **File:** `src/app/service/booking-summary.jsx` · **Reached from:** My Activity upcoming/pending/past rows (`MyActivity.jsx:68-71,373-377`); notification taps (`src/app/notifications.jsx:550`).
- **Gating / data needed:** `GET /api/me/bookings/<id>` (`useBookingDetail`). No cancel / reschedule control exists on this screen.
| # | Element (EN label from en.json, ES if short) | Type | Source (`path:line`) | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | Back arrow | header icon | `booking-summary.jsx:159-160` | `router.back()`. | |
| 2 | Summary rows: Service, What was done (notes), Status (chip), When, Provider, Pet, Paid ("Not recorded" if none) | display | `booking-summary.jsx:208-232` | Read-only. | |
| 3 | Location card (name, "Open now"/"Closed now", address) | display | `booking-summary.jsx:239-262` | Read-only. | |
| 4 | "Get directions" | button | `booking-summary.jsx:268-287` (`openDirections :92-97`) | Opens `https://www.google.com/maps/search/?api=1&query=…` in browser/Maps app. | ⚠️ |
| 5 | "Message provider" | button | `booking-summary.jsx:291-314` (`messageProvider :99-118`) | `POST /api/threads {providerId}` then `router.push /provider-chat` (opens chat; no message sent until user writes one). | 📤 |
| 6 | "Share clinic history" card — only for non-completed bookings with provider+pet: button "Share medical records" | button | `booking-summary.jsx:323-385` (`shareRecords :120-130`) | `POST /api/care-access/grants {petId, providerId, scopes}` → grants the provider read access to the pet's medical records & vaccinations; card then shows "Shared" + "Revoke". Error Alert "Couldn't share records". | 📤 ⚠️ |
| 7 | "Revoke" (when already shared) | button | `booking-summary.jsx:352-357` (`revokeAccess :132-142`) | Alert "Revoke access? – This provider will no longer be able to see this pet's records." [Cancel / Revoke] → revokes the care-access grant. | ⚠️ |
| 8 | "Leave a review" — only when booking `status==="completed"` | button | `booking-summary.jsx:390-409` | Opens `WriteReviewModal` (see its section; posts a public review). | 🌍 |
| 9 | "View provider" — when `provider_slug` present | button | `booking-summary.jsx:413-432` | `router.push /service/provider?slug=…`. | |
| 10 | Pull-to-refresh | pull-to-refresh | `booking-summary.jsx:204` | Refetches. | |

- **Empty / loading / error states:** spinner (`booking-summary-loading`); error card "Couldn't load this booking / It may have been removed, or something went wrong." (`booking-summary-error`).
- **Modals / sheets / alerts opened:** WriteReviewModal; revoke Alert; share error Alert.
- **Back / dismiss behaviour:** `router.back()`.

---

### Saved places — `/service/places`
- **File:** `src/app/service/places.jsx` · **Reached from:** My Activity "Saved places" row (`MyActivity.jsx:233-239`) – only shown if ≥1 saved place.
- **Gating / data needed:** `GET /api/saved-places` (`src/hooks/usePlaces.js:12`).
| # | Element | Type | Source | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | Back arrow; title "Saved places" | header icon | `places.jsx:51-55` | `router.back()`. | |
| 2 | Heart (a11y "Remove") on each saved place | button | `places.jsx:98-100` | `DELETE /api/saved-places/<id>` – removes the favourite immediately, no confirm. | 🗑️ (own favourite only) |
| 3 | "Directions" | button | `places.jsx:107-113` (`openDirections :19-28`) | Opens Maps (Apple Maps `maps.apple.com/?daddr=` on iOS / Google Maps dir URL otherwise). | ⚠️ |

- **Empty / loading / error states:** "No saved places yet." card (`places-saved-empty`). Place cards themselves are NOT tappable (no drill-in).
- **Modals:** none. **Back:** `router.back()`.

---

### Place detail (pet-friendly place) — `/service/place?id=<placeId>`
- **File:** `src/app/service/place.jsx` · **Reached from:** Discover result card for a place (`ServicesDiscovery.jsx:490-493`).
- **Gating / data needed:** `GET /api/places/<id>` + `GET /api/places/<id>/reviews`; logged-in user's own review is detected via profile id.
| # | Element (EN label from en.json, ES if short) | Type | Source (`path:line`) | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | Back arrow + place name | header icon | `place.jsx:128-133` | `router.back()`. | |
| 2 | Header card: name, category, neighborhood, address, rating badge | display | `place.jsx:324-396` | Read-only. | |
| 3 | Rating summary (stars/count) | button | `place.jsx:384-396` | Jumps to Reviews tab. | |
| 4 | "Save" / "Saved" heart button | toggle | `place.jsx:400-430` (`toggleSave :94-108`) | `POST /api/saved-places {place_id,name,category,lat,lng,address}` or `DELETE /api/saved-places/<id>`; private favourite (appears in My Activity > Saved places). | |
| 5 | "Directions" | button | `place.jsx:432-453` (`openDirections :49-58`) | Opens Apple Maps (iOS) / Google Maps with the coordinates or address. | ⚠️ |
| 6 | Tabs "Overview" / "Reviews" (`placeReviews.tabs.*`) | tab | `place.jsx:462-506` (testID `place-tab-overview/reviews`) | Switch panel (both stay mounted). | |
| 7 | Overview: "Pet reviews" summary — overall rating, "Most owners say: <welcome level>", welcome-level distribution, amenity tallies; empty "No pet reviews yet — be the first." | display | `place.jsx:181-265` | Read-only. | |
| 8 | "Rate this place" / "Edit your review" (coral button) | button | `place.jsx:273-293` (testID `place-rate-cta`) | Opens PlaceReviewModal. | 🌍 |
| 9 | Review cards (reviewer name or "Pet parent", stars, welcome tier, amenities, comment, date) | display | `place.jsx:295-296`, `ReviewCard :508-585` | Read-only. | |

- **Empty / loading / error states:** spinner (`place-loading`); not found = "Place not found" (`place-not-found`, `placeReviews.notFound`).
- **Modals / sheets / alerts opened:** PlaceReviewModal (below).
- **Back / dismiss behaviour:** `router.back()`.

### Rate a place (modal) — `PlaceReviewModal`
- **File:** `src/components/Places/PlaceReviewModal.jsx` · **Reached from:** Place detail "Rate this place"/"Edit your review" (`place.jsx:302-307`).
- **Gating / data needed:** logged in; Submit disabled until a star rating (1-5) AND a welcome tier are chosen (`PlaceReviewModal.jsx:22`). One review per user per place (edit pre-fills).
| # | Element | Type | Source | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | Close | header icon | `PlaceReviewModal.jsx:118-120` | Closes (disabled while submitting). | |
| 2 | Stars 1-5 ("Overall rating") | button | `PlaceReviewModal.jsx:154-157` (testID `place-star-<n>`) | Sets rating. | |
| 3 | Welcome tier chips: Treated like royalty / Very welcoming / Pets allowed / Patio only / Not for pets ("How pet-welcoming is it?") | toggle | `PlaceReviewModal.jsx:176-200` (testID `place-welcome-<key>`) | Single select. | |
| 4 | Amenity chips: Water bowls, Treats, Pet menu, Indoor allowed, Outdoor patio, Off-leash area, Poop bags, Shade / AC, Size or breed limits | toggle (multi) | `PlaceReviewModal.jsx:222-246` (testID `place-amenity-<key>`) | Multi-select. | |
| 5 | Comment ("Share a few words (optional)") | text input | `PlaceReviewModal.jsx:253-258` (testID `place-review-comment`) | Optional text. | |
| 6 | "Submit review" | button | `PlaceReviewModal.jsx:277-297` (`handleSubmit ~:55-80`) | `POST /api/places/<id>/reviews` (`src/hooks/usePlaceReviews.js:45`); the review (with your display name) is public on the place page. Error Alert "Couldn't submit" + server message. | 🌍 |

- **Back:** Close / hardware back.

---

### Pet-friendly places directory — `/service/pet-friendly`
- **File:** `src/app/service/pet-friendly.jsx` · **Reached from:** NO in-app link found (orphan / deep-link only; `hub.jsx:13` comment says pet-friendly places moved into Services tab). Registered in `telemetry/registry.js:100`.
- **Gating / data needed:** `GET /api/providers/discover?provider_type=pet_friendly&limit=500` (seeded directory rows, may be thousands but capped at 500).
| # | Element | Type | Source | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | Back arrow | header icon | `pet-friendly.jsx:39-45` | `router.back()`. | |
| 2 | Place row (name, address, "Dogs allowed" badge) | list item | `pet-friendly.jsx:74-104` | `router.push /service/provider?slug=…` (storefront where user may Claim it). | |
| 3 | Pull-to-refresh | pull-to-refresh | `pet-friendly.jsx:71-72` | Refetch. | |

- **Empty / loading / error states:** spinner; empty "No pet-friendly places yet / Check back soon — we're growing the directory." No error UI.
- **Modals:** none. **Back:** `router.back()`.

---

### Business post detail — `/service/provider-post?providerId=&postId=`
- **File:** `src/app/service/provider-post.jsx` · **Reached from:** storefront Posts tile (`PostsPanel.jsx:35-39`), feed card (`src/app/(tabs)/index.jsx:171`), business console (`src/app/business/profile.jsx:122`, `business/index.jsx:468`). The post object is passed via an in-memory hand-off (`src/utils/providerPostHandoff.js`) then refetched.
- **Gating / data needed:** viewing is open; Paw / comment require login (guests are sent to `signIn()`).
| # | Element (EN label from en.json, ES if short) | Type | Source (`path:line`) | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | Back arrow; title "Post" | header icon | `provider-post.jsx:233-240` | `router.back()`. | |
| 2 | "…" moderation menu (Report / Block user) — for posts not owned by viewer | header icon | `provider-post.jsx:244-251` → `src/components/moderation/ModerationMenu.jsx:49-203` | Menu: "Report" → reason list (Spam, Harassment, Hate, Sexual, Violence, Other) → `reportContent` Alert "reported"; "Block user" → confirm Alert → blocks author. | 📤 |
| 3 | Post media: photo(s) (single tap enlarges; double tap = Paw) or video | image/video | `provider-post.jsx:306-345` | Single tap opens full-screen viewer (close X `:604-607`); double-tap sends a Paw (see row 4; guests → sign in; never un-paws). | 🌍 |
| 4 | Paw button + count (testID `provider-post-paw`) | toggle | `provider-post.jsx:368-387` (`handlePawPress :198-205`) | `POST` / `DELETE /api/providers/<id>/posts/<postId>/paw` – the business sees a Paw from the owner. Optimistic update, revert on error. | 🌍 |
| 5 | Comments list; own comments show a delete icon (testID `delete-comment-<id>`) | list + icon | `provider-post.jsx:425-470` (`handleDelete :160-178`) | Alert "Remove comment? – This comment will be removed." [Cancel/Remove] → `DELETE /api/providers/<id>/posts/<postId>/comments/<commentId>`; error Alert "Couldn't remove the comment." | 🗑️ |
| 6 | Comment field "Add a comment…" (testID `comment-input`) + send arrow (testID `comment-send`; disabled when empty) | text input + button | `provider-post.jsx:508-546` (`handleSend :150-158`) | `POST /api/providers/<id>/posts/<postId>/comments` (author shown as pet name/handle if a current pet exists). Public comment visible to the business and others. Error Alert "Couldn't add your comment." | 🌍 📤 |
| 7 | Guest: "Sign in to comment" + "Sign in" button (testID `comment-signin`) | button | `provider-post.jsx:567-580` | Starts sign-in flow (`signIn`). | 🔑 |

- **Empty / loading / error states:** comments spinner; "No comments yet."; if the in-memory hand-off or legacy param is missing the post body is not rendered (comments-only view, never a crash).
- **Modals / sheets / alerts opened:** image viewer, moderation menu sheet, delete-comment Alert.
- **Back / dismiss behaviour:** `router.back()`; keyboard avoiding view.


---

### Shop (all stores, orders, auto-reorder) — `/service/shop`
- **File:** `src/app/service/shop.jsx` · **Reached from:** My Activity "My orders" and "Auto-reorder" rows (`MyActivity.jsx:254,266`; both open the SAME screen on its default "Browse" tab – the tab is not pre-selected). No other in-app link found.
- **Gating / data needed:** none for browse (`GET /api/providers/discover?capability=shop`); orders = `GET /api/shop/orders`; plans = `GET /api/shop/subscriptions`. Checkout needs an active pet.
| # | Element (EN label from en.json, ES if short) | Type | Source (`path:line`) | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | Back arrow; title "Shop 🛍️" / "Food, toys, and supplies — delivered" | header icon | `shop.jsx:81-89` | `router.back()`. | |
| 2 | Tabs "Browse / Orders / Auto-reorder" | tab (chips) | `shop.jsx:100-101` | Switches body. | |
| 3 | Browse: "SHOPS NEAR YOU" shop cards (logo, name, rating, bio) | list item | `shop.jsx:168-170,193-245` | Opens the store catalog modal (`StorefrontCatalog`, rows 8-12). | |
| 4 | Browse pull-to-refresh | pull-to-refresh | `shop.jsx:162-163` | Refetch shops. | |
| 5 | Orders: order cards (shop name, status pill Placed/Paid/Shipped/Delivered/Cancelled/Pending/Refunded, total, "N × item", "Payment: <status>") | display | `shop.jsx:250-312` | Read-only (not tappable). Pull-to-refresh via RefreshableScrollView. | |
| 6 | Auto-reorder: plan card (product, "N × · plan · shop", status pill) | display | `shop.jsx:356-397` | Read-only. NO "subscribe" UI exists in the app (hook `useCreateShopSubscription` imported `shop.jsx:29` but unused). | |
| 7 | "Cancel auto-reorder" (only if status != cancelled) | button | `shop.jsx:386-392`; handler `:320-326` | Alert "Cancel auto-reorder? – You can resubscribe anytime." [Keep / Cancel plan] → `PATCH /api/shop/subscriptions/<id> {status:"cancelled"}` | ⚠️ |
| **Store catalog modal** (`StorefrontCatalog`) |||||
| 8 | Back arrow (when a product detail is open) | header icon | `src/components/Providers/StorefrontCatalog.jsx:86-88` | Closes product detail. | |
| 9 | Close (X, a11y "Close") | header icon | `StorefrontCatalog.jsx:100` | Closes the catalog (cart discarded). | |
| 10 | Product grid, search "Search this store", category chips, favourite heart, "+" quick add, product detail with Add to cart / Remove one | various | `StorefrontCatalog.jsx` → `StorefrontPanels/StorefrontBrowse.jsx`, `ProductDetail.jsx` (identical to the storefront "Products" tab rows 17-24 above) | Local cart only. | |
| 11 | "Checkout · $total" cart bar | button | `StorefrontCatalog.jsx:139-142` | Opens Checkout sheet. | |
| 12 | Checkout sheet: Pickup/Delivery, delivery address, "Pay · $total" | modal | `StorefrontCatalog.jsx:149-160` → `StorefrontCheckout.jsx` + `useStorefrontCart.js:66-122` | **Same money path as storefront row 30**: `POST /api/pets/<petId>/shop-checkout` then opens MercadoPago via `Linking.openURL`; Alert "Complete your payment". Closes the catalog. | 💸 |

- **Empty / loading / error states:** shops: "Couldn't load shops / Pull down to try again." / "No shops available yet / Check back soon — pet shops are joining PawPi."; orders: "Couldn't load orders" / "No orders yet / Your purchases will show up here."; plans: "Couldn't load plans" / "No auto-reorder plans / Subscribe to a product to have it delivered on a schedule."; catalog: "This store hasn't listed any products yet."
- **Modals / sheets / alerts opened:** catalog modal, checkout sheet, cancel-plan Alert, payment Alerts.
- **Back / dismiss behaviour:** header arrow `router.back()`; catalog modal closes via X.

---

### Telehealth (video vets & my consults) — `/service/telehealth`
- **File:** `src/app/service/telehealth.jsx` · **Reached from:** My Activity upcoming-booking row for a telehealth booking WITH a session (`MyActivity.jsx:63-66`); no other in-app link found (Discover opens telehealth vets via the storefront, with `capability=telehealth`).
- **Gating / data needed:** telehealth vets = `GET /api/providers/discover?capability=telehealth`; consults need an active pet (`GET /api/pets/<petId>/telehealth-sessions`).
| # | Element (EN label from en.json, ES if short) | Type | Source (`path:line`) | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | Back arrow; title "Telehealth 📹" / "Video consult with a vet" | header icon | `telehealth.jsx:82-90` | `router.back()`. | |
| 2 | Messages icon (a11y "Messages") | header icon | `telehealth.jsx:94-95` | `router.push("/provider-messages")`. | |
| 3 | "MY CONSULTS" cards: provider name, status (Scheduled / In progress / Consult ended / Cancelled); active ones sorted first | list | `telehealth.jsx:116,151-275` | Read-only card with join button (row 4) and timing messages ("Your video consult will be available on <date> at <time>." / "You'll be able to join once your vet starts the call."). | |
| 4 | "Join video consult" (only scheduled / in_progress; disabled while "Joining…") | button | `telehealth.jsx:244-257`, handler `:176-200` | `POST /api/providers/<providerId>/telehealth/sessions/<sessionId>/join` → on success `router.push /service/telehealth-call?joinUrl=…` (embedded Daily.co call, camera+mic). Too early (client check or server 425) shows friendly "wait" text; other errors shown inline in red ("Couldn't join the consult"/server message). Joining a live call with a real vet. | 📤 ⚠️ |
| 5 | "TELEHEALTH VETS" provider cards (logo, name, bio) | list item | `telehealth.jsx:141,277-335` → `openProvider :59-64` | `router.push /service/provider?slug=…&capability=telehealth` → storefront; booking there may require payment (see Booking form). | |
| 6 | Pull-to-refresh | pull-to-refresh | `telehealth.jsx:110` | Refetch vets. | |

- **Empty / loading / error states:** spinner; "Couldn't load telehealth vets / Something went wrong. Pull down to try again."; "No telehealth vets yet / Check back soon — vets are joining PawPi."
- **Modals:** none. **Back:** `router.back()`.

### Telehealth video call — `/service/telehealth-call?joinUrl=`
- **File:** `src/app/service/telehealth-call.jsx` · **Reached from:** Telehealth "Join video consult" (`telehealth.jsx:185`).
- **Gating / data needed:** a `joinUrl` (WebView of the video room). iOS prompts for camera/microphone (`mediaCapturePermissionGrantType="grantIfSameHostElsePrompt"`).
| # | Element | Type | Source | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | Embedded video room (WebView) | WebView | `telehealth-call.jsx:55-63` | Joins the live call with the vet. | ⚠️ |
| 2 | Close X (a11y "Leave call") | floating button | `telehealth-call.jsx:83-100` | `leave()` → `router.back()`, or `replace("/service/telehealth")` if nothing to go back to. | |

- **Empty / loading / error states:** spinner while loading; after 15 s or on WebView error / missing URL shows "Couldn't load the video consult" (`telehealth.couldNotLoadCall`). **Back:** X button.

---

### Insurance (compare plans, quote, apply) — `/service/insurance`
- **File:** `src/app/service/insurance.jsx` · **Reached from:** Discover when a provider's only capability is `insurance` (`ServicesDiscovery.jsx:168-172,498-505`).
- **Gating / data needed:** insurers = `GET /api/providers/discover?capability=insurance`; plans = `GET /api/providers/<id>/insurance-plans`. Quote uses the current pet (species/breed/age) automatically.
| # | Element (EN label from en.json, ES if short) | Type | Source (`path:line`) | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | Back arrow; title "Insurance 🛡️" / "Compare plans and get a quote" | header icon | `insurance.jsx:97-103` | `router.back()`. | |
| 2 | Insurer row (testID `insurer-<id>`) | list item | `insurance.jsx:122-141` | Selects insurer; shows its "PLANS" and resets compare. | |
| 3 | Plan card: name · tier, price range "min–max/mo", Deductible, Reimbursement, coverage bullets | display | `insurance.jsx:156-178` | Read-only. | |
| 4 | "Compare" checkbox per plan | toggle | `insurance.jsx:180-187` (testID `compare-<id>`) | Marks plan; with ≥2 selected a comparison table (price · deductible · reimbursement) appears (`:211-222`). | |
| 5 | "Get a quote" | button | `insurance.jsx:188-194` (testID `quote-<id>`) | Opens inline quote form (row 6). | |
| 6 | Quote form: "Contact email", "Contact phone (optional)", "Anything the insurer should know? (optional)" + privacy note "We only share what you enter here — never your Vet Record." | text inputs | `insurance.jsx:238-264,275-277` (testIDs `quote-email`, `quote-phone`, `quote-note`) | Free-text. | |
| 7 | "Request quote" ("Sending…") | button | `insurance.jsx:265-274` → `sendQuote :53-79` | `POST /api/insurance-leads {provider_id, plan_id, pet_id, species, breed, age, contact_email, contact_phone, note}` – LEAD ONLY: insurer is notified/contacted with the user's contact details; no payment. Success Alert "Request sent – <insurer> will follow up with a quote."; error Alert "Couldn't send". | 📤 |
| 8 | "Apply" | button | `insurance.jsx:195-205` (testID `apply-<id>`) | `router.push /insurance-policy?providerId&planId&planName&petId&termsUrl&insurerName` (next section). | 📤 |

- **Empty / loading / error states:** "Loading…", "Couldn't load insurers.", "No insurers available yet." (`insurers-empty`), "No plans yet." (`plans-empty`).
- **Modals:** Alerts as listed. **Back:** `router.back()`.

### Pet insurance application — `/insurance-policy`
- **File:** `src/app/insurance-policy.jsx` · **Reached from:** Insurance "Apply" (`insurance.jsx:197-201`); possibly from other entry points listing "YOUR POLICIES".
- **Gating / data needed:** LEAD-GEN ONLY (file header, `insurance-policy.jsx:1-5`): no in-app premium payment; insurer contacts the owner to arrange payment.
| # | Element | Type | Source | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | Back arrow; title "Pet insurance" | header icon | `insurance-policy.jsx:99-104` | `router.back()`. | |
| 2 | "YOUR POLICIES" cards (plan name, policy no., premium note "…will contact you to arrange payment — there's no payment step here.") | display | `insurance-policy.jsx:119-155` (`GET /api/insurance-policies`) | Read-only. | |
| 3 | Disclaimer text ("PawPi facilitates this application — <insurer> issues and underwrites…") | info | `insurance-policy.jsx:173` | | |
| 4 | "Read the insurer's terms" | link | `insurance-policy.jsx:179-185` | `Linking.openURL(termsUrl)`. | ⚠️ |
| 5 | "I have read and accept the insurer's terms and disclaimer." | checkbox | `insurance-policy.jsx:191-210` | Enables Apply. | |
| 6 | "Apply" (disabled until accepted) | button | `insurance-policy.jsx:215-227` → `submit :68-83` | `POST /api/insurance-policies {plan_id, provider_id, pet_id, terms_accepted:true, terms_url}`; Alert "Application sent – The insurer will review and set your premium." or "Couldn't apply". Real application sent to the insurer; no money moves in-app. | 📤 ⚠️ |

- **Back:** `router.back()`.


---

### Adoption (browse dogs, favourites, my applications) — `/service/adoption[?tab=&listingId=&providerId=]`
- **File:** `src/app/service/adoption.jsx` (+ shared `src/components/adoption/AdoptionListingViews.jsx`) · **Reached from:** More hub row (`src/app/(tabs)/more/hub.jsx:210`), Feed "ADOPT ME" card (`src/app/(tabs)/index.jsx:140,147`), notification taps (`src/app/notifications.jsx:556`), Discover when a provider only has the `adoption` capability (`ServicesDiscovery.jsx:168-171,499-503`, passes `providerId`). Deep link `?listingId=&providerId=` auto-opens that dog's detail (or Alert "No longer available – This dog has found a home or the listing was removed." `adoption.jsx:106-109`); `?tab=browse|favorites|applications` preselects a tab (`:70-74`).
- **Gating / data needed:** none to browse (`GET /api/adoption/listings`); asks for device location once to sort NEAREST FIRST (falls back to "RECENTLY ADDED" when denied). Applying/chat/payment need login.
| # | Element (EN label from en.json, ES if short) | Type | Source (`path:line`) | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | Back arrow; title "Adoption 🐶" / "Find a dog to bring home" | header icon | `adoption.jsx:135-143` | `router.back()`. | |
| 2 | Tabs "Browse / Favorites / Applications" | tab (chips) | `adoption.jsx:150-156` | Switches body. | |
| 3 | Banner "NEAREST FIRST" / "RECENTLY ADDED" | display | `adoption.jsx:276` | Informational. | |
| 4 | "Filters" / "Filters (N)" | button | `adoption.jsx:280-296` (testID `open-filters`) | Opens Filter sheet (rows 9-16). | |
| 5 | Dog card grid (photo, name, age · size · gender, distance, chips Foster / Adopt or foster / energy / good with kids, "URGENT" badge, "See more") | list item | `adoption.jsx:315-335` (card `AdoptionListingViews.jsx:75-165`) | Opens Dog detail modal (next section). | |
| 6 | Browse pull-to-refresh | pull-to-refresh | `adoption.jsx:262` | Refetch listings. | |
| 7 | Favorites tab: "SAVED DOGS" rows (testID via `FavoriteRow`) | list item | `adoption.jsx:479-516` (press `:499-509`) | Opens the dog detail modal built from the favourite row. **NOTE:** there is NO heart/favourite control anywhere in the UI (hook `useToggleAdoptionFavorite` `src/hooks/useProviders.js:1790` is not used by any screen), so this tab will normally be empty although the empty text says "Tap the heart on a dog you love to save it here." | |
| 8 | Applications tab: "YOUR APPLICATIONS" cards (dog name, status pill Submitted / Under review / Approved / Declined; Approved note "Approved — this dog is now your pet! Find it under My Pets.") | display | `adoption.jsx:555-606` | Read-only (not tappable). Pull-to-refresh. | |
| **Filter sheet** (page-sheet modal) |||||
| 9 | Close X | button | `adoption.jsx:390` (testID `filters-close`) | Closes without applying. | |
| 10 | "Clear all" | button | `adoption.jsx:394` (testID `filters-clear`) | Resets draft filters. | |
| 11 | Gender pills (Male / Female) | toggle | `adoption.jsx:400-403` | Single-select (tap again to unset). | |
| 12 | Size pills (Small / Medium / Large / Extra large) | toggle | `adoption.jsx:405-408` | Single-select. | |
| 13 | Age pills: Puppy (≤1y), Young (1–3y), Adult (3y+) | toggle | `adoption.jsx:410-414` | Sets age range. | |
| 14 | Energy pills (low/medium/high) | toggle | `adoption.jsx:415-418` | Single-select. | |
| 15 | "Good with" pills Kids / Cats / Dogs; Vaccination pills (Up to date / Partial / Unknown) | toggle | `adoption.jsx:420-428` | Boolean / single select. | |
| 16 | "Show dogs" | button | `adoption.jsx:434-438` (testID `filters-apply`) | Applies filters, refetches with query params, closes sheet. Empty result: "No matches / Try widening or clearing your filters." | |

- **Empty / loading / error states:** spinner while locating/loading; error "Couldn't load dogs / Something went wrong. Pull down to try again."; none = "No dogs near you yet / Check back soon — shelters and rescues are joining PawPi."; favourites/applications have their own empty/error cards.
- **Modals / sheets / alerts opened:** Filter sheet, `ListingDetailModal` (below).
- **Back / dismiss behaviour:** `router.back()`.

### Dog detail / apply / pay / donate (modal) — `ListingDetailModal`
- **File:** `src/components/adoption/AdoptionListingViews.jsx:176-480` · **Reached from:** Adoption browse/favourites cards, storefront Adoption tab (`provider.jsx:889-893`).
- **Gating / data needed:** login for apply/chat/pay. One application per dog: if the server says the user already applied the CTA is replaced by a disabled status button ("The center is reviewing your application" / "Application approved" / "Application declined"). Pay fee only enabled if listing has fee > 0.
| # | Element (EN label from en.json, ES if short) | Type | Source (`path:line`) | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | Dog name header | display | `AdoptionListingViews.jsx:309` | | |
| 2 | "…" moderation menu (Report this listing) | header icon | `AdoptionListingViews.jsx:310` (`ModerationMenu targetType="adoption_listing"`) | Report reasons sheet → reports listing to PawPi moderators. | 📤 |
| 3 | Close X | header icon | `AdoptionListingViews.jsx:311` | Closes modal. | |
| 4 | Photo/video gallery, facts (Age, Gender, Size, Breed, Vaccination, Adoption fee), chips, "<Name>'s story", shelter mini-map | display | `AdoptionListingViews.jsx:484-640` | Read-only. | |
| 5 | "I'd like to:" Adopt / Foster (only when listing allows both; "This dog is available to foster." when foster-only) | toggle | `AdoptionListingViews.jsx:337,344,353` (testIDs `placement-adopt`, `placement-foster`, `placement-foster-only`) | Sets `requested_placement`. | |
| 6 | "A few questions from the shelter" answer inputs (one per question; placeholder "Your answer") | text input | `AdoptionListingViews.jsx:370-375` (testID `answer-<i>`) | Stored with the application. | |
| 7 | "Apply to adopt" / "Apply to foster" ("Sending…") | button | `AdoptionListingViews.jsx:425-432` → `doApply :213-241` | `POST /api/adoption/applications {listing_id, answers[{question,answer}], requested_placement}`; Alert "Application sent – The shelter will review your application for <dog>…"; button becomes green "Application sent" (`:396-410`). Error Alert "Couldn't apply". The shelter is notified and sees the answers. No money. | 📤 |
| 8 | "Chat with shelter" ("Opening…") | button | `AdoptionListingViews.jsx:436-439` → `doChat :243-262` | `POST /api/threads {providerId}`, closes modal, `router.push /provider-chat`. Error Alert "Couldn't open chat". | 📤 |
| 9 | "Pay adoption fee · $X" (disabled and labelled "No adoption fee" when fee = 0) | button | `AdoptionListingViews.jsx:441-452` → `doPay :266-283` | **No confirmation dialog.** `POST /api/payments/checkout {rail:"mercadopago", currency:"ARS", provider_id, kind:"adoption_fee", amount_cents, source_ref:"adoption-listing-<id>"}` then `Linking.openURL(checkoutUrl)` → **MercadoPago**; Alert "Payment started – Complete it in the checkout window." If server returns no URL: Alert "Thank you – Your payment is being processed." Errors (e.g. 503 not configured) Alert "Payments not available" + server text. | 💸 |
| 10 | "Donate to this place" | button | `AdoptionListingViews.jsx:454-471` | iOS: `Alert.prompt` "Donate – Amount in ARS" (numeric text input) then `doPay("donation", cents)` → same MercadoPago redirect as row 9 (`kind:"donation"`). **Non-iOS (no Alert.prompt): immediately charges a fixed 1000 cents (ARS 10) with no prompt.** | 💸 |

- **Empty / loading / error states:** n/a (data comes from the card). **Back / dismiss:** Close X / swipe-down.

---

### Vet directory — `/service/vet`
- **File:** `src/app/service/vet.jsx` · **Reached from:** NO in-app link found (legacy screen; Vets are now found through the Discover "Vet" category). Deep link only.
- **Gating / data needed:** `GET /api/providers/discover?capability=vet`.
| # | Element | Type | Source | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | Back arrow; title "Veterinary 🏥" / "Find and book a vet" (hard-coded English) | header icon | `vet.jsx:69,75-80` | `router.back()`. | |
| 2 | Messages icon (a11y "Messages") | header icon | `vet.jsx:84-85` | `router.push("/provider-messages")`. | |
| 3 | Search box + sort chips (Suggested / Top rated / Most reviewed) | text input / chips | `vet.jsx:116-130` → `ProviderListControls.jsx` | Client filter/sort. | |
| 4 | Vet card (logo, name, rating, bio) | list item | `vet.jsx:132`, `:161-238`, `openProvider :48-50` | `router.push /service/provider?slug=…` (storefront; booking happens there). | |
| 5 | Pull-to-refresh | pull-to-refresh | `vet.jsx:46,106-110` | Refetch. | |

- **Empty / loading / error states:** "Couldn't load vets / Something went wrong. Pull down to try again." / "No vets available yet / Check back soon — vet clinics are joining PawPi." / "No results" with query. **Modals:** none. **Back:** `router.back()`.

### Grooming directory — `/service/grooming`
- **File:** `src/app/service/grooming.jsx` · **Reached from:** NO in-app link found (legacy; deep link only). Same layout as Vet.
- **Gating:** `GET /api/providers/discover?capability=groomer`.
| # | Element | Type | Source | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | Back arrow; "Grooming ✂️" / "Find and book a groomer" (hard-coded English) | header icon | `grooming.jsx:76,83-87` | `router.back()`. | |
| 2 | Messages icon | header icon | `grooming.jsx:91-92` | `router.push("/provider-messages")`. | |
| 3 | Search + sort | text input / chips | `grooming.jsx` (ProviderListControls) | Client-side. | |
| 4 | Groomer card | list item | `grooming.jsx:151`, `openProvider :52-56` | `router.push /service/provider?slug=…&capability=groomer`. | |
| 5 | Pull-to-refresh | pull-to-refresh | `grooming.jsx:50` | Refetch. | |

- **Empty / loading / error states:** "Couldn't load groomers…" / "No groomers available yet / Check back soon — groomers are joining PawPi." **Back:** `router.back()`.


---

### Dog Walking (walkers, requests, live walk) — `/service/walking`
- **File:** `src/app/service/walking.jsx` · **Reached from:** Care tab ("Hire" pane) walker entry (`src/app/(tabs)/training.jsx:249-252`, testID `care-walker-entry`).
- **Gating / data needed:** walkers = `GET /api/providers/discover?capability=walker`; "Request"/"Find now" need an active pet (else Alert "Add a pet first – You need a pet on your profile to request a walk."). Live banner appears only if the active pet has an `in_progress` walk session (`GET /api/pets/<id>/walk-sessions`).
| # | Element (EN label from en.json, ES if short) | Type | Source (`path:line`) | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | Back arrow; "Dog Walking 🐾" / "Book a walker, watch the walk live" | header icon | `walking.jsx:217-227` | `router.back()`. | |
| 2 | Messages icon (a11y "Messages") | header icon | `walking.jsx:232-233` | `router.push("/provider-messages")`. | |
| 3 | Live banner "Walk in progress – <walker> is out with <pet> — tap to watch live" (coral; only when live) | button | `walking.jsx:253-259` | `router.push /walk-live?sessionId=<id>` (live map). | |
| 4 | "Waiting for a walker" request cards (with "Waiting for <walker>" / "Your request was sent.") + "Cancel" | list + button | `walking.jsx:297-300`, `RequestStatusCard :543-590` (testID `cancel-request-<id>`) | `PATCH /api/walk-requests/<id>` (cancel); error Alert "Couldn't send request". | 📤 |
| 5 | "Find a walker now – Alert available walkers near you" | button | `walking.jsx:306-340` (testID `find-walker-now`), `findWalkerNow :148-198` | No pet → Alert. Asks location permission; without coordinates Alert "Location needed – Turn on location so nearby walkers can find you." Else `POST /api/walk-requests {pet_id, target_provider_id:null, pickup_lat/lng, radius_km:5, when_type:"now"}` → **broadcasts push notifications to available walkers within 5 km with the owner's location**; Alert "Looking for a walker – We're notifying nearby available walkers. You'll be notified when one accepts." No payment. | 📤 ⚠️ |
| 6 | Search box + sort chips | text input / chips | `walking.jsx` (ProviderListControls, `:361-366`) | Client-side filter/sort. | |
| 7 | Walker card (logo, name, rating, bio, chevron) | list item | `walking.jsx:387`, `ProviderCard :445-540`, `openProvider :89-94` | `router.push /service/provider?slug=…&capability=walker` (storefront; packages/booking there). | |
| 8 | "Request a walk" button on each walker card | button | `walking.jsx:517-537` (testID `request-walk-<id>`) | Opens RequestWalkModal (rows 9-12). | 📤 |
| 9 | Request modal: close (X, a11y "Cancel") | button | `walking.jsx:630` | Closes. | |
| 10 | Note "Anything the walker should know? (optional)" | text input | `walking.jsx:642-648` (testID `request-note-input`) | Free text. | |
| 11 | Toggle "Share my pickup location – Helps the walker find you." (default ON) | toggle | `walking.jsx:672-683` (testID `request-share-location`) | If ON, location permission is requested on send. | |
| 12 | "Send request" ("Sending…") | button | `walking.jsx:686-701` (testID `request-submit`), `submitRequest :96-136` | `POST /api/walk-requests {pet_id, target_provider_id, note, when_type:"now", pickup_lat, pickup_lng}` → notifies that walker; Alert "Request sent – We let the walker know. You'll be notified when they accept." Error Alert "Couldn't send request". No payment (walker accepts, a booking + chat open). | 📤 |
| 13 | "RECENT WALKS" report cards (walker, minutes) | list item | `walking.jsx:409-424`, `WalkReportCard :709-750` | `router.push /walk-live?sessionId=<id>` (finished-walk report). | |
| 14 | Pull-to-refresh | pull-to-refresh | `walking.jsx:247-248` | Refetches walkers. | |

- **Empty / loading / error states:** "Couldn't load walkers / Something went wrong. Pull down to try again."; "No walkers available yet / Check back soon — walkers are joining PawPi."; "No results" with query.
- **Modals / sheets / alerts opened:** Request-a-walk modal; location permission prompt; Alerts above.
- **Back / dismiss behaviour:** `router.back()`.

---

### Daycare & Boarding — `/service/daycare`
- **File:** `src/app/service/daycare.jsx` · **Reached from:** My Activity "Daycare stays" row (only when ≥1 active stay) (`MyActivity.jsx:207-214`). No other in-app link found.
- **Gating / data needed:** daycare providers `GET /api/providers/discover?capability=daycare`; stays `GET /api/pets/<id>/daycare-stays` (needs a pet). Booking needs a pet.
| # | Element (EN label from en.json, ES if short) | Type | Source (`path:line`) | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | Back arrow; "Daycare & Boarding 🏠" / "Book a stay, get daily report cards" | header icon | `daycare.jsx:96-104` | `router.back()`. | |
| 2 | Messages icon | header icon | `daycare.jsx:108-109` | `router.push("/provider-messages")`. | |
| 3 | "YOUR STAYS" cards: facility, dates, status pill (Booked / Checked in / Checked out / Cancelled), vaccine status ("Vaccinations up to date" / "Missing required vaccines"), "REPORT CARDS" (Mood, Meals, Activities) | display | `daycare.jsx:130-134,204-350` | Read-only (cards not tappable). | |
| 4 | Search + sort | text input / chips | `daycare.jsx` (ProviderListControls) | Client-side. | |
| 5 | Facility card (logo/name/rating/bio) | list item | `daycare.jsx:170-181`, `ProviderCard :378-450` (press `:387`) | `router.push /service/provider?slug=…&capability=daycare`. | |
| 6 | "Book a stay" on each facility card | button | `daycare.jsx:435-445` | Opens BookStayModal (rows 7-12). | 💸 |
| 7 | Modal title "Book a stay" + close X | header icon | `daycare.jsx:529-531` | Closes. | |
| 8 | Start date / End date ("Select start" / "Select end") | native date picker | `daycare.jsx:543-552` | Sets stay dates. | |
| 9 | "Feeding instructions" and "Medication instructions" | text input (multiline) | `daycare.jsx:554-573` | Free text to facility. | |
| 10 | "Confirm stay" ("Booking…") | button | `daycare.jsx:575-590`, `submit :469-507` | No dates → Alert "Pick dates". Else `POST /api/pets/<petId>/daycare-stays {provider_id, location_id, start_date, end_date, feeding_instructions, med_instructions}`. If the response has `checkoutUrl` (facility priced the stay: rate x nights or deposit) → Alert "Stay booked — complete payment – Opening MercadoPago…" and `Linking.openURL(checkoutUrl)` (**MercadoPago**, real money). Else if vaccines missing → Alert "Stay booked — vaccines needed – Missing: …". Else Alert "Stay booked – Your stay is booked. You'll get daily report cards." Errors (e.g. fully booked) Alert "Couldn't book" + server message. | 💸 📤 |
| 11 | Pull-to-refresh | pull-to-refresh | `daycare.jsx:124` | Refetches facilities. | |

- **Empty / loading / error states:** "Couldn't load facilities…"; "No facilities available yet / Check back soon — daycares are joining PawPi."; "PAST STAYS" section only when past stays exist.
- **Modals:** BookStayModal; MercadoPago via `Linking`. **Back:** `router.back()`.

---

### Pet Sitting — `/service/sitting`
- **File:** `src/app/service/sitting.jsx` · **Reached from:** NO direct in-app link found (My Activity "Sitting visits" goes to `/sitter-visits`, which is the SITTER workspace — see that section). Deep link / legacy.
- **Gating / data needed:** sitters `GET /api/providers/discover?capability=sitter`; visit updates `GET /api/pets/<id>/sitting-visits`.
| # | Element (EN label from en.json, ES if short) | Type | Source (`path:line`) | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | Back arrow; "Pet Sitting 💛" / "In-home visits, overnights, and house-sits" | header icon | `sitting.jsx:97-105` | `router.back()`. | |
| 2 | Messages icon | header icon | `sitting.jsx:109-110` | `router.push("/provider-messages")`. | |
| 3 | "VISIT UPDATES" cards (sitter, status Scheduled/Done/Cancelled, notes, check-in coordinates, photo/video counts) | display | `sitting.jsx:131,196-258` | Read-only. | |
| 4 | Search + sort | text input / chips | `sitting.jsx` | Client-side. | |
| 5 | Sitter card | list item | `sitting.jsx:174-181`, `:284-352` (press `:293`) | `router.push /service/provider?slug=…&capability=sitter`. | |
| 6 | "Book a sitter" on card | button | `sitting.jsx:341-351` | Opens BookSittingModal. | 📤 |
| 7 | Modal close X | button | `sitting.jsx:438` | Closes. | |
| 8 | Service chips: Drop-in visit / Overnight / House-sit | toggle chips | `sitting.jsx:450-457` | Chooses sitting type. | |
| 9 | Date field ("Select date") | native date picker | `sitting.jsx:485-486` | Sets `appointment_date` (time defaults 09:00). | |
| 10 | Notes for the sitter | text input | `sitting.jsx:488-496` | Free text. | |
| 11 | Switch "Meet & greet first" | toggle | `sitting.jsx:498-504` | Marks booking as an intro request. | |
| 12 | Switch "Recurring drop-ins" (drop-in only) | toggle | `sitting.jsx:506-512` | Weekly Mon/Wed/Fri RRULE. | 📤 |
| 13 | "Confirm booking" / "Request meet & greet" ("Booking…") | button | `sitting.jsx:514-531`, `submit :384-413` | No date → Alert "Pick a date". Else `POST /api/providers/<id>/book {capability:"sitter", appointment_date/time, title, notes, meet_and_greet, recurrence_rule}` (NO payment step in this screen — request only). Alert "Sitter booked – Your sitter is booked…" (or "Meet & greet requested – Message your sitter to arrange the intro…"). Provider notified. Error Alert "Couldn't book". | 📤 |

- **Empty / loading / error states:** "Couldn't load sitters…"; "No sitters available yet / Check back soon — pet sitters are joining PawPi." **Back:** `router.back()`.

---

### Training (hire a trainer) — `/service/training`
- **File:** `src/app/service/training.jsx` · **Reached from:** Care tab "Hire a trainer" banner (`src/app/(tabs)/training.jsx:296-298`, testID `hire-trainer-banner`).
- **Gating / data needed:** trainers `GET /api/providers/discover?capability=trainer`; programs `GET /api/pets/<id>/training-programs`; booking needs a pet.
| # | Element (EN label from en.json, ES if short) | Type | Source (`path:line`) | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | Back arrow; "Training 🎓" / "Hire a trainer — 1:1, group classes, and programs" | header icon | `training.jsx:96-104` | `router.back()`. | |
| 2 | Messages icon | header icon | `training.jsx:108-109` | `router.push("/provider-messages")`. | |
| 3 | "YOUR TRAINING" program cards (title, status, "N of M sessions completed", session list, "Watch N video lessons" text) | display | `training.jsx:130,195-282` | Read-only (video text is NOT a link). | |
| 4 | Search + sort | text input / chips | `training.jsx` | Client-side. | |
| 5 | Trainer card | list item | `training.jsx:172-180`, `:305-376` (press `:314`) | `router.push /service/provider?slug=…` (storefront). | |
| 6 | "Book training" on card | button | `training.jsx:362-372` | Opens BookTrainingModal. | 📤 |
| 7 | Modal close X | button | `training.jsx:470` | Closes. | |
| 8 | Service chips: 1:1 session / Group class / Program | toggle chips | `training.jsx:482-490` | Chooses type. | |
| 9 | Group class: class list "title – N / M seats · Full" (full ones disabled); empty "This trainer has no group classes yet." | list item | `training.jsx:519-558` | Select a class to join. | |
| 10 | Title field; "Number of sessions" (program only, default 6) | text input | `training.jsx:561-585` | Enrolment details. | |
| 11 | "Confirm booking" ("Booking…") | button | `training.jsx:590-602`, `submit :409-444` | Group: none selected -> Alert "Pick a class"; else `POST /api/pets/<id>/training-classes {session_id}` + Alert "Class booked – You're enrolled…". 1:1/Program: `POST /api/pets/<id>/training-programs {provider_id, title, total_sessions}` + Alert "Training booked – You're enrolled. Your trainer will log progress here." Enrolment only, NO payment step. Errors Alert "Couldn't book". | 📤 |

- **Empty / loading / error states:** "Couldn't load trainers…"; "No trainers available yet / Check back soon — dog trainers are joining PawPi." **Back:** `router.back()`.


---

### Transport (pet-taxi) — `/service/transport`
- **File:** `src/app/service/transport.jsx` · **Reached from:** Discover when a provider's only capability is `transport` (`ServicesDiscovery.jsx:168-172,503`). Deep link otherwise.
- **Gating / data needed:** transport providers `GET /api/providers/discover?capability=transport`; trips `GET /api/transport-trips` for the active pet; booking needs a pet. Payment possible only after the provider confirms the trip AND sets a fare (hint text: "The provider sets the fare and confirms. You can pay once it's confirmed (payments may not be set up yet).").
| # | Element (EN label from en.json, ES if short) | Type | Source (`path:line`) | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | Back arrow; "Transport 🚕" / "Book a pet-taxi: pickup and dropoff" | header icon | `transport.jsx:219` | `router.back()`. | |
| 2 | "TRANSPORT PROVIDERS NEAR YOU" provider rows (testID `provider-<id>`) | list item | `transport.jsx:250-251` | Selects provider and shows the booking form below ("Book <name>"). Does NOT open the storefront. | |
| 3 | Date field / Time field | native pickers | `transport.jsx:291,295` (testIDs `trip-date`,`trip-time`) | Trip schedule. | |
| 4 | "Pickup address" and "Dropoff address" inputs + optional map pickers | text input / map | `transport.jsx:302-326` (testIDs `pickup-address`,`dropoff-address`,`pickup-map`,`dropoff-map`) | Address text and optional map pin. | |
| 5 | Chips "One-way" / "Round-trip" | toggle chips | `transport.jsx:331-332` (testIDs `type-one_way`,`type-round_trip`) | Trip type. | |
| 6 | "Pet size (e.g. small / medium / large)", Switch "Carrier needed", "Notes (gate code, temperament…)" | inputs | `transport.jsx:335-354` (testIDs `pet-size`,`carrier`,`notes`) | Extra details. | |
| 7 | "Request pet-taxi" ("Requesting…"; disabled until provider+pet+date+time+both addresses) | button | `transport.jsx:360-362`, `submit :122-150` | `POST /api/providers/<id>/transport-trips {…scheduled_at, pickup/dropoff addr+coords, trip_type, pet_size, carrier_needed, notes}`; Alert "Trip requested – The transport provider will confirm and assign a driver." No payment at this step; provider is notified. Error Alert "Couldn't book". | 📤 |
| 8 | "MY TRIPS" cards: provider, status (Requested / Confirmed / On the way / Completed / Cancelled), "Fare: X", "✓ Paid" | display | `transport.jsx:395-420` | Read-only. | |
| 9 | "Pay fare" ("Opening…") — shown when trip is confirmed/en_route, has a fare and is not yet paid | button | `transport.jsx:424-430`, `payTrip :83-106` (testID `pay-<id>`) | `POST /api/payments/checkout {rail:"mercadopago", currency:"ARS", kind:"booking", provider_id, source_ref:"transport:<tripId>"}` (server derives the amount from the trip fare) then `Linking.openURL(checkoutUrl)` → **MercadoPago**, real money. No confirm dialog, no "payment started" Alert. Errors: Alert "No fare yet" (if fare empty) / "Couldn't start payment". | 💸 |
| 10 | "Message" | button | `transport.jsx:441`, `messageProvider ~:185-200` (testID `message-<id>`) | `POST /api/threads` then `router.push /provider-chat`. | 📤 |
| 11 | "Add to calendar" / "Added" (requested/confirmed/en_route trips) | button | `transport.jsx:450-451`, `addTripToCalendar :152-170` (testID `add-calendar-<id>`) | Asks iOS Calendar permission and creates an event; Alerts on permission denied / failure. | |
| 12 | "Track live" (only `en_route`) | button | `transport.jsx:462-463` (testID `track-<id>`) | `router.push /transport-track?tripId=<id>`. | |
| 13 | "Cancel" (only requested/confirmed) | button | `transport.jsx:472-476`, `cancelTrip` (testID `cancel-<id>`) | Alert "Cancel trip?" [Keep / Cancel trip] → `PATCH /api/transport-trips/<id>` cancel; the provider is notified. | 📤 ⚠️ |

- **Empty / loading / error states:** "Loading…" / "Couldn't load providers." / "No transport providers available yet." (`providers-empty`) / "No trips yet." (`trips-empty`). Pull-to-refresh (`transport.jsx:231`).
- **Modals / alerts opened:** Alerts listed; MercadoPago via `Linking`; calendar permission prompt. **Back:** `router.back()`.

### Live trip tracking — `/transport-track?tripId=`
- **File:** `src/app/transport-track.jsx` · **Reached from:** Transport "Track live" (`transport.jsx:463`).
- **Gating / data needed:** trip must exist (`GET` track endpoint polled every 5 s while en route). The "Share live location" bar (`DriverShareBar`, `transport-track.jsx:200-310`) only renders in `mode=driver&providerId=` (provider/driver side) — NOT for owners.
| # | Element | Type | Source | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | Back arrow; title "Live trip" (or "Trip summary" once completed); red "LIVE" dot while en route | header icon | `transport-track.jsx:119-132` | `router.back()`. | |
| 2 | Map with Pickup / Dropoff markers, driver marker and travelled polyline | map | `transport-track.jsx:58-90` (Apple Maps; iOS only) | Display only. | |
| 3 | Stats "Travelled", "Elapsed", "GPS points" | display | `transport-track.jsx:170-179` | Display only. | |
| 4 | (driver mode only) "Share live location" / "Stop sharing" (testID `driver-share-toggle`) | button | `transport-track.jsx:262-280` | Posts device GPS every ~8 s to the trip while en_route (permission prompt; messages "Location permission is needed to share your live location." / "Location is shared only while the trip is en route."). | ⚠️ |

- **Empty / loading / error states:** "Waiting for the driver's location…" / "No route was recorded for this trip." (`track-waiting`); not found = "Trip not found / This trip is no longer available." **Back:** `router.back()`.

---

### Prescription fulfillment request (owner) — `/rx-fulfillment?prescriptionId=&petId=&drugName=`
- **File:** `src/app/rx-fulfillment.jsx` · **Reached from:** Vet Record > Prescriptions card button "Request fulfillment" (only for `active` prescriptions with refills remaining) (`src/components/Health/VetRecord/PrescriptionsSection.jsx:130-140`, testID `rx-fulfill-<id>`).
- **Gating / data needed:** needs an active prescription; pharmacies = `GET /api/providers/discover?capability=pharmacy`; existing orders for that prescription.
| # | Element (EN label from en.json, ES if short) | Type | Source (`path:line`) | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | Back arrow; title "Request fulfillment" | header icon | `rx-fulfillment.jsx:148-153` | `router.back()`. | |
| 2 | "YOUR FULFILLMENT ORDERS" cards: pharmacy, status, method (Delivery/Pickup), price | display | `rx-fulfillment.jsx:168-190` (testID `rxf-order-<id>`) | Read-only. | |
| 3 | "Pay $X" (shown when pharmacy set a price, order not paid, not cancelled) | button | `rx-fulfillment.jsx:191-199`, `pay :92-132` (testID `rxf-pay-<id>`) | `POST /api/payments/checkout {provider_id, kind:"product", amount_cents:<price from order>, rail:"mercadopago", source_ref:"rxf-<id>"}` (503 -> Alert "Payments not available yet"), then `PATCH /api/rx-fulfillment-orders/<id> {order_id}` to link the payment, then `Linking.openURL(checkoutUrl)` → **MercadoPago**, real money. Errors Alert "Couldn't start payment". NB: this path still sends `amount_cents` from the client (unlike booking/transport which send only ids). | 💸 |
| 4 | "CHOOSE A PHARMACY" rows (testID `rxf-provider-<id>`) | list item | `rx-fulfillment.jsx:221-222` | Selects pharmacy; reveals method form. Empty: "No fulfillment providers available yet." | |
| 5 | Chips "Delivery" / "Pickup" | toggle chips | `rx-fulfillment.jsx:244-255` (testIDs `rxf-method-delivery/pickup`) | Chooses method. | |
| 6 | "Delivery address" (delivery only; map-assisted `LocationField`) | text input / map | `rx-fulfillment.jsx:261-265` (testID `rxf-location`) | Required for delivery. | |
| 7 | "Request fulfillment" (disabled until pharmacy + (pickup or address)) | button | `rx-fulfillment.jsx:271-283`, `submit :70-90` (testID `rxf-submit`) | `POST` fulfillment request (prescription_id, provider_id, method, delivery lat/lng/address) via `useRequestFulfillment` (`src/hooks/useRxFulfillment.js:27`); sends the pet's prescription + delivery address to the pharmacy. Alert "Fulfillment requested – The pharmacy will confirm and set a price." No payment yet. Error Alert "Couldn't request fulfillment". | 📤 |

- **Empty / loading / error states:** empty pharmacies text above; spinner while providers load. **Back:** `router.back()`.

---

### Sitting Visits (SITTER workspace) — `/sitter-visits`
- **File:** `src/app/sitter-visits.jsx` · **Reached from:** My Activity "Sitting visits – N active" row (`MyActivity.jsx:220-227`) and from the business/sitter workspace. **QA flag: the owner-facing My Activity row routes owners to this PROVIDER-side screen**; an owner without a sitter workspace sees the empty state "No sitter workspace / You're not active staff of a pet-sitting provider yet." The owner-side visit updates live on `/service/sitting` ("VISIT UPDATES").
- **Gating / data needed:** the logged-in user must be active staff of a sitter provider (`useMyProviders`); bookings `GET /api/providers/<id>/bookings`; visits `GET /api/providers/<id>/sitting-visits`.
| # | Element | Type | Source | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | Back arrow; "Sitting Visits 💛" / provider name | header icon | `sitter-visits.jsx:61-69` | `router.back()`. | |
| 2 | Booking cards (dog, "N visits logged", "Meet & greet" tag) | display | `sitter-visits.jsx:121-180` | Read-only. | |
| 3 | "Log visit" | button | `sitter-visits.jsx:161-174` | Opens LogVisitModal. | |
| 4 | Modal close X | button | `sitter-visits.jsx:236` | Closes. | |
| 5 | "Update for the owner" note field | text input | `sitter-visits.jsx:250-254` | Free text. | |
| 6 | "Post update" ("Logging…") | button | `sitter-visits.jsx:260-273`, `submit :190-212` | Empty note -> Alert "Add a note". Else `POST /api/providers/<id>/sitting-visits` -> the pet owner sees the update and is notified. Alert "Visit logged – The owner will see your update." | 📤 |

- **Empty / loading / error states:** spinner; "No sitter workspace" / "No sitting jobs booked / Booked sitting jobs from owners will appear here to log visits." Pull-to-refresh (`:75`). **Back:** `router.back()`.

### Walker history (WALKER workspace) — `/walker-history`
- **File:** `src/app/walker-history.jsx` · **Reached from:** Walker workspace link "walker-history-link" (`src/app/walker-walks.jsx:354`). **Provider/walker side, not an owner screen**; owners without a walking provider see "No walker workspace / You're not active staff of a walking provider yet."
- **Gating / data needed:** active walking-provider staff; `GET /api/providers/<id>/walk-sessions?status=finished`.
| # | Element | Type | Source | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | Back arrow; "Walk history" / provider name | header icon | `walker-history.jsx:48-56` | `router.back()`. | |
| 2 | History row (dog, date, duration, distance) (testID `history-row-<id>`) | list item (expand) | `walker-history.jsx:135-137` | Toggles expanded detail: route map with pickup/start markers (`history-map-<id>`) or "No route recorded" (`history-noroute-<id>`), plus walk photos (`history-photo-<id>-<i>`). Read-only. | |

- **Empty / loading / error states:** "No past walks yet / Finished walks will show here with their route and pickup point."; "Couldn't load history / Pull down to try again." **Back:** `router.back()`.

---

## Risky actions found in Part E
Legend: money moves only when the user completes the MercadoPago page opened via `Linking.openURL` (every checkout in this area uses `rail: "mercadopago"`; no Stripe, RevenueCat or in-app WebView payment was found in these files). "Lead/request" = creates a record and notifies a real party but moves no money.

**Money (MercadoPago redirect) — real charge if the tester completes payment**
- `src/components/Providers/BookingFormModal.jsx:293-309,354-357` — "Reserve appointment / Confirm <service> · $X" on a service whose `payment_policy` is `deposit` or `full`: `POST /api/payments/checkout {provider_id, service_id}` (creates an order; server computes amount), then `POST /api/providers/<id>/book {order_id}` (creates the booking AND notifies the provider), then Alert "Almost done — complete payment" and `Linking.openURL(checkoutUrl)` → MercadoPago. If no URL comes back the booking is left created-but-unpaid. Reached from storefront service row / Book button (`provider.jsx:285-298,762-789`). Services with policy "none" only send the booking request (see Lead/request).
- `src/app/service/provider.jsx:184-205` (button `WalkPackagesSection.jsx:124-138`, testID `walk-package-buy-<id>`) — walk package "Buy": `POST /api/pets/<petId>/walk-package-checkout {provider_id, walk_package_id, rail:"mercadopago"}` → `Linking.openURL` MercadoPago. No confirmation dialog.
- `src/hooks/useStorefrontCart.js:66-122` ("Pay · $total" at `StorefrontCheckout.jsx:190-205`; used by storefront Products tab `provider.jsx:816-830` and Shop catalog modal `StorefrontCatalog.jsx:149`) — shop checkout: `POST /api/pets/<petId>/shop-checkout {provider_id, items, rail:"mercadopago", fulfillment_type, shipping_address}` → MercadoPago; order stays pending until the webhook confirms. Delivery sends the typed address to the store.
- `src/app/service/daycare.jsx:469-507` ("Confirm stay") — `POST /api/pets/<petId>/daycare-stays`; if the facility priced the stay the response has `checkoutUrl` and the app opens MercadoPago (Alert "Stay booked — complete payment"). Otherwise it is only a booking request.
- `src/components/adoption/AdoptionListingViews.jsx:441-452,266-283` ("Pay adoption fee · $X") — `POST /api/payments/checkout {kind:"adoption_fee", amount_cents, provider_id, source_ref:"adoption-listing-<id>"}` → MercadoPago. No confirm dialog.
- `src/components/adoption/AdoptionListingViews.jsx:454-471` ("Donate to this place") — `POST /api/payments/checkout {kind:"donation"}` → MercadoPago. iOS asks an amount via `Alert.prompt`; on non-iOS it auto-charges a fixed ARS 10 (1000 cents) with NO prompt.
- `src/app/service/transport.jsx:83-106,424-430` ("Pay fare") — `POST /api/payments/checkout {provider_id, source_ref:"transport:<tripId>"}` → MercadoPago (only after provider confirms and sets a fare). No confirm dialog.
- `src/app/rx-fulfillment.jsx:92-132,191-199` ("Pay $X") — `POST /api/payments/checkout {kind:"product", amount_cents (client-supplied), source_ref:"rxf-<id>"}` + `PATCH /api/rx-fulfillment-orders/<id>` → MercadoPago.

**Commits a provider / sends a request to a real party (no money in-app)**
- `src/components/Providers/BookingFormModal.jsx:310-336,364-367` — booking with no payment policy ("Request sent! <provider> will confirm…") `POST /api/providers/<id>/book`; also recurring rule (`:628-659`), telehealth (video modality) and pay-with-credit walk (`pay_with_credit:true`, spends one prepaid credit at pickup) variants. Notifies the provider.
- `src/app/service/provider.jsx:178-183` + `WalkPackagesSection.jsx:72-75` — "Schedule with my pack": books a walk against prepaid credit.
- `src/app/service/sitting.jsx:384-413` — "Confirm booking" / "Request meet & greet": `POST /api/providers/<id>/book {capability:"sitter"}` (no payment step even for priced sitters).
- `src/app/service/training.jsx:409-444` — "Confirm booking": `POST /api/pets/<id>/training-programs` or `/training-classes` (joins a group class, uses a seat; no payment step).
- `src/app/service/walking.jsx:96-136` ("Send request" in Request-a-walk modal) and `:148-198` ("Find a walker now") — `POST /api/walk-requests`; the second broadcasts the owner's live location to every available walker within 5 km. Cancel: `PATCH /api/walk-requests/<id>` (`:139-146`).
- `src/app/service/transport.jsx:122-150` ("Request pet-taxi") `POST /api/providers/<id>/transport-trips`; cancel `transport.jsx:472-476` `PATCH /api/transport-trips/<id>`.
- `src/app/service/insurance.jsx:53-79` ("Request quote") `POST /api/insurance-leads` — lead to the insurer with the owner's contact email/phone and pet species/breed/age. `src/app/insurance-policy.jsx:68-83` ("Apply") `POST /api/insurance-policies {terms_accepted:true}` — application sent to the insurer; explicitly no in-app payment.
- `src/components/adoption/AdoptionListingViews.jsx:213-241` ("Apply to adopt/foster") `POST /api/adoption/applications` — adoption application with answers; shelter notified. Chat with shelter (`:243-262`) opens a thread.
- `src/components/Providers/ClaimCTA.jsx:140-165,262-284` ("Send claim") `POST /api/providers/<id>/claim` — ownership claim reviewed by a human; request only.
- `src/app/rx-fulfillment.jsx:70-90` ("Request fulfillment") — sends prescription + delivery address to the pharmacy.
- `src/app/service/booking-summary.jsx:120-130` ("Share medical records") `POST /api/care-access/grants` — gives a provider read access to the pet's medical records; revoke at `:132-142`.
- Messaging (opens/creates a thread; nothing sent until the user types a message in the chat): `provider.jsx:626-670`, `booking-summary.jsx:99-118`, `transport.jsx:441`, `AdoptionListingViews.jsx:243-262` — `POST /api/threads`.
- `src/components/Providers/ProviderFollowButton.jsx:24-40` — Follow/Unfollow `POST|DELETE /api/providers/<id>/follow` (visible to the business as a follower).
- `src/app/service/telehealth.jsx:176-200` — "Join video consult" `POST …/telehealth/sessions/<id>/join` then WebView video call with camera/mic (`telehealth-call.jsx:55-63`).

**Public content / visible to other real users**
- `src/components/Providers/WriteReviewModal.jsx:38-60` (also from `booking-summary.jsx:390-409`, storefront Reviews tab) — `POST /api/providers/<id>/reviews`, public star rating + text (needs a completed booking).
- `src/components/Places/PlaceReviewModal.jsx` ("Submit review") — `POST /api/places/<id>/reviews`, public review of a pet-friendly place with the user's name.
- `src/app/service/provider-post.jsx:150-158` (comment send), `:198-205` (Paw), double-tap photo — public comments/paws on a business post; delete own comment `:160-178`.
- Moderation menu reports (`ModerationMenu.jsx:78`, used in `provider-post.jsx:244-251` and `AdoptionListingViews.jsx:310`) — sends a report to PawPi moderators; "Block user" blocks an author.

**Deletes / irreversible**
- `src/app/service/shop.jsx:320-326,386-392` — "Cancel auto-reorder" (Alert, then `PATCH /api/shop/subscriptions/<id> {status:"cancelled"}`; the app has no subscribe UI, so a cancelled plan cannot be recreated from the app).
- `src/app/service/places.jsx:98-100` — removes a saved place immediately (no confirm).
- `src/app/service/booking-summary.jsx:132-142` — "Revoke" provider access to the pet's records (Alert confirm).

**External links that leave the app**
- `StoreHeader.jsx:120-125`, `AboutPanel.jsx:78` (Website / Instagram / Facebook / Google Maps), `booking-summary.jsx:92-97`, `place.jsx:49-58`, `places.jsx:19-28` (maps/directions), `insurance-policy.jsx:179-185` (insurer terms) — `Linking.openURL`.

**Auth**
- No Apple/Google/social login is invoked by these screens, except guest "Sign in" shortcuts that call the shared `signIn()`: `ProviderFollowButton.jsx:26`, `ClaimCTA.jsx:50-51`, `provider-post.jsx:199,210,570-571` (open the app's normal sign-in flow).


---

<!-- ===== PART F ===== -->

## Part F — Messaging + Business / Provider mode

All paths are relative to `anything/apps/mobile/`. EN strings from `src/i18n/locales/en.json`, ES from `es.json`.
Risk legend: 💸 spends money · 📤 messages/notifies a real user · 🌍 posts publicly / visible to other real users · 🗑️ deletes data/account · 🔑 Apple/Google/social login · ⚠️ other irreversible/outbound action.

## 0. How the tester gets to each area (read this first)

**Messaging (owner side) entry points**
- Feed tab header, speech-bubble icon (no badge on it) → `/messages` (modal) — `src/components/Feed/FeedHeader.jsx:91`.
- Services tab → "My Activity" segment (segment carries an unread badge) → "Messages" row → `/provider-messages` — `src/app/(tabs)/services.jsx:27`, `src/components/Services/MyActivity.jsx:174`.
- Each service sub-screen (vet, grooming, daycare, walking, training, sitting, telehealth) has a header link to `/provider-messages` — `src/app/service/vet.jsx:84`, `grooming.jsx:91`, `daycare.jsx:108`, `walking.jsx:232`, `training.jsx:108`, `sitting.jsx:109`, `telehealth.jsx:94`.
- New conversation entry points are listed in section 6.

**Business mode gating (a normal pet-owner account will NEVER see this)**
- Gate = the account is *active staff of >=1 provider* (`GET /api/providers` via `useMyProviders`, `src/hooks/useProviders.js:667` / `src/utils/launchQueries.js:39`).
- Path A (staff-only account, no pets): after login `EntryPoint` routes straight to `/business` — `src/utils/auth/determinePetsRoute.js:65-69`, consumed in `src/app/index.jsx`.
- Path B (account that has pets AND is provider staff): stays in the pet app; Profile tab burger menu ("Menu" sheet, `OwnerMenu`) shows an extra "BUSINESS" section with a "Business" item (🏪) → `/business` — `src/components/More/OwnerMenu.jsx:40,167-188`. A pure pet owner never sees this item.
- Path C (any signed-out visitor): Welcome screen top-right underlined link "Access for vets & businesses" / ES "Acceso para veterinarias y negocios" → `/vet-business-access` (create-a-business wizard) — `src/app/welcome.jsx:68-69,85-100`.
- There is NO route guard inside `src/app/business/*`: typing the route manually with a non-staff account would render empty/"Your business" fallbacks (no providers → Post-moment button disabled).
- No MercadoPago-connect / payouts / availability-windows / product management screens exist in the mobile business area (the Today screen says "Services, products, hours, bookings and adoption listings are managed on the PawPi web dashboard", `src/i18n/locales/en.json` `business.home.manageBody`). The only business-side money-ish thing in mobile is the pickup-QR credit redemption (section 17). There is no create-business *claim* screen other than the Claim CTA (section 20) and "My claims" (also section 20, which has NO inbound navigation in code — see note there).

---

## 1. Messages hub (People + Businesses inbox)

### Messages — `/messages` (modal)
- **File:** `src/app/messages.jsx` · **Reached from:** Feed header message icon (`src/components/Feed/FeedHeader.jsx:91`). Registered as `presentation: "modal"` (`src/app/_layout.jsx:146`).
- **Gating / data needed:** none to open. Lists owner↔owner DM threads (`GET /api/dm-threads`, polls 15 s) merged with owner↔business threads (`GET /api/threads?side=owner`), newest first. Typing >=2 chars also queries `GET /api/search?q=` and lists **real pet-parent accounts of the live app** under "START A NEW CHAT".
| # | Element (EN label / ES) | Type | Source | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | X (close) top-left | icon button | `src/app/messages.jsx:171` | `router.back()` → modal dismisses to the Feed. | |
| 2 | Title "Messages" / "Mensajes" | label | `src/app/messages.jsx:174` | none | |
| 3 | Search field, placeholder "Search people or start a new chat…" / "Buscá personas o iniciá un chat…" | text input | `src/app/messages.jsx:194` | Filters existing rows locally by name/last-message text. At >=2 chars (300 ms debounce) also fires `GET /api/search` and shows owner results under "START A NEW CHAT". | |
| 4 | Clear (small X inside search) | icon button | `src/app/messages.jsx:203` | Clears the query; only visible when the field has text. | |
| 5 | Filter chip "All" / "Todos" | segmented chip | `src/app/messages.jsx:214` | Shows all threads (default). Active chip = coral fill. | |
| 6 | Filter chip "People" / "Personas" | segmented chip | `src/app/messages.jsx:214` | Shows only owner↔owner DM rows (`kind: people`). | |
| 7 | Filter chip "Businesses" / "Negocios" | segmented chip | `src/app/messages.jsx:214` | Shows only owner↔business rows (`kind: businesses`). | |
| 8 | Owner search result row (avatar + name, testID `owner-result`) | list row | `src/app/messages.jsx:277-281` | `startChatWithOwner` → `POST /api/dm-threads {otherUserId}` (creates or reuses 1:1 thread, no message yet) → clears search → pushes `/chat` with threadId/otherUserId/otherName/otherAvatar. On failure: Alert "Error" / "Something went wrong" (`common.error`, `common.somethingWrong`). | ⚠️ opens a DM thread with a real user (thread may appear in their inbox) |
| 9 | "No pet parents found." row | label | `src/app/messages.jsx:262-273` | Shown when search returns 0 owners; spinner shown while searching. | |
| 10 | People thread row (testID `dm-thread`): avatar, name, time, last-message preview, coral unread count pill | list row | `src/app/messages.jsx:366-371,52-62` | Pushes `/chat` with threadId, otherUserId, otherName, otherAvatar. Unread rows: coral border + bold preview + coral count pill (`unread_count`). Preview falls back to "📷 Photo" (image msg) or "Say hi 👋" (empty). | |
| 11 | Business thread row (testID `biz-thread`, Store icon fallback) | list row | `src/app/messages.jsx:366-371,75-84` | Pushes `/provider-chat` with threadId, providerName, ownerUserId. | |
| 12 | Relative time label ("12m", "3h", "Yesterday", "5d", else locale date) | label | `src/app/messages.jsx:27-39,447` | none (English-only hardcoded "Yesterday"). | |

- **Empty / loading / error states:** spinner while either list loads; with 0 rows after filter: 💬 + "No conversations yet" / "Todavía no hay conversaciones" + "Search a pet parent above to start a chat, or message a business from its profile." (`messagesScreen.emptyTitle/emptyBody`). Load errors of the two lists are not surfaced (treated as empty). Only the "start chat" failure shows an Alert. No pull-to-refresh on this screen (it polls every 15 s instead). No raw technical text shown (error text only goes to console).
- **Modals / sheets / alerts opened:** error Alert from row 8. Navigation to `/chat` or `/provider-chat`.
- **Back / dismiss behaviour:** X button or iOS modal swipe-down → Feed. No custom hardware-back handling.
- **Unread badge note:** there is NO unread badge on the Feed header message icon, and the DM unread query key `dm-unread` is invalidated in `src/hooks/useDMs.js:82,101` but no hook reads it — unread for people-DMs is only visible as per-row pills in this screen.

---

## 2. Owner↔owner chat

### Chat (pet-parent DM) — `/chat`
- **File:** `src/app/chat.jsx` · **Reached from:** Messages hub rows 8/10 (`src/app/messages.jsx:54,136`); Pet profile "Message" button (`src/app/pet-profile.jsx:104,505-507`).
- **Gating / data needed:** needs `threadId` + `otherUserId` route params (always supplied by the callers). Hardcoded-English strings on this screen (not in i18n): "Pet parent" fallback name, "Say hello to start the conversation.", placeholder "Send a message…".
| # | Element | Type | Source | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | Back chevron (coral) | icon button | `src/app/chat.jsx:96` | `router.back()`. | |
| 2 | Header avatar + name (`otherName`, fallback "Pet parent") | label | `src/app/chat.jsx:99-130` | none (not tappable; does not open the profile). | |
| 3 | "···" More options (ModerationMenu, `authorUserId=otherUserId`, no target) | icon button → bottom sheet | `src/app/chat.jsx:132-135` | Opens sheet (section 3). Only **Block user** + Cancel appear (no Report row because no `targetType/targetId` passed). Renders nothing if `otherUserId` missing. | ⚠️ (block, see section 3) |
| 4 | Message bubbles (mine = coral right, theirs = card left) with 5-minute time separators | list | `src/app/chat.jsx:160-232` | Auto-scrolls to bottom on new message (100 ms timeout). Image messages show 200x150 image, NOT tappable (no enlarge). | |
| 5 | Photo button (image icon, spinner while uploading) | icon button | `src/app/chat.jsx:248-268` | `ImagePicker.launchImageLibraryAsync` (photo library, editing on, 4:3 crop, quality 0.8) → `useUpload` (Supabase storage) → **immediately** `POST /api/dm-threads/{id}/messages {image_url}`. No preview/confirmation step; upload failure is silent (nothing happens). Photo-library permission prompt may appear. | 📤 |
| 6 | Text input, placeholder "Send a message…" (multiline, max height 90) | text input | `src/app/chat.jsx:270-293` | Typing enables Send. `returnKeyType="send"` + `onSubmitEditing` → send (on a multiline field iOS may insert a newline instead of sending). | |
| 7 | Send button (paper-plane; coral when text present, peach when empty; disabled when empty or pending) | icon button | `src/app/chat.jsx:295-309` | `handleSend` → `POST /api/dm-threads/{id}/messages {body}` → on success clears the input and refetches. **No error UI on failure** (text simply stays in the input). | 📤 |

- **Empty / loading / error states:** spinner while loading; no messages → "Say hello to start the conversation."; a failed messages fetch also falls through to that empty text (no error message). Send/upload failures are silent. Messages poll every 8 s; thread is marked read (`POST /api/dm-threads/{id}/read`) on open and whenever the message count changes.
- **Modals / sheets / alerts opened:** ModerationMenu (section 3) → Block confirm Alert → result Alerts. Photo library system picker.
- **Back / dismiss behaviour:** chevron or iOS swipe-back → previous screen (Messages hub modal or Pet profile). After a successful block the app auto-calls `router.back()` (`onBlocked`).
- **Note:** there is no "unblock" UI anywhere in the mobile code (grep for unblock finds nothing) — a block made while testing cannot be undone from the app.

---

## 3. Report / Block sheet (shared)

### Report + Block menu — component `ModerationMenu`
- **File:** `src/components/moderation/ModerationMenu.jsx` · **Reached from:** Chat header (`src/app/chat.jsx:132`); also used on other UGC surfaces (e.g. `src/app/service/provider-post.jsx`, other colleagues' areas). NOT present in `/provider-chat` or business chat.
- **Gating / data needed:** renders nothing for own content or when neither a report target nor a blockable author is known. In Chat only Block is available.
| # | Element (EN / ES) | Type | Source | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | "···" trigger (a11y "More options") | icon button | `src/components/moderation/ModerationMenu.jsx:120-127` | Opens fade-in bottom sheet. | |
| 2 | Dim backdrop (a11y "Dismiss menu") | pressable | `src/components/moderation/ModerationMenu.jsx:130-134` | Closes sheet. | |
| 3 | "Report" / "Reportar" row (only when a target is passed; NOT shown in Chat) | row | `src/components/moderation/ModerationMenu.jsx:148-155` | Switches sheet to reason list. | |
| 4 | "Block user" / "Bloquear usuario" row (red) | row | `src/components/moderation/ModerationMenu.jsx:156-164` | Closes sheet, shows Alert "Block this user?" / "¿Bloquear a esta persona?" + "You won't see each other's posts, comments, walks, or messages, and neither of you can contact the other." Buttons: "Cancel", "Block" (destructive). | |
| 5 | Alert "Block" (destructive) | alert button | `src/components/moderation/ModerationMenu.jsx:95-113` | `POST /api/blocks {blocked_user_id}` → invalidates social caches → Alert "User blocked" / "Their content will disappear from your app." → `onBlocked` (Chat goes back). Failure → Alert "Couldn't block" + server message or "Please try again." | ⚠️ real-user block, no in-app undo |
| 6 | "Cancel" row | row | `src/components/moderation/ModerationMenu.jsx:165-170` | Closes sheet. | |
| 7 | Reason list header row "Why are you reporting this?" with back chevron | row | `src/components/moderation/ModerationMenu.jsx:174-179` | Back to actions view. | |
| 8 | Reason rows: "Spam or scam", "Harassment or bullying", "Hate speech", "Nudity or sexual content", "Violence or threats", "Something else" | rows | `src/components/moderation/ModerationMenu.jsx:17-24,180-193` | `POST /api/reports {target_type,target_id,reason}` → Alert "Thanks for reporting" / "Our team will review this within 24 hours." Failure → "Couldn't report". | ⚠️ files a real moderation report (idempotent per reporter+target) |

- **Empty / loading / error states:** n/a; errors shown as Alert with server message (could surface raw server `error` text).
- **Back / dismiss behaviour:** Android back / backdrop closes (`onRequestClose`).

---

## 4. Owner↔business chat

### Provider chat — `/provider-chat` (shared by owner AND business/staff)
- **File:** `src/app/provider-chat.jsx` · **Reached from:** Messages hub business row (`src/app/messages.jsx:77`); Provider Messages inbox (`src/app/provider-messages.jsx:46`); storefront Message CTA, booking summary, transport trip row, adoption listing "Chat with shelter" (section 6); and **business side**: Business → Messages thread row (`src/app/business/messages.jsx:46`) and Adoption applications → "Message" (`src/app/business-adoption.jsx:494`).
- **Gating / data needed:** `threadId` route param. Owner mode passes `providerName`+`ownerUserId`; business mode passes `title` (customer name) + `meUserId` (staff's own profile id) so staff messages right-align. No moderation (report/block) controls exist on this screen. Hardcoded-English strings: "Provider" fallback, "No messages yet. Say hello.", placeholder "Type a message…".
| # | Element | Type | Source | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | Back arrow | icon button | `src/app/provider-chat.jsx:121-127` | `router.back()`. | |
| 2 | Header title (`title` || `providerName` || "Provider") | label | `src/app/provider-chat.jsx:128-130` | none | |
| 3 | Message bubbles (mine coral/right; others card/left), each with HH:mm time; image attachment 180x180 above text | list | `src/app/provider-chat.jsx:155-206` | Auto-scrolls to latest. Images not tappable. Thread polled and marked read (`POST /api/threads/{id}/read`) on open and when count changes. | |
| 4 | Attach image button | icon button | `src/app/provider-chat.jsx:223-242` | `launchImageLibraryAsync` (no crop) → `useUpload` → **immediately** `POST /api/threads/{id}/messages {attachment_url}`. No preview. Upload error → silently returns. | 📤 |
| 5 | Text input, placeholder "Type a message…" | text input | `src/app/provider-chat.jsx:243-261` | Multiline; no return-to-send. | |
| 6 | Send button (shows spinner while pending; 50% opacity when empty/pending) | icon button | `src/app/provider-chat.jsx:262-281` | `POST /api/threads/{id}/messages {body}` → clears draft on success. No error UI on failure. | 📤 |

- **Empty / loading / error states:** spinner; no messages → "No messages yet. Say hello."; fetch errors are shown as that same empty state (silent). Send failures silent.
- **Modals / sheets / alerts opened:** iOS photo-library picker only.
- **Back / dismiss behaviour:** arrow / swipe-back to the previous screen (inbox, storefront, booking summary, Business → Messages, or Adoption applications). KeyboardAvoidingView on iOS only.

### Provider Messages (owner↔business inbox) — `/provider-messages`
- **File:** `src/app/provider-messages.jsx` · **Reached from:** Services tab → My Activity → "Messages" row (`src/components/Services/MyActivity.jsx:174`); service sub-screen header links (listed in section 0).
- **Gating / data needed:** none; real data only (`GET /api/threads?side=owner`, polls 15 s). Hardcoded English ("Messages", "No conversations yet", "Provider", "Photo", "No messages yet", "Yesterday"/"now").
| # | Element | Type | Source | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | Back arrow | icon button | `src/app/provider-messages.jsx:69-75` | `router.back()`. | |
| 2 | Thread card (logo or MessageSquare tile, provider name, relative time, last-message preview or "Photo"/"No messages yet", coral unread pill) | list row | `src/app/provider-messages.jsx:123-231` | Pushes `/provider-chat` with threadId/providerName/ownerUserId. Unread rows have a coral border. | |
| 3 | Pull-to-refresh | gesture | `src/app/provider-messages.jsx:119-122` | Refetches `/api/threads?side=owner`. | |

- **Empty / loading / error states:** spinner; empty: message icon + "No conversations yet" + "Message a vet or service provider from their profile to start a conversation."; load errors are not shown (treated as empty).
- **Back / dismiss behaviour:** back arrow → originating service screen / Services tab.
- **Unread badge:** the same count (`GET /api/threads/unread-count?side=owner`, `useUnreadCount`) drives the badge on the Services tab "My Activity" segment (`src/app/(tabs)/services.jsx:27,31`) and the "N unread" subtitle + badge on the Messages row (`src/components/Services/MyActivity.jsx:83,167-175`). It counts business threads only, not people-DMs.

---

## 5. Business messages inbox

### Messages (business tab) — `/business/messages`
- **File:** `src/app/business/messages.jsx` · **Reached from:** Business tab bar "Messages" (`src/app/business/_layout.jsx:70-76`); Today "Unread messages" row (`src/app/business/index.jsx:593-599`).
- **Gating / data needed:** business mode (staff of >=1 provider, see section 0). Shows the **active business's** threads (`GET /api/threads?side=provider&providerId=`), customer is the other party.
| # | Element (EN / ES) | Type | Source | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | Header: business logo + name + title "Messages" / "Mensajes" | BusinessHeader | `src/app/business/messages.jsx:61-65` | none (not tappable) | |
| 2 | Customer thread card (testID `business-thread-{id}`): avatar, customer name (fallback "Customer"/"Cliente"), relative time, last message or "Photo"/"No messages yet", unread pill (testID `business-thread-unread-{id}`) | list row | `src/app/business/messages.jsx:115-203` | Pushes `/provider-chat` with `threadId`, `title`=customer name, `meUserId`=staff's profile id (`GET /api/user-profile`), `ownerUserId`=customer. Sending from there messages a real customer (see section 4). | 📤 (once inside chat) |
| 3 | "Try again" / "Reintentar" (testID `business-messages-retry`) | button | `src/app/business/messages.jsx:76-90` | Refetches threads (only on error state). | |
| 4 | Pull-to-refresh | gesture | `src/app/business/messages.jsx:108-111` | Refetches threads. | |

- **Empty / loading / error states:** spinner; error "Couldn't load your conversations." / "No pudimos cargar tus conversaciones." + retry; empty: "No conversations yet" + "When a customer messages your business, it shows up here." / "Cuando un cliente le escribe a tu negocio, aparece aquí."
- **Modals / sheets / alerts opened:** none; navigates to `/provider-chat`.
- **Back / dismiss behaviour:** it's a tab — back via other tabs. The tab bar floats over content (90 px bottom padding).

---

## 6. New-conversation entry points (owner side) — summary

| # | Element (EN) | Type | Source | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | Pet profile "Message" button (testID `message-owner`; only on another owner's pet, needs viewer pet + owner id) | button | `src/app/pet-profile.jsx:505-527,99-117` | `POST /api/dm-threads {otherUserId}` → `/chat`. Failure is swallowed (button just does nothing). | ⚠️ opens thread with a real user |
| 2 | Storefront "Message" (testID `storefront-message-cta`, label `providers.message` "Message") next to Follow | button | `src/app/service/provider.jsx:629-650` | `POST /api/threads {providerId}` (idempotent) → `/provider-chat`. | ⚠️ opens thread with a real business |
| 3 | Booking summary "Message provider" (testID `booking-summary-message`) | button | `src/app/service/booking-summary.jsx:100-116,293-314` | `POST /api/threads {providerId}` → `/provider-chat`. | ⚠️ |
| 4 | Transport trip row "Message" (testID `message-{id}`) | button | `src/app/service/transport.jsx:186-203,441-446` | `POST /api/threads {providerId, booking_id}` → `/provider-chat`. | ⚠️ |
| 5 | Adoption listing "Chat with shelter" | button | `src/components/adoption/AdoptionListingViews.jsx:243-262,436-438` | `POST /api/threads {providerId}` → closes sheet → `/provider-chat`; error Alert `adoption.listing.chatErrorTitle`. | ⚠️ |
| 6 | Messages hub owner search result | row | `src/app/messages.jsx:277` | see section 1 row 8 | ⚠️ |
| 7 | Notification rows | n/a | `src/app/notifications.jsx` | Notification taps open booking summary / adoption / walker-walks (no direct message deep-link found in code). | |

---

## 7. Business mode shell

### Business tab shell — `/business/*`
- **File:** `src/app/business/_layout.jsx` · **Reached from:** `/business` (see "How the tester gets here", section 0). Registered as a root Stack screen `business` (`src/app/_layout.jsx:132`).
- **Gating / data needed:** staff of >=1 provider. Floating glass tab bar with 4 tabs; `settings` route is hidden (`href: null`, line 87).
| # | Element (EN / ES) | Type | Source | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | Tab "Today" / "Hoy" (home icon) | tab | `src/app/business/_layout.jsx:56-62` | Opens `/business` (section 8). | |
| 2 | Tab "Bookings" / "Reservas" | tab | `src/app/business/_layout.jsx:63-69` | Opens `/business/bookings` (section 11). | |
| 3 | Tab "Messages" / "Mensajes" | tab | `src/app/business/_layout.jsx:70-76` | Opens `/business/messages` (section 5). | |
| 4 | Tab "Profile" / "Perfil" (store icon) | tab | `src/app/business/_layout.jsx:77-83` | Opens `/business/profile` (section 13). | |

- **Empty / loading / error states:** per-tab.
- **Back / dismiss behaviour:** the business group is a root-level stack screen; the only way back to the pet app is Profile tab → "Switch to Pet app" (visible only if the account also owns pets) or logging out. A staff-only account has no pet app to return to.

---

## 8. Business Today (home)

### Today — `/business`
- **File:** `src/app/business/index.jsx` · **Reached from:** auto-routed after login for staff-only accounts; or Profile burger menu → "Business" for dual accounts; Business tab bar "Today".
- **Gating / data needed:** staff of >=1 provider. All reads follow the active business (`useActiveProvider`). Adoption row only if the active provider has capability `adoption`; Walks card + "Accepting walks now" switch only if capability `walker`.
| # | Element (EN / ES) | Type | Source | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | Header: round business logo + business name (+ chevron-down when staff of several) (testID `business-switcher`) | pressable | `src/app/business/index.jsx:510-521` | If >1 business: opens the "Choose a business" sheet (section 9). If only one: not interactive. | |
| 2 | Bell icon (testID `business-notifications`, a11y "Notifications") | icon button | `src/app/business/index.jsx:522-537` | `router.push("/notifications")` (modal notifications screen, covered elsewhere). | |
| 3 | Stat strip: Followers · Posts · Paws · Barks (testID `business-stat-row`) | pressable | `src/app/business/index.jsx:546-553` | Tap → `/business/profile` (Profile tab). Counts come from public profile + follow query. | |
| 4 | "Bookings today" row (testID `glance-bookings`) with count + "Next up: HH:mm · service/pet" or "No bookings today" | pressable row | `src/app/business/index.jsx:572-590` | → `/business/bookings`. | |
| 5 | "Unread messages" row (testID `glance-messages`) with count | pressable row | `src/app/business/index.jsx:593-599` | → `/business/messages`. Count = `GET /api/threads/unread-count?side=provider`. | |
| 6 | "Pending applications" row (testID `glance-applications`; adoption capability only) | pressable row | `src/app/business/index.jsx:603-612` | → `/business-adoption` (section 14). Counts submitted/under_review/pending. | |
| 7 | "Accepting walks now" switch (walker capability only, testID `business-accepting-walks-switch`); sub-text "Let nearby owners know you're available right now" / "You're available until HH:mm" | switch | `src/app/business/index.jsx:216-299` | ON: asks foreground-location permission, grabs current GPS (still proceeds if denied), `PUT /api/providers/{id}/live-availability {accepting:true,lat,lng}`; server auto-expires after 8 h; refetched every 60 s. OFF: same PUT with false. Failure → Alert "Couldn't update your status". | ⚠️ publishes live presence + GPS point to nearby real owners |
| 8 | "Walks" card (walker capability only, testID `business-walks-action`; "Check in a walk and record the route") | pressable card | `src/app/business/index.jsx:621-660` | → `/walker-walks` (section 15). | |
| 9 | "Post a moment" / "Publicar un momento" (coral, testID `business-post-moment`; shows "Posting…" + spinner while posting; disabled without a provider) | button | `src/app/business/index.jsx:663-687` | Opens the Post Composer (section 10). After the composer submits, upload + create post runs (see section 10). | 🌍 |
| 10 | "Recent moments" tiles (testID `business-post-{id}`: 2-col grid, thumbnail or video poster, "Video" badge, paw count, comment count) | pressable tile | `src/app/business/index.jsx:93-157,741-743,456-473` | Stashes post in memory and pushes `/service/provider-post` (post detail with paws/comments; covered by another colleague — it is the detail screen, NOT the composer). | |
| 11 | "Try again" (error state of Recent moments) | button | `src/app/business/index.jsx:701-714` | Refetches `GET /api/providers/{id}/posts`. | |
| 12 | Pull-to-refresh | gesture | `src/app/business/index.jsx:540-543` | Refetches posts, bookings, unread count, adoption applications. | |
| 13 | "Manage on the web" info card (Globe) | static card | `src/app/business/index.jsx:749-770` | Not tappable; says services/products/hours/bookings/adoption listings are managed on the web dashboard. | |

- **Empty / loading / error states:** full-screen spinner while the providers list loads. Recent moments: spinner; error "Couldn't load your moments." + "Try again"; empty card "No moments yet / Share your first moment — it shows up in your followers' feed." The "Next up" text is built client-side from the bookings list. Post failure → Alert "Couldn't post your moment" + server/raw error message (may leak e.g. "Upload returned no URL").
- **Modals / sheets / alerts opened:** Business switcher sheet (section 9); Post composer (section 10); Alerts for failed live-availability / failed post.
- **Back / dismiss behaviour:** tab root. There is no back button; leaving business mode requires Profile tab actions.

---

## 9. Business switcher sheet

### Choose a business — modal inside `/business`
- **File:** `src/app/business/index.jsx:774-823` · **Reached from:** Today header (row 1), only when the account is staff of >1 business.
| # | Element | Type | Source | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | Dim area above sheet | pressable | `src/app/business/index.jsx:781` | Closes the sheet. | |
| 2 | Business rows (testID `business-provider-{id}`: logo, name, coral check on the selected one) | list row | `src/app/business/index.jsx:800-818` | Persists `activeProviderId` (AsyncStorage `pawpi:activeProviderId`) and closes; ALL four tabs then follow the new business (`src/hooks/useActiveProvider.js`). | |

- **Empty / error:** n/a. **Back/dismiss:** backdrop tap or system back (`onRequestClose`).

---

## 10. Post-a-moment composer (business configuration)

### New moment (composer) — modal `PostComposerModal`
- **File:** `src/components/Feed/PostComposerModal.jsx` (shared with the pet feed; business config at `src/app/business/index.jsx:826-834`) · **Reached from:** Today → "Post a moment".
- **Gating / data needed:** business mode; camera permission. Video always offered for businesses (`allowVideo`), no "lucky day" banner. **Camera-only capture — there is no "choose from library" option** (verified: only `launchCameraAsync`, lines 150-180).
| # | Element (EN / ES) | Type | Source | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | X (close; picker step) | icon button | `src/components/Feed/PostComposerModal.jsx:240-241` | Closes composer. | |
| 2 | "Back" with chevron (compose step) | button | `src/components/Feed/PostComposerModal.jsx:230` | Returns to picker step. | |
| 3 | Header "New moment" | label | `src/components/Feed/PostComposerModal.jsx:245` | none | |
| 4 | "Take a photo" / "Tomar una foto" (testID `composer-take-photo`) | button | `src/components/Feed/PostComposerModal.jsx:150-171` | Asks camera permission (denied → Alert `postComposer.cameraDeniedTitle/Body`); opens camera (4:5, editing on) → compose step. | |
| 5 | "Record a video" / "Grabar un video" (testID `composer-take-video`) | button | `src/components/Feed/PostComposerModal.jsx:173-191` | Camera permission; records up to 15 s → compose step with muted looping preview. | |
| 6 | Camera icon over preview (a11y change photo/video) | icon button | `src/components/Feed/PostComposerModal.jsx:379` | Back to picker to retake. | |
| 7 | Caption field "Add a caption ✍️", placeholder "Say something about this moment…" (testID `composer-caption`) | text input | `src/components/Feed/PostComposerModal.jsx:409` | Free-text caption. | |
| 8 | "Post moment 🐾" / "Publicar momento 🐾" | button | `src/components/Feed/PostComposerModal.jsx:197,433` | `onPost` then closes: uploads media (`useUpload`), for videos also uploads a poster frame, then `POST /api/providers/{id}/posts` ({body, image_urls} or {media_type:"video", video_url, video_thumbnail_url}). Post appears in followers' feed and on the public storefront. Failure → Alert "Couldn't post your moment". | 🌍 |

- **Empty / loading / error states:** while posting, the Today button shows "Posting…" + spinner (composer has already closed). No success toast; the new tile appears in Recent moments after refetch.
- **Back / dismiss:** pageSheet; swipe-down / X / system back closes (`onRequestClose`).

---

## 11. Business Bookings

### Bookings (agenda) — `/business/bookings`
- **File:** `src/app/business/bookings.jsx` · **Reached from:** Business tab "Bookings"; Today "Bookings today" row.
- **Gating / data needed:** business mode. Shows only `requested`/`confirmed` bookings dated today or later (declined/cancelled/completed hidden); read `GET /api/providers/{id}/bookings` polled every 20 s.
| # | Element (EN / ES) | Type | Source | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | Booking card (testID `business-booking-{id}`): date · time, status chip (Requested/Confirmed…), service name, pet name, owner name | card | `src/app/business/bookings.jsx:79-114` | Display only (card itself not tappable). | |
| 2 | "Confirm" / "Confirmar" (testID `business-booking-confirm-{id}`; only while status = requested) | button | `src/app/business/bookings.jsx:120-141,248-251` | **No confirmation dialog.** `PATCH /api/providers/{id}/bookings/{appointmentId} {action:"confirm"}`; card turns "Confirmed". Server may reject (e.g. 409 unpaid) → Alert "Couldn't update the booking" + server message. | 📤 notifies the customer |
| 3 | "Decline" / "Rechazar" (testID `business-booking-decline-{id}`; only while requested) | button | `src/app/business/bookings.jsx:143-166,253-269` | Alert "Decline this booking?" / "¿Rechazar esta reserva?" + "The customer will be notified and any payment refunded." Buttons "Keep it"/"Mantener" (cancel) and "Decline" (destructive) → `PATCH … {action:"decline"}`. | 📤 💸 (notifies customer + refunds payment) |
| 4 | "Start walk" / "Iniciar paseo" (testID `business-booking-start-walk-{id}`; only for capability `walker` bookings) | button | `src/app/business/bookings.jsx:172-194,334` | `router.push("/walker-walks")` (does not start anything by itself). | |
| 5 | "Try again" (error state, testID `business-bookings-retry`) | button | `src/app/business/bookings.jsx:289-303` | Refetch. | |
| 6 | Pull-to-refresh | gesture | `src/app/business/bookings.jsx:306-309` | Refetch. | |
| 7 | "Manage bookings on web" footer | static | `src/app/business/bookings.jsx:340-353` | Not tappable. | |

- **Empty / loading / error states:** spinner; error "Couldn't load your bookings." + retry; empty "No upcoming bookings / New reservations from customers show up here." Cancel/reschedule/assign/complete are NOT available on mobile (web only; `bookingActions` helper computes them but only confirm/decline are rendered).
- **Modals / sheets / alerts opened:** Decline Alert; error Alert.
- **Back / dismiss behaviour:** tab; none.

---

## 13. Business Profile + Account

### Profile — `/business/profile`
- **File:** `src/app/business/profile.jsx` · **Reached from:** Business tab "Profile"; Today stat strip.
- **Gating / data needed:** business mode; storefront read `useProviderProfile(slug)` (public by-slug read).
| # | Element (EN / ES) | Type | Source | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | Stat strip (Followers · Posts · Paws · Barks) | static | `src/app/business/profile.jsx:169` | Display only here. | |
| 2 | Bio text | static | `src/app/business/profile.jsx:172-176` | Display only (if the business has one). | |
| 3 | "View public profile" / "Ver perfil público" (testID `business-profile-view-public`; disabled w/o slug) | button | `src/app/business/profile.jsx:179-199,102-105` | Pushes `/service/provider?slug=…` (public storefront as customers see it; covered elsewhere). | |
| 4 | "Recent moments" 3-up tiles (testID `business-profile-moment`) | grid tiles | `src/app/business/profile.jsx:205-227,109-127` | Opens `/service/provider-post` detail. | |
| 5 | "Try again" (testID `business-profile-retry`; error state) | button | `src/app/business/profile.jsx:150-164` | Refetch. | |
| 6 | "Signed in as" identity card (name, email, business name) (testIDs `business-account-name`, `business-account-email`) | static | `src/app/business/profile.jsx:264-295` | Display only. | |
| 7 | "Settings" / "Ajustes" (testID `business-account-settings`) | row button | `src/app/business/profile.jsx:298-309,58-60` | `router.push("/business/settings")` (section 13b). | |
| 8 | "Switch to Pet app" / "Ir a la app de mascotas" (testID `business-account-switch-pet`; only if the account also owns >=1 pet) | row button | `src/app/business/profile.jsx:312-325,62-64` | `router.replace("/(tabs)")` → pet app Feed. | |
| 9 | "Log out" / "Cerrar sesión" (red, testID `business-account-logout`) | button | `src/app/business/profile.jsx:328-349,75-84` | Alert "Log out?" / "¿Cerrar sesión?" + "You'll need to sign in again to manage your business." Buttons Cancel / "Log out" (destructive) → clears local account storage, drops session, `router.replace("/welcome")`. | ⚠️ ends session (language/notif prefs kept) |
| 10 | "Manage on the web" info card | static | `src/app/business/profile.jsx:230-251` | Not tappable. | |

- **Empty / loading / error states:** spinner; error "Couldn't load your profile." + retry; empty moments card "No moments yet / Post a moment from Today — it shows up on your public profile." The Account section is always rendered even while the storefront loads/fails.
- **Back / dismiss behaviour:** tab.

### 13b. Business Settings — `/business/settings`
- **File:** `src/app/business/settings.jsx` → `src/components/Settings/AppSettings.jsx` (`mode="business"`) · **Reached from:** Profile → Settings. Hidden tab; back returns to Profile. Same component also backs the pet-owner Settings route (documented elsewhere); here the pet-only notification toggles and the "Walk tracking" block are hidden.
| # | Element (EN / ES) | Type | Source | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | Back arrow | icon button | `src/components/Settings/AppSettings.jsx:783` | `router.back()` → business Profile. | |
| 2 | "Notify my phone" group: toggles "Walk & job requests", "New bookings", "Booking changes", "New orders", "New messages", "Adoption applications" (testID `biz-notif-toggle-{key}`; default ON) | switches | `src/components/Settings/AppSettings.jsx:465-521,527-562` | Optimistic flip, then `PUT /api/notification-prefs {category, enabled}` (server-backed, governs push only; in-app bell always written). | ⚠️ changes real push preferences |
| 3 | "Optional push" group: "New reviews", "Payments & payouts" (default OFF) | switches | `src/components/Settings/AppSettings.jsx:564-580` | Same PUT. | ⚠️ |
| 4 | "In-app only" group: "Post activity", "New followers" (bell icon, no toggle) + note "Always shown in your notifications — never sent to your phone." | info rows | `src/components/Settings/AppSettings.jsx:582-600` | none | |
| 5 | Language: "System default" / "English" / "Español" (testIDs `lang-system`, `lang-en`, `lang-es`) | radio rows | `src/components/Settings/AppSettings.jsx:79-120,842` | Persists locale preference; UI language switches. | |
| 6 | "Account Privacy: Public" row | static row | `src/components/Settings/AppSettings.jsx:857` | Display only (not a control). | |
| 7 | "Help improve PawPi (anonymous)" switch (testID `telemetry-toggle`, default ON) | switch | `src/components/Settings/AppSettings.jsx:126-196,858` | Turns anonymous telemetry on/off (opt-out wipes queue + install id). | |
| 8 | "Help Center" / "Centro de ayuda" → | row | `src/components/Settings/AppSettings.jsx:873,673-679` | Opens hosted help URL in the browser, else falls back to mail. | ⚠️ leaves app |
| 9 | "Contact Us" / "Contactanos" → | row | `src/components/Settings/AppSettings.jsx:874,665-671` | Opens mail composer `mailto:` support address (subject "PawPi support"); if no mail app, Alert with the address. | ⚠️ leaves app |
| 10 | "Privacy Policy", "Terms of Service", "End User License Agreement (EULA)" → | rows | `src/components/Settings/AppSettings.jsx:875-897,681-687` | Open hosted pages on www.pawpi.info in the browser. | |
| 11 | "Delete account" (testID `delete-account`; hint "Permanently delete your account and all data.") | button | `src/components/Settings/AppSettings.jsx:913-940,622-660` | Alert "Delete account?" (Cancel / "Delete account") → second Alert "This is permanent" ("Keep my account" / "Delete forever") → `DELETE /api/account` → clears storage → `/welcome`. **Do NOT tap on production.** | 🗑️ deletes the real account and data |

- **Empty / loading / error states:** prefs fall back to catalog defaults if the GET fails (never throws). Delete failure → Alert "Couldn't delete account" + server message.
- **Back / dismiss behaviour:** back arrow → business Profile (stays inside business group).

---

## 14. Adoption applications (shelter review)

### Applications — `/business-adoption`
- **File:** `src/app/business-adoption.jsx` · **Reached from:** Today "Pending applications" row (`src/app/business/index.jsx:609`).
- **Gating / data needed:** business mode **and** active provider with capability `adoption` (query disabled otherwise → shows the empty state). Root-level Stack screen (not a tab).
| # | Element (EN / ES) | Type | Source | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | Back arrow (testID `adoption-back`, a11y "Back") | icon button | `src/app/business-adoption.jsx:530-538` | `router.back()` → Today. | |
| 2 | Header "Applications" + business name | label | `src/app/business-adoption.jsx:539-546` | none | |
| 3 | Search field (testID `adoption-search`, "Search applicants, dogs or answers"); only when there is >=1 application | text input | `src/app/business-adoption.jsx:591-598` | 200 ms debounced client-side filter over applicant name, dog name/breed and answers. | |
| 4 | Dog group header (paw + "Name · Breed", listing pill Available/Pending/Adopted, "N applications") (testID `adoption-group-{key}`) | static | `src/app/business-adoption.jsx:311-340` | none. Groups sorted by open-application count; within group open → approved → declined. | |
| 5 | Application card (testID `adoption-app-{id}`): applicant name, status chip, "Submitted: date", Q&A answers | card | `src/app/business-adoption.jsx:135-200` | Display only. | |
| 6 | Email link (envelope, coral) | link | `src/app/business-adoption.jsx:171-177` | `Linking.openURL("mailto:…")` → opens the mail composer. | ⚠️ leaves app, composes mail to a real applicant |
| 7 | Phone link (extracted from the "Best contact number" answer) | link | `src/app/business-adoption.jsx:178-184` | `Linking.openURL("tel:…")` → iOS call confirmation. | ⚠️ initiates a phone call to a real person |
| 8 | "Approve" / "Aprobar" (green; testID `adoption-approve-{id}`; open apps only) | button | `src/app/business-adoption.jsx:205-226,449-459` | Alert "Approve this application?" + "This creates the adopter's pet and marks the dog adopted. It can't be undone." (Cancel / Approve) → `PATCH /api/providers/{id}/adoption-applications/{appId} {status:"approved"}`. 409 → Alert "Already decided / pull to refresh". | ⚠️ 📤 irreversible: creates a pet in the applicant's account + marks listing adopted |
| 9 | "Decline" / "Rechazar" (testID `adoption-decline-{id}`; open apps only) | button | `src/app/business-adoption.jsx:227-248,463-479` | Alert "Decline this application?" + "The applicant will be notified." → PATCH `{status:"declined"}`. | 📤 |
| 10 | "Mark under review" / "Marcar en revisión" (testID `adoption-under-review-{id}`; hidden when already under review) | button | `src/app/business-adoption.jsx:249-273,481` | **No confirm dialog.** PATCH `{status:"under_review"}`; chip turns blue "Under review". | 📤 (status change may notify the applicant) |
| 11 | "Message" / "Mensaje" (coral outline; testID `adoption-message-{id}`; available even after a decision) | button | `src/app/business-adoption.jsx:278-304,486-511` | `POST /api/providers/{id}/adoption-applications/{appId}/thread` (creates/reuses a chat thread with the applicant) → pushes `/provider-chat` (title = applicant name). Failure → Alert "Couldn't open the conversation". | ⚠️ opens thread with a real applicant (sending is 📤 in chat) |
| 12 | "Retry" (testID `adoption-retry`) | button | `src/app/business-adoption.jsx:558-572` | Refetch (error state). | |
| 13 | Pull-to-refresh | gesture | `src/app/business-adoption.jsx:603-606` | Refetch applications. | |

- **Empty / loading / error states:** spinner; error "Couldn't load your applications." + retry; no applications: "No applications yet / When someone applies to adopt one of your dogs, it shows up here to review."; search with zero hits: "No matches / Try a different name or dog." (testID `adoption-no-matches`). Action errors show Alert with raw server message.
- **Modals / sheets / alerts opened:** Approve/Decline/already-decided/error Alerts; mail/phone system handoff.
- **Back / dismiss behaviour:** back arrow / iOS swipe-back → Today.

---

## 15. Walker workspace

### Walks (walker workspace) — `/walker-walks`
- **File:** `src/app/walker-walks.jsx` · **Reached from:** Today "Walks" card (`src/app/business/index.jsx:623`); Bookings "Start walk" (`src/app/business/bookings.jsx:334`); a walk-request notification tap (`src/app/notifications.jsx:561`).
- **Gating / data needed:** account must be active staff of a provider; it uses the **first** provider in the list (`providers[0]`), not the Today switcher. Without one: "No walker workspace" empty state. Walk-booking list = bookings with capability `walker` and not cancelled.
| # | Element (EN / ES) | Type | Source | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | Back arrow | icon button | `src/app/walker-walks.jsx:253-258` | `router.back()`. | |
| 2 | Header "Walks 🐾" / "Paseos 🐾" + provider name | label | `src/app/walker-walks.jsx:259-268` | none | |
| 3 | "Scan" / "Escanear" QR button (testID `walker-scan-pickup`; a11y "Scan pickup") | button | `src/app/walker-walks.jsx:270-291` | Opens the QR scanner modal (section 17). | |
| 4 | "Incoming requests" section (testID `incoming-requests`): request card (`request-card-{id}`) with dog name, owner · when ("Now" or datetime) · distance km, note | cards | `src/app/walker-walks.jsx:300-323,515-584` | Display; only open requests targeted at this walker (`GET /api/providers/{id}/walk-requests?status=open`, polls 20 s). | |
| 5 | "Nearby now" section (testID `nearby-requests`) | cards | `src/app/walker-walks.jsx:326-349` | "Find a walker now" broadcasts near the walker (`?scope=broadcast`). | |
| 6 | "Accept" / "Aceptar" (testID `accept-request-{id}`) | button | `src/app/walker-walks.jsx:559-580,210-234` | `POST /api/providers/{id}/walk-requests/{requestId}/accept` → Alert "Walk accepted" ("A confirmed walk was added to your agenda and a chat opened with the owner."). 409 → Alert "No longer available". Other → "Couldn't accept". **No pre-confirmation dialog.** | 📤 creates a confirmed booking + chat with a real owner |
| 7 | "Walk history" row (testID `walker-history-link`) | row | `src/app/walker-walks.jsx:352-374` | → `/walker-history` (section 18). | |
| 8 | Walk booking card: dog name, optional "Uses a walk" badge (credit walk), owner · date time | card | `src/app/walker-walks.jsx:436-490` | Display. | |
| 9 | "Start" / "Empezar" | button | `src/app/walker-walks.jsx:491-509,120-136` | `POST /api/providers/{id}/pets/{petId}/walk-sessions {booking_id}` creates a live session → opens the walk modal (section 16) and starts GPS tracking (asks foreground location permission). Failure → Alert "Couldn't start walk". | 📤 ⚠️ starts a live-tracked session the owner can watch |
| 10 | Pull-to-refresh | gesture | `src/app/walker-walks.jsx:294-297` | Refetch bookings. | |

- **Empty / loading / error states:** spinner; no provider: "No walker workspace / You're not active staff of a walking provider yet."; no bookings: "No walks booked / Booked walks from owners will appear here to check in." Walking with location denied still times the walk; map shows "Location is off for this walk — the time still tracks, just no live map." (hardcoded English).
- **Modals / sheets / alerts opened:** StartWalkModal (section 16), PickupScannerModal (section 17), Alerts listed above.
- **Back / dismiss behaviour:** back arrow. Closing the walk modal mid-walk asks to confirm cancel.

---

## 16. Live walk timer (walker usage)

### Walk in progress — modal `StartWalkModal`
- **File:** `src/components/Health/WalkActivity/StartWalkModal.jsx` (shared with owner self-tracking; walker passes `topContent=<WalkerLiveMap>` from `src/components/Health/WalkActivity/WalkerLiveMap.jsx`) · **Reached from:** Walks → "Start" or after a successful QR redeem.
| # | Element (EN / ES) | Type | Source | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | X (close) | icon button | `src/components/Health/WalkActivity/StartWalkModal.jsx:186-198,138-157` | If time has elapsed: Alert "Walk in Progress" / "Are you sure you want to cancel this walk? Progress will be lost." Buttons "Keep Walking" / "Cancel Walk" (destructive) → stops GPS tracking and closes (no `finish` is sent; the server session stays in progress). | ⚠️ abandons a live session (does not call the finish endpoint) |
| 2 | Live route map (Start/Now markers) or note "Waiting for the first GPS points…" / "Location is off for this walk…" | map | `src/components/Health/WalkActivity/WalkerLiveMap.jsx:19-60` | Route extends as points arrive; each point (~every 5 s / 10 m) is `PATCH /api/providers/{id}/walk-sessions/{sessionId} {action:"track", points}`. | 📤 live location shared with the owner |
| 3 | Countdown (30 min), scheduled/elapsed/pace info | display | `src/components/Health/WalkActivity/StartWalkModal.jsx:230-310` | Ticks every second; at 0 shows "Walk time is up". | |
| 4 | "Pause" / "Resume" | buttons | `src/components/Health/WalkActivity/StartWalkModal.jsx:323-371` | Pauses/resumes the *timer* only (GPS watch keeps running). | |
| 5 | "Extend 10 / 15 / 30 min" (after time-up) | buttons | `src/components/Health/WalkActivity/StartWalkModal.jsx:425-448` | Adds time and resumes. | |
| 6 | Notes (optional), placeholder "Route, observations..." | text input | `src/components/Health/WalkActivity/StartWalkModal.jsx:470-495` | Free text saved into the report. | |
| 7 | "Finish Walk" / red-coral | button | `src/components/Health/WalkActivity/StartWalkModal.jsx:500-521`; handler `src/app/walker-walks.jsx:181-201` | Stops GPS, `PATCH /api/providers/{id}/walk-sessions/{sessionId} {action:"finish", duration_s, notes}` → Alert "Walk finished" ("The report was saved and added to the pet's health timeline."). Failure → "Couldn't finish walk". | 📤 ⚠️ writes into the real pet's health timeline and notifies the owner |

- **Back / dismiss behaviour:** pageSheet; swipe-down triggers the same cancel confirmation (`onRequestClose`).

---

## 17. QR pickup scanner

### Scan pickup code — modal `PickupScannerModal`
- **File:** `src/components/Providers/PickupScannerModal.jsx` · **Reached from:** Walks → "Scan" button.
- **Gating / data needed:** camera permission (requested on open). The owner shows a QR on their side (Pet/walker package screens, covered by the owner colleague).
| # | Element (EN / ES) | Type | Source | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | X close (testID `pickup-scanner-close`) | icon button | `src/components/Providers/PickupScannerModal.jsx:55-63` | Closes scanner. | |
| 2 | "Enable camera" (testID `pickup-scanner-grant`; only if permission denied but can ask again) | button | `src/components/Providers/PickupScannerModal.jsx:81-97` | Re-requests camera permission. Text "Camera access is needed to scan the owner's pickup code." | |
| 3 | Camera viewfinder (testID `pickup-camera`, QR only) + hint "Point at the owner's QR code" | camera | `src/components/Providers/PickupScannerModal.jsx:99-130` | **Auto-submits on first QR detected — no confirm.** Calls handler `src/app/walker-walks.jsx:140-179`: best-effort GPS then `POST /api/providers/{id}/walk-pickup/redeem {token,lat,lng}` → deducts one prepaid walk credit, creates an in-progress session → closes scanner → opens the walk modal and starts tracking. 409 → Alert "No walks left / Ask the owner to buy a pack before this walk."; 401/403 → "Invalid code / That QR isn't a valid pickup code for your business."; other → "Couldn't scan" + server message. Spinner while busy. | 💸 consumes the owner's prepaid credit; 📤 starts a walk visible to the owner |

- **Empty / loading / error states:** spinner until permission state known; denied-forever shows only the explanation text. 
- **Back / dismiss behaviour:** X or system back.

---

## 18. Walker history

### Walk history — `/walker-history`
- **File:** `src/app/walker-history.jsx` · **Reached from:** Walks → "Walk history" (`src/app/walker-walks.jsx:353`).
- **Gating / data needed:** staff of a provider (uses first provider); finished sessions (`GET /api/providers/{id}/walk-sessions?status=finished`).
| # | Element | Type | Source | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | Back arrow | icon button | `src/app/walker-history.jsx:48` | `router.back()`. | |
| 2 | History row (testID `history-row-{id}`: dog, date · min · km) | expandable row | `src/app/walker-history.jsx:135-137` | Toggles an inline map (route polyline + pickup/start marker, testID `history-map-{id}`), or "No route recorded" (testID `history-noroute-{id}`), plus photos. | |
| 3 | Pull-to-refresh | gesture | `src/app/walker-history.jsx:61-64` | Refetch. | |

- **Empty / loading / error states:** spinner; no provider: "No walker workspace"; error "Couldn't load history / Pull down to try again."; empty "No past walks yet / Finished walks will show here with their route and pickup point."
- **Back / dismiss behaviour:** back arrow.

---

## 19. Create your business (wizard)

### Create / list your business — `/vet-business-access`
- **File:** `src/app/vet-business-access.jsx` · **Reached from:** Welcome screen link "Access for vets & businesses" (`src/app/welcome.jsx:68-69`). Root stack screen (`src/app/_layout.jsx:123`).
- **Gating / data needed:** none to open. Three states: spinner (auth loading) / **signed-out gate** / **signed-in onboarding** (if the user already manages a business → "all set" success panel instead of the form).
| # | Element (EN / ES) | Type | Source | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | Close X (top-right circle) | icon button | `src/app/vet-business-access.jsx:78-99` | `router.back()` → Welcome. | |
| 2 | **Signed-out:** Terms checkbox "I agree to the Terms of Service and Privacy Policy, including PawPi's zero-tolerance policy…" | checkbox | `src/app/vet-business-access.jsx:154-197` | Toggles agreement (unchecked by default). | |
| 3 | "Terms of Service" and "Privacy Policy" inline links | text links | `src/app/vet-business-access.jsx:178-194` | Open hosted pages in the browser. | |
| 4 | "Create account" / "Crear cuenta" (50% opacity until checked) | button | `src/app/vet-business-access.jsx:200-222,135-144` | Unchecked → Alert "One more step / Please agree to the Terms of Service and Privacy Policy to create an account." Checked → `signUp()` opens the web auth modal (sign-up). | 🔑 (account creation; do not complete on prod) |
| 5 | "Log in" / "Iniciar sesión" | button | `src/app/vet-business-access.jsx:225,956-974` | `signIn()` opens the web auth modal (email/Apple/Google flows live in the modal). When it completes the form appears. | 🔑 |
| 6 | **Signed-in:** "Business name" * (placeholder "Happy Paws Veterinary") | text input | `src/app/vet-business-access.jsx:493-500` | Required. | |
| 7 | "Services you offer" multi-select checkboxes: Veterinary clinic 🩺, Telehealth (video vet) 📹, Groomer ✂️, Dog walker 🦮, Daycare / boarding 🏠, Pet sitter 🏡, Trainer 🎓, Pet shop 🛍️, Adoption / shelter 🐶 | checkbox cards | `src/app/vet-business-access.jsx:48-58,505-539` | Toggles capability; "Selected: …" summary appears. At least one required. | |
| 8 | "Short bio" (optional) | multiline input | `src/app/vet-business-access.jsx:560-568` | Free text. | |
| 9 | "Business location" field (shared `LocationField`) | map pin field | `src/app/vet-business-access.jsx:573-578` | Opens the shared location sheet (open / "Done" / close buttons, testIDs `business-location-open`, `-done`, `-close`, `-picker`; `src/components/Map/LocationField.jsx:92,138,148`) to drop a pin / type an address / use "My location" (GPS permission). Optional. | |
| 10 | Links (optional): Website, Instagram, Facebook, Google Maps URL | 4 text inputs | `src/app/vet-business-access.jsx:583-625` | Free text URLs (keyboard type url). | |
| 11 | Price-list/menu uploader ("Upload a price list to pre-fill your services"; shows filename + "Change") | button | `src/app/vet-business-access.jsx:629-662,282-301` | System document picker (PDF/CSV/XLS/XLSX) → uploads to storage immediately via `useUpload`. Errors inline (red text "Couldn't upload that document."). | ⚠️ uploads a file to production storage |
| 12 | "Build my profile" / "Armá mi perfil" (sparkles; shows "Building your profile…") | button | `src/app/vet-business-access.jsx:678-683,303-389` | Validates name + >=1 service (inline red errors "Please enter your business name." / "Please choose at least one service."). Then `POST /api/providers` (creates a real DRAFT business with you as owner), optional `POST /api/providers/{id}/locations`, then `POST /api/providers/{id}/enrich` (+ `/enrich/document`) which only *proposes* a profile from your links/doc. If a proposal exists → Review step (row 13) else → success panel. | ⚠️ creates a real business record in production (draft; not published) |
| 13 | **Review step** ("Review your profile"): editable "About your business", proposed service rows (checkbox + name + price + mins), "N candidate photos found…" note | inputs/checkboxes | `src/app/vet-business-access.jsx:700-801` | Edit/untick proposals before saving. | |
| 14 | "Save & finish" / "Guardar y finalizar" | button | `src/app/vet-business-access.jsx:793-798,394-420` | `PATCH /api/providers/{id}` (bio) and `POST /api/providers/{id}/services` per ticked row → success panel. Per-row failures are swallowed silently. | ⚠️ writes services to the draft business |
| 15 | **Success / "You're all set up" panel** → "Open web dashboard" / "Abrir el panel web" (shows the URL below it) | button | `src/app/vet-business-access.jsx:804-879,846-864` | `Linking.openURL(<app base>/provider)` — opens the web dashboard in the browser (disabled if no base URL configured). Copy: `"{name}" is set up as a draft. Finish setup — publish, add your services, and invite staff — from the PawPi web dashboard.` | ⚠️ leaves app |

- **Empty / loading / error states:** spinner while auth/providers load; inline red `errorMessage` text for validation/server failures (server `error` text shown verbatim, or `common.somethingWrong`); enrichment failures are swallowed → falls back to the manual flow. A user who already manages a business always sees the "You're all set up" panel (single vs multiple copy) instead of the form, so a second business cannot be created from here.
- **Modals / sheets / alerts opened:** "One more step" Alert; LocationField sheet; document picker; web auth modal.
- **Back / dismiss behaviour:** only the X button (no back arrow); swipe-back still works on iOS.

---

## 20. Claim a listed business

### Claim card + modal — component `ClaimCTA` / `ClaimModal`
- **File:** `src/components/Providers/ClaimCTA.jsx` · **Reached from:** the owner-facing storefront `/service/provider` when the listing is a directory seed (`claim_status === "unclaimed"`) — `src/app/service/provider.jsx:610`. Renders nothing for already-claimed listings.
- **Gating / data needed:** signed in to submit (guest gets a sign-in Alert).
| # | Element (EN / ES) | Type | Source | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | Card "Is this your business?" + "Claim your PawPi listing to update photos, hours, services, and reply to reviews." | static | `src/components/Providers/ClaimCTA.jsx:76-93` | none | |
| 2 | "Claim it" / "Reclamalo" (testID `provider-claim-cta`); label becomes "Claim submitted" (disabled chip) when a claim is pending, "Retry claim" after rejection | button | `src/components/Providers/ClaimCTA.jsx:94-125,45-58` | Guest: Alert "Sign in to claim your business." (Sign in / Cancel). Else opens the claim modal. | |
| 3 | Modal X close (a11y "Close") | icon button | `src/components/Providers/ClaimCTA.jsx:187` | Closes modal. | |
| 4 | Method chips "Business phone", "Business email", "Document" (toggle; optional) | chips | `src/components/Providers/ClaimCTA.jsx:207` | Choose how the reviewer can verify. | |
| 5 | Note field "Anything else? (optional)", placeholder "e.g. I'm the owner and my WhatsApp is +54 11 ..." (max 500) | multiline input | `src/components/Providers/ClaimCTA.jsx:241` | Free text. | |
| 6 | "Send claim" / "Enviar reclamo" | button | `src/components/Providers/ClaimCTA.jsx:263,140-170` | `POST /api/providers/{id}/claim {method, note}` → closes modal, Alert "Claim submitted / We'll review your claim and get back to you soon." Errors: 409 → "This business has already been claimed." / "A claim is already pending on this business."; 404 → "This business is no longer available."; else "Please try again in a moment." (title "Couldn't submit claim"). | ⚠️ 📤 submits an ownership claim on a real business; staff review it manually |

- **Empty / loading / error states:** see errors above. Text under the button: "Claims are reviewed manually. You'll see the status in 'My claims'."
- **Back / dismiss:** pageSheet; swipe-down / X.

### My claims — `/service/my-claims`
- **File:** `src/app/service/my-claims.jsx` · **Reached from:** **no navigation entry found in code** (the only references are the telemetry route registry and the "My claims" text in the claim modal) — treat as unreachable in the live app unless deep-linked.
| # | Element | Type | Source | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | Back arrow | icon button | `src/app/service/my-claims.jsx:32-38` | `router.back()`. | |
| 2 | Claim row (business name + status chip Pending review / Approved / Rejected / Withdrawn) | list row | `src/app/service/my-claims.jsx:64-85` | Opens `/service/provider?slug=…` when a slug exists. | |
| 3 | Pull-to-refresh | gesture | `src/app/service/my-claims.jsx:61-62` | Refetch `GET /api/providers/claims/mine`. | |

- **Empty / loading / error states:** spinner; empty "No claims yet / Found your business in the PawPi directory? Open its profile and tap 'Claim it'."

---

## 21. Prescription fulfillment (owner-side, includes a payment)

### Request fulfillment — `/rx-fulfillment`
- **File:** `src/app/rx-fulfillment.jsx` · **Reached from:** Health → Vet Record → Prescriptions card, button `health.prescriptions.requestFulfillment` (testID `rx-fulfill-{id}`; only for active Rx with refills left) — `src/components/Health/VetRecord/PrescriptionsSection.jsx:129-141`. Owner-facing (the provider/pharmacy side is web-only). Params: `prescriptionId`, `petId`, `drugName`.
- **Gating / data needed:** a prescription; pharmacy providers come from `GET /api/providers/discover?type=pharmacy` (empty state if none).
| # | Element (EN / ES) | Type | Source | Action → expected result | Risk |
|---|---|---|---|---|---|
| 1 | Back arrow | icon button | `src/app/rx-fulfillment.jsx:148-150` | `router.back()`. | |
| 2 | Orders list "YOUR FULFILLMENT ORDERS": pharmacy, status (Requested/Accepted/Preparing/Ready/Out for delivery/Fulfilled/Cancelled — hardcoded English), method · price (testID `rxf-order-{id}`) | cards | `src/app/rx-fulfillment.jsx:165-203` | Display. | |
| 3 | "Pay $X.XX" / "Pagar" (testID `rxf-pay-{id}`; only when the pharmacy set a price, order not paid, not cancelled) | button | `src/app/rx-fulfillment.jsx:188-200,93-132` | `POST /api/payments/checkout {provider_id, kind:"product", amount_cents, rail:"mercadopago", source_ref:"rxf-{id}"}`; 503 → Alert "Payments not available yet"; else `PATCH /api/rx-fulfillment-orders/{id} {order_id}` to link, then `Linking.openURL(checkoutUrl)` → opens MercadoPago checkout in the browser. | 💸 |
| 4 | Pharmacy rows (testID `rxf-provider-{id}`) | selectable rows | `src/app/rx-fulfillment.jsx:218-240` | Selects the pharmacy (peach highlight). | |
| 5 | Delivery / Pickup chips (testIDs `rxf-method-delivery`, `rxf-method-pickup`) | chips | `src/app/rx-fulfillment.jsx:242-257,293-317` | Switch method; Delivery shows the address field. | |
| 6 | "Delivery address" LocationField (testID `rxf-location`) | map field | `src/app/rx-fulfillment.jsx:259-268` | Opens location sheet; address required for delivery. | |
| 7 | "Request fulfillment" / "Solicitar entrega" (testID `rxf-submit`; disabled until pharmacy chosen and (pickup or address)) | button | `src/app/rx-fulfillment.jsx:270-285,73-91` | `POST /api/rx-fulfillment-orders {prescription_id, provider_id, method, delivery_*}` → Alert "Fulfillment requested / The pharmacy will confirm and set a price." | 📤 ⚠️ sends the prescription request + delivery address to a real pharmacy |

- **Empty / loading / error states:** spinner; no pharmacies: "No fulfillment providers available yet."; request failure → Alert "Couldn't request fulfillment" + server text; payment failure → "Couldn't start payment" + server text (may be raw).
- **Back / dismiss behaviour:** back arrow.

---

## Screens intentionally not documented
- `src/app/service/provider-post.jsx` — it is the provider-post **detail** (paws, comments, delete, ModerationMenu), not the business composer; the business composer is `PostComposerModal` (section 10). Left to the colleague covering storefront/social screens.
- `src/app/sitter-visits.jsx`, `notifications.jsx`, `/service/provider` storefront, `/service/adoption` — covered elsewhere.

## Risky actions found in Part F
- `src/app/messages.jsx:277-281` — tapping a search result runs `POST /api/dm-threads {otherUserId}`, opening a DM thread with a real pet-parent account (search lists real production users).
- `src/app/chat.jsx:295-309` — Send text: `POST /api/dm-threads/{id}/messages {body}` → delivers to a real user. 📤
- `src/app/chat.jsx:248-268` — Photo button: picks from the library and **auto-sends** `POST /api/dm-threads/{id}/messages {image_url}` with no preview/confirm. 📤
- `src/app/chat.jsx:132-135` + `src/components/moderation/ModerationMenu.jsx:95-113` — Block user: `POST /api/blocks {blocked_user_id}`; blocks messaging both ways; there is no unblock UI in the app. ⚠️
- `src/components/moderation/ModerationMenu.jsx:75-86,190` — Report reason rows: `POST /api/reports {target_type,target_id,reason}` (not reachable from Chat, reachable on other UGC surfaces). ⚠️
- `src/app/provider-chat.jsx:262-281` — Send text: `POST /api/threads/{id}/messages {body}` to a real business or (in business mode) a real customer/adoption applicant. 📤
- `src/app/provider-chat.jsx:223-242` — Attach image auto-sends `POST /api/threads/{id}/messages {attachment_url}` without preview. 📤
- `src/app/pet-profile.jsx:505-527`, `src/app/service/provider.jsx:629-650`, `src/app/service/booking-summary.jsx:100-116`, `src/app/service/transport.jsx:186-203`, `src/components/adoption/AdoptionListingViews.jsx:243-262` — each opens a thread (`POST /api/dm-threads` or `POST /api/threads`) with a real user/business. ⚠️
- `src/app/business/index.jsx:216-299` (switch at 290) — "Accepting walks now": `PUT /api/providers/{id}/live-availability {accepting,lat,lng}`; publishes live presence + GPS to nearby owners (8 h auto-expiry). ⚠️
- `src/app/business/index.jsx:663-687` + `src/components/Feed/PostComposerModal.jsx:197,433` — "Post moment": uploads media and `POST /api/providers/{id}/posts`; public in followers' feed and storefront. 🌍
- `src/app/business/bookings.jsx:120-141,248-251` — "Confirm": `PATCH /api/providers/{id}/bookings/{aid} {action:"confirm"}` with no confirm dialog; notifies customer. 📤
- `src/app/business/bookings.jsx:143-166,253-269` — "Decline": `PATCH … {action:"decline"}`; copy says customer notified and any payment refunded. 📤 💸
- `src/app/business/profile.jsx:328-349,75-84` — "Log out": clears local account storage and session. ⚠️
- `src/components/Settings/AppSettings.jsx:913-940,622-660` (reachable at `/business/settings`) — "Delete account": `DELETE /api/account`, permanently removes account and data after two confirmations. 🗑️
- `src/components/Settings/AppSettings.jsx:504,527-540` — business notification toggles: `PUT /api/notification-prefs {category,enabled}` changes real server push preferences. ⚠️
- `src/app/business-adoption.jsx:205-226,449-459` — Approve: `PATCH /api/providers/{id}/adoption-applications/{appId} {status:"approved"}`; creates the adopter's pet and marks the dog adopted; irreversible. ⚠️ 📤
- `src/app/business-adoption.jsx:227-248,463-479` — Decline: same PATCH with `declined`; applicant notified. 📤
- `src/app/business-adoption.jsx:249-273,481` — "Mark under review": PATCH `under_review` with no confirm. 📤
- `src/app/business-adoption.jsx:278-304,486-511` — Message: `POST /api/providers/{id}/adoption-applications/{appId}/thread` then chat with a real applicant. ⚠️
- `src/app/business-adoption.jsx:171-184` — Email/phone links: `mailto:` / `tel:` handoff (can start a real phone call). ⚠️
- `src/app/walker-walks.jsx:559-580,210-234` — Accept request: `POST /api/providers/{id}/walk-requests/{requestId}/accept`; creates a confirmed booking and opens a chat with a real owner. 📤
- `src/app/walker-walks.jsx:491-509,120-136` — Start walk: `POST /api/providers/{id}/pets/{petId}/walk-sessions`; begins live GPS posting (`PATCH …/walk-sessions/{sessionId} {action:"track"}`) visible to the owner. 📤 ⚠️
- `src/components/Health/WalkActivity/StartWalkModal.jsx:500-521` + `src/app/walker-walks.jsx:181-201` — Finish Walk: `PATCH …/walk-sessions/{sessionId} {action:"finish"}`; writes the report into the pet's health timeline. 📤 ⚠️
- `src/components/Health/WalkActivity/StartWalkModal.jsx:138-157` — Cancel Walk abandons the live session without calling finish (server session left in progress). ⚠️
- `src/components/Providers/PickupScannerModal.jsx:99-130` + `src/app/walker-walks.jsx:140-179` — scanning any QR immediately `POST /api/providers/{id}/walk-pickup/redeem {token,lat,lng}`; spends one prepaid walk credit and starts a walk. 💸 📤
- `src/app/vet-business-access.jsx:200-225` — Create account / Log in open the web auth modal. 🔑
- `src/app/vet-business-access.jsx:303-389` — "Build my profile": `POST /api/providers` (creates a real draft business), `POST /api/providers/{id}/locations`, `POST /api/providers/{id}/enrich` (+ `/enrich/document`). ⚠️
- `src/app/vet-business-access.jsx:394-420` — "Save & finish": `PATCH /api/providers/{id}` + `POST /api/providers/{id}/services`. ⚠️
- `src/app/vet-business-access.jsx:282-301` — price-list upload to production storage. ⚠️
- `src/components/Providers/ClaimCTA.jsx:140-170` — "Send claim": `POST /api/providers/{id}/claim`; ownership claim reviewed by staff. ⚠️ 📤
- `src/app/rx-fulfillment.jsx:73-91` — "Request fulfillment": `POST /api/rx-fulfillment-orders` sends the Rx and delivery address to a pharmacy. 📤 ⚠️
- `src/app/rx-fulfillment.jsx:93-132` — "Pay": `POST /api/payments/checkout` (rail `mercadopago`, kind `product`), `PATCH /api/rx-fulfillment-orders/{id}`, then opens the MercadoPago checkout URL. 💸
