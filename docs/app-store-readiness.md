# App Store readiness — PawPi (ticket 2.78)

Pre-submission hardening pass measured against **Apple's App Store Review Guidelines** (re-read live,
June 2026). This file is the handoff: **FIXED** (done in code), **FLAGGED** (policy/legal — Tats decides),
and the **ACCOUNT-GATED CHECKLIST** (needs the Apple Developer account / EAS build).

The actual archive + upload needs the Apple Developer account + an EAS build — this pass makes the
**code + config** submission-ready and documents the rest.

---

## ✅ FIXED (in code)

| Area | Guideline | What changed |
|---|---|---|
| iOS permission strings | 5.1.1, 5.1.5, 2.5.14 | Added honest `NS*UsageDescription` for every permission the app actually uses — `NSLocationWhenInUseUsageDescription` (places/walks/transport/events + live pet-taxi GPS), `NSCameraUsageDescription` (pet photos / health checks / posts), `NSPhotoLibraryUsageDescription` + `NSPhotoLibraryAddUsageDescription` (uploads + saving the share frame), `NSMicrophoneUsageDescription` (telehealth video). No permission is declared that the app doesn't use; **no ATT / `NSUserTrackingUsageDescription`** (the app does not track users across apps). `anything/apps/mobile/app.json`. |
| iOS Privacy Manifest | 5.1.1 / 5.1.2 | Added `ios.privacyManifests` → `NSPrivacyTracking: false`, empty tracking domains, and the **required-reason API** declarations the app + its Expo libs use (UserDefaults `CA92.1`, file timestamp `C617.1`, system boot time `35F9.1`, disk space `E174.1`). `app.json`. |
| App identity / metadata | 2.1 | Set app `name` → **PawPi**, `slug` → `pawpi`, `ios.bundleIdentifier` → `com.pawpi.app` (**placeholder — confirm the real ID once the Apple account exists**, see below), `ios.buildNumber` → `1`, android `package` → `com.pawpi.app`. Icon, splash, portrait orientation already present. `app.json`. |
| iPhone-only (v1) | 2.1 | Set `ios.supportsTablet` → **false** — v1 ships **iPhone-only**. Only iPhone 6.9"/6.7" screenshots are required at submission; no iPad assets needed. `app.json`. |
| ASC content pack | 2.1 / 2.3 | `docs/app-store-connect-content.md` **finalized** — all confirmed values filled (name, subtitle "Care, track, connect for dogs" ≤30, bundle ID, primary language, copyright, SKU, URLs, category, App Privacy, UGC review note). Only the demo-account email/password remain as fill-at-submission. |
| Debug surface removed | 2.3.1 | Removed the `wrongPets` owner-id **debug query + console spam** from `GET /api/pets` (flagged in `docs/test-backlog.md`); the handler is now a clean owner-scoped read. `anything/apps/web/src/app/api/pets/route.js`. |
| Privacy / Terms links in-app | 5.1.1 | Added a config slot (`src/constants/legal.js`, `EXPO_PUBLIC_PRIVACY_POLICY_URL` / `EXPO_PUBLIC_TERMS_URL`) and wired the welcome-screen "Terms & Privacy Policy" line to open them when set (degrades cleanly to plain text until the URLs are supplied). `anything/apps/mobile/src/app/welcome.jsx`. **LIVE (2026-06-28):** docs finalized + hosted; the URL env vars are now set (mobile `EXPO_PUBLIC_*`, web `NEXT_PUBLIC_*`), so the links are no longer no-ops. See FLAGGED #2 for the live URLs. |
| Placeholder / no-op buttons removed | 2.1 / 2.3.1 | Wired two "coming soon" no-ops to real functionality: the **Weight-entry delete** button now calls a new owner-scoped `DELETE /api/health/weight-logs?id=` (with a destructive confirm); the **Change Photo** button on Profile Edit now opens the image picker and feeds the existing upload-on-save path (it was an `Alert("coming soon")`). `WeightModal.jsx`, `profile-edit.jsx`, `api/health/weight-logs/route.js`. |
| In-app account deletion | 5.1.1(v) | **Added** (migration 0062 + `DELETE /api/account`): Settings → "Delete account" → two-step destructive confirm → `delete_my_account()` SECURITY DEFINER irreversibly deletes the caller's account + all owner-scoped data (auth→profile→pets→data cascade; the no-cascade `health_medical_care_logs` is cleared first), then the client clears its session and returns to welcome. Self-only (keys off `current_app_user_id()`); harness-proven (FK-clean cascade + another account untouched). Distinct from "Reset App Data" (local logout). |

### Verified already-compliant (no change needed)
- **Sign in with Apple parity (4.8 / 5.1.1).** `SocialSignInButtons.jsx` renders **both** Apple and Google,
  symmetric env-gating (`oauthProviders.js`), shown together — Apple is never hidden when Google shows.
  Both stay "Coming soon" until OAuth keys are set (fine pre-launch; the compliance structure is correct).
