# PawPi Payments — "Not Charging" Diagnosis

Branch: `fix/payments-charging` · Date: 2026-08-02 · Base: `main` @ `214256e`

**One-line answer:** The payment code is well-built and does **not** fake-mark anything paid.
Money isn't moving because of a **configuration/onboarding chain** (each provider must OAuth-connect
their MercadoPago account) **plus one real, go-live-blocking code gap** (the checkout preference
never told MercadoPago where to send the payment webhook, so even a real payment would never
reconcile to `paid`). Booking not charging by default is **intended** (pay-at-clinic). I fixed the
webhook gap and three "false success" UX bugs; everything requiring account/credential changes is
left for you to do in the MercadoPago dashboard.

---

## TL;DR verdicts

| Path | Charges today? | Verdict | Why |
|---|---|---|---|
| **Shop checkout** | No real charge | **TEST-ENV / CONFIG-EXPECTED** + 1 UX bug (fixed) | Order stays `pending`; only a signed webhook flips it to `paid`. No premature "paid". Blocked by provider-not-connected and/or webhook-not-wired. |
| **Appointment booking** | No, when service is `payment_policy='none'` | **BY DESIGN (not a bug)** — pay-at-clinic default | Booking route never charges. Online charge only fires when a service is set to `deposit`/`full` **and** the provider is MP-connected. |
| **Webhook reconciliation** | Would not fire | **REAL BUG (fixed, P0 for go-live)** | `createCheckout` set no `notification_url`; MP had no per-preference callback. |

**Nothing is ever marked paid without a signature-verified webhook.** That part is correct and safe.

---

## A. SHOP CHECKOUT — exact flow

**Mobile CTA** → `anything/apps/mobile/src/components/Providers/StorefrontCatalog.jsx:81` `doCheckout()`
→ POST via `useShopCheckout` (`anything/apps/mobile/src/hooks/useProviders.js:1003`).

**Web** → `anything/apps/web/src/app/api/pets/[id]/shop-checkout/route.js`
- Validates ownership, `shop` capability, stock, Rx gate.
- Inserts the order **`status='pending'`** — `route.js:149-156`.
- Calls the shared `createCheckout` — `route.js:169`.
- Returns `{ order, payment, checkoutUrl, deeplink, qrContent }` — `route.js:171-180`.
- Provider not connected → `PaymentsNotConfiguredError` → clean **503** — `route.js:182-184`.

**Shared layer** → `anything/apps/web/src/app/api/utils/payments/index.js:77` `createCheckout()`
- Loads the provider's connected MP account (`index.js:83`), calls the adapter, inserts a
  **`pending`** `payments` row (`index.js:91-100`), returns `checkoutUrl` = the MP `init_point`.

**Adapter** → `anything/apps/web/src/app/api/utils/payments/mercadopago.js:77` `createCheckout()`
- Throws `PaymentsNotConfiguredError` if the provider has **no `access_token`** — `mercadopago.js:80-83`.
- Otherwise POSTs a real split-payment preference to `api.mercadopago.com/checkout/preferences`
  and returns `data.init_point ?? data.sandbox_init_point` — `mercadopago.js:108-113`.

### Does the app actually send the user to pay?
Yes — when a `checkoutUrl` is returned, mobile opens it with `Linking.openURL` (system browser).
**But** the old code announced **"Order placed"** in *both* branches, including when `checkoutUrl`
was `null` — telling the buyer their order was "on its way" while no payment window ever opened and
nothing was charged. (Fixed — see below.)

### Where is the order marked `paid`?
**Only** in `applyPaymentStatus` (`index.js:257-290`), reached **only** from `handleWebhook`
(`index.js:150`), `getStatus` reconciliation (`index.js:173`), and `refund` (`index.js:189`).
`approved → orders.status='paid'`. **No premature paid-on-creation anywhere.** Stock is decremented
only on the real `pending→paid` transition (`index.js:283-284`). ✅ Correct.

### Webhook / IPN
Endpoint exists: `anything/apps/web/src/app/api/payments/webhooks/mercadopago/route.js` (unauthenticated,
signature-gated). `handleWebhook` verifies the HMAC `x-signature` (`mercadopago.js:120-139`), maps status,
finds the payment by `external_id`, flips payment + order idempotently. ✅ Correct — **but MercadoPago
was never told to call it** (Gap 1 below).

