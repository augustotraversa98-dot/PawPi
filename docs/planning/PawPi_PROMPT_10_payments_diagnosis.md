# PawPi — PROMPT 10: Payments not charging — DIAGNOSE then fix (money path)

Paste into a FRESH Claude Code conversation on its own branch. Investigation-first: the
guaranteed deliverable is a diagnosis + fix plan. Only implement clearly-safe fixes.

---

```
ROLE
PawPi payments are not charging. The founder can book an appointment AND complete a shop
checkout WITHOUT being charged. Find out exactly why — separating "expected because we're
on MercadoPago TEST/sandbox credentials" from "a real bug where payment is never enforced
or confirmed." Cover BOTH money paths: (1) appointment booking, (2) shop checkout. Produce
a precise diagnosis + fix plan; implement only clearly-safe, low-risk fixes.

BRANCH & SAFETY
- Base on the latest `main` (git fetch first). Branch `fix/payments-charging` (worktree if
  the folder is shared). No merge, no deploy.
- This is the MONEY PATH. Do NOT flip anything to real-charge behavior blindly, do NOT
  change payment credentials, and never mark an order/appointment as paid without a
  confirmed payment. Additive, reversible changes only.
- Do NOT ask questions — put genuine unknowns / product decisions in the report with your
  recommended answer.

TRACE END-TO-END (read real code; don't guess) — for BOTH paths:
A. SHOP CHECKOUT: mobile Pay CTA (StorefrontCatalog / useShopCheckout) → web
   `shop-checkout` route → `createCheckout` → MercadoPago. Answer precisely:
   - Does the app actually SEND the user to pay (MercadoPago Checkout Pro redirect / in-app
     browser / card sheet), or does it just create an order and show "order placed"?
   - What does `createCheckout` return and is that result actually used to drive payment?
   - Is the order marked paid/confirmed BEFORE payment succeeds? (Trace the order status
     lifecycle: created → pending → paid. Where, exactly, is it set to paid?)
   - Is there a MercadoPago WEBHOOK/IPN endpoint that receives payment status and updates
     the order? If missing, orders never become truly paid even if the user pays.
B. APPOINTMENT BOOKING: BookingFormModal → book route. Answer precisely:
   - Do appointments have a price/amount, and is a payment step wired at all — or does
     booking just create the appointment with no charge?
   - If a charge is intended, where should it happen and why doesn't it? If booking was
     never meant to charge online (pay-at-clinic), say so — that's a product question for
     the founder, not necessarily a bug.
C. ENVIRONMENT / CONFIG:
   - Which MercadoPago credentials/env are configured (TEST vs PROD, present vs missing)?
     Is there a sandbox flag? Is a "payments not configured / pay later" fallback being
     hit (the audit saw payUnavailable-style copy in rxf/insurance flows)?
   - Determine whether "no charge" is simply the app running on test/sandbox keys (expected)
     vs. the flow never enforcing/confirming payment (bug). State which, with evidence.
D. WEBHOOK & RECONCILIATION: is payment confirmation wired (webhook signature verified,
   order/appointment updated, idempotent)? What happens on payment failure/cancel — does
   the order correctly NOT complete?

DELIVERABLE — anything/PAYMENTS_DIAGNOSIS.md (keep updated as you go)
- For SHOP and for BOOKING separately: the exact current flow (file:line), where the
  charge is supposed to happen, and precisely why no charge occurs.
- A clear verdict per path: TEST-ENV-EXPECTED vs REAL-BUG (with the evidence).
- Order/appointment status lifecycle diagram (created→paid→…), highlighting any premature
  "paid"/"confirmed" writes.
- What's missing to charge for real: code gaps AND account/config gaps (e.g. PROD MP
  credentials, webhook URL registered in the MercadoPago dashboard, return URLs) — clearly
  separating what YOU can fix in code from what the FOUNDER must set up in the MP account.
- A prioritized fix plan (P0/P1) with effort + risk.

FIX vs PROPOSE
- FIX NOW on the branch (with tests) ONLY if clearly correct and low-risk, e.g.: the order
  is marked paid without a confirmed payment (stop doing that); the pay CTA doesn't
  actually open the MercadoPago checkout (wire it); missing/incorrect return handling;
  adding a webhook handler that updates status on confirmed payment (idempotent, signature-
  verified) if the pattern is unambiguous.
- PROPOSE ONLY (report + plan): anything needing MP account setup, credential/env changes,
  switching test→prod, or that could change whether/when money moves. Never enable live
  charging blind.
- If unsure whether something is safe, PROPOSE.

VERIFY
- Web: `bun run test` + `bun run typecheck` + `bun run build` (report new vs pre-existing
  baseline). Mobile: `npm test`. Add tests for any fix: e.g. an order is NOT marked paid
  without a confirmed-payment webhook; the pay CTA triggers the checkout redirect; webhook
  updates status idempotently; payment-failure leaves the order not-completed.
- Do NOT run a live charge yourself — the founder runs the real MercadoPago E2E during
  review. Describe exactly the E2E steps to run (pickup order, delivery order, one booking)
  and what "charged correctly" looks like end to end.

STOP after the diagnosis + any safe fixes: commit on fix/payments-charging, and give me:
the per-path verdict (test-env vs bug), the fix plan, what YOU fixed, and the exact list
of MercadoPago account/config steps I need to do to make real charges work. Do NOT merge
or deploy.
```
