# PawPi — Phase 2 Master Plan: the Pet Owner Super-App (services, marketplace, payments, adoption)

Status: PLAN (Tats + Cowork, Jun 2026). This is the strategic blueprint for Phase 2 — turning the
finished provider/vet spine into a full super-app of pet services. It is a planning doc, not a ticket;
the sequenced roadmap at the end breaks it into the usual one-prompt-per-branch tickets.

---

## 0. Where we are (the foundation Phase 2 builds on — already shipped)

- **Unified provider spine** (one `providers` entity, `provider_staff` membership, `provider_type`
  drives type-specific modules): onboarding/profile/publish, services, locations, staff (+ invite/
  accept), discovery (`/discover`, `/public/[slug]`), booking (extends `vet_appointments`), and the
  consent system (`care_access_grants` + `assertCareAccess` + audit).
- **Vet = built end-to-end**, owner + provider sides (owner discover/book/grant on mobile; provider
  web dashboard: bookings inbox, profile/services/locations/staff, clinical read/write).
- **`provider_reviews` table exists** (reviews not yet surfaced).
- **RLS is LIVE** — every data table is owner/consent/membership-scoped at the database level, proven
  via the real-Postgres harness. **Every new Phase-2 table must ship with RLS policies + harness
  proofs from the start** (no more retro-RLS).
- **Workflow** (keep): one prompt = one fresh branch off `origin/main`; web-first API + vitest, plus
  the real-Postgres integration harness for RLS; squash-merge; migrations hand-applied to Supabase;
  two-suite canary (`npm test` + `npm run test:integration`).

The big idea: **most services are the *same spine* with a different `provider_type` + a type-specific
module.** We are not building 8 apps; we are adding modules + a few cross-cutting systems (payments,
chat, reviews, generalized booking) and surfacing it all.

---

## 1. The full service catalog (everything a pet owner needs)

Each is a `provider_type` on the spine unless noted. "Module" = the type-specific part beyond the
shared onboarding/profile/services/locations/staff/discovery/booking.

| Service | provider_type | Owner-facing | Type-specific module |
|---|---|---|---|
| **Veterinary** ✅ done | `vet` | discover, book, grant record access, see notes/vax | clinical read/write (notes, vaccinations, Rx, labs), telehealth (later) |
| **Grooming** | `groomer` | book service (bath/cut/spa), see before/after | service menu w/ duration+price, before/after photos → pet profile, coat/skin notes → health logs, recurring cycles |
| **Dog walking** | `walker` | book (scheduled or on-demand), live track, get report | **GPS live walk tracking**, check-in/out, walk report → health logs, recurring/pack walks |
| **Daycare / Boarding** | `daycare` | book stay, send feeding/med instructions, get daily cards | capacity/occupancy calendar, check-in/out, **daily report cards** (photos/video), **vaccine-requirement verification (reads `pet_vaccinations`)** |
| **Pet sitting** (in-home) | `sitter` | book drop-in / overnight / house-sit | visit logs, photo/video updates, meet-and-greet |
| **Training** | `trainer` | book classes/1:1, follow a program | sessions/programs, progress notes, group classes, video lessons |
| **Shop / Store** | `shop` | browse, buy, **subscribe/auto-reorder** | product catalog + inventory, orders, subscriptions (food), Rx products (vet-linked), delivery, loyalty |
| **Adoption** | `adoption` | browse "adoption places", view their dogs, apply, pay fee, donate | the **"adoption place"** org + its **adoptable animals shown in the existing dog-profile format**, application workflow, adoption-fee + donations, foster (later) |
| **Pet taxi / transport** | `transport` | book a ride (to vet/groomer/airport) | scheduled rides, pickup/dropoff, live status |
| **Pharmacy / Rx fulfillment** | `pharmacy` | order meds (vet-prescribed) | Rx validation against vet records (consent), refills |

**Super-app extras worth tracking (later / partner-based):** pet insurance marketplace (quotes/
policies), lost & found + microchip alerts, pet-friendly places directory (parks/cafes/hotels),
events & meetups, nutrition/diet plans, memorial/cremation services. None block the core; they slot
onto the same discovery+profile patterns when wanted.

---

## 2. Cross-cutting systems (shared by every service — build once, reuse everywhere)

These are the high-leverage builds. Most services are cheap once these exist.

1. **Payments & wallet** (§3) — MercadoPago + Binance. Powers booking deposits, service fees, product
   orders, subscriptions, adoption fees, donations, payouts to providers.
2. **Generalized booking & calendar** — today booking is `vet_appointments` (named as a forward-
   compatible subset of a future cross-type booking). Generalize to serve walks/grooming/daycare/etc.
   (service + slot + status + assigned staff), with 2-way calendar sync and recurring bookings.