---

## B. APPOINTMENT BOOKING — exact flow

**Mobile** → `anything/apps/mobile/src/components/Providers/BookingFormModal.jsx:142` `handleConfirm()`
- `requiresPayment = payment_policy !== 'none' && chargeCents > 0` — `BookingFormModal.jsx:120-128`.
- If paid: `checkout.mutateAsync()` first (`:184`) → then `book.mutateAsync({ order_id })` (`:192`) →
  `Linking.openURL(checkoutUrl)` (`:219`).
- If `payment_policy='none'`: books and shows **"Request sent!"** — no charge (`:220-225`).

**Web** → `anything/apps/web/src/app/api/providers/[id]/book/route.js`
- **Contains no MercadoPago call at all.** It only inserts `vet_appointments`
  (`booking_status='requested'`, `status='scheduled'`) — `book.jsx:256-303` — and *validates* an
  optional `order_id` belongs to the owner (`:231-244`). The charge, when required, is created
  separately by the client via `/api/payments/checkout`.

### Do appointments carry a price, and is a charge wired?
Price lives on the **service** (`price_cents`, `deposit_cents`, `payment_policy`), not the appointment.
Payment is wired **only client-side** and **only** when the chosen service is `deposit`/`full`. The
appointment row is **never** marked `paid`; only the linked order is. A provider **manually** confirms
the booking, independent of payment (`providers/[id]/bookings/[appointmentId]/route.js`). Declining
auto-refunds any approved payment (`:153-169`).

### Is booking-without-charge a bug?
**No.** `payment_policy='none'` = "No online payment — pay in person" is the **server default**
(`providers/[id]/services/route.js:106`; UI `provider/components/ProviderServices.jsx:434-437`). If the
founder's test service is left at the default, a free booking is the **intended** behavior.

> **Product decision for the founder:** Do you want vet/grooming/etc. bookings to charge (a deposit)
> online, or stay pay-at-clinic? **Recommended:** keep `none` as the default (lower friction, avoids
> refund overhead), and turn on `deposit` per-service only for no-show-prone services. To charge, set
> the service's `payment_policy` to `deposit`/`full` **and** connect the provider's MP account.

---

## C. ENVIRONMENT / CONFIG

**Config reader:** `anything/apps/web/src/app/api/utils/payments/config.js:43` — requires
`MP_CLIENT_ID` + `MP_CLIENT_SECRET` + `MP_WEBHOOK_SECRET`; missing any → `null` → 503 (never a crash).

**Railway production (verified 2026-08-02, names present):** `MP_CLIENT_ID`, `MP_CLIENT_SECRET`,
`MP_WEBHOOK_SECRET`, `MP_REDIRECT_URI`, `PAYMENTS_TOKEN_KEY`, `APP_BASE_URL` are **all set**.
→ The platform-level "payments not configured" 503 is **NOT** the blocker.

**There is no `MP_ACCESS_TOKEN` in the codebase** — this is a **marketplace / split-payment** model.
Every charge is created with **each provider's own OAuth access token**, stored (AES-256-GCM encrypted)
in `provider_payment_accounts` after the provider completes OAuth connect. So platform keys being set
is **necessary but not sufficient**: **each selling provider must OAuth-connect** or their checkout 503s.

**Sandbox vs prod:** No explicit sandbox flag. Whether money is real depends entirely on the *type of
token the provider connected* (`init_point` for live, `sandbox_init_point` fallback —
`mercadopago.js:111`). No hardcoded `TEST-`/`APP_USR-` tokens anywhere.

**"Pay unavailable" fallbacks** (from the audit): triggered only on the checkout route's **503**, in two
screens — `anything/apps/mobile/src/app/rx-fulfillment.jsx:107-110` (`rxf.payUnavailable`) and
`anything/apps/mobile/src/app/insurance-policy.jsx:100-103` (`ins.payUnavailable`). These are honest
("you can pay once payments are set up"). The booking modal has no such branch — it shows "Couldn't book".

### Test-env vs bug — the evidence
- **Money not moving = mostly TEST-ENV / CONFIG-EXPECTED.** Platform keys are present, so a checkout
  either (a) 503s because the *provider* hasn't connected, or (b) runs against a sandbox/test provider
  token = no real money. Neither is a code defect.
