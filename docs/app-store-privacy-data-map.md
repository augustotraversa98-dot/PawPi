# PawPi — App Privacy "nutrition label" data map

What to declare in App Store Connect → **App Privacy**, derived from the Phase C data-collection
audit (`docs/legal/privacy-policy.md`). This supersedes/expands §9 of
`app-store-connect-content.md` with the push-token and coarse-location items.

> **Anonymous usage & diagnostics telemetry.** From app build 26 (v1.0.2), the first build to ship the
> telemetry, the app sends anonymous product-analytics and diagnostics events (ON by default, opt-out in
> Settings → "Help improve PawPi (anonymous)"). Builds before 26 collect nothing. The authoritative
> description is `docs/privacy/telemetry.md`.
> **Status:** the App Store Connect App Privacy declaration is **already published** with exactly
> **Product Interaction, Performance Data and Other Diagnostic Data** — purpose **Analytics**, **not linked**
> to the user, **not used for tracking**. **Crash Data is not declared.** This file mirrors that declaration.

**Global answers**
- **Tracking:** **No.** No data is used to track you across other companies' apps/sites. iOS privacy
  manifest declares `NSPrivacyTracking: false`. No ATT prompt.
- **Third-party advertising:** **None.** No ad SDKs.
- **Analytics SDK:** **None shipped** — no third-party analytics or crash SDK (`@sentry/react-native` is a
  no-op shim). From build 26 the app has its **own first-party, anonymous** telemetry (events go to PawPi's
  server, then to Grafana Cloud as a processor; nothing goes to an ad or analytics network) → declared as
  **Usage Data + Diagnostics**, **not linked to identity**, **not used for tracking** (second table below).
- **Data used to link to identity:** every type in the first table below is **Linked** to the user's account.
  The telemetry types in the second table are **Not linked**: they carry only a random `install_id` /
  `session_id` generated on the device, never an account id, email, name, pet, location, IP or advertising id.
- **Account deletion offered:** **Yes** (Settings → Delete account).

## Collected data types (all "App Functionality" purpose)

| Apple category | Specific types | Why |
|---|---|---|
| **Contact Info** | Email address, Name | Account creation, sign-in, transactional email |
| **User Content** | Photos or Videos; Other User Content (pet profiles, health/vet entries, posts, comments, messages, reviews, adoption answers); Customer Support | Core app functionality |
| **Location** | **Precise Location** (nearby, walks, pet-taxi live-share, events, adoption distance, lost & found); **Coarse Location** (optional leaderboard area label) | Location-based features (not tracking) |
| **Identifiers** | User ID; **Device ID** (Expo push token) | Account identity; delivering push notifications |
| **Purchase History** | Orders / bookings / transaction references | Fulfilling purchases of real-world services & goods |
| **Contact Info** | **Physical Address** (shipping address stored on shop orders for physical goods, `orders.shipping_address`) | Fulfilling purchases of physical goods |

## Anonymous usage & diagnostics (build 26+) — NOT linked, NOT used for tracking

Declared in App Store Connect as **"Data Not Linked to You"** and **not used to track you**; purpose:
**Analytics** only. Every other purpose (including Advertising and App Functionality) is unchecked.

| Apple category | Specific type | What it is |
|---|---|---|
| **Usage Data** | **Product Interaction** | Screen views (route template, never a URL with ids), taps on registered controls, feature and funnel usage |
| **Diagnostics** | **Performance Data** | Startup, screen-ready and API-latency buckets |
| **Diagnostics** | **Other Diagnostic Data** | App/OS version, platform, language, API status classes, navigation anomalies, client error class names (no message or stack) |

- **Identifiers is NOT ticked for telemetry.** The random `install_id` is app-generated, kept in the secure
  store, never tied to the account or any device identifier, and not shared with third parties. If Apple
  review pushes back, the conservative alternative is to also tick **Identifiers → Device ID** (not linked,
  not tracking, purpose Analytics).
