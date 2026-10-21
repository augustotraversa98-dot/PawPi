# Production apply runbook — migration `0135` (payment settlement: the webhook can finally find and settle a payment)

**Audience:** the owner. **Nothing here is applied by automation or by the PR that adds it.** You apply the SQL by hand in the Supabase SQL
editor and verify it; the PR's code does not merge until you have. Flow-matrix refs: **F3-01** (webhook has no RLS identity), **F3-02**
(payload extractor), **F3-03** (monotonic guard — now inside the database), **F3-06** (out of scope, see §6).

## 1. What was wrong, in one paragraph

MercadoPago calls our webhook; the webhook is not a logged-in user, so its database session has **no identity**. `payments` and `orders` are
`FORCE ROW LEVEL SECURITY` and the app connects as `pawpi_app` (no bypass), so with no identity **both tables read as empty**. The webhook
never found the payment, answered `200 ignored/unknown_reference`, and the order stayed `pending` forever: no stock decrement, no walk credits,
and the provider's *Confirm* always said "unpaid". A real payment could be taken and never settled. (Even with the lookup fixed, the old code
also read the wrong ids and trusted a status in the unauthenticated body — F3-02.)

## 2. What the PR changes

| Piece | What |
|---|---|
| `supabase/migrations/0135_payment_settlement_definer.sql` | Two `SECURITY DEFINER` functions, `search_path` pinned, `EXECUTE` revoked from `PUBLIC`/`anon`/`authenticated` and granted to `pawpi_app` only. **No table, policy or data change.** Idempotent. |
| `app_payment_for_webhook(text)` | Finds one payment by `external_id`, then `idempotency_key`, then the **order id** (what we send MercadoPago as `external_reference`). Read-only. |
| `app_apply_payment_status(int, text, text)` | One atomic, row-locked step: flips payment **and** order and runs the once-only side effects. `refunded` is terminal; `approved` may only become `refunded`; a repeat is a no-op. On the real transition only: product stock −1 on paid (+1 on refund, **only if it had been paid**), walk credits granted once, and the linked booking set to `confirmed` **if the provider enabled auto-confirm**. |
| Webhook code | Signature is checked **first** (no DB call, no outbound call before it passes). Then: locate the row → ask MercadoPago for the payment with the **seller's** token → require its `external_reference` to equal our order id → apply the status MercadoPago reports. A status in the notification body is never trusted. A failed fetch/apply answers **5xx** so MercadoPago redelivers. |
| Extractor | Reads `data.id`/`type` from the **query string** *and* the JSON body, legacy IPN (`?id=&topic=payment`, `resource` URL), and ignores other topics. |
| `createCheckout` | The per-preference `notification_url` now ends in `?order_ref=<order id>` so the webhook can find the order (and which seller's token to use) from MercadoPago's payment id. Amounts, `marketplace_fee`/commission, OAuth: **untouched**. |
| `verify_0135.sql` | Read-only; 8 rows, all must read `PASS`. |

The identity-ful paths (provider *refund*, `getStatus`) now call the same function, so there is exactly one implementation of the status machine.

## 3. Apply (≈5 minutes, low risk)

**Order matters: apply the SQL first, then merge/deploy.** The new code calls the functions; the old code never touches them, so applying early is harmless.
If the code were deployed *before* the SQL, every webhook would answer 500 and MercadoPago would keep redelivering (nothing is lost while its retry
window lasts, but don't rely on it).

1. Supabase **SQL editor** (you are `postgres`). Paste the whole of `supabase/migrations/0135_payment_settlement_definer.sql` and run it. Expect "Success. No rows returned".
2. Paste `supabase/verify_0135.sql` and run it. **Every row must read `PASS`:**
   1. both functions exist; 2. both are `SECURITY DEFINER`; 3. both pin `search_path = public, pg_temp`; 4. `pawpi_app` can execute both;
   5. `PUBLIC` cannot; 6. `anon`/`authenticated` cannot; 7. no other role has `EXECUTE`; 8. the pieces they call exist (`app_adjust_order_stock` 0037,
   `app_grant_walk_credits` 0089, `providers.auto_confirm_bookings` 0079, `vet_appointments.order_id` 0030).
3. Re-run `supabase/verify_0134.sql` (row 4: "`pawpi_app` can EXECUTE every public function" should still be PASS) — it also covers the new functions.
4. Tell me "0135 applied, verify all PASS" and I will merge (squash).

**Rollback:** nothing in the app can break from the functions existing. To remove them after the code is reverted:
`drop function if exists app_payment_for_webhook(text); drop function if exists app_apply_payment_status(integer, text, text);`

## 4. Test with ZERO real money first (MercadoPago sandbox)

The code is proven by 49 real-Postgres tests (as `pawpi_app`, no identity, real HMAC, MercadoPago's HTTP stubbed) and about 50 new/updated unit tests, but
MercadoPago's real notification has **never** been seen by this code — the fixtures in `anything/apps/web/src/app/api/utils/payments/__fixtures__/mercadopago/`
are **synthetic**, modelled on MercadoPago's documented shapes. Before any live charge, do one sandbox payment and capture what actually arrives.

### 4a. Setup (test accounts, no real money)
1. MercadoPago developers → your app → **Cuentas de prueba**: create a **seller** test user and a **buyer** test user.
2. Connect the **seller test account** to a test provider through the normal *Sales → Connect MercadoPago* flow (OAuth with the test seller).
3. In the app's **Webhooks** settings, confirm the webhook URL `https://<prod>/api/payments/webhooks/mercadopago`, the **Payments** topic, and that
   the secret equals `MP_WEBHOOK_SECRET` on Railway.
4. Make a booking/shop order on that test provider, open the Checkout link, pay as the **buyer test user** with a test card (approved: `APRO`).

### 4b. Exactly what I need you to capture (redact tokens/emails; **never paste an access token or the webhook secret into chat or git**)
The one thing the code cannot know without a real sandbox run is **which of two formats MercadoPago uses for a *per-preference* `notification_url`**.
Please capture, for **one approved payment** (and ideally one **rejected** and one **refunded**):

| # | What | Where to get it | Why it matters |
|---|---|---|---|
| 1 | The **request line** of the notification we receive — the full path **and query string**, e.g. `/api/payments/webhooks/mercadopago?order_ref=…&data.id=…&type=payment` | MercadoPago dashboard → Webhooks → **Notification history** / delivery log; or, to see it raw, create a preference by hand with `notification_url` pointing at a request-catcher (webhook.site) + `?order_ref=1`, pay it, and read the catcher | Confirms our `order_ref` survives and whether MercadoPago sends `data.id`+`type` (Webhooks) or `id`+`topic` (legacy IPN) |
| 2 | The **headers**: `x-signature`, `x-request-id` present? | Same catcher / log | **If `x-signature` is absent the notification is unsigned IPN and the code rejects it with 401 by design** — see 4c |
| 3 | The **JSON body** | Same | Fixture + extractor check (`data.id`, `type`, `user_id`) |
| 4 | `GET https://api.mercadopago.com/v1/payments/<data.id>` response for that payment, fetched with the **seller test token** | `curl -H "Authorization: Bearer $SELLER_TEST_TOKEN" …` from your shell (token only in an env var) | Confirms `status`, `status_detail`, **`external_reference` = our order id**, `transaction_amount` |
| 5 | Same for a **refund** (refund the test payment from the seller test account or via `POST /api/payments/<id>/refund`) and a **rejected** payment (test card holder name `OTHE`/`FUND`) | Same | Confirms the `refunded` / `rejected` → ledger mapping |
| 6 | After each: the order's final `status`, `payments.status`, and (product) `shop_products.stock_qty` | Supabase table editor / the verify query below | End-to-end proof |

Save the redacted results as `…/__fixtures__/mercadopago/*.captured.json` in a PR (or hand them to me) and I will add tests against them and delete the synthetic ones.

```sql
-- read-only: what did the sandbox payment do?
select p.id, p.status as payment_status, p.raw_status, o.id as order_id, o.status as order_status, o.kind
from payments p join orders o on o.id = p.order_id
order by p.id desc limit 5;
```

### 4c. If the sandbox shows unsigned IPN instead of signed Webhooks
Then every notification gets `401` (correct — we will not settle on an unsigned request). Do **not** loosen the check. The fix is to switch the app to the
dashboard-registered **Webhooks** (signed) and have the webhook find the seller from the notification's `user_id` (a small follow-up: one more
`SECURITY DEFINER` lookup of `provider_payment_accounts.account_ref`). Tell me what you captured and I will do it.

## 5. After a real payment, how you know it worked
* `payments.status = 'approved'` and `orders.status = 'paid'` for that order (query above); product: stock went down by the ordered quantity **once**.
* A booking that carried the order: *Confirm* no longer answers "unpaid" (409 `unpaid`). If the provider has **auto-confirm** on, the booking is already `confirmed`
  (note: no notification is sent for that automatic confirmation — the webhook has no user identity to notify as; the owner sees it in the app).
* Railway logs: no `[POST /api/payments/webhooks/mercadopago] Error`. Warnings you may see and what they mean:
  `payment notification without a locatable order reference` (no `order_ref` arrived — see 4b #1) and `payment/order reference mismatch — ignored`.
  Logs never contain tokens, bodies or ids by design.

## 6. Not in this PR (decisions / follow-ups — nothing here is silently dropped)

| Item | Why not here |
|---|---|
| **F3-06** — `book` ignores `payment_policy`; a paid `order_id` can back several bookings or be the wrong kind/amount | The matrix marks it **needs-human**: enforcing `payment_policy` changes *which bookings are allowed* (a service set to "pay in full" could no longer be booked without paying — and the mobile booking flow would need to handle the new 409 `payment_required`). It is a product decision plus a mobile change, not settlement. **Note: fixing F3-01 makes the order-reuse half of F3-06 exploitable as soon as real payments flow**, so decide it before announcing payments. Optional DB backstop (separate migration, my suggestion): `create unique index concurrently idx_vet_appointments_order_unique on vet_appointments(order_id) where order_id is not null and deleted_at is null;` |
| Amount check (MercadoPago `transaction_amount` vs `orders.amount_cents`) | Not added: it could wrongly block legitimate payments (currency/rounding) before we have a real payload to calibrate against. Add after the sandbox capture. |
| A *second* approved MercadoPago payment on the same order (customer pays twice) | The second is ignored by the monotonic guard (the order is already paid) — i.e. a double charge is **not** auto-refunded. Rare; needs a reconcile/refund job. |
| Refund of a **walk package** does not claw back the credits | Same as before this change; a product decision. |
| No reconcile job for a missed webhook (`getStatus` exists but nothing calls it) | MercadoPago redelivers on 5xx; a periodic reconcile is a separate hardening ticket. |
| No "payment received" notification to owner/provider; no `x-signature` timestamp-freshness window | Pre-existing, listed in the flow matrix (U2). |
| F3-25 `PAYMENTS_LIVE` switch | Decided not to add (fix log item 8): do it together with setting it on Railway, as a human step. |