- **But one genuine code bug (Gap 1) means even a real, completed payment would never be recorded as
  `paid`** — because MercadoPago had no webhook target. That is a real go-live blocker, now fixed.

---

## D. WEBHOOK & RECONCILIATION

- Signature verified (HMAC-SHA256, timing-safe) before any state change — `mercadopago.js:120-139`. ✅
- Idempotent, transition-guarded status + stock reconciliation — `index.js:257-290`. ✅
- Failure/cancel → `mapStatus` returns `failed`/`pending`; order does **not** complete. ✅
- Missed-webhook safety net (`getStatus`) exists but **nothing calls it automatically** (no reconcile cron).
- **Gap 1 (was):** the checkout preference set **no `notification_url`**, so MP would only call the webhook
  if a URL was hand-registered in the MP dashboard. → **Fixed in code.**

---

## Order / payment status lifecycle

```
                 owner taps Pay/Book(paid)
                          │
                          ▼
        orders.status = 'pending'  ◄── created here (shop-checkout:153 / payments/checkout / daycare)
        payments.status = 'pending' ◄── createCheckout (index.js:96)
                          │
                 user pays at MercadoPago (external browser)
                          │
             MercadoPago → POST /api/payments/webhooks/mercadopago
                          │  (signature verified — index.js:123-135)
             ┌────────────┼───────────────────────────┐
     approved│      refunded/charged_back│      rejected/cancelled│
             ▼            ▼                            ▼
   orders.status='paid'  orders.status='refunded'   orders.status='failed'
   (+ stock −1)          (+ stock +1)               (order NOT completed)
             │
   vet_appointments.booking_status stays 'requested' until the PROVIDER manually confirms
   (payment success does NOT auto-confirm the appointment; it only sets a joined `paid` flag)
```

No premature/`paid` write exists on any path. ✅

---

## What I fixed on this branch (safe, additive, tested)

### Fix 1 — Wire the MercadoPago webhook (`notification_url`) · **P0 · low risk**
`anything/apps/web/src/app/api/utils/payments/mercadopago.js`
- `createCheckout` now adds `notification_url = <APP_BASE_URL>/api/payments/webhooks/mercadopago` to the
  preference, **only when `APP_BASE_URL` is a public `https` URL** (new `webhookUrl()` helper). Localhost/unset
  → omitted, so tests/local and preference creation are unaffected. This is the missing wire that lets a real
  payment actually reconcile to `paid`. It cannot cause a charge that wouldn't otherwise happen — it only tells
  MP where to report status.
- Tests: `mercadopago.test.js` — asserts the URL is built/stripped correctly, included with a public base,
  and omitted otherwise.

### Fix 2 — Shop checkout must not fake success · **P1 · low risk**
`anything/apps/mobile/src/components/Providers/StorefrontCatalog.jsx`
- With a `checkoutUrl`: opens MP and says **"Complete your payment"** (was the misleading "Order placed").
- With **no** `checkoutUrl`: shows **"Payment couldn't start … nothing was charged"** and keeps the cart open
  (was falsely "Order placed / on its way"). Tests added in `StorefrontCatalog.test.jsx`.

### Fix 3 — Booking must not label an unpaid required-payment as "Request sent!" · **P1 · low risk**
`anything/apps/mobile/src/components/Providers/BookingFormModal.jsx`
- New branch: `requiresPayment && !checkoutUrl` → **"Payment couldn't start … nothing was charged"** instead of
  the free-booking "Request sent!". Test added in `BookingFormModal.test.jsx`.