- **Other Diagnostic Data includes client errors:** the app reports JS client errors by **error class name
  only** (no message, no stack). No native crash logs and no crash-reporting SDK are used, which is why
  **Crash Data is not declared**.
- The user can turn it off any time (Settings → "Help improve PawPi (anonymous)"): collection stops and the
  `install_id` is deleted. That choice survives sign-out / account deletion.
- Never collected by telemetry: account id, email, name, pet data, content, messages, search text, location
  (precise or coarse), IP (used only as a salted hash in memory for rate limiting), IDFA/IDFV.
- Retention: no specific period is stated. It is set by the hosting/monitoring provider's plan and is
  deliberately not stated in the privacy policy (`docs/privacy/telemetry.md`).

## Third-party services that receive data (accuracy sweep 2026-10-16)

Checked against the code, the production Railway service's variable **names** (values never read) and live
requests to `www.pawpi.info`. **Live** = reachable in the shipped app/backend today and receives data;
**Inactive** = bundled or coded but sends nothing in production; **Not used** = dead code or removed. Policy
Section 8 (EN + ES) lists exactly the **Live** rows. Full evidence and the open items:
`docs/legal/accuracy-sweep-2026-10-16.md`. This is a factual inventory, not legal advice.

| Service | Status | What it receives | In policy §8 |
|---|---|---|---|
| **Supabase** (Postgres + Storage) | **Live** | All app data; uploaded photos/docs/video via `POST /api/upload` (public `media` bucket, private bucket for medical/chat files) | Yes (now says "database and file storage") |
| **Railway** | **Live** | Hosting; requests in transit | Yes |
| **Cloudflare** | **Live, proxied.** `www.pawpi.info` (incl. `/api/*`) and the apex answer from Cloudflare (`server: cloudflare`, `cf-ray`, Cloudflare IPs, `cf-cache-status: DYNAMIC`). | Every request to the site and API passes through Cloudflare in transit: IP address and request content. | Yes (added) |
| **Expo push** (+ APNs/FCM behind it) | **Live** | Push token, notification content | Yes (now notes Apple/Google push) |
| **Expo Updates** (`u.expo.dev`) | **Live** | Update ids, platform, channel, random client id, IP | Yes |
| **MercadoPago** | **Live.** `MP_*` variables are set on production. | Order amount/status/reference; payment details entered directly with MercadoPago | Yes (now named alone) |
| **Resend** | **Live.** `EMAIL_API_KEY`/`EMAIL_FROM` set; the only email adapter. | Recipient email address and message content (password reset, digests) | Yes |
| **Grafana Cloud** | **Live.** `GRAFANA_LOKI_*` and `OTEL_*` set. | Anonymous app events; server request records (route template, status, duration, request id) and trace spans with IP/query/URL ids scrubbed | Yes (server records sentence added to §5) |
| **Daily.co** | **Live** (`VIDEO_PROVIDER` + `VIDEO_API_KEY` set; telehealth WebView). | Account display name, live audio/video, in-call chat, screen share, IP. Room is private; no recording. | Yes |
| **Sign in with Apple / Google** | **Live.** `AUTH_APPLE_*` and `AUTH_GOOGLE_*` set; the Welcome buttons appear only when configured. | Basic profile (name, email incl. Apple private relay) and token verification | Yes (added; was in §2 but missing from §8) |
| **Apple Maps / Apple geocoder** (iOS system) | **Live on iPhone.** `react-native-maps` uses `PROVIDER_DEFAULT` (Apple Maps) and `expo-location` reverse-geocoding uses Apple's geocoder. | Map area viewed; coordinates to turn into a street address | Yes (added, within the Apple entry) |
| **OpenStreetMap Nominatim** | **Live.** Services Discover "search a location", from the device on explicit submit. | Typed place text, IP, a PawPi User-Agent | Yes |
| GitHub (`GITHUB_DISPATCH_TOKEN`) | **Live, internal ops only.** Observability alert-to-autofix loop. | Alert payloads (route/metric text), no user data | No (not user data) |
| **RevenueCat** (`react-native-purchases`) | **Inactive.** `Purchases.configure` is only reachable from an unused hook; no RevenueCat keys in the EAS `production` profile; no webhook route. | Nothing today | No |
| **Anthropic (Claude)** AI document reading | **Inactive.** Returns 503 unless `ANTHROPIC_API_KEY` is set; the key (and `ENRICHMENT_LLM_KEY`) is not set on production. | Nothing today. When enabled: the uploaded vet document | No |
| **Google Maps Platform** (Places enrichment, browser map picker) | **Inactive.** `GOOGLE_PLACES_API_KEY` is not set on production; `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY` is not set, so the provider-dashboard map picker renders nothing. Android shows a "coming soon" map placeholder (no Google key). | Nothing today | **Removed** |
| **Binance Pay** | **Inactive.** Adapter exists; `BINANCE_PAY_API_*` not set on production, routes answer 503 "not configured". | Nothing today | **Removed** |
| **Stripe** | **Not used.** Only a platform scaffold (`src/__create/stripe.ts`) that nothing imports; no Stripe key. | Nothing | **Removed** |
| **Uploadcare / `api.anything.com`** | **Not used.** Real uploads go to Supabase Storage. `utils/upload.js` (the `api.anything.com` helper) had no importers and was deleted; `@uploadcare/upload-client` in the mobile `package.json` is an unused leftover. | Nothing | **Removed** |
| **Google Fonts** and **Font Awesome kit** | **Removed from public pages in this PR.** Nunito/JetBrains Mono are now self-hosted; the Font Awesome Pro kit was loaded in `root.tsx` for every page but no `fa-` icon is used anywhere (and the CSP did not even allow its stylesheet). Verified no third-party request on `/`, `/privacy`, `/terms`, `/eula`, `/support`, `/account/signin`, `/p/tag/*`. | Was: visitor IP to Google / Font Awesome | n/a (no longer happens) |

