# PawPi — PROMPT 11: Booking with a paid service never charges — find & fix (real repro)

Paste into the `fix/payments-charging` Claude Code conversation (continue on that branch).

---

```
This is a CONFIRMED bug, not a config/test-env issue — stop attributing it to setup.
The founder HAS connected a (test) MercadoPago account for the provider AND set the
service to charge at booking time. Booking still does NOT charge: it just sends a request
to the vet, the vet can accept it, and no payment ever happens. No MercadoPago redirect,
no payment sheet, nothing.

EXACT REPRODUCTION (use these real records — inspect the actual data, don't theorize):
- Provider: "Vet Krauss"
- Service: "Chequeos", price 50 (ARS)
- Pet: "Mango test"
- Action: booked that service → only a booking request was created; never prompted to pay.

STEP 1 — INSPECT THE REAL DATA for this exact case (query the DB directly):
- The service row for "Chequeos" under "Vet Krauss": what is its payment_policy / price /
  amount / currency actually stored as? Is it really set to require payment (deposit/full),
  or did the founder's "charge at booking" setting NOT persist (still 'none')?
- The provider row for "Vet Krauss": is there a provider_payment_accounts row with a
  decryptable access_token (i.e. is MercadoPago actually connected for THIS provider)?
- The appointment/booking row just created for "Mango test": its status, amount, and
  whether ANY payment/checkout/preference record was created alongside it.
Report exactly what you find for each — this decides code-bug vs data-state.

STEP 2 — TRACE THE BOOKING CODE PATH for a REQUEST-BASED booking of a PAID service:
- BookingFormModal → book route. When a service requires payment AND the provider is
  connected, does the flow actually call createCheckout and return a checkoutUrl the app
  opens? Or does it create the appointment/request and skip payment?
- KEY HYPOTHESIS TO CONFIRM OR KILL: the "request → vet accepts" booking model may bypass
  payment entirely — i.e. payment is only wired for instant/confirmed bookings, so a
  request-based paid service (like this one) never triggers a charge. Determine precisely
  whether, and where, a request-based booking is supposed to charge:
    * at request time (authorize/charge up front), or
    * after the vet accepts (charge on acceptance)?
  State what the code does today vs. what it should do. The founder expects payment AT
  booking time, so a $50 "Chequeos" booking must trigger MercadoPago.
- Confirm whether the mobile BookingFormModal even receives/uses the service's
  payment_policy + amount, and whether it opens the checkout URL (Linking) when required.

STEP 3 — ROOT CAUSE + FIX:
- State the ONE real root cause (with file:line and the actual data from Step 1).
- FIX it if it's clearly correct and low-risk (e.g. wire the paid request-based booking to
  create a checkout and open MercadoPago; ensure the appointment is NOT confirmed until
  payment is confirmed by the webhook). Add tests.
- If the fix hinges on a product decision (charge at request vs. on vet acceptance),
  implement the "charge at booking time" behavior the founder asked for, and note the
  alternative in the report.
- Also sanity-check the SHOP path with the connected provider so buying a product with a
  value actually opens MercadoPago too.

RULES: money path — additive/reversible, never mark paid/confirmed without a verified
payment, no merge, no deploy. Do NOT ask questions; put decisions in the report.

VERIFY: web `bun run test` + `typecheck` + `build`; mobile `npm test`; add a test proving
a paid request-based booking triggers checkout and stays unconfirmed until payment. Do NOT
run a live charge — give me the exact steps to test the "Vet Krauss / Chequeos / Mango
test" booking end to end after your fix.

DELIVERABLE: update anything/PAYMENTS_DIAGNOSIS.md with the real-data findings and the
root cause, commit the fix on fix/payments-charging, and tell me plainly: what was broken,
what you changed, and how to verify the $50 Chequeos booking now charges.
```