**Verification:** web `vitest run` **1484 passed** (+ my new MP tests); web `react-router build` ✅;
`tsc` baseline unchanged (124 pre-existing `TS7016` route-type errors, **0 new**, none in my files); mobile
`jest` for the touched suites — StorefrontCatalog 10 ✅, BookingFormModal 16 ✅, provider/storefront 14 ✅.
No live charge was run (that's your E2E).

---

## What I deliberately did NOT change (PROPOSE only)

1. **Daycare silently swallows checkout errors** — `anything/apps/web/src/app/api/pets/[id]/daycare-stays/route.js:321-324`
   catches `createCheckout` failures and returns the stay with `checkoutUrl:null` (unpaid, no error). Same
   "silent unpaid" class, but the comment says it's intentional and changing it could break the daycare flow.
   **Recommendation:** decide whether daycare should hard-fail like shop, or surface a "pay later" state; then
   apply the same honest-copy treatment on the mobile daycare screen. Needs product sign-off → not touched.
2. **`back_urls` / auto-return + deep-link** — the preference has no post-payment return URL, so after paying in
   the system browser nothing brings the user back into the app (settlement relies solely on the webhook).
   Adding this needs a decision on the return page / app deep-link scheme → **PROPOSE**, see plan.
3. **Auto-reconcile cron** calling `getStatus` for stuck `pending` payments (webhook-miss safety net) → **PROPOSE**.
4. Anything touching **credentials, test→prod, or the MP account** → out of scope by policy.

---

## What YOU must set up in the MercadoPago account (code can't do this)

1. **Register the webhook URL** in your MercadoPago **application** settings (Webhooks/IPN):
   `https://<APP_BASE_URL>/api/payments/webhooks/mercadopago`, subscribed to **Payments** events. Fix 1 also
   sends it per-preference, but registering it at the app level is the belt-and-suspenders MP expects.
   Confirm the secret you signed with matches `MP_WEBHOOK_SECRET` on Railway.
2. **Connect a real provider account (OAuth).** In the app: provider → connect MercadoPago → complete the OAuth
   return at `MP_REDIRECT_URI` (`/provider/payments/mercadopago/return`). Verify a
   `provider_payment_accounts` row exists with `rail='mercadopago'` and a decryptable `access_token`.
   **Until this is done, every checkout for that provider returns 503 — this is the #1 reason nothing charges.**
3. **Decide TEST vs PROD credentials.** For a real end-to-end charge, the connected provider must authorize with
   **production** MP credentials (and you as buyer use a different real account/card). For safe rehearsal, connect
   with **test** credentials and use MP test cards — no real money moves (expected "no charge").
4. **Confirm `MP_REDIRECT_URI`** matches, byte-for-byte, the Redirect URL registered in the MP app.
5. **(Optional) `PLATFORM_COMMISSION_BPS`** on Railway if you want the platform to take a split (currently
   defaults to 0% — providers keep 100%).

---

## Prioritized fix plan

| Pri | Item | Owner | Effort | Risk | Status |
|---|---|---|---|---|---|
| **P0** | `notification_url` on the preference | code (me) | XS | low | ✅ done |
| **P0** | Register webhook URL + confirm secret in MP dashboard | founder | S | — | you |
| **P0** | Connect ≥1 real provider MP account (OAuth) | founder | S | — | you |
| **P1** | Stop faking "Order placed"/"Request sent!" on unpaid | code (me) | S | low | ✅ done |
| **P1** | Daycare: honest unpaid handling (decide hard-fail vs pay-later) | founder+code | S | med | proposed |
| **P2** | `back_urls`/auto-return + app deep-link back from MP | code | M | med | proposed |
| **P2** | Reconcile cron (`getStatus` for stuck `pending`) | code | M | low | proposed |

---

## Exact E2E for your review (you run the real charge)

Preconditions: provider MP-connected (prod token) + webhook registered + you signed in as a buyer on a
different MP account/card.

1. **Shop — pickup/delivery order:** open a connected shop → add product → Checkout → app should open
   MercadoPago and say **"Complete your payment"** (not "Order placed"). Pay. Within seconds the webhook fires
   and the order flips `pending→paid` (check the provider's Sales/orders, and MP dashboard shows the payment with
   your `marketplace_fee`). **Charged correctly** = money debited on your buyer account, order shows `paid`, stock
   decremented by 1.
2. **Booking — paid service:** set a service to `payment_policy='deposit'` (with `deposit_cents`) → book it →
   app opens MP for the deposit → pay → the linked order flips to `paid` (provider's bookings list shows the
   `paid` flag). The provider then manually confirms. **Charged correctly** = deposit amount debited, order `paid`.
3. **Negative check:** start a checkout and **cancel** in MP → order must stay `pending`/`failed`, never `paid`,
   stock unchanged. Try a booking on a `none`-policy service → free "Request sent!", no charge (expected).

If an order that you actually paid does **not** flip to `paid`, the webhook isn't reaching us — re-check step 1
of the account setup (URL + secret + Payments subscription).
