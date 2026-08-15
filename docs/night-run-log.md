# Night-run log — 2026-07-29

---

## ✅ BN2 PR3 — Channel-aware business Settings UI — 2026-08-15 — **BN2 COMPLETE**

**Branch:** `feat/bn2-pr3-business-settings` · **No migration** · Mobile-only.

**What shipped.** The business-mode notification settings now present the real BN2 categories grouped by
their PUSH channel class instead of one flat list, consuming the PR2 catalog.

- **`AppSettings` (`mode="business"`) → `BusinessNotificationToggles`** rebuilt into three groups from
  `businessNotificationPrefs.js`:
  - **"Notify my phone"** — the PUSH categories (walk requests · new bookings · booking changes · orders
    · messages · adoption applications), each a Switch, default ON.
  - **"Optional push"** — the OPTIONAL_PUSH categories (reviews · payments/payouts), each a Switch,
    default OFF (opt-in). The displayed default now honors `categoryDefaultEnabled` (OPTIONAL shows off
    until turned on), so a category reads its true state before/after the server load.
  - **"In-app only"** — an info group (post activity · new followers) rendered with a bell tag and a
    "always shown … never sent to your phone" note; **no toggle** (these can't be turned off — they're
    never pushed).
- Toggles write `notification_prefs` via the existing GET/PUT `/api/notification-prefs` (BX4); the PR1
  send-hook already respects them. New per-category icons; group headers + labels/hints are EN+ES i18n
  keys (`bizNotif.group*` + the `bizNotif.*` labels added in PR2).
- **Pet-owner Settings unchanged** — the `mode` gate is untouched: pet mode still renders the E5
  client-side categories + the Walk-tracking / Apple-Health block byte-for-byte.

**Tests / gates.** mobile jest 1882→**1883** (+1: `AppSettings.test.jsx` asserts the three groups render,
PUSH+OPTIONAL categories get a toggle, the in-app-only category is info-only never a toggle; the existing
pet-mode-unchanged + toggle-PUTs-the-pref cases still pass). Web/integration unchanged (no web change).

**Flag:** **NEEDS ON-DEVICE CONFIRMATION** of the grouped screen (RNTL covers structure/behavior; a
device pass confirms the visual). Real phone push still awaits the APNs/EAS setup in the BN2 PR1 entry
below.

**BN2 is COMPLETE** (PR1 remote-push foundation · PR2 emission + catalog · PR3 channel-aware settings).
Migrations **0109 + 0110** are ✅ APPLIED + VERIFIED on Supabase (2026-08-15). The only remaining external dependency:
configure **APNs/Expo credentials** (PR1 steps) to light up iOS delivery.

---

## ✅ BN2 PR2 — Business notification EMISSION + channel catalog — 2026-08-15

**Branch:** `feat/bn2-pr2-business-emission` · **Migration:** 0110 (✅ APPLIED + VERIFIED on Supabase 2026-08-15) · Design of
record: `docs/business-provider.md`.

**What shipped.** PawPi now emits the provider-facing notifications owners actually want, to the
**OWNER + the relevant active STAFF**, and stands up the full shared channel catalog. Until now the
only notification reaching a business was a walk request.

- **Recipient resolution — `notifyProviderTeam` (`utils/providerNotify.js`).** One resolver for all
  business events: `app_provider_active_staff_ids([providerId])` (0093, DEFINER) returns owner + every
  active staff in a single call (the owner is enrolled as active staff at provider creation), so the
  emitting route — running in the *actor's* identity, which can't read another provider's staff — still
  reaches the whole team. `ownerOnly` targets just `providers.owner_user_profile_id` (used by
  `biz_follow`). Never throws, never double-notifies the actor (safeNotify skips `recipient === actor`),
  never leaks across businesses (scoped to one providerId), degrades clean if the DEFINER reader is
  absent.
- **Events wired (route → type → recipients):**
  - `providers/[id]/book` → **`biz_booking`** → owner + staff (actor = the booking client).
  - `vet-appointments` PUT (reschedule / status) + DELETE (cancel) → **`biz_booking_change`** → owner +
    staff, gated on a real `provider_id` (personal vet appts have none) + a schedule-relevant change.
  - `payments/checkout` (`kind='product'`) + `pets/[id]/shop-checkout` → **`biz_order`** → owner + staff.
    Booking payments are excluded (they already fired `biz_booking`).
  - `threads/[id]/messages` → **`biz_message`** → owner + staff, **only when the CLIENT (thread owner)
    messages** the business; the staff→client direction is owner-facing and left out of BN2 scope.
  - `adoption/applications` → **`biz_adoption_application`** → shelter owner + staff.
  - Engagement (IN-APP-ONLY — a bell, never a push): `providers/[id]/posts/[postId]/paw` +
    `.../comments` → **`biz_post_engagement`** (owner + staff); `providers/[id]/follow` → **`biz_follow`**
    (OWNER ONLY). Paw/follow only notify on a *genuinely new* row (`ON CONFLICT DO NOTHING RETURNING id`),
    so a repeat tap doesn't re-notify.