3. **Reviews & ratings** — surface the existing `provider_reviews`: write a review after a completed
   booking/order; show aggregate rating on discovery + profiles. (Anti-abuse: one review per completed
   booking.)
4. **Chat / messaging** — owner ↔ provider threads (booking-scoped). Needed by nearly every service
   (walkers, sitters, adoption, etc.). New tables, RLS participant-scoped.
5. **Discovery & search** — extend `/discover` with `?type=`, location/distance, rating, price,
   availability filters; maps view (the web app already has `@vis.gl/react-google-maps`).
6. **Dashboards & analytics** — provider: bookings, revenue, reviews, occupancy (recharts is already a
   web dep); owner: a unified "my orders / bookings / who-has-access" hub.
7. **Notifications** — booking/order status, report cards, walk-finished, subscription renewals,
   adoption-application updates (reuses the existing reminder/notification engine patterns).
8. **Media** — report cards / before-after / walk photos reuse the existing Supabase Storage upload
   path; before/after + walk media can flow into the pet's health/profile timeline.

---

## 3. Payments architecture (MercadoPago + Binance) — "ready for you to integrate"

**Goal you set:** scaffold everything so you only do the account/key setup + flip on the integrations.
Region context (Supabase `sa-east-1`, MercadoPago) = LATAM-first.

**Model = marketplace with split payments.** Owner pays; the platform takes a commission; the provider
receives the rest. Two rails:

- **MercadoPago (primary, fiat)** — use **Split Payments / marketplace**: each provider connects their
  own MP account via **OAuth**; the owner pays through **Checkout** (Pro or API/Bricks); MP **splits**
  the amount between provider and platform automatically and deducts commission; **webhooks** confirm
  status; supports refunds and booking deposits. (There's even an official MP + Claude Code marketplace
  plugin and CLI/sandbox to speed this up.)
- **Binance Pay (secondary, crypto)** — merchant API issues a **QR / deeplink**, customer pays in 50+
  cryptos, merchant settles in **USDT**; **Payout API** for mass payouts to providers. Crypto has no
  native marketplace-split, so model it as **owner → platform merchant**, then **payout → provider**
  via the Payout API (or platform-only services first).

**What I'll SCAFFOLD (so integration = plug in keys):**
- **DB (all RLS'd):** `payments`, `orders`/`order_items`, `payouts`, `provider_payment_accounts`
  (the per-provider MP OAuth tokens / Binance handle), `transactions`/ledger, `subscriptions`.
- **A provider-agnostic payment layer**: `createCheckout()`, `handleWebhook()`, `getStatus()`,
  `refund()`, `payout()` — with **MercadoPago and Binance adapters** behind env keys, so a new service
  just calls the layer.
- **Provider onboarding hooks**: the MP **OAuth "connect your account"** flow (UI + token storage);
  Binance merchant handle capture.
- **Server routes + signed webhook endpoints** (signature verification), idempotency keys, status
  reconciliation.
- **Tests**: vitest for the layer/routes (mocked), integration tests for the RLS on the money tables.

**What YOU do (the actual integration):** create the MercadoPago marketplace app (get OAuth client
id/secret) + a Binance Pay merchant account (API key/secret), register redirect/webhook URLs, set the
env vars, and complete each provider's OAuth connect. Sandbox first, then live keys.

**Where payments plug in:** booking deposits/fees (every service), shop orders + subscriptions,
adoption fees + donations, telehealth/Rx. Commission % is a platform config.

---

## 4. The adoption model ("adoption place" + its dogs)

This is a first-class part of the super-app and maps cleanly:

- **The "adoption place"** = a provider of `provider_type = 'adoption'` (shelter/rescue/foster org).
  Reuses provider onboarding/profile/locations/staff exactly — so a shelter gets the same profile +
  dashboard machinery.
- **Their adoptable dogs** = listed **in the existing dog-profile format** (the "super nice" format you
  already have). Implementation: adoptable animals are pet records owned by the shelter provider with
  an `adoption_status` (available/pending/adopted) + adoption fields (fee, story, good-with-kids/cats,
  energy, vaccination status — which can read `pet_vaccinations`). Reuse the dog-profile UI to render
  them, so the shelter "places all their dogs in the format it currently is."
- **Owner adoption flow:** discover adoption places → browse their dogs (dog-profile cards) → favorite
  → **apply** (application form) → **chat** with the shelter → pay **adoption fee** (payments) →
  approved → the pet record transfers/creates under the adopter. **Donations** to a place = a payment.
- Later: foster workflow, application review dashboard for shelters, multi-photo/video, "urgent" flags.

This makes PawPi a place where shelters list, owners discover and adopt end-to-end, and the adopted
dog flows straight into the owner's normal pet experience (health, social, services).

---

## 5. Data-model strategy (reuse the spine; RLS from day one)

- **New provider types**: no schema change needed for the entity — `provider_type` is the switch.
  Type-specific data goes in **per-type module tables** (e.g. `walk_sessions`, `daycare_stays`,
  `report_cards`, `shop_products`, `shop_orders`, `adoptable_pets`/pet-extension, `payments`...).
- **Booking**: generalize `vet_appointments` → a cross-type booking (or per-type tables sharing the
  booking columns already added). Decide in the booking-generalization ticket.
- **RLS, every new table, every ticket**: owner-scoped, provider-staff-scoped, or consent-scoped as
  appropriate; proven in the harness with as-`pawpi_app` zero-rows tests; covered by the completeness
  guard (the meta-test that fails if a public table is RLS-on-without-a-policy or unclassified).
- **Money tables** are the most sensitive → strict owner/provider scoping + audit.

---

## 6. Sequenced roadmap (the build order; each = its own ticket/branch)

Principle: **surface what's live first**, then build the **cross-cutting unlocks** (payments, reviews,
chat, generalized booking) that make every subsequent service cheap, then roll out service types, then
shop/adoption, then feed + dashboards. Only feature provider types in nav once they're live.

