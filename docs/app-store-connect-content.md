# PawPi — App Store Connect content pack

Everything you paste into App Store Connect (ASC) on submission day, prepared in advance so the only
thing missing is the Apple Developer account + the EAS build. Values are finalized — the only items to
supply at submission are the demo-account email/password in §10. Character limits are Apple's; counts
below are within them.

> Companion docs: `docs/app-store-readiness.md` (the compliance pass) and `docs/legal/` (Privacy
> Policy + Terms). Set the hosted Privacy Policy URL here AND in `EXPO_PUBLIC_PRIVACY_POLICY_URL`.

---

## 1. App identity

| Field | Value | Limit |
|---|---|---|
| **App Name** | PawPi | ≤ 30 |
| **Subtitle** | Care, track, connect for dogs | ≤ 30 |
| **Bundle ID** | `com.pawpi.app` | — |
| **Primary language** | English (U.S.) | — |
| **Copyright** | © 2026 Augusto Traversa | — |
| **SKU** | PAWPI-IOS-001 | — |

Subtitle is 29 chars (the earlier "Your dog's whole world, in one app" was 34, over the ≤30 limit).

## 2. Category

**Primary: Lifestyle. No secondary category.**

- Lifestyle is the standard home for pet/owner apps and avoids over-signaling medical claims.
- A secondary category can be added later if discovery needs it (a Health/Medical secondary would help
  the health-tracking and vet-record features get found, at the cost of more Review scrutiny on
  diagnostic claims). Left off for v1.

## 3. Promotional text (≤ 170 chars, editable anytime without review)

> Track your dog's health, set smart reminders, share daily moments, and book trusted vets, groomers,
> walkers and more — all in one friendly app.

## 4. Description (≤ 4000 chars)

```
PawPi is the all-in-one app for dog owners — bringing your dog's health, daily life, and care into one warm, friendly place.

TRACK HEALTH, THE RIGHT WAY
Log weight, wellness checks, photos, medications and vaccinations. Keep a real vet record: medical profile, allergies, conditions, prescriptions, lab results and documents. PawPi helps you track changes and prepare better conversations with your veterinarian — it does not diagnose or replace professional veterinary care.

SMART REMINDERS & ROUTINES
Set up feeding, walks, photo checks, medical care, wellness checks and vet appointments. Each scheduled item is its own reminder, so nothing gets missed — and your "Today" view shows exactly what's due.

A SOCIAL FEED FOR YOUR DOG
Give your dog a profile, share daily moments, collect paws and barks, and make pet friends. Build a streak and celebrate birthdays and gotcha days.

COMMUNITY
Join the forum, find local events and meetups, walk with buddies nearby, and help reunite lost dogs with lost-and-found alerts.

EVERYTHING YOUR DOG NEEDS, BOOKABLE
Discover and book trusted providers — vets and telehealth, grooming, walking, daycare and boarding, sitting, training, transport, pharmacies and insurance — message them, pay securely, and leave reviews. Shop pet products and find dogs to adopt or foster.

FAMILY & CARE SHARING
Share your dog's care with family and caregivers, at the access level you choose, and revoke any time.

BUILT FOR PEACE OF MIND
A printable emergency medical card, account and data you fully control, and an in-app option to delete your account at any time.

PawPi is made for the everyday joys and responsibilities of dog ownership — beautifully simple, genuinely useful.

Health features in PawPi are for tracking and organization only and do not provide veterinary diagnosis or treatment. Always consult a licensed veterinarian.
```

*(Trim the provider list if you want only live capabilities highlighted at launch.)*

## 5. Keywords (≤ 100 chars total, comma-separated, no spaces)

```
dog,puppy,pet care,vet records,dog health,reminders,walker,groomer,adoption,dog community,pet
```

*(Don't repeat words already in the app name/subtitle; don't use competitor names or "app".)*

## 6. URLs

| Field | Value |
|---|---|
| **Support URL** (required) | https://pawpi.info/support — ⚠️ page must be LIVE before submission |
| **Marketing URL** (optional) | https://pawpi.info |
| **Privacy Policy URL** (required) | https://augustotraversa98-dot.github.io/pawpi-legal/privacy |

## 7. "What's New in This Version" (v1.0)

> Welcome to PawPi! The all-in-one app for dog owners — health tracking, smart reminders, a social
> feed for your dog, community, and a marketplace of trusted pet services. We'd love your feedback.

---

## 8. Age rating questionnaire — recommended answers

PawPi has user-generated content, social networking, and messaging, so it will land in a teen band.
**Recommended: answer the questionnaire honestly; expect roughly 13+.** Key answers:

- User-generated content / social: **Yes** (feed, forum, profiles, messaging, events).
- Unrestricted web access: **No** (the app doesn't ship an open in-app browser).
- Violence / sexual content / profanity / mature themes / gambling / drugs: **None**.
- Contests: **No**.

> ⚠️ **Guideline 1.2 (UGC) — confirm before submitting.** Because users post content and message each
> other, Apple requires the app to have: (1) a way to **filter** objectionable content, (2) a way to
> **report** offensive content, (3) the ability to **block** abusive users, and (4) **published
> contact** info so users can reach you. Verify each exists in the app (report + block on posts/
> profiles/messages; content moderation; support contact). If any is missing, that's a small build
> ticket to do **before** submission — flag it and I'll write the Claude Code prompt.

## 9. App Privacy ("nutrition labels") — what to declare

None of these are used for **Tracking**, and none for third-party advertising. The iOS privacy
manifest already declares `NSPrivacyTracking: false`. Declare the following as **collected** and
(unless noted) **linked to the user's identity**, used for **App Functionality**:

| Data type | Specifics | Purpose | Linked? |
|---|---|---|---|
| Contact Info | Email address, Name | App Functionality, Account | Yes |
| User Content | Photos or Videos; Other User Content (pet & health entries, posts, messages, reviews); Customer Support | App Functionality | Yes |
| Location | Precise Location | App Functionality (nearby features) — **not** tracking | Yes |
| Identifiers | User ID | App Functionality | Yes |
| Purchase History | Orders/bookings/transaction references | App Functionality | Yes |

Notes / decisions to confirm:

- **Financial info:** card/wallet credentials are handled by the payment processors, not stored by
  PawPi — so you generally declare **Purchase History** (what was bought), not Payment Info. Confirm
  with how your processors report back.
- **Diagnostics / Usage Data:** declare **NONE**. Verified: the `@sentry/react-native` import is a
  no-op shim that collects nothing, and there is no analytics SDK shipped — no Crash Data, no
  Performance Data, no Usage Data is collected.
- **Health:** pet health entries are treated as **User Content**, not Apple "Health & Fitness" (that
  category is for the *user's* own health data via HealthKit, which PawPi does not use).
- **Data deletion:** answer **Yes**, the app offers account deletion (Settings → Delete account).

## 10. App Review notes (paste into "Notes" for the reviewer)

```
DEMO ACCOUNT
Email: [demo email]
Password: [demo password]
(Pre-seeded with a sample dog, a few posts, and example reminders so all tabs are reviewable.)

PAYMENTS — EXTERNAL PAYMENT IS INTENTIONAL (Guideline 3.1.3(e))
Every paid flow is a real-world service or physical good (vet/telehealth consults, grooming, walking, daycare/boarding, sitting, training, transport, prescription fulfillment of physical medication, shop products, adoption fees, insurance premiums, donations). There is no digital-only content, in-app currency, or app-exclusive media sold. Payment is via external processors (MercadoPago / Binance Pay), permitted under 3.1.3(e). No IAP is used.

ACCOUNT DELETION (Guideline 5.1.1(v))
In-app: Settings → Delete account → two-step confirm → irreversibly deletes the account and the user's owned data.

LOCATION
Precise location is requested only for nearby features (places, walks, transport, events, adoption distance, lost-and-found). The app works with location denied.

SOCIAL LOGIN
"Continue with Apple / Google" are env-gated and may appear disabled ("Coming soon") in this build until OAuth keys are configured; email/password sign-in is fully functional. Sign in with Apple is implemented with parity to Google.

HEALTH POSITIONING (Guideline 1.4.1)
PawPi is a tracking/organization tool with non-diagnostic disclaimers throughout; it does not diagnose, prescribe, or replace veterinary care.

USER-GENERATED CONTENT (Guideline 1.2)
Every user-generated surface has a Report action; any user can be blocked. Objectionable content is reviewed and removed within 24h, and an on-submit content filter screens posts at creation time. Contact: augusto@pawpi.info.
```

## 11. Export compliance

`ITSAppUsesNonExemptEncryption: false` is already set in `app.json`, so the encryption question should
auto-resolve. Confirm at upload.

## 12. Screenshots & assets (needs the EAS build — plan now, capture later)

v1 is **iPhone-only** (`ios.supportsTablet: false` in `app.json`), so **no iPad screenshots are
required**. Required (App Store): **iPhone 6.9"/6.7"** screenshots (1290×2796 / 1284×2778). 3–10
screenshots per size; an optional app preview video.

Plan the 6–8 hero screens now so capture is fast once there's a build:
1. Dog social profile + daily moments
2. Health → Today (reminders due)
3. Vet Record
4. Feed with a daily moment
5. Services discovery / booking
6. Community (forum / events / walks)
7. Adoption browse
8. Emergency medical card

App icon + splash are already in `app.json`. Decide on optional localized (Spanish) screenshots — the
app already supports EN/ES.

---

_Prepared as part of the pre-Apple-approval readiness work. Update counts if you change copy._