- **Shared channel catalog** — web `notificationCategories.js` + mobile `businessNotificationPrefs.js`,
  the single source of truth: category → PUSH channel class (PUSH default-on · OPTIONAL_PUSH review/
  payout default-off · IN_APP_ONLY post-activity/followers) and the type↔category maps. The BN2 model:
  **every business notification ALWAYS writes an in-app bell**; the channel class + `notification_prefs`
  decide whether the PR1 send-hook also pushes. The PR1 push hook now consults the pref for **both** PUSH
  and OPTIONAL_PUSH (new PUSH categories aren't DB-gated, so the bell is never suppressed). The
  `notification-prefs` GET returns per-category defaults (OPTIONAL_PUSH absent = off).
- **Bilingual (EN + ES)** — push banner copy (`push.js`) + the in-app bell (`bizNotifBell.*` +
  a `BUSINESS_TYPES` branch in mobile `notifications.jsx`) for every `biz_*` type; the settings
  category labels/hints (`bizNotif.*`) for PR3.
- **DB — migration 0110** widens `notifications_type_check` for the nine `biz_*` types. The ONLY DB
  change; `app_notify()`'s BX4 gate is untouched (still only `walk_requests`). Verify `verify_0110.sql`.
  Degrades clean while absent: safeNotify swallows the CHECK violation, dropping the new bell rows,
  never 500.

**Tests / gates.** vitest 2010→**2022** (+12: catalog + `providerNotify` + push OPTIONAL/disabled paths),
integration 1006→**1011** (+5: `business-notification-emission.integration.test.ts` proves each event
through the REAL router on real Postgres — owner+staff recipients, actor = client, no cross-business
leak, owner-only follow, idempotent no-re-notify, staff-reply emits nothing), mobile jest 1879→**1882**
(+3: catalog shape + per-category defaults).

**Decisions / deviations.**
- Kept the walk-request pair on the **legacy `walk_requests` category key** (shipped in 0108) rather
  than the design's `biz_walk_job` label, so no pref rows migrate. Documented as a benign quirk:
  `walk_requests` is the one category `app_notify` still DB-gates (disabling suppresses its bell); the
  new categories follow the BN2 "bell always writes" model.
- `biz_review` / `biz_payout` are in the catalog (OPTIONAL_PUSH) but **not emitted** — no review/payout
  event fires today; reserved for when it does (no fake toggle for an event that can't fire, but the
  type is pre-allowed in 0110 so no future migration is needed).
- Emitted `biz_order` at **both** product-order paths (generic `payments/checkout kind=product` and the
  dedicated `shop-checkout`) since they insert orders independently — no double-notify (distinct paths).

**Flag:** **0110 ✅ APPLIED + VERIFIED on Supabase 2026-08-15.** **NEEDS ON-DEVICE CONFIRMATION** — a provider/staff
account should see these land in its bell (and, once APNs is configured per PR1's steps below, ring the
phone).

---

## ✅ BN2 PR1 — Remote-push FOUNDATION (server→phone) — 2026-08-15

**Branch:** `feat/bn2-pr1-push-foundation` · **Migration:** 0109 (✅ APPLIED + VERIFIED on Supabase 2026-08-15) · Design of record:
`docs/business-provider.md` ("Business / Provider Notifications v2").

**What shipped.** The first server→phone push layer PawPi has ever had. Until now the mobile app only
scheduled **local** reminders (`expo-notifications`) and server events wrote the in-app bell
(`app_notify`, 0044/0108) — nothing rang a phone. PR1 is the plumbing (emission of the business events
themselves is PR2):

- **DB — migration 0109 `device_push_tokens`** (`id, user_id→user_profiles.id, token, platform
  (ios|android), updated_at, UNIQUE(user_id, token)`), **ENABLE + FORCE RLS** own-row policy, app runs as
  `pawpi_app`. Plus **three SECURITY DEFINER readers** so the web send-hook — which runs in the **actor's**
  request identity, not the recipient's — can cross the owner boundary without loosening RLS:
  `app_recipient_push_tokens(user)`, `app_notification_pref_enabled(user, category)`,
  `app_recipient_locale(user)`. Additive, idempotent. Verify: `supabase/verify_0109.sql`.
- **Web token route** — `POST /api/push-tokens` (upsert, idempotent on the token) + `DELETE` (logout /
  token change). Own-row; degrades clean (42P01 → friendly 503).
- **Web send layer** — `src/app/api/utils/push.js` using **`expo-server-sdk`**: `sendPush(recipient,
  {title, body, data})` resolves the recipient's tokens via the DEFINER reader and sends. Wired as a
  **post-`app_notify` hook** inside `safeNotify` — after a bell row is created (`app_notify` returned a
  non-null id) it consults the shared channel catalog (`notificationCategories.js`) + the recipient's
  `notification_prefs` and pushes per the BN2 rule: **IN_APP_ONLY → never · PUSH → unless the category is
  disabled (absent = ON) · OPTIONAL_PUSH → only if explicitly enabled (absent = OFF)**. Push copy is
  **bilingual (EN + ES)**, rendered in the recipient's stored locale (0107). **Never throws / never
  blocks the action**: no tokens, unmigrated table/fn, or an Expo/APNs error → log-and-no-op.
- **Mobile registration** — `src/utils/registerPushToken.js`: reuses the permission already asked at
  startup (**no cold prompt**), reads the Expo token (`getExpoPushTokenAsync` scoped to the EAS
  `projectId`), and POSTs it. No-ops on simulators (`expo-device` `isDevice`) and when permission was
  declined; memoized per session. Registered **after auth** in `src/app/_layout.jsx`.

**Catalog scope (PR1).** The channel catalog is stubbed with the **types that exist today** — only the
`walk_request_targeted` / `walk_request_broadcast` pair reaches a business recipient (both **PUSH**).
Every un-cataloged type (all current pet-owner notifications) defaults to **IN_APP_ONLY**, so PR1 does
**not** suddenly start pushing anything that was silent before. PR2 adds the full business catalog
(`biz_booking` / `biz_order` / `biz_message` / `biz_adoption_application` PUSH; `biz_review` /
`biz_payout` OPTIONAL_PUSH; `biz_post_engagement` / `biz_follow` IN_APP_ONLY) **and** the emission at each
route.

**Tests / gates.** vitest 1989→**2010** (+21: `push.test.js` 13, `push-tokens/route.test.js` 8),
integration 1000→**1006** (+6: `push-tokens-rls.integration.test.ts` — own-row RLS, the spoof-write
denial, the idempotent upsert, and all three DEFINER readers crossing the owner boundary), mobile jest
1874→**1879** (+5: `registerPushToken.test.js`).

**Decisions / deviations.**
- Reused `notification_prefs` (0108) for the push pref — **no new prefs table** (recommended default).
- Web installs with **bun** (`bun.lock`, `--frozen-lockfile` in CI), not npm — `expo-server-sdk` added
  via `bun install`; a stray `package-lock.json` from an initial npm attempt was removed.
- Push **content localization** honored now (EN + ES per recipient locale) rather than deferred, since
  push text is a user-facing surface (Rule: EN+ES on every surface).
- `EXPO_ACCESS_TOKEN` is **optional** for the Expo push service; unset (the current state) is not an
  error — the client still constructs and sends, and delivery depends on the per-platform credentials at
  Expo/Apple (below).

### 🔴 NEEDS ON-DEVICE CONFIRMATION + iOS/APNs setup (what Tats must do to light up iOS push)

The send layer is built and unit/integration-proven with the Expo client mocked, but **real iOS delivery
stays dark until APNs credentials are configured** in EAS/Apple against the PawPi Apple Developer account
(the same account dependency as widget PR #187). Exact steps:

1. **Apple Developer** — ensure the app's **Push Notifications** capability is enabled for the bundle id
   `com.pawpi.app` (Certificates, Identifiers & Profiles → Identifiers → the App ID → check *Push
   Notifications*). Do **not** change the bundle id.
2. **EAS credentials** — from `anything/apps/mobile`, run **`eas credentials`** (or `eas build` and let it
   prompt): select **iOS → Push Notifications: Manage your Apple Push Notifications Key**, and let EAS
   **create/upload an APNs Key (.p8)** for the Apple account. EAS stores it and links it to the Expo
   project (`projectId e1ab38b2-5f41-4d15-bc18-64c8b0717a3d`). One APNs key covers dev + prod.
3. **(Optional) Expo access token** — if you want server-side send auth/receipt checks, create an
   **`EXPO_ACCESS_TOKEN`** in the Expo dashboard (Account → Access Tokens) and set it on **Railway** (web
   service env). Not required for basic delivery; the send layer already no-ops gracefully without it.
4. **Build + install a real build** — `eas build -p ios` (dev or TestFlight). Simulators never receive a
   token, so this must be a **physical device** (or TestFlight). On first authed launch the app registers
   its token to `POST /api/push-tokens`.
5. ~~**Apply migration 0109**~~ ✅ DONE — **0109 + 0110 APPLIED + VERIFIED on Supabase 2026-08-15**
   (`verify_0109.sql` / `verify_0110.sql` all PASS). `POST /api/push-tokens` + the `biz_*` bell rows are
   live server-side; only the phone DELIVERY awaits APNs (steps 1–4 above).
6. **Confirm on device** — sign in on the physical build, verify a `device_push_tokens` row appears for
   the account, then trigger a **PUSH-class** notification (PR2 will make business bookings/chat do this;
   for PR1, a walk request to a walker's staff) and confirm the phone banner arrives.

---

## ✅ BX4 — Business-specific notification settings (mode-aware + functional) — 2026-08-15

**2 PRs MERGED CI-green** (merge commit + branch deleted). Gives the business its own
notification categories AND makes the toggles truly gate delivery — no fake toggle.

| Ticket | PR | Migration | Gist |
|---|---|---|---|
| BX4 PR1 — server prefs + gating | [#404](https://github.com/augustotraversa98-dot/PawPi/pull/404) | **0108** ✅ APPLIED + VERIFIED 2026-08-15 | `notification_prefs` own-row + `app_notify()` gate |
| BX4 PR2 — mode-aware business Settings UI | [#405](https://github.com/augustotraversa98-dot/PawPi/pull/405) | — | `AppSettings` `mode="business"` + server-backed toggle |

### The audit (which provider/business notifications actually fire today)
Grepped **every** `app_notify` / `safeNotify` call site + the booking / chat / review / payment
routes. Recipient direction of each notification type:

| Type | Recipient | Business? |
|---|---|---|
| `walk_request_targeted` · `walk_request_broadcast` | walker's **active staff** | ✅ **business** |
| `booking_requested` / `booking_confirmed` (on book) | the OWNER (self-notify) | ❌ |
| booking lifecycle `confirmed`/`declined`/`cancelled` | the OWNER | ❌ |
| `walk_request_accepted` | the OWNER | ❌ |
| `adoption_under_review`/`approved`/`declined` | the applicant (owner) | ❌ |
| `paw` / `bark` / `follow` / engagement (`welcome`…`winback`) | owners | ❌ |

**Real vs omitted (honest, per "never show a toggle for a notification that doesn't fire"):**
- ✅ **Walk/job requests** — `walk_request_targeted` + `walk_request_broadcast` land on a walker
  business. This is the **sole** business-recipient notification path in the app today → the **one**
  category that ships.
- ❌ **Booking request to a provider** — a regular provider booking (`providers/[id]/book`) notifies
  **only the owner**; the provider is **not** notified. Omitted.
- ❌ **Booking updates to a business** — all booking-lifecycle notifications are addressed to the
  **owner**. Omitted.
- ❌ **New client message (chat)** — chat routes (`dm-threads`, `threads/[id]/messages`, …) fire
  **no** notification at all today. Omitted.
- ❌ **Reviews · payments/payouts** — no notify fires. Omitted.

### PR1 — server-side prefs + gating (the functional part)
- **migration 0108**: `notification_prefs (user_id → user_profiles.id, category, enabled,
  updated_at; UNIQUE(user_id, category))`, ENABLE+FORCE RLS, single own-row `FOR ALL` policy.
  `app_notify()` now maps a business type → its gating category and **no-ops** (returns null,
  inserts nothing) when the recipient's pref is `false`. **Fail-open** (absent row = enabled);
  keeps the never-throw / never-self-notify contract; the DEFINER pref-lookup bypasses RLS exactly
  like its existing cross-user insert. `verify_0108.sql` (8 checks).
- **GET/PUT `/api/notification-prefs`** (owner-scoped): GET returns the effective on/off for every
  business category (fail-open); PUT upserts one `{category, enabled}`.
- **`utils/notificationCategories.js`**: the audited-real business-category catalog + type→category
  map mirroring the SQL CASE.
- Tests: integration proves own-row RLS + gating (disabled→no row, enabled/absent→delivered,
  owner-only `paw` ungated); route unit test covers auth/validation/upsert.

### PR2 — mode-aware business Settings UI
- Shared `AppSettings` (BX3) gains a `mode` prop. `app/business/settings.jsx` renders
  `mode="business"`; the pet route keeps `mode="petOwner"` (default) — its rendered output is
  **unchanged** (new paths gated behind `isBusiness`).
- **Business mode** shows the **one** audited-real category — **"Walk & job requests"** — reading/
  writing the PR1 server prefs, and **HIDES** the pet-owner categories (social/milestone/streak/care)
  + the Walk-tracking / Apple Health block. Keeps Language, Help Center, Contact Us, Delete account.
- **`utils/businessNotificationPrefs.js`**: server-backed client helper (GET/PUT, fail-open, never
  throws) + the category catalog (labels/hints = `bizNotif.*` i18n keys, **EN+ES**).
- Tests: business mode renders the business category + hides the pet blocks; pet mode unchanged;
  toggling PUTs the server pref; helper GET/PUT + fail-open covered.

### Decisions / deviations
- **Split logged (recommended default taken):** only **business** categories go server-side this
  ticket; the pet-owner **E5** client-side (AsyncStorage) prefs mechanism is left **as-is**. The two
  coexist for a dual owner+staff account (pet app = pet categories, business app = business).
- Small table (not JSONB) so the sender's lookup is a trivial equality join.
- Category catalog is **extensible**: a future business event = one arm in the `app_notify` CASE +
  the JS catalog + a pref row. Shipped **only** what fires today.

### Gates
- PR1: web **vitest 1982→1989**, **integration 995→1000**. PR2: mobile **jest 1863→1874**.

### Deploy / follow-ups
- ✅ **Migration 0108 APPLIED + VERIFIED on Supabase 2026-08-15** (`verify_0108.sql` all rows PASS).
  The gate is now live: business categories set to off truly stop delivery; fail-open otherwise.
- ⚠️ **NEEDS ON-DEVICE CONFIRMATION** — business Settings visual (business Profile → Settings shows
  the single "Walk & job requests" toggle; pet-owner categories + Walk-tracking hidden).

---

## ✅ BX3 — Business Settings dropped into the pet-owner app + back → feed — 2026-08-14

Single surgical bugfix, **1 PR MERGED CI-green** (squash + branch deleted), Railway healthy
(mobile-only; no web/API/migration change).

| Ticket | PR | Migration | Gist |
|---|---|---|---|
| BX3 business Settings routes into pet-owner tabs | [#403](https://github.com/augustotraversa98-dot/PawPi/pull/403) | — | shared route-agnostic `AppSettings` + in-business `settings` route so back → business Profile |

- **Bug (confirmed):** business `Profile → Settings` called `router.push("/(tabs)/more/settings")`,
  which navigates into the **pet-owner** tab group. Two symptoms: (1) the user lands in pet-owner
  context; (2) the settings back arrow (`router.back()` in the settings header) then reveals the
  pet-owner group's **default tab (the feed)** instead of returning to the business Profile.
- **Root cause:** the business host reused the pet-owner *route* for settings, so pressing it
  entered the `(tabs)` group; the back gesture then unwinds to that group's initial tab.
- **Fix (recommended default taken):** extract the settings screen body into a shared,
  route-agnostic component `components/Settings/AppSettings.jsx` (header back = `router.back()`).
  The pet-owner route `app/(tabs)/more/settings.jsx` now just renders it (More → Settings
  **unchanged**; back → More). A **new** business route `app/business/settings.jsx` renders the
  same component and is registered in `business/_layout` with `options={{ href: null }}` (reachable
  route, **not** a visible tab) → its back arrow returns to the business **Profile**.
  `business/profile.jsx` now pushes `/business/settings`. "Switch to Pet app"
  (`router.replace("/(tabs)")`) left exactly as-is.
- **Tests:** `business/profile.test.jsx` (Settings press → `/business/settings`, **not**
  `/(tabs)/more/settings`); `components/Settings/AppSettings.test.jsx` (shared component renders +
  header back = `router.back()`); `business/settings.test.jsx` (business route delegates to
  `AppSettings`); pet-owner `settings.test.jsx` unchanged + green. EN+ES intact.
- **Gates:** mobile jest **1866** (from 1863, +3); web vitest / integration untouched (mobile-only).
- **NEEDS ON-DEVICE CONFIRMATION:** the final nav feel (present + back returning to the business
  Profile, no feed flash) is best confirmed on the simulator/device — CC can't drive the sim tap.

---

## ✅ WAVE 2 FIX-PACK — COMPLETE 2026-08-14

Autonomous run, all **5 PRs MERGED CI-green** (merge commit + branch deleted each), Railway healthy
throughout (every change additive + degrades cleanly). Built in order BX2 → BX1 → FF1 → FF2 → FF3.

| Ticket | PR | Migration | Gist |
|---|---|---|---|
| BX2 walker QR close (X) not tappable | [#398](https://github.com/augustotraversa98-dot/PawPi/pull/398) | — | header pinned above native camera (zIndex/elevation/opaque + hitSlop + box-none) |
| BX1 business mobile profile / log out | [#399](https://github.com/augustotraversa98-dot/PawPi/pull/399) | — | Account section on business Profile: identity + Settings + switch-to-pet + Log out |
| FF1 per-user email locale | [#400](https://github.com/augustotraversa98-dot/PawPi/pull/400) | **0107** | `user_profiles.preferred_locale` + both digest/win-back senders render in it (es-AR fallback) |
| FF2 caregiver walk/health logging | [#401](https://github.com/augustotraversa98-dot/PawPi/pull/401) | — | owner-OR-family write gate (`resolvePetLogOwner`) on walk/food/general-check + mobile "Log a walk" |
| FF3 day-card into the main feed | [#402](https://github.com/augustotraversa98-dot/PawPi/pull/402) | — | `groupFeedDayCards` collapses same-pet same-day moments into the multi-caregiver DayCard |

**Final gates:** mobile jest **1863** (from 1847), web vitest **1982** (from 1970), web integration
**995** (from 989). **All decisions = the driver's recommended defaults** (per-ticket deviations logged
below, each with reasoning: FF2 anchors caregiver writes to the pet's owner per the as-built care-ring
model; FF3 builds the DayCard payload from feed data rather than N per-group endpoint calls).

**Migration status:** **0107 ✅ APPLIED + VERIFIED on Supabase 2026-08-14** (hand-applied; `verify_0107.sql`
all PASS) — nothing owed on the DB side. **NEEDS ON-DEVICE CONFIRMATION:**
**BX2** — the walker QR close (X) tap fix is layering + hitSlop; the `onPress` wiring is unit-proven but
the actual tap must be confirmed on the simulator/device (CC can't tap the simulator). No other ticket
needs device confirmation, though a device smoke of BX1 logout + FF2 "Log a walk" + FF3 feed is nice-to-have.

---

## 🔧 WAVE 2 FIX-PACK (BX2·BX1·FF1·FF2·FF3) — autonomous run 2026-08-14

Design of record: `docs/wave2-finish-fixpack.md`. Closes the three deferred Wave 2 niceties
(FF1–FF3) + two on-device bugs (BX1 business logout, BX2 walker QR close). Each ticket its own
PR, CI-green → merge → deploy → log, recommended defaults taken. **Baselines at start:** mobile
jest **1847**, web vitest **1970**, web integration **989**. Next migration number: **0107**.

- **2026-08-14 — BX2 walker QR "Scan pickup" close (X) not tappable** — [#398](https://github.com/augustotraversa98-dot/PawPi/pull/398)
  MERGED (merge commit `55ba63bb`, branch deleted), **CI-green** (mobile jest / web vitest / integration all pass).
  - **What shipped (mobile-only, no migration):** `PickupScannerModal.jsx` (B3 walker QR pickup)
    header is now pinned **above** the native `CameraView` layer — opaque `backgroundColor:"#000"`
    + `zIndex:20` (iOS) + `elevation:20` (Android); the header row is `pointerEvents="box-none"`
    so only the close button captures taps; the close button gains `hitSlop:16` +
    `accessibilityRole="button"`. New test asserts `onClose` fires on press of `pickup-scanner-close`.
  - **Root cause:** touch-layering — the header carried no zIndex/elevation/opaque background, so
    the native camera preview could composite over the close control on device; button had no hitSlop.
  - **Decision (default taken):** BX2 default — "real button above the camera layer; overlay wrapper
    `pointerEvents="box-none"` so only the button captures touches." Applied exactly. No new i18n
    strings (reuses existing `common.close`, so EN+ES already covered).
  - **⚠️ NEEDS ON-DEVICE CONFIRMATION:** CC cannot tap the simulator. The `onPress` wiring is proven
    by the new test; the layering/tap fix itself must be confirmed by a human tap on the simulator/device.
  - **Gates:** mobile jest 1847→**1848** (+1); web vitest **1970** / integration **989** unchanged.
  - **Deploy:** mobile-only, no DB/Railway change — nothing to apply; Railway unaffected.

- **2026-08-14 — BX1 business account: no profile / log out on mobile** — [#399](https://github.com/augustotraversa98-dot/PawPi/pull/399)
  MERGED (merge commit, branch deleted), **CI-green** (mobile jest / web vitest / integration all pass).
  - **What shipped (mobile-only, no migration):** an always-visible **Account** section on the
    business Profile tab (`app/business/profile.jsx`): signed-in identity (name + email) + active
    business name; **Settings** → the shared `/(tabs)/more/settings` screen; **Switch to Pet app**
    (only when the account ALSO owns pets — dual account); **Log out** (Alert confirm → mirrors the
    pet-owner `OwnerMenu` logout exactly: `AsyncStorage.clear` + `setAuth(null)` +
    `router.replace("/welcome")`). Section renders OUTSIDE the storefront load/error branches so
    logout is always reachable. Pet-owner "More" untouched — logout works from BOTH surfaces. EN+ES.
  - **Decisions (defaults taken):** BX1 default — "mirror the pet-owner More/settings/logout exactly;
    business profile entry in the business nav; dual staff+owner accounts keep both surfaces." Applied.
    Added a confirm dialog before logout (safer UX; logout is reversible so not a prohibited action).
    Reused the existing app Settings screen rather than a business-specific one (simplest, consistent).
  - **Gates:** mobile jest 1848→**1852** (+4: identity render, Settings deep-link, logout
    confirm→clear→welcome, dual-account switch gating); web vitest **1970** / integration **989** unchanged.
  - **Deploy:** mobile-only, no DB/Railway change — nothing to apply; Railway unaffected.

- **2026-08-14 — FF1 per-user language for digest / win-back emails** — [#400](https://github.com/augustotraversa98-dot/PawPi/pull/400)
  MERGED (merge commit `e7ffc03b`, branch deleted), **CI-green** (mobile jest / web vitest / integration all pass).
  - **Problem:** E11/E12 emails are server-rendered but PawPi had no per-user locale → every email
    defaulted to es-AR (an English user would get a Spanish email; breaks the EN+ES guardrail).
  - **What shipped:** **Migration 0107** (additive) — `user_profiles.preferred_locale` (CHECK
    null|'en'|'es'; NULL → es-AR fallback so current behaviour is preserved) + extends both DEFINER
    enumerators (`app_weekly_digest_due`, `app_reengagement_due`) to return `preferred_locale`. Both
    senders render the email in the recipient's stored locale (es-AR when null/absent). New
    `PUT /api/user-profile/locale` owner-scoped writer (persists only en/es, else NULL; degrades clean
    pre-0107 via undefined_column → 200 no-op). Mobile `syncLocaleToServer()` mirrors the resolved app
    language on login (tabs-shell mount) + every Settings language change (existing control reused).
    + `verify_0107.sql`.
  - **Decisions (defaults taken):** FF1 default — column `preferred_locale text null`, values en/es,
    es-AR fallback, populate from device locale on next login. Applied exactly. Chose to thread locale
    through the existing DEFINER enumerators (already join user_profiles) rather than a per-owner
    re-read in the run tx — one place, DEFINER-privileged, backward-compatible. Reused the existing
    Settings language control (no new control needed).
  - **Gates:** web vitest 1970→**1976** (+6 locale route), integration 989→**990** (+1 digest renders
    EN for an English user / es-AR for a null-locale user); mobile jest **1852** unchanged (source-only
    wiring, existing tests pass).
  - **Deploy:** **Migration 0107 ✅ APPLIED + VERIFIED on Supabase 2026-08-14** (hand-applied;
    `verify_0107.sql` all PASS). Railway deploy of `e7ffc03b` SUCCESS. (Pre-apply the routes degraded
    cleanly — undefined_column / old-function-without-column → es-AR fallback — so production was healthy
    the whole time; now the per-user locale is live.)

- **2026-08-14 — FF2 caregiver in-app logging (walks / health beyond the daily moment)** — [#401](https://github.com/augustotraversa98-dot/PawPi/pull/401)
  MERGED (merge commit, branch deleted), **CI-green** (mobile jest / web vitest / integration all pass).
  - **Problem:** 0049 RLS already lets an accepted FAMILY caregiver write health/walk logs, but the app
    never wired the route gates or surfaced any log buttons beyond the daily moment.
  - **What shipped (NO migration — 0049 RLS unchanged):** new `resolvePetLogOwner(callerId, petId)`
    owner-OR-family write gate; applied to `health/walk-logs`, `food-logs`, `general-checks` POST.
    Mobile `CaregiverLogWalkModal` (petId-scoped "Log a walk") surfaced on the "Shared with me" tab for
    ACTIVE FAMILY grants only (Viewer/pending → no button). EN+ES.
  - **Attribution decision (DEVIATION from the brief's parenthetical, logged):** the brief said
    "owner_user_id = the logger", but the **as-built** model (E13 care-ring `resolveOwnerGate`) anchors a
    caregiver's write to the **pet's OWNER** — health tables use `owner_user_id` as the shared read key,
    and under 0049 RLS a logger-attributed row is **invisible to the owner** (no policy grants it).
    Anchoring to the owner is the only model where the household sees shared logs AND RLS isn't widened.
    Followed the as-built model; logged the deviation with reasoning.
  - **Scope decision (default: "match 0049, family=full, Viewer=read-only"):** health writes gated to
    FAMILY per 0049 (`app_user_has_pet_family`); a Viewer gets a clean 403. Broadened the walk + food +
    general-check routes (the ring's care/health/walk trio); remaining health-log routes share the
    identical helper and are a trivial follow-up (kept out to bound the PR — LOGGED).
  - **Gates:** web vitest 1976→**1982** (+6 helper), integration 990→**995** (+5: owner/family log,
    Viewer+stranger 403, family write anchored to owner), mobile jest 1852→**1854** (+2: button gating,
    modal posts petId).
  - **Deploy:** mobile + web code, NO migration — nothing to hand-apply; Railway auto-deploy healthy
    (all changes additive; degrade cleanly pre-0049).

- **2026-08-14 — FF3 day-card into the main feed** — [#402](https://github.com/augustotraversa98-dot/PawPi/pull/402)
  MERGED (merge commit, branch deleted), **CI-green** (web vitest needed one re-run for a transient
  `bun install` pdfjs-dist tarball flake — code was never red; mobile jest / integration passed first try).
  - **What shipped (mobile-only, NO migration):** new pure util `groupFeedDayCards(posts)` collapses a
    pet's same-day daily moments (`is_daily_update`) into one `{ kind:"daycard" }` item matching the
    endpoint's contract, so the existing `DayCard` component renders it unchanged — with NO extra
    per-group network call (feed already carries every field). `UnlockedFeed` groups BEFORE interleaving
    suggestions, adds a daycard branch, and counts day cards for the Suggested divider. `DayCard` gains an
    optional `onOpenDetail` (tap opens the shown slide's real post). Non-moment posts / suggestions /
    business posts untouched. EN+ES (reuses `dayCard.*`).
  - **Decision (default: "reuse the existing endpoint/component"):** reused the COMPONENT + the endpoint's
    OUTPUT SHAPE, but build the payload from the feed posts client-side rather than calling
    `/api/pets/[id]/day-card` per pet-day group — calling it per group would be a feed perf regression
    (N requests). Logged as a justified deviation from a literal "call the endpoint" reading.
  - **Gates:** mobile jest 1854→**1863** (+9: grouping util +6, feed integration +3); web vitest **1982**
    / integration **995** unchanged (no web changes).
  - **Deploy:** mobile-only, no DB/Railway change — nothing to apply; Railway unaffected.

---

## ✅ WAVE 2 — Pet Owner engagement: Household & Retention (E11–E15) — COMPLETE 2026-08-14

Autonomous run, all 7 PRs **MERGED CI-green** (merge commit + branch deleted each), Railway deploys
healthy. Every migration is **additive + degrades cleanly** (42P01/42883/42703/RLS-denial → feature
absent, never a 500), so production stayed healthy at all times. **✅ Migrations 0100–0106 APPLIED +
VERIFIED on Supabase 2026-08-14** (Tats hand-applied; all `verify_010x.sql` PASS).

| Unit | PR(s) | Migration(s) | Gist |
|---|---|---|---|
| E11 Weekly digest "Rex's Week" | [#391](https://github.com/augustotraversa98-dot/PawPi/pull/391) | 0100 | real weekly stats + CRON Sunday-evening sender (push+email) + prefs + share |
| E12 Comeback loop | [#392](https://github.com/augustotraversa98-dot/PawPi/pull/392) | 0101 | server-side "lapsed" (7d) → warm win-back on a REAL hook + welcome-back + repair |
| E13 Shared custody (3 PRs) | [#393](https://github.com/augustotraversa98-dot/PawPi/pull/393) · [#394](https://github.com/augustotraversa98-dot/PawPi/pull/394) · [#395](https://github.com/augustotraversa98-dot/PawPi/pull/395) | 0102·0103·0104 | shared ring/streak + multi-caregiver day-card + household leaderboard (**reused 0049 pet_caregivers**) |
| E14 Multi-pet household | [#396](https://github.com/augustotraversa98-dot/PawPi/pull/396) | 0105 | household home + pet switcher (existing store) + opt-in family streak |
| E15 Life-stage ring goals | [#397](https://github.com/augustotraversa98-dot/PawPi/pull/397) | 0106 | puppy/adult/senior copy adapt (3 segments unchanged) + owner override |

**Final gates:** web vitest **1970** (from 1924), web integration **989** (from 932), mobile jest **1847**
(from 1809). **All decisions taken = the driver's recommended defaults** (logged per unit below). **Key
reconciliation:** E13 did NOT create a new `pet_caregivers` table — ticket 2.47 / migration 0049 already
ships the caregiver model + owner-OR-caregiver RLS; E13 extended it to the engagement layer (role map:
owner=Owner/Admin, 0049 family=Caregiver, 0049 caregiver=Viewer). **Deferred (logged):** caregiver
health-log route gates beyond the daily moment (0049 RLS already permits; route-gate follow-up); day-card
main-FEED grouping wire-in (component + endpoint ready); server-side per-user locale for digest/win-back
email (defaults to es-AR fallback; both langs present). **✅ Migrations 0100–0106 APPLIED + VERIFIED on
Supabase 2026-08-14 (all `verify_010x.sql` PASS)** — nothing owed.

Per-unit detail below.

---

Fast, timestamped, one-line-per-merge scan for Augusto. Full detail lives in each PR and in
`docs/roadmap.md` / `PawPi_instructions.md`'s status block (updated in step). Ticket briefs:
`docs/phase2-tickets/N1-N10`; run preamble: `docs/night-run-2026-07-29.md`.

---

## Wave 2 — Pet Owner engagement: Household & Retention (E11–E15) — autonomous run 2026-08-14

Design of record: `docs/pet-owner-engagement.md` "WAVE 2" section. Each unit its own PR, CI-green + merge
+ deploy + log before the next. Recommended defaults taken per the driver prompt (logged per unit).

- **2026-08-14 — E11 "Rex's Week" weekly digest** — [#391](https://github.com/augustotraversa98-dot/PawPi/pull/391)
  MERGED (merge commit, branch deleted), CI-green (mobile jest / web vitest / integration all pass).
  - **What shipped:** `GET /api/pets/[id]/weekly-digest` (real owner-tz Mon–Sun stats: walks, ring days
    x/7, care actions, moments, best moment = most-pawed daily post, friends strip = accepted-friend pets
    that posted this week, milestone ≤7d; server owns honest `state` rich|quiet|empty). `GET/PUT
    /api/engagement/weekly-digest-prefs` (server-side push/email toggles). `POST
    /api/engagement/weekly-digest/run` (`CRON_SECRET`-gated Sunday-evening sender; DEFINER
    `app_weekly_digest_due` enumeration; claim-then-send idempotency; push + optional email). Mobile "Rex's
    Week" screen + `useWeeklyDigest` hooks + `weekly_digest` notification mapper/deep-link. EN+ES throughout.
  - **Migration 0100** (weekly_digest_prefs + weekly_digest_state own-row RLS, notifications_type_check +=
    'weekly_digest', app_weekly_digest_due DEFINER) + `verify_0100.sql`. **⚠️ awaits hand-apply to
    Supabase** (this env can't apply DDL); routes degrade cleanly while absent (42P01/42883 → feature
    absent, never 500) so Railway stays healthy.
  - **Decisions (recommended defaults taken):** weekly cadence Sunday evening owner-tz; push default ON /
    email default OFF; reused idempotency-state row (weekly_digest_state) per (pet, week); quiet/empty week
    degrades honestly (no fake numbers). **Deviation from spec:** E5's toggles are client-only (AsyncStorage),
    but a server-side sender can't read them, so the weekly-digest channel prefs are a NEW server-side table
    (weekly_digest_prefs) rather than "reuse E5 toggles" — logged; E5's send-time/caps concept is honoured by
    the tz-aware Sunday-evening gate. Server has no per-user locale column, so the EMAIL defaults to the app's
    es-AR fallback (both EN+ES live in the copy module); the PUSH body is JSON localized client-side.
  - **Gates:** web vitest 1924→**1942** (+18), integration 932→**948** (+16), mobile jest ~1809→**1816**.

- **2026-08-14 — E12 comeback / re-engagement loop** — [#392](https://github.com/augustotraversa98-dot/PawPi/pull/392)
  MERGED (merge commit, branch deleted), CI-green.
  - **What shipped:** `GET/POST /api/pets/[id]/reengagement` (lapse status = no ring activity for N owner-tz
    days, default 7, `?n` override; welcome-back payload = friends' REAL recent moments + next milestone +
    pack/streak status + repair availability; POST opt_out / repair / seen). `POST
    /api/engagement/reengagement/run` (`CRON_SECRET` win-back sender; DEFINER `app_reengagement_due`
    enumerates lapsed+due pets with real hook signals; claim-then-send cap guard = at most one per cap
    window; warm push `winback` + email preferred). Mobile "Welcome back" screen + `useReengagement` hooks +
    `winback` notif mapper/deep-link. EN+ES; no-shame grep test.
  - **Migration 0101** (reengagement_state own-row RLS; notifications_type_check += 'winback';
    `app_reengagement_due(timestamptz,int,int,int)` DEFINER; `app_winback_repair_streak(int,int,int)` DEFINER
    = E2 repair with a configurable grace window) + `verify_0101.sql`. **⚠️ awaits hand-apply**; routes
    degrade clean (42P01/42883) so Railway stays healthy.
  - **Decisions (recommended defaults taken):** lapsed threshold 7 days; win-back prefers email + at most one
    gentle in-app push; real hooks only (milestone > friend > memory fallback, never fabricated); returning-user
    repair grace window 14 days (kept free, v1). Cross-owner friend-activity + milestone signals computed in
    the DEFINER enumerator (owner RLS hides other pets). Reused E11's `upcomingMilestone` (same [id] dir) in the
    GET route; inlined the milestone math in the cron to avoid a cross-`[id]`-dir import.
  - **Gates:** web vitest 1942→**1954** (+12), integration 948→**958** (+10), mobile jest green (+E12 suites).

- **2026-08-14 — E13 shared custody / caregivers (3 PRs)** — the riskiest unit; RLS generalization.
  MERGED CI-green: PR1 shared ring [#393](https://github.com/augustotraversa98-dot/PawPi/pull/393) ·
  PR2 day-card [#394](https://github.com/augustotraversa98-dot/PawPi/pull/394) ·
  PR3 household leaderboard [#395](https://github.com/augustotraversa98-dot/PawPi/pull/395).
  - **KEY DECISION (logged, spec reconciliation):** the caregiver MODEL already existed — **ticket 2.47 /
    migration 0049 (`family_caregiver_sharing`)** ships `pet_caregivers` (person↔person grants, roles
    family|caregiver, status pending/active/revoked), the invite/accept/revoke API (`/api/pet-caregivers`),
    the mobile UI (`pet-sharing.jsx`), and the owner-OR-caregiver RLS generalization across
    pets/routines/pet_medical_profiles/all health logs (via DEFINER gates app_owns_pet /
    app_user_has_pet_access / app_user_has_pet_family). So E13 did NOT create a new pet_caregivers table
    (would have collided). Instead it **extended 0049 to the E0–E2 engagement layer**. Role mapping:
    pet owner = Owner/Admin; 0049 'family' = E13 "Caregiver" (full day-to-day); 0049 'caregiver' = E13 "Viewer".
  - **PR1 (0102):** pet_care_days + pet_streaks gain an active-caregiver FOR ALL policy (alongside the owner
    own-row); `app_pet_ring_segments(pet,tz,day)` DEFINER derives the ring by pet_id across ALL contributors.
    care-ring route gate widened to owner-OR-caregiver (`requirePetAccess`); persist tolerates a pre-0102 RLS
    denial. Solo owner byte-for-byte unchanged (existing care-ring suite green).
  - **PR2 (0103):** daily-moment uniqueness swapped one-per-pet-per-day → one-per-AUTHOR-per-pet-per-day.
    posts route: daily-moment gate widened to owner OR 'family' caregiver (Viewer still can't post); cap now
    per-author. `GET /api/pets/[id]/day-card` groups the day's moments into attributed carousel slides +
    day-card paw/bark totals + latest_contribution_at (bump). Mobile `DayCard` component + `useDayCard`.
  - **PR3 (0104):** `household_leaderboard_prefs` (owner-manage + caregiver-read) + `app_household_leaderboard`
    DEFINER (per-member weekly counts — moments by author, walks/care by logger owner_user_id — for owner +
    active caregivers). Pure `rankHousehold` = positive-only, NEVER a least-active flag (grep). Owner-only
    opt-out. Mobile `HouseholdLeaderboardCard` (renders nothing solo/opted-out). **No new logged_by column
    needed** — attribution rides existing posts.user_id + health-log owner_user_id (the logger).
  - **Migrations 0102 + 0103 + 0104 await hand-apply.** All degrade clean (missing fn/policy/table or a
    caregiver RLS denial → derived-only / empty board / owner-only, never a 500).
  - **Deferred (logged):** caregiver LOG routing into the ring via the health-log routes beyond the daily
    moment (the health-spine route gates stay owner-only for now; 0049's family RLS already permits the
    writes, so it's a route-gate follow-up, not a data-model gap). Day-card main-FEED grouping wire-in is a
    mobile follow-up (the DayCard component + endpoint are ready). Viewer optional walk/care logging deferred.
  - **Gates:** web vitest 1954→**1958** (+4), integration 958→**976** (+18 across the 3 PRs), mobile jest green.

- **2026-08-14 — E14 multi-pet household + family streak** — [#396](https://github.com/augustotraversa98-dot/PawPi/pull/396)
  MERGED (merge commit, branch deleted), CI-green.
  - **What shipped:** `GET/POST /api/household` (lists owned + co-cared dogs each with today's ring status
    + streak; the family streak; opt-in toggle). care-ring route advances the family streak on close (own
    savepoint). Mobile Household home screen — dog list + tap-to-switch (reuses the EXISTING persisted
    `selectedPetStore`; the switcher plumbing already existed, so every `useCurrentPet` consumer follows the
    tap) + opt-in family-streak card (2+ dogs). EN+ES.
  - **Migration 0105** (household_streaks own-row RLS; `app_advance_household_streak(owner,day)` DEFINER)
    + `verify_0105.sql`. **⚠️ awaits hand-apply**; degrades clean (42P01/42883) so Railway stays healthy.
  - **Decision (recommended default + the tracked open decision):** family-streak metric = **"every active
    dog's ring closed"** (not the softer "all dogs cared for"); forgiveness-aware (banked freezes bridge a
    miss, like E2); OPT-IN; keyed per-owner over OWNED pets (co-cared pets belong to their own owner's
    family streak). The pet SWITCHER was already built (`selectedPetStore` + `useCurrentPet`), so E14 layered
    the household UI + family streak on top rather than re-plumbing pet selection. Single-dog account unchanged.
  - **Gates:** web vitest **1958** (no new web unit — integration-tested), integration 976→**983** (+7),
    mobile jest green (+E14 suites).

- **2026-08-14 — E15 life-stage ring goals** — [#397](https://github.com/augustotraversa98-dot/PawPi/pull/397)
  MERGED (merge commit, branch deleted), CI-green. **Completes Wave 2.**
  - **What shipped:** `GET/POST /api/pets/[id]/life-stage` (owner or caregiver reads detected + override +
    effective stage + ring goals; OWNER-only sets/clears the override). Pure `detectLifeStage` (age from
    birthday/age; SIZE-scaled senior threshold via weight — larger dogs age faster; conservative 'adult'
    when age unknown, with an explicit null-vs-0 guard) + `effectiveLifeStage` + `ringGoalsForStage`
    (always the same 3 segments). Mobile `LifeStageCard` (per-stage positive tip + owner override picker,
    read-only for caregivers) + `useLifeStage`. EN+ES.
  - **Migration 0106** (`pets.life_stage_override text` CHECK null|puppy|adult|senior; NULL = auto-detect)
    + `verify_0106.sql`. **⚠️ awaits hand-apply**; degrades clean (missing column 42703 → auto-detect).
  - **Decision (recommended default):** puppy < 1yr; senior at a size-scaled threshold (small 11 / medium
    8 / large 7 / giant 6 yr; unknown size → 9); owner override always wins; the ring keeps its THREE
    segments — life stage only tunes copy/suggested actions, never diagnostic.
  - **Gates:** web vitest 1958→**1970** (+12), integration 983→**989** (+6), mobile jest 1816→**1847**.

- **2026-07-29 00:19** — Prereq: password reset flow (migration 0069) merged — [#261](https://github.com/augustotraversa98-dot/PawPi/pull/261) (predates tonight's queue, landed first to bring `main` current).
- **2026-07-29 00:19** — Prereq: support-contact domain fix (augusto@pawpi.info) merged — [#262](https://github.com/augustotraversa98-dot/PawPi/pull/262).
- **2026-07-29 00:20** — Prereq: demo accounts renamed to pawpi.info — [#263](https://github.com/augustotraversa98-dot/PawPi/pull/263).
- **2026-07-29 03:53** — N2 (retire PATCH /api/pets repair handler) merged — [#266](https://github.com/augustotraversa98-dot/PawPi/pull/266). Docs-only: the actual code removal had already landed via an earlier PR #225; this closed the paper trail (FLAGGED item → FIXED).
- **2026-07-29 03:53** — N9 (docs hygiene sweep) merged — [#264](https://github.com/augustotraversa98-dot/PawPi/pull/264). Only 1 of 3 items needed a change (guideline-1.2-audit.md superseded banner); the other two were already resolved by #263.
- **2026-07-29 03:58** — N5 (payments go-live hardening + setup checklist) merged — [#268](https://github.com/augustotraversa98-dot/PawPi/pull/268).
- **2026-07-29 04:07** — N1 (address autofill on shared location picker) merged — [#270](https://github.com/augustotraversa98-dot/PawPi/pull/270). Needs a device pass (jest mocks expo-location) — see `docs/test-backlog.md`.
- **2026-07-29 04:08** — N7 (support page live + pawpi.info DNS gap documented) merged — [#265](https://github.com/augustotraversa98-dot/PawPi/pull/265). Support URL is live at the github.io URL; pawpi.info itself still needs Tats' one.com DNS action — see FLAGGED #5 in `docs/app-store-readiness.md`.
- **2026-07-29 04:08** — N6 (Apple Sign-in client-secret JWT automation) merged — [#271](https://github.com/augustotraversa98-dot/PawPi/pull/271).
- **2026-07-29 04:15** — N3 (adoption screen restyled to Liquid Glass) merged — [#269](https://github.com/augustotraversa98-dot/PawPi/pull/269). Structural parity confirmed (testID/useState/onPress/etc. counts unchanged).
- **2026-07-29 04:44** — N4 (medical profile sex/gender selector fix) merged — [#267](https://github.com/augustotraversa98-dot/PawPi/pull/267). Note: this PR's conflicts were resolved and pushed earlier but the actual merge call was missed until caught during N8 — see that entry below. Also found (not fixed, flagged): the Save button on this same screen is a pre-existing no-op from the 2.77 restyle (prop-name mismatch) — spawned as a separate follow-up task.
- **2026-07-29 05:11** — N8 (iOS Simulator self-verify pass) merged — [#272](https://github.com/augustotraversa98-dot/PawPi/pull/272). Confirmed the app boots + round-trips real backend data; fixed a stale dev-env LAN IP along the way. Caught and fixed the missed N4 merge above. Simulator tap-injection was unreliable for a stretch, so most of the historical `2.x` device-test backlog was left untouched rather than false-positived — documented honestly in `docs/test-backlog.md`.
- **2026-07-29 ~05:15** — N10 (widget PR #187 rebase) — **not merged, by design.** Rebased the ~40-day-stale branch cleanly onto `main` (2 conflicts resolved, zero reverted work, mobile jest 156/156 green). Confirmed `expo prebuild` generates both the app and widget Xcode targets. Left **open as an updated draft** — this PR is explicitly gated on Tats' Apple Developer account setup + on-device acceptance pass (see `docs/native-widgets.md`); tonight's job was just to un-stick it from staleness, not to merge it.

---

# Night-run log — 2026-08-11 (Wave 10, tickets 2.88–2.92)

Preamble: `docs/night-run-2026-08-11.md`. Continues the Shop/Store + business-social work. One line per merge.

- **2026-08-11 (2.88)** — provider-post open route fix merged — [#339](https://github.com/augustotraversa98-dot/PawPi/pull/339). Root cause: the storefront post card passed the whole post (signed image URLs with `?`/`&`/`%`) as a `router.push` param, corrupting the deep-link URL so expo-router fell back to the `/service` root ("screen doesn't exist"). Fix: navigate with only `providerId`+`postId`; hand the rich post off in memory (`utils/providerPostHandoff.js`). Mobile jest 1562→1565 (+3 regression tests). No migration.
- **2026-08-11 (2.89)** — grouped offering picker merged — [#340](https://github.com/augustotraversa98-dot/PawPi/pull/340). The dashboard nav was already capability-driven + grouped (#327/#328); the remaining flat list was the Business-Profile offering picker (and onboarding form). Added shared `provider/lib/capabilityGroups.js` (presentation-only taxonomy over the EXISTING keys — Veterinary & Health / Walking & Sitting / Training / Store / Adoption / Other); both pickers now render grouped sections. No capability key created/renamed/removed (`capabilities.js` untouched). web vitest 1764→1770. No migration.
- **2026-08-11 (2.90)** — Products enable clarity merged — [#341](https://github.com/augustotraversa98-dot/PawPi/pull/341). A store-less business hit the API's jargon 403 ("Provider does not have the 'shop' capability") on the Products page. Replaced with a friendly explainer + one "Enable Products" button that flips the SAME `shop` offering the profile controls (`useAddCapability`, reused) and lands on add-a-product; enabled-empty shows the inviting add-first state. Header Shop→Products. No user-facing jargon (grep-checked). web vitest 1770→1773. No migration.
- **2026-08-11 (2.91)** — adoption end-to-end fix merged — [#342](https://github.com/augustotraversa98-dot/PawPi/pull/342). Root causes: (a/b/c) the provider editor only edited MEDIA — no way to edit/see the name/breed/fee/story a shelter wrote; (d) the public browse (`/api/adoption/listings`) dropped any shelter without a map pin whenever the owner shared location (the geo bounding box required coords). Fixes: the per-listing action is now a full **Edit** modal prefilling every field + media (saves via the existing `useUpdateAdoptableListing` PATCH — backend already COALESCEd all fields); the browse now includes coordless shelters (distance unknown → sorted last) while still radius-filtering located ones. Mobile browse/detail already rendered real data (unchanged). Integration test proves a pin-less shelter surfaces. No migration, no RLS change.
- **2026-08-11 (2.92)** — follow a business merged — [#343](https://github.com/augustotraversa98-dot/PawPi/pull/343). Pet owners can FOLLOW a provider (mirrors pet_follows): **migration 0083** `provider_follows` (ENABLE+FORCE RLS — any-authed read, own-row write; passes the R2g completeness guard; PENDING hand-apply, flagged in test-backlog ACTION 1). API `GET/POST/DELETE /api/providers/[id]/follow` + `GET /api/providers/following`; mobile `ProviderFollowButton` (optimistic, guest→sign-in, follower count) on the provider screen + a "Businesses you follow" list off the More hub; EN+ES. **Degrades cleanly pre-migration** (catches undefined_table 42P01 → not following / 0 followers). All routes tested through the REAL router by URL (no `/providers/following` shadowing). web vitest 1773→1777 · integration +8 · mobile jest 1565→1570.

---

# Night-run log — 2026-08-12 (Wave 11, tickets 2.97 / 2.96 / 2.94 / 2.98 / 2.99)

Preamble: `docs/night-run-2026-08-12.md`. Adoption-on-profile + nav cleanup + business-post paws + the two activation checklists. One line per merge.

- **2026-08-12 (2.97)** — Adoption tab on the business storefront merged — [#PENDING]. A business with the `adoption` capability + ≥1 available listing now shows an **Adoption** tab on its mobile storefront (`getStorefrontTabs`, presence-aware, right after Services; i18n `storefront.tabs.adoption` EN "Adoption"/ES "Adopción"). The tab reuses the SAME browse card + detail/apply modal — extracted verbatim into a shared `components/adoption/AdoptionListingViews.jsx` now imported by BOTH `service/adoption.jsx` and `service/provider.jsx` (one implementation, no parallel design). Data via the existing `GET /api/adoption/listings?provider_id=` (`useAdoptableBrowse` gained an `enabled` gate so only shelters make the call). No migration, no web/API change. Mobile jest 1583→1592 (+9: 4 tab-resolver + 3 provider-screen + shared-module reuse proven in both suites).
- **2026-08-12 (2.96)** — remove the "Show all sections" nav escape hatch merged — [#PENDING]. The provider dashboard left nav (`ProviderShell.jsx` `Sidebar`) no longer lets you reveal unselected offerings: deleted the `showAll` state, the toggle button block, and the `showAll` param/branch in `navItemVisible`. A capability-gated section now shows ONLY when the business holds its offering (driven by the Business-Profile selections, already reactive); structural sections (Dashboard/Chats/Storefront/Profile/Staff/Sales) always show; the active section is still never hidden (deep-link safety unchanged). No migration/API/copy change. `ProviderShell.test.jsx` updated: an unselected offering is absent + there is NO "Show all sections" control; selecting the offering makes it appear; structural sections always render. web vitest 1786 green.
- **2026-08-12 (2.94)** — Paws (likes) on business posts merged — [#PENDING]. **Migration 0085** `provider_post_paws` (post_id → provider_posts, user_id → user_profiles, unique(post_id,user_id); ENABLE+FORCE RLS — any-authed read, own-row write; passes the R2g completeness guard; PENDING hand-apply, flagged in test-backlog ACTION 1). A signed-in owner paws a business post via a tap on the paw control OR a double-tap on the image (reuses the pet-feed `PawablePhoto` + brand-color pop from 2.64); optimistic toggle, guest → sign-in. New API `POST/DELETE /api/providers/[id]/posts/[postId]/paw` (static "paw" segment, no shadowing) + the single-post GET now returns `paw_count` + `is_pawed`; the public-profile `pawsCount` stat (already written in 2.93) lights up automatically once the table exists. **Degrades cleanly pre-migration** (every paw query catches undefined_table 42P01 → 0 paws / not-pawed / no-op; never a 500 — proven in a mocked unit test). New mobile `useProviderPostPaw` (query + optimistic toggle). web vitest 1786→1794 · integration +9 (paw/unpaw/count/guest/RLS/stats) · mobile jest 1592→1599. **PR body leads with the migration SQL block for Tats.**
- **2026-08-12 (2.98)** — Pet-owner activation checklist merged — [#PENDING]. A persistent **"Getting started"** card at the top of the Home tab with a % badge + progress bar; every item's done/undone is **derived** from existing data (no new table, no stored flag): add basics (name+breed), complete history (breed + age + real gender + weight), first reminder (`/api/routines` non-empty), first meal (food-logs non-empty), first post (pet-profile `stats.totalPosts`), turn on notifications (OS permission). `%` = completed ÷ 6; the card retires at 100% after a brief paw celebration (once, persisted). Each row taps through to the screen that completes it (profile-edit / reminders / health / composer / permission prompt). **Daily-return habit:** on enabling notifications, schedules a recurring **daily** local reminder exactly once (idempotent via a persisted id, guarded on permission — never double-schedules). New `utils/gettingStarted.js` (pure derivations), `hooks/useGettingStarted.js`, `components/Home/GettingStartedCard.jsx`, + `ensureDailyReturnReminder`/`getNotificationPermissionGranted` in `utils/notifications.js`. EN+ES neutral "tú". No migration, no web change. mobile jest 1599→1620 (+21: derivations, % math, card hides at 100%, permission item, daily-reminder-once).
- **2026-08-12 (2.99)** — Business activation checklist merged — [#PENDING]. The web mirror of 2.98: a persistent **"Getting started"** card at the top of the provider dashboard (`ProviderDashboard.jsx`) with a % badge + progress bar. Five items, each **derived** from existing provider reads (no new table/endpoint): complete profile (logo + bio), add what you offer (≥1 service OR product), set hours (≥1 availability window), add a location, share first post. Reuses the existing hooks (`useProvider`/`useProviderServices`/`useShopProducts`/`useAvailabilityWindows`/`useProviderLocations`/`useProviderPosts`); products query gated on the `shop` capability. Each row navigates to the screen that completes it (Profile/Services/Locations/Storefront). `%` = completed ÷ 5; retires at 100% after a brief success state (localStorage-remembered per provider). On-brand coral/cream, English-only (web). New `provider/lib/activation.js` (pure) + `provider/components/GettingStartedChecklist.jsx`. No migration. web vitest 1794→1805 (+11: derivations, % math, card hides at 100%, nav).

---

# Night-run log — 2026-08-13 (Pet Owner engagement wave, units E0–E4)

Preamble: `docs/pet-owner-engagement.md`. Sequential retention build: E0 foundations → E1 Care Ring →
E2 streak → E3 milestones → E4 share cards. Celebrate the dog, never shame the owner; forgiveness on
day one; no fake data. One line per merge.

- **2026-08-13 (E0)** — Data foundations merged — [#378](https://github.com/augustotraversa98-dot/PawPi/pull/378). **Migration 0094** (`pet_care_days`,
  `pet_streaks`, `user_profiles.timezone`; ENABLE+FORCE own-row RLS, `pawpi_app`). The gotcha/adoption
  day reuses the existing `pets.adoption_date` (already synced Dog Profile ↔ Medical Profile — no new
  column). `verify_0094.sql`; RLS proven in `engagement-foundations-rls.integration.test.ts` (+9
  integration). No mobile/web-app code change. **0094 ✅ APPLIED + verified on Supabase 2026-08-13.**
- **2026-08-13 (E1)** — Care Ring merged — [#379](https://github.com/augustotraversa98-dot/PawPi/pull/379). **NO migration** (visualization over existing
  walk/moment/care logs; reuses E0's `pet_care_days`/`pet_streaks`). New owner-scoped route
  `GET/POST /api/pets/[id]/care-ring`: derives the three segments for the **owner-tz day**
  (`(ts AT TIME ZONE tz)::date`, tz = `COALESCE(user_profiles.timezone,'America/Buenos_Aires')`),
  upserts the derived state into `pet_care_days`, and writes rest-day (`pet_care_days.rest_day`) +
  pause (`pet_streaks.paused_until`). Degrades cleanly pre-0094 (savepoint + 42P01 → derived-only).
  Mobile: `CareRing` (react-native-svg 3-arc ring, RN-Animated closing pop + guarded expo-haptics),
  `CareRingCard` on Health→Today (status copy that celebrates the dog / never shames, tappable segment
  deep-links, rest-day toggle + pause-until date), and a live ring around the owner's own pet-profile
  avatar; `useCareRing`/`useSetRestDay`/`useSetPause`; walk/moment/care log mutations invalidate
  `["care-ring", petId]` so a segment fills without reload. EN+ES. Gates: integration 872→893 (+21
  incl. E0), web vitest 1920 (unchanged), mobile jest 1721→1735 (+14 careRing util).
- **2026-08-13 (E2)** — Streak + forgiveness merged — [#380](https://github.com/augustotraversa98-dot/PawPi/pull/380). **Migration 0095** (`pet_streaks`
  += `pre_reset_count`/`reset_at`/`last_award_count`; `app_advance_care_streak` /
  `app_repair_care_streak` SECURITY DEFINER helpers — the single source of truth for the streak math,
  granted to pawpi_app). The ring route advances the streak when the ring closes (idempotent; a gap of
  missed **non-excused** days auto-consumes banked freezes; only a wider gap resets to 1, remembering
  the run; **rest/pause is never a miss**; milestones 7/30/100 bank a freeze, capped 2) and exposes a
  one-tap `repair_streak` (~48h window). Degrades cleanly pre-0095 (42P01/42883 → ring without a
  streak). Mobile: 🔥 `StreakChip` on the pet-profile + feed header (renders nothing at 0), a "streak
  is safe" line + "Restore your streak" CTA on the ring card; `useRepairStreak`. EN+ES. Gates:
  integration 893→901 (+8 forgiveness matrix), web vitest 1920 (unchanged), mobile jest 1735→1738 (+3).
- **2026-08-13 (E3)** — Milestone moments merged — [#381](https://github.com/augustotraversa98-dot/PawPi/pull/381). **NO migration** (reuses `pets.birthday`
  + `pets.adoption_date`). `feedDelight.js` gains `getMilestone` (type: birthday|gotcha + years) and
  `getUpcomingMilestone` (3-day countdown, strictly future). On a milestone day a daily moment gets an
  animated `MilestoneRibbon` + one-shot `Confetti` (RN Animated, jest-safe) + a "Share this 🎉" CTA
  (labeled `DailyShareButton`, stubs to the 2.62 share frame until E4). New owner-scoped
  `GET /api/feed/milestones?viewerPetId=&day=` returns followed pets whose birthday/gotcha falls today
  (+ `today_post_id` to wire paw/bark) → `FollowedMilestones`/`MilestoneEventCard` injected atop the
  home feed (tap → profile, "Send a paw" on the pet's moment). A `MilestoneCountdownBanner` on the
  pet-profile shows only in the 3-day window (feeds E5). Profile route now also returns `adoption_date`.
  EN+ES. Real dates only — nothing renders without a matching date. Gates: integration 901→906 (+5),
  web vitest 1920 (unchanged), mobile jest 1738→1746 (+8).
- **2026-08-13 (E4)** — Share cards deck merged — [#382](https://github.com/augustotraversa98-dot/PawPi/pull/382). **NO migration** (reads existing
  walk/moment logs + E0/E2 `pet_streaks`). New owner-scoped `GET /api/pets/[id]/share-stats?day=`
  returns REAL stats — streak (from `pet_streaks`, degrade-clean), walks in the last 7 owner-tz days,
  total daily moments; a non-owned pet 404s and another owner's logs never leak. Mobile:
  `ShareableStatCard` (story-sized 9:16 captured at **1080×1920**, PawPi-branded, carries **@handle + a
  handle-only deep link — never location**) + `ShareCardButton` reusing the 2.62 `react-native-view-shot`
  + `expo-sharing` capture path (load-gated, timeout, graceful no-op); `ShareCardDeck` modal lists the
  templates built from real stats (milestone / week-in-walks / streak / pet-of-the-day) with a clean
  empty state when a stat is 0 (no fake number), plus an **empty-safe monthly care-recap STUB** (depends
  on E10). Opened from a "Share a card" button on the owner's own pet-profile. EN+ES. Gates: integration
  906→910 (+4), web vitest 1920 (unchanged), mobile jest 1746→1752 (+6). **Pet Owner engagement wave
  E0–E4 COMPLETE.**
- **2026-08-14 (E5)** — Notification rewrite merged — #384. **NO migration** (client-side policy;
  toggles in AsyncStorage, streak-save is a local evening notification, send time from app-open history).
  Rebuilt around WANTED triggers only: `notificationPolicy.js` (pure — the exact at-risk streak-save
  condition [ring exactly one segment from close AND streak>0 AND not closed AND not rest/paused AND
  not-already-sent-today], global daily cap, personalized send hour), `notificationPreferences.js`
  (per-category toggles + per-day send log + rolling open-hour history), `engagementNotifications.js`
  (positive EN+ES copy builders + guarded `maybeScheduleStreakSave` wired into `CareRingCard`). Removed
  guilt/chore copy: reframed `notificationGenerator.js` (no "overdue"/"is due now") + the daily-return
  fallback. Settings → Notifications replaced 3 dead hardcoded switches with real persisted per-category
  toggles (Social / Milestones / Streak / Care). Warm friend-based dormant re-engagement copy ("Bella
  misses Rex", never "you haven't opened"). A no-guilt grep test scans EN+ES copy. Gates: mobile jest
  1752→1782 (+30); web vitest + integration unchanged (mobile-only).
- **2026-08-14 (E6)** — Onboarding D1 polish merged — #385. **Migration 0096** (welcome paw; ✅ APPLIED + verified on Supabase
  2026-08-14, verify_0096.sql all PASS). The first session now ends with the Care Ring STARTED: after the first
  daily moment is posted, `POST /api/onboarding/welcome` (a) seeds the day-1 streak (pet_streaks
  current_count=1, ON CONFLICT DO NOTHING so a real streak is never overwritten) and (b) grants the ONE
  allowed, honest, LABELLED seeded interaction — a first paw from the official "PawPi Welcome" account.
  The account is created LAZILY by the `app_welcome_account` DEFINER helper (NOT a migration-time seed
  INSERT — that would collide with the integration harness's explicit-id seeding in the first test),
  and `app_welcome_paw` DEFINER inserts the paw (post_paws' write policy only lets the actor paw) + a
  labelled `welcome` notification (notifications_type_check widened). Endpoint is idempotent and
  degrades cleanly pre-migration (42883/42P01 -> welcomed:false, never a 500). Onboarding now captures
  BOTH birthday AND gotcha/adoption day inline (both optional, two DateFields -- was either/or); the
  success screen shows "Day 1 -- {dog}'s care ring has begun" + "PawPi Welcome sent {dog} a paw", or a
  ring-start nudge ("Take {dog}'s first photo to close today's ring") when no moment was posted. No
  medical/health fields forced at signup. EN+ES (new onboarding.* keys). Gates: mobile jest 1782->1786
  (+4), web integration 910->915 (+5), web vitest 1920 (unchanged).
- **2026-08-14 (E7)** — Pack / shared streaks merged — #386. **Migration 0097** (✅ APPLIED + verified on Supabase 2026-08-14,
  verify_0097.sql all PASS). New `pet_pack_streaks` (requester/receiver user+pet, status pending/active/ended,
  current/longest count, last_active_day; unordered-pair unique index; participant-scoped ENABLE+FORCE
  RLS) + 5 SECURITY DEFINER helpers — every action crosses the owner boundary (pets + pet_care_days are
  owner-scoped, so a caller can't read a friend's pet, see their ring, or notify them): app_request_
  pack_streak (opt-in by partner @handle), app_accept_pack_streak, app_advance_pack_streaks (called on
  ring close — advances only when BOTH pets closed the same owner-tz day; idempotent; gap restarts at
  1), app_pack_boop (rate-limited once/pack/actor/day, only if the friend hasn't closed), app_pack_
  streaks_for_pet (reader w/ partner display + boop_available; needs `#variable_conflict use_column`
  because the RETURNS TABLE out-cols shadow the joined tables' id/status/etc.). notifications_type_check
  widened (pack_invite/pack_accepted/boop). `GET/POST /api/pets/[id]/pack-streaks`; the pack advance is
  wired into the care-ring close in its OWN savepoint so a pre-migration absence never degrades the
  personal streak. Consumers degrade clean (list->empty, actions->503). Mobile: usePackStreaks hooks +
  PackStreaksCard on Health->Today (flame+count, boop, accept invite, start by @handle; break copy shows
  the best run, never blames). Notifications screen localizes the new welcome/pack/boop types (EN+ES).
  Opt-in only. Gates: mobile jest 1786->1791 (+5), web integration 915->919 (+4), web vitest 1920.
- **2026-08-14 (E8)** — Leaderboards (density-gated) merged — #387. **Migration 0098** (✅ APPLIED + verified on Supabase
  2026-08-14, verify_0098.sql all PASS). Weekly care-effort leagues. XP = walks*10 + ring-closes*15 +
  care-actions*5 + paws-GIVEN*2 over the owner-tz week (paws RECEIVED / likes never count) via
  `app_pet_week_xp` DEFINER; `app_leaderboard` DEFINER builds the cohort per flavor (friends /
  breed / neighborhood), scores + ranks it, and returns NOTHING below the min cohort size so the
  route falls back to the friends board (never empty/fake) — DEFINER because ranking must read other
  owners' logs. Coarse OPT-IN geo added additively to pets (`lb_opt_in`/`lb_area`; never lat/lng);
  new `pet_leaderboard_weeks` (own-row ENABLE+FORCE RLS) snapshots each week so promotion/relegation
  movement (bronze<silver<gold, top/mid/bottom third) is real vs the prior week. `GET/POST /api/pets/
  [id]/leaderboard`; the reader needs `#variable_conflict use_column` and `drop table if exists
  _cohort` (re-callable within one tx — the route may call it twice: requested flavor then friends
  fallback). Degrades clean pre-migration (empty-safe board / opt-in 503). Mobile: useLeaderboard +
  LeaderboardCard on Health->Today (flavor tabs, tier badge + movement, gated fallback note,
  neighborhood coarse-area opt-in). EN+ES. Gates: mobile jest 1791->1793 (+2), web integration
  919->924 (+5), web vitest 1920.
- **2026-08-14 (E9)** — Comparative health insight merged — #388. **Migration 0099** (✅ APPLIED + verified on Supabase
  2026-08-14, verify_0099.sql all PASS). A positive, behavioral activity reward after logging. v1 defaults to
  the dog's OWN history: this week's walk count vs the prior 3 weeks → best-week-in-a-month /
  more-than-last-week / keep-going / gentle forward nudge. A breed+age COHORT win ("more active than
  X% of {breed}s his age") only renders when the pet is ABOVE median AND the cohort is >= min size, via
  `app_activity_cohort` DEFINER (owner-scoped RLS forbids reading peers' logs; the aggregate is
  same-breed + age±1yr weekly walk counts). The positive-only rule is ENFORCED in a pure,
  server-authoritative `decideInsight` (logic.js) — no bare-negative kind can ever be returned; below
  median falls through to personal/nudge. `GET /api/pets/[id]/activity-insight`; disclaimer always
  present (behavioral, never diagnostic); degrades clean pre-migration (cohort branch drops, personal
  history still renders). Mobile: useActivityInsight + ActivityInsightCard on Health->Today (maps the
  server `kind` to positive EN+ES copy; a no-negative grep test guards the strings). Gates: mobile jest
  1793->1805 (+12), web vitest 1920->1924 (+4), web integration 924->928 (+4).
- **2026-08-14 (E10)** — Health-update reinforcement merged — #389. **NO migration** (reads/writes
  existing tables). Three positive payoff loops: (1) one-tap "all good" on the Care Ring — writes a
  REAL health_wellness_logs general log (in the care-ring derivation), closing the Care segment in a
  single tap; (2) Vet-Summary readiness — new `GET /api/pets/[id]/vet-summary-readiness` counts REAL
  records across weight / meds / photo-checks / vet-visits (each in its own savepoint so a missing
  table degrades to 0, never 500), returns filled/total/percent + a positive level (start/building/
  great); 0 records → honest low state, never shames gaps; (3) monthly care recap — share-stats
  extended with `care_recap` (this month's ring_closed days / elapsed owner-tz days = percent, degrade
  clean), surfaced in-app via `VetSummaryReadinessCard` AND wired into the E4 share-card deck
  (`buildShareCards` + ShareableStatCard + ShareCardDeck now render the REAL recap percent, empty-safe
  at 0%). Mobile: useHealthReinforcement (useLogAllGood / useVetSummaryReadiness) + the one-tap button
  on CareRingCard + VetSummaryReadinessCard on Health->Today (links to the Vet Record). Behavioral, not
  diagnostic; a no-shame grep test guards the copy. EN+ES. Gates: mobile jest 1805->1809 (+4), web
  integration 928->932 (+4), web vitest 1924. **Pet Owner engagement wave E5–E10 COMPLETE.**

## Pre-launch night run (2026-08-16 plan) — see docs/night-run-2026-08-16-report.md

- **2026-08-15 (A2a)** — Demo/seed content leak into real feeds/discovery FIXED — #410. Migration
  **0111** (`user_profiles.is_demo` + denormalized `providers.is_demo`, additive, no RLS change)
  **APPLIED + VERIFIED on Supabase prod**; safe backfill flagged **58 demo profiles + 1 demo provider**
  (no deletes). Exclusion added to all 7 global surfaces (discover, search, feed/suggestions,
  providers/discover, services/discover, adoption/listings, posts Suggested); owner/following-scoped
  views untouched so the App-Review demo login still shows a populated app. Seed runner stamps
  is_demo + refuses prod without ALLOW_PROD_SEED=1. New integration test demo-content-guard (5 cases).
  Prod was 58/72 demo profiles at run start. Gates: web vitest 2027 / integration 1021.
- **2026-08-15 (A2b)** — Honest + localized post timestamps FIXED. NO migration. Removed the hardcoded
  `"just now"` fallback in PostCard + PostDetailModal (a fabricated time when created_at absent; the
  `post.timestamp` fallback was dead mock code). `formatRelativeTime` now localizes via an optional
  `{ now, t }` arg (back-compat with the positional `now`); added feed.minutesShort/hoursShort/
  daysShort/yesterday to en+es. All 5 call sites pass `{ t }` + drop the lie. Gates: mobile jest 1885.
- **2026-08-15 (A3, feed comments)** — Comment moderation gap FIXED for feed comments (barks). NO
  migration (post_barks_author_all FOR ALL already permits author DELETE). New endpoint DELETE
  /api/posts/[id]/barks/[barkId] (author-scoped, IDOR-safe) + useDeleteBark hook; BarkModal now shows
  Delete on own comments and Report+Block (via bark.user_id) on others'. New moderation.* i18n keys
  (EN+ES). Tests: web integration bark-delete (4) + BarkModal affordance tests (2). Gates: mobile jest
  1887, web vitest 2022. Follow-up: business-post (provider-post) comments still need Report+Block
  (delete-own present) — needs content_reports.target_type CHECK widen; next PR.
- **2026-08-15 (A3, business-post comments)** — Report + Block added to business-post
  (provider-post) comments (delete-own was already present) — closes the A3 UGC-moderation matrix.
  Migration **0112** widens content_reports.target_type CHECK to allow 'provider_post_comment'
  (**APPLIED + VERIFIED on Supabase prod**); reports route allows the new type; provider-post.jsx
  renders ModerationMenu (report+block via c.author_user_id) on non-own comments. Test: reports
  route unit + provider-post mobile. Noted follow-up: ModerationMenu labels are English-only
  (pre-existing EN/ES gap) — flagged for an i18n sweep.
- **2026-08-15 (Phase C — Legal)** — Privacy Policy + Terms rewritten EN+ES and DRAFT-stamped
  ("needs a lawyer's review; not legal advice"). Data-collection audit from the live schema drives an
  expanded Privacy Policy (legal bases, subprocessor table incl. Supabase/Railway/Expo/MercadoPago+
  Binance+Stripe/Resend/Uploadcare/Google Maps, push tokens, coarse-geo, caregivers, retention). New
  files: privacy-policy.es.md, terms-of-service.es.md, LEGAL-REVIEW-CHECKLIST.md. Docs-only, no code.
  Tats action: lawyer review → publish to the hosted pawpi-legal repo + confirm EXPO_PUBLIC_*_URL env.
- **2026-08-15 (Phase B — Performance)** — Audit only; NO migration (evidence-based decision). Prod
  pg_stat_statements shows every app query <~2ms mean (identity lookup 0.04ms @95k calls; bookings
  1.5-2ms; chat 1.45ms); hot tables fully indexed; N+1s avoided via JOIN-aggregates. No index/rewrite
  warranted at current scale — deliberately did not ship a make-work migration. Flagged optional:
  drop redundant duplicate indexes (write-amp) + re-profile as data grows + possible partial
  notifications(recipient) WHERE read_at IS NULL index later.
- **2026-08-15 (Phase D — Apple submission prep)** — Built docs/app-store-submission-runbook.md
  (every ASC step + exact eas build/submit commands + APNs setup), added eas.json appleId placeholder,
  docs/app-store-privacy-data-map.md (App Privacy nutrition label from Phase C), ES App Store metadata
  (content pack §13). Config: v1.0.0, com.pawpi.app, iPhone-only, encryption-exempt, permission
  strings present (EN; ES InfoPlist localization flagged as optional). CC does NOT submit — Tats runs
  the eas commands + ASC console steps per the runbook.
- **2026-08-15 (Phase A audit + closeout)** — A1 lifecycle VERIFIED via the existing per-stage
  integration suite (+2 new tests: demo-content-guard, bark-delete); no new backend bugs beyond
  A2/A3. A2c "layers on layers" ROOT-CAUSED (search is presentation:"modal" so pet-profile/photo
  stack over it) → punch list with the concrete modal→card fix to verify on device. A3 interactive
  controls CLEAN (no dead/no-op/broken handlers; honest empty states). A4 STRONG: 48 *-rls
  integration files prove cross-tenant denial + input validation present; one gap flagged =
  no app-level write rate-limiting. Deferred/flagged: ModerationMenu EN-only labels, EN-only iOS
  permission strings, rate-limiting, redundant duplicate indexes. Docs-only closeout PR.
  Run COMPLETE: PRs #410-#415 merged; migrations 0111+0112 live on prod.

## Pre-launch polish fix-pack (PP1–PP3) — see docs/pre-launch-polish-fixpack.md

- **2026-08-15 (PP1)** — Navigation "layers on layers" FIXED — #417. Mobile-only, NO migration.
  `search` was `presentation: "modal"` on the root Stack while everything it opens is a push
  (result → `/pet-profile` card → photo → `PostDetailModal` pageSheet), so a card stacked on a modal
  and a modal on that card: 3 layers, no back button, swipe-only dismiss. `search` is now a **card
  push**, and its header affordance reads as **back** (`ChevronLeft` + `common.back` a11y label,
  already EN+ES) instead of a modal-dismiss `X` — the clear-query `X` stays. Checked: there is no
  separate full-screen photo route, so `PostDetailModal` is the ONLY modal in the chain (and
  `BarkModal` can't stack on it — `onOpenBarks` closes the detail sheet first). Deep link `/search`
  + the tab initial route unchanged. New guard `navigation-layers.test.js` (source-level nav
  contract: `search`/`pet-profile` must never be modals) + back-affordance/push-only tests in
  `search.test.jsx`. Gates: mobile jest 1887→**1891**, web vitest 2023, web integration 1020
  (web untouched — no Railway deploy needed). **Deliberately NOT changed:** `notifications` and
  `messages` are still modals that push cards from inside themselves (same shape) — PP1 was scoped
  to Search/Discovery, so they are flagged for a follow-up decision rather than changed blind.
  ⚠️ **NEEDS ON-DEVICE CONFIRMATION** — swipe-back through search → pet-profile → photo, and whether
  losing swipe-down-to-dismiss on search feels right.
- **2026-08-15 (PP2)** — EN/ES parity gaps CLOSED. Mobile + app config, NO migration.
  **(a) iOS permission prompts** are drawn by the OS, so `t()` can never reach them: `app.json` now
  declares `expo.locales` → `anything/apps/mobile/locales/{en,es}.json` + `ios.infoPlist`
  `CFBundleLocalizations: ["en","es"]`, which prebuild turns into `<locale>.lproj/InfoPlist.strings`.
  Camera / photo library (read+add) / location / microphone / both calendar strings now ship EN+ES
  (Argentine voseo); English copy is byte-identical to what Apple already reviewed. Guarded by
  `locales/locales.test.js` (key parity; every `…UsageDescription` in both files; EN file == the
  `ios.infoPlist` base fallback; no ES value left equal to its English source) because nothing at
  runtime could ever catch drift here. **(b) ModerationMenu** — every label, a11y label and Alert
  through `t()` under `moderation.*`; `REPORT_REASONS` carries `labelKey` (the reason **`key` is
  unchanged** — it is the wire value posted to /api/reports). One component covers moderation on the
  feed, comments, chat, events, forum, reviews and adoption. **(c) Sweep** — Search & Discover was
  100% hardcoded English despite `search.title`/`noResults`/`nothingHere` sitting unused in the
  catalog; 10 new `search.*` keys EN+ES. `testMock.makeReactI18nextMock()` now takes a locale, so
  both surfaces get a `*.es.test.jsx` rendering the REAL Spanish catalog (that is what separates
  "localized" from "calls t() against an English-only entry"); the pre-existing English tests are
  unchanged and still pass, pinning that no visible English copy moved. Docs: runbook +
  app-store-readiness flipped to DONE with an on-device verify step. Gates: mobile jest
  1891→**1905**, web untouched (vitest 2023 / integration 1020, no Railway deploy needed).
  ⚠️ **Residual debt measured, NOT fixed** (new DEFERRED item): **158 hardcoded English
  `Alert.alert` literals** app-wide and only **83 of 255** non-test `.jsx` files use
  `useTranslation`. Deliberately left for its own ticket — too large and regression-prone to ride
  along in a fix-pack. Not an Apple blocker (store listing, legal docs and prompts are bilingual).
- **2026-08-15 (PP3)** — Write rate-limiting SHIPPED — closes the night run's last A4 gap. Web-only.
  **Migration 0113** (`rate_limit_hits` + `app_rate_limit_hit()` + `app_rate_limit_gc()`, additive,
  verify_0113.sql). Store is Postgres ON PURPOSE: the app runs as multiple Railway instances, so an
  in-process Map is per-instance and a burst just spreads across replicas. Table is
  **ENABLE+FORCE RLS with a SELECT-only own-row policy and NO write policy** — pawpi_app cannot
  INSERT/UPDATE/DELETE it on any path, so a caller can't reset their own counter; the only writer is
  the SECURITY DEFINER function (pinned search_path, granted to pawpi_app), one atomic upsert
  returning (allowed, hits, retry_after_seconds). Self-cleaning: the upsert detects it INSERTED
  (`xmax = 0` = first hit of a new window) and only then drops that (bucket, subject)'s older rows,
  so the table sizes with ACTIVE subjects, not traffic. Limits (generous): post 12/5min, bark 30/5min,
  report 20/h, booking 15/h, paw 120/min, follow 60/5min — on 7 write handlers (posts, barks,
  paw POST+DELETE, reports, pet follow, provider follow, provider book). **NO GET is wrapped**
  (a test proves a read leaves the counter at 0). 429 carries Retry-After + code `rate_limited` +
  BOTH message_en/message_es; `error` (what the mobile client shows) resolves from the caller's
  preferred_locale → Accept-Language → English. Three rules: reads never limited; **fails open** on
  any error (so the code could ship before the migration); runs inside a **SAVEPOINT** so it can
  never poison the request tx into withRequestContext's blanket 500. Gotcha found + handled: the
  limiter must skip entirely when no request transaction is open, or a route unit test's mocked `sql`
  hands it a queued result and shifts every later assertion — detected by probing `sql.savepoint`
  (porsager puts it on a tx handle, never the pool) rather than importing `getActiveTx`, which every
  route test's `sql` mock would then have to provide. Accepted limitation, logged not hidden: the
  increment is in the request tx, so a rolled-back 500 doesn't count (handled 4xx still do) —
  under-counts, never over-counts. Gates: web vitest 2023→**2048**, integration 1020→**1035**
  (+15 real-Postgres cases), mobile untouched (jest 1905).
- **2026-08-15 (PP3 apply)** — **Migration 0113 APPLIED + VERIFIED on Supabase prod**
  (`qaebbesldduvgwttqlnq`). All 9 structural checks PASS (table, PK, ENABLE+FORCE RLS, exactly ONE
  SELECT-only policy, both DEFINER fns with pinned search_path, both granted to pawpi_app), and the
  behaviour check passes on prod: 1:true → 2:true → 3:false at a limit of 2, collapsing to one live
  window row. Probe rows deleted; `rate_limit_hits` left at 0 rows. **Fixed in verify_0113.sql:**
  the first version called the function three times inside a SINGLE SQL statement (a lateral over
  `values (1),(2),(3)`), where all three calls share one snapshot, each sees an empty counter and
  returns hits=1 — a false FAIL against a limiter that was working correctly. The behaviour probe is
  now a DO block (one call per plpgsql statement), which is also why the harness integration test
  always read it right. Two `max(boolean)` aggregates in the same script were fixed to `bool_or`.
  Railway needs no action beyond the normal deploy on merge — the limiter fails open, so the window
  between deploy and apply was a no-op.