If RevenueCat, Anthropic, Google Maps, Binance Pay or an uploads vendor is switched on later, update this table,
policy §2/§8 (EN + ES) and the App Store label first.

### Label impact (for the App Store Connect owner)

- **Cloudflare / Railway / Supabase / Resend / MercadoPago:** processors for data already declared; no new data type.
- **Daily.co:** live audio/video/chat are real-time and not recorded; Apple excludes data not kept longer than needed
  to serve the request, so no change is strictly required. Conservative option: **User Content → Audio Data**,
  Linked, App Functionality.
- **Expo Updates:** random client id + IP, no account link. Conservative option: **Identifiers → Device ID**, Not linked,
  App Functionality.
- **Nominatim:** a typed place name is not the user's location. Borderline **Search History** (Not linked,
  App Functionality); conservative option is to declare it.
- **RevenueCat / Anthropic:** none today. If RevenueCat goes live: **Purchases → Purchase History** and
  **Identifiers → User ID / Device ID**. If Anthropic goes live: uploaded vet documents map to the already-declared
  **Photos or Videos / Other User Content** (Linked, App Functionality).

## Explicitly NOT collected / declared
- **Financial Info (card/wallet):** handled by the payment processor (MercadoPago; Binance Pay and Stripe are
  not live), **not stored by PawPi** → declare **Purchase History**, not Payment Info.
- **Health & Fitness (Apple category):** **No** — that category is the *user's own* health via
  HealthKit, which PawPi does not use. Pet health data is declared as **User Content**.
- **Diagnostics / Usage Data:** **Declared, not linked** from build 26 (table above) — anonymous
  first-party telemetry only. (Builds before 26 collect none.)
- **Crash Data:** **Not declared.** No crash-reporting SDK; native crash logs are not collected by PawPi.
- **Advertising Data, Tracking:** **None.**
- **Browsing History, Sensitive Info, Contacts:** **None.**
- **Search History:** **None declared.** The only search text sent off-device is the Services "search a location"
  query to OpenStreetMap Nominatim (see the third-party table above for the borderline call).

