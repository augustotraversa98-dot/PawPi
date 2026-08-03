# PawPi — PROMPT 9: Services Hub — build Phase 4b (checkout: pickup + delivery address)

Paste into the same `feat/services-hub` Claude Code conversation. This is the MONEY PATH —
be conservative and additive.

---

```
P4a merged — start P4b. Rebase feat/services-hub on latest main first. This phase touches
checkout/orders, so be maximally careful: ADDITIVE only, preserve all existing successful
order/payment behavior, keep the MercadoPago rail unchanged. No merge, no deploy.

FULFILLMENT DECISION (final): pickup + delivery ADDRESS. NOT a courier system.
The buyer chooses Pickup or Delivery; for Delivery we collect an address and store it on
the order; the MERCHANT fulfills/delivers themselves. No courier assignment, no shipping-
fee engine, no live tracking this phase.

PHASE 4b — Checkout with pickup/delivery + address
- Cart → checkout: wire the storefront cart (StorefrontCatalog) through the EXISTING
  checkout (useShopCheckout → MercadoPago). Do not rewrite the payment flow; only extend
  the payload.
- Fulfillment choice in the cart/checkout UI: Pickup or Delivery.
    * Pickup → no address needed; show the store/pickup info.
    * Delivery → require a delivery address. REUSE existing address entry if present
      (e.g. LocationField / MapLocationPicker, or the address pattern the rxf pharmacy-
      delivery flow already uses) rather than building a new one. Validate address is
      present before allowing Delivery checkout.
- Persist on the order (ADDITIVE migration, nullable, back-compat):
    * `fulfillment_type` ('pickup' | 'delivery'), default 'pickup' for existing rows.
    * `shipping_address` jsonb (null for pickup).
  Include these in order creation; existing orders and any caller that omits them must
  still work (treated as pickup).
- i18n: the checkout/cart Alert strings relocated verbatim in P4a are still English —
  convert them to t() now, plus all new fulfillment/address copy. Keys in en.json AND
  es.json, neutral LatAm Spanish "tú".
- Per-store cart stays per-store; no cross-store cart.
- Do NOT add: shipping fees, courier/driver assignment, delivery tracking, or a new
  payment rail. If tempted, note it as a future phase.

RULES
- Do NOT ask questions — pick the best implementation; note decisions in the report.
- No fake/mock data; real empty/error states. Preserve exact back-compat of the existing
  successful checkout.

VERIFY
- Web: `bun run test` + `bun run typecheck` + `bun run build`; report NEW vs pre-existing
  baseline. Add tests: order creation stores fulfillment_type + shipping_address; a
  delivery order requires an address; a pickup order needs none; an omitted-field caller
  still creates a valid pickup order (back-compat); the additive migration is additive.
- Mobile: `npm test`. Add tests: pickup vs delivery selection, address required for
  delivery, payload carries the choice + address, existing shop/storefront checkout still
  works, and the checkout strings are now translated (keys in both locales).
- Do a dry run of the checkout payload end-to-end in tests; note that ONE real
  MercadoPago sandbox/live E2E should be run before this ships (call it out — I'll do the
  live E2E during review).

STOP after P4b: commit on feat/services-hub, report what changed, the migration, new i18n
keys, new-vs-baseline test/typecheck/build results, and explicitly confirm the existing
payment flow is unchanged and back-compatible. Do NOT merge or deploy — I'll review and
run the live payment test. Then we're at the end of the core build; remaining are P5
(self-sourced places), P6 (retire old screens), and Android/web maps — your call on order.
```