**2.0 — Surface Pet Services in nav (FIRST — ticket written).** Promote "Pet Services" to a quick-
access spot; move Community into More; feature only live types (Veterinary now). Makes the built vet
loop reachable.

**2.1 — Reviews surfacing (small, high-trust).** Write-after-completed-booking + show ratings on
discovery/profiles. (Independent, quick, uses existing `provider_reviews`.)

**2.2 — Payments foundation (big, cross-cutting unlock).** The §3 scaffold: money tables + RLS +
payment layer + MercadoPago split adapter + Binance adapter (key-stubbed) + provider OAuth connect +
webhooks. Everything monetizable depends on this, so do it early.

**2.3 — Generalized booking + calendar.** Booking usable by all service types; recurring; 2-way sync.

**2.4 — Chat / messaging.** Owner ↔ provider, booking-scoped. Unblocks walkers/sitters/adoption.

**2.5 — Service-type rollout (one ticket each, in this rough order):**
   Groomer → Walker (GPS) → Daycare/Boarding (check-in/capacity/report cards/vaccine-check) →
   Sitter → Trainer. Each = onboarding type module + discovery surfacing + booking + the type module +
   payments wired.

**2.6 — Shop / e-commerce.** Catalog/inventory/orders + product payments + subscriptions/auto-reorder.

**2.7 — Adoption.** `adoption` provider type + adoptable-dog listings (dog-profile format) +
application workflow + fee/donation payments + (later) foster.

**2.8 — Feed integration.** Surface businesses/services in the social feed for organic discovery.

**2.9 — Dashboards & analytics.** Provider revenue/bookings/reviews/occupancy; owner orders/bookings
hub.

(Discovery filters, maps, and notifications are folded into the relevant tickets as each service ships.
Telehealth, insurance, lost&found, places-directory, etc. are post-core add-ons.)

---

## 7. Build conventions (carry over from Phase 1)

- One prompt = one fresh branch off `origin/main`; squash-merge; migrations hand-applied to Supabase.
- Web-first API + vitest; **RLS policies + real-Postgres harness proofs for every new table**; the
  completeness guard keeps the RLS invariant.
- Reuse the provider spine, the consent system, Supabase Storage uploads, the notification engine, and
  the web dashboard shell (Chakra/Tailwind/React-Query/React-Table/recharts) + the mobile patterns.
- Two-suite canary every ticket; confirm `origin/main` before the next.

---

## Sources (research, Jun 2026)
- Rover/Wag/Tails pet-care app feature comparisons — booking, GPS walk tracking, messaging, report
  cards, photo/video updates, marketplace model: https://trytails.com/guides/finding-care/best-dog-walking-apps/ , https://trytails.com/guides/hiring-pet-care/best-pet-sitting-apps/ , https://www.petcareins.com/blog/wag-vs-rover-review
- MercadoPago Split Payments / marketplace + Checkout + OAuth-per-seller + webhooks:
  https://www.mercadopago.com.mx/developers/en/docs/split-payments/landing , https://www.mercadopago.com.ar/developers/en/docs/split-payments/integration-configuration/integrate-marketplace
- Binance Pay merchant API (QR/deeplink, 50+ cryptos, settle USDT, Payout API):
  https://merchant.binance.com/en/products/payment-apis , https://developers.binance.com/docs/binance-pay/introduction
- Pet adoption platform models (shelter listings, adoptable profiles, application→contract→fee
  workflow, chat/filters): https://ideausher.com/blog/developing-pet-adoption-app/ , https://www.adopets.com/ , https://petstablished.com/
