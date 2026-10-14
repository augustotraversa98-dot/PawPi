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
| **Purchase History** | Orders / bookings / transaction references; shipping address for physical goods | Fulfilling purchases of real-world services & goods |

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

## Explicitly NOT collected / declared
- **Financial Info (card/wallet):** handled by the payment processors (MercadoPago / Binance /
  Stripe), **not stored by PawPi** → declare **Purchase History**, not Payment Info. (Confirm against
  what your processors report back.)
- **Health & Fitness (Apple category):** **No** — that category is the *user's own* health via
  HealthKit, which PawPi does not use. Pet health data is declared as **User Content**.
- **Diagnostics / Usage Data:** **Declared, not linked** from build 26 (table above) — anonymous
  first-party telemetry only. (Builds before 26 collect none.)
- **Crash Data:** **Not declared.** No crash-reporting SDK; native crash logs are not collected by PawPi.
- **Advertising Data, Tracking:** **None.**
- **Browsing History, Search History, Sensitive Info, Contacts:** **None.**

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