## Notes for the reviewer form
- Location is requested only for nearby features and the app works with location denied.
- The push-token "Device ID" is collected only if the user enables notifications, and is deleted when
  they disable notifications or delete their account.
- Telemetry: keep the iOS privacy manifest (`PrivacyInfo.xcprivacy`) consistent with the published
  declaration (Product Interaction, Performance Data, Other Diagnostic Data) and the resulting label showing
  Usage Data + Diagnostics as "Data Not Linked to You". `NSPrivacyTracking` stays `false` (no ATT prompt).
- The live privacy policy needs the matching "Anonymous usage and diagnostics data" paragraph (EN + ES draft in
  `docs/privacy/telemetry.md` §5) — a human action after legal review.
- Keep this map in sync with `docs/legal/privacy-policy.md` §7 (subprocessors) and §2 (data collected)
  whenever data practices change.

## FINAL recommended App Privacy label (apply in App Store Connect)

Global: **Data used to track you: No.** Third-party advertising: none. Account deletion offered: Yes.
Every "Linked" row below is linked to the user's account; every purpose not listed is unchecked.
Items marked **NEW vs. this doc before the sweep** are changes you may need to make.

### Required (declare these)

| Data type (Apple category → type) | Linked to user? | Purpose | Notes |
|---|---|---|---|
| Contact Info → Email Address | Linked | App Functionality | Sign-up / Sign in with Apple, Google |
| Contact Info → Name | Linked | App Functionality | |
| Contact Info → **Physical Address** | Linked | App Functionality | **NEW vs. this doc before the sweep.** Shipping address saved on physical-goods orders. Previously folded under Purchase History. |
| User Content → Photos or Videos | Linked | App Functionality | Pet photos, posts, health-check images, daily moments, documents |
| User Content → Other User Content | Linked | App Functionality | Pet profiles, health/vet entries, posts, comments, messages, reviews, adoption answers |
| User Content → Customer Support | Linked | App Functionality | |
| Location → Precise Location | Linked | App Functionality | Nearby, walks, pet-taxi live-share, events, adoption distance, lost and found |
| Location → Coarse Location | Linked | App Functionality | Optional leaderboard area label |
| Identifiers → User ID | Linked | App Functionality | |
| Identifiers → Device ID | Linked | App Functionality | Expo push token (only if notifications are enabled) |
| Purchases → Purchase History | Linked | App Functionality | Orders, bookings, payment references |
| Usage Data → Product Interaction | **Not linked** | Analytics | Anonymous telemetry (build 26+); already published |
| Diagnostics → Performance Data | **Not linked** | Analytics | Already published |
| Diagnostics → Other Diagnostic Data | **Not linked** | Analytics | Already published |

Not declared: Crash Data (no crash SDK), Health & Fitness (that category is the person's own HealthKit data),
Financial Info, Advertising Data, Browsing History, Contacts, Sensitive Info.

### Conservative extras (optional; judgement calls, each defensible either way)

| Data type | Linked? | Purpose | Why you might add it |
|---|---|---|---|
| User Content → Emails or Text Messages | Linked | App Functionality | In-app messages with providers/other owners are currently covered by Other User Content; Apple's definition of this type names message content, so a reviewer could ask for it. |
| User Content → Audio Data | Linked | App Functionality | Telehealth video calls (Daily.co) carry live audio; not recorded, so Apple's "not kept longer than needed" exclusion probably applies. |
| Identifiers → Device ID (telemetry/updates) | Not linked | Analytics (telemetry) and App Functionality (Expo Updates) | Random `install_id` and Expo's random client id are not device identifiers, but this is the safest reading if review pushes back. |
| Usage Data → Search History | Not linked | App Functionality | The Services "search a location" text is sent to OpenStreetMap Nominatim. |
| Contact Info → Phone Number | Linked | App Functionality | Users can enter an emergency contact's and their vet's phone numbers (stored as pet-record content, not for contacting the user). |
