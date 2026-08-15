# PawPi — App Privacy "nutrition label" data map

What to declare in App Store Connect → **App Privacy**, derived from the Phase C data-collection
audit (`docs/legal/privacy-policy.md`). This supersedes/expands §9 of
`app-store-connect-content.md` with the push-token and coarse-location items.

**Global answers**
- **Tracking:** **No.** No data is used to track you across other companies' apps/sites. iOS privacy
  manifest declares `NSPrivacyTracking: false`. No ATT prompt.
- **Third-party advertising:** **None.** No ad SDKs.
- **Analytics SDK:** **None shipped.** `@sentry/react-native` is a no-op shim; no usage/crash SDK →
  declare **no** Diagnostics/Usage Data.
- **Data used to link to identity:** everything below is **Linked** to the user's account.
- **Account deletion offered:** **Yes** (Settings → Delete account).

## Collected data types (all "App Functionality" purpose)

| Apple category | Specific types | Why |
|---|---|---|
| **Contact Info** | Email address, Name | Account creation, sign-in, transactional email |
| **User Content** | Photos or Videos; Other User Content (pet profiles, health/vet entries, posts, comments, messages, reviews, adoption answers); Customer Support | Core app functionality |
| **Location** | **Precise Location** (nearby, walks, pet-taxi live-share, events, adoption distance, lost & found); **Coarse Location** (optional leaderboard area label) | Location-based features (not tracking) |
| **Identifiers** | User ID; **Device ID** (Expo push token) | Account identity; delivering push notifications |
| **Purchase History** | Orders / bookings / transaction references; shipping address for physical goods | Fulfilling purchases of real-world services & goods |

## Explicitly NOT collected / declared
- **Financial Info (card/wallet):** handled by the payment processors (MercadoPago / Binance /
  Stripe), **not stored by PawPi** → declare **Purchase History**, not Payment Info. (Confirm against
  what your processors report back.)
- **Health & Fitness (Apple category):** **No** — that category is the *user's own* health via
  HealthKit, which PawPi does not use. Pet health data is declared as **User Content**.
- **Diagnostics / Usage / Crash Data:** **None** (no analytics SDK).
- **Browsing History, Search History, Sensitive Info, Contacts:** **None.**

## Notes for the reviewer form
- Location is requested only for nearby features and the app works with location denied.
- The push-token "Device ID" is collected only if the user enables notifications, and is deleted when
  they disable notifications or delete their account.
- Keep this map in sync with `docs/legal/privacy-policy.md` §7 (subprocessors) and §2 (data collected)
  whenever data practices change.