- **Medical positioning (1.4.1).** Non-diagnostic disclaimers ("does not diagnose / prescribe / replace
  veterinary care") are present on Health Insights, General/Photo checks, Vet Summary, Emergency Card,
  Prescriptions, and the new Nutrition screen.
- **No user-facing debug output.** Remaining `console.*` calls are server-side logs only — never echoed
  to clients.

---

## 🚩 FLAGGED (policy / legal — Tats decides; not auto-changed)

1. **Payments mapping (Guideline 3.1).** Every paid flow is a **real-world service or physical good**, so
   external payment (MercadoPago / Binance) is permitted under 3.1.3(e) — **no IAP required**:
   - Services consumed outside the app: vet, telehealth (a real consult), grooming, walking, daycare/boarding,
     sitting, training, transport, Rx fulfillment (dispensing a physical medication).
   - Physical goods: shop products.
   - Other real-world: adoption fees, insurance premiums (a financial product, insurer is party-of-record), donations.
   - **No digital-only content** (no premium-feature unlock, in-app currency, or app-exclusive media) is sold
     via external payment. ✅ Reads compliant. **Action:** confirm this mapping is still accurate at submission
     and that App Review notes describe the external-payment model.
2. **Privacy Policy + Terms URLs (required for submission). ✅ RESOLVED (2026-06-28).** Both docs are
   finalized (all placeholders filled; effective + last-updated **June 22, 2026**, matching the
   `2026-06-22` consent version) and **hosted live** at:
   - Privacy Policy: **https://augustotraversa98-dot.github.io/pawpi-legal/privacy**
   - Terms of Service: **https://augustotraversa98-dot.github.io/pawpi-legal/terms**

   Served from the public repo `augustotraversa98-dot/pawpi-legal` via GitHub Pages (both return HTTP 200).
   The in-app URL env vars are set — mobile `EXPO_PUBLIC_PRIVACY_POLICY_URL`/`EXPO_PUBLIC_TERMS_URL`,
   web `NEXT_PUBLIC_PRIVACY_POLICY_URL`/`NEXT_PUBLIC_TERMS_URL` (in the gitignored `.env` files). **Still
   account-gated:** set the Privacy Policy URL in the App Store Connect metadata at submission (see the
   account-gated checklist below).
3. **`com.pawpi.app` bundle identifier is a placeholder.** Confirm/replace with the real registered App ID.
4. **`PATCH /api/pets` repair handler.** A historical owner-id repair endpoint (`pets/route.js`), still
   invoked best-effort by `usePetProfile.js`. Not user-facing and harmless, but it is debug/maintenance
   code — consider retiring it in a later cleanup once the data is confirmed clean (left in place to avoid
   regressing the repair call).
5. **App display name / branding.** Set to "PawPi" — confirm the final App Store name + subtitle.

---

## ☑️ ACCOUNT-GATED SUBMISSION CHECKLIST (needs the Apple Developer account / EAS / App Store Connect)

In rough order:

1. **Apple Developer Program** enrollment; register the real **App ID / bundle identifier** + capabilities
   (Sign in with Apple, Push Notifications, Maps, associated domains if any).
2. **Signing & provisioning** (distribution cert + provisioning profile) — via EAS managed credentials.
3. **App Store Connect app record:** name, subtitle, primary category (**Lifestyle**, no secondary), age
   rating. Values are finalized in `docs/app-store-connect-content.md` — paste from there.
4. **Privacy "nutrition labels"** in App Store Connect — declare the data collected (account email/name,
   pet/health content the owner enters, precise location for nearby features, photos, payment handled by the
   processors) and link the **Privacy Policy URL** (live: https://augustotraversa98-dot.github.io/pawpi-legal/privacy).
5. **Sign in with Apple** service key + the OAuth env keys (`AUTH_APPLE_ID/SECRET`, `AUTH_GOOGLE_ID/SECRET`)
   so the buttons go live (2.46).
6. **Go-live backend env keys** (see `docs/test-backlog.md`): payment rails (MercadoPago/Binance),
   `GOOGLE_PLACES_API_KEY` (places 2.73), `CRON_SECRET` + an external scheduler (subscriptions 2.17 +
   food-recall ingest 2.75), `AUTH_*`. Each feature degrades cleanly until its key is set.
7. **Pending Supabase migrations** `0056–0061` (Wave 7) hand-applied (`docs/test-backlog.md` ACTION 1).
8. **EAS build** (production profile) → **TestFlight** → screenshots (**iPhone 6.9"/6.7" only — iPhone-only
   v1, no iPad**) → **export compliance** (`ITSAppUsesNonExemptEncryption: false` already set) → submit for
   review.
9. **App Review notes:** a demo account + a note that paid services are real-world (external payment per
   3.1.3(e)), and how to reach the new account-deletion flow.

---

_Last updated: 2026-06-28 — iPhone-only v1 (`supportsTablet: false`), Privacy Policy URL live, ASC content
pack finalized. (Originally ticket 2.78, 2026-06-19.) Tests (web vitest + mobile jest + integration RLS)
green at write._
