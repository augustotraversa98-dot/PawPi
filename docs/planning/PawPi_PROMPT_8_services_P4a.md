# PawPi — PROMPT 8: Services Hub — build Phase 4a (unified storefront, NO payment changes)

Paste into the same `feat/services-hub` Claude Code conversation.

---

```
P3 merged — start P4a. Rebase feat/services-hub on latest main first. Additive, no merge,
no deploy. This is the storefront convergence WITHOUT any payment/checkout/delivery
changes — those are P4b. Reuse the existing cart + checkout exactly as-is this phase.

PHASE 4a — Unified storefront shell (per-type primary action + product detail)
Converge the provider profile and the shop into ONE storefront that adapts its primary
action to the provider's capabilities. Reference: Rappi/Glovo storefront.

- Build a storefront shell that `app/service/provider.jsx` uses (generalize it + reuse
  the existing `app/service/shop.jsx` product/cart pieces). It ALWAYS supports: search
  within the store, learn-about-it (about/info), and see-what-they-offer (catalog or
  services). The PRIMARY ACTION depends on type:
    * SHOP type (has products / shop|pharmacy capability): mini storefront — search within
      the store, browse categories, product grid with favorites, and a PRODUCT DETAIL
      view: image carousel, title, price (use the audit's shared formatMoney → ARS "$"
      with es-AR grouping), description with "read more", stock status, Rx flag if
      applicable, and a delivery/pickup info line (informational only this phase). ADD TO
      CART using the EXISTING shop cart. Do NOT change cart/checkout logic — reuse it.
    * BOOK type (vet / grooming / telehealth / walker / sitter / daycare / trainer): the
      audit's Book-primary CTA + trust strip; about/info; services offered; reviews.
      CAPABILITY-AWARE BOOKING (important): when the provider offers multiple services,
      the user picks one and the storefront passes THAT capability to BookingFormModal —
      a grooming booking must book as `groomer`, NOT default to `vet` (fixes the
      book/route default gotcha). 
    * A provider with BOTH (e.g. a vet that also sells) shows capability chips and offers
      both Book and Shop entry points on one profile.
- Do NOT include rich product fields that would require fake data — NO star ratings,
  "% approval", Q&A counts, or financing/"from X per month" lines until real data exists.
  Real data only; real empty states.
- Pet-friendly places are NOT in scope (deferred). Keep the three profile types (Dog
  Social / Dog Profile / Pet Medical) untouched — this is the provider/storefront surface.

RULES
- Do NOT ask questions — pick the best implementation; note decisions in your report.
- ZERO changes to payment, checkout, order creation, Stripe, or the cart's persistence/
  logic this phase. If something tempts you toward the money path, STOP and note it for
  P4b instead.
- ALL new user-facing strings via the i18n system: t() + keys in en.json AND es.json,
  neutral LatAm Spanish "tú". No hardcoded English.

VERIFY
- Mobile: `npm test`. Add/adjust tests for: capability-aware booking (a grooming service
  sends `groomer`, telehealth sends telehealth, vet sends vet — not the default), the
  storefront product detail + add-to-cart, per-type primary-action selection, and a
  both-capabilities provider showing Book + Shop. Confirm existing shop.jsx and
  provider.jsx flows/tests still pass (nothing deleted, cart/checkout unchanged).
- Confirm new keys exist in both en.json and es.json.

STOP after P4a: commit on feat/services-hub, report what changed, new i18n keys, test
results, and confirm cart/checkout logic is untouched and existing flows intact. Do NOT
merge or deploy — I'll review. Then wait for my go-ahead on P4b (checkout wiring +
delivery-vs-pickup + live payment E2E).
```
