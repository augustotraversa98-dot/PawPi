# PawPi — Security Fixes (the 6 items from the 2026-08-21 night run)

Status of each of the six propose-only findings, in three tiers by risk.

- **Tier A — MERGED to `main`** (PR #498, all CI green): #2 SSRF, #3 upload limits, #6 rate limits.
- **Tier B — implemented/proposed, HELD for review** (separate PR, not merged): #4 login-token origin (code), #1 checkout pricing (proposal — see why below).
- **Tier C — prepared, you hand-apply**: #5 emergency-tag migration file.

---

## Tier A — merged (safe, additive, tested)

### #2 — SSRF guard on server-side document fetches ✅ merged
- **What changed:** New `anything/apps/web/src/app/api/utils/enrichment/safeFetch.js`. The enrichment extractors (`petRecords.js`, `document.js`) now fetch through `safeFetch`, which allows only **https** to the app's own storage hosts (`SUPABASE_URL` host + `api.anything.com` / `ucarecdn.com`, extensible via `ENRICHMENT_FETCH_ALLOWED_HOSTS`), refuses IP-literal / private / loopback / link-local targets, and re-validates every redirect hop.
- **Why safe:** both call sites already fail soft, so a blocked URL becomes an empty proposal (never a 500). The vet-record extract route accepts a client `url`, so this closes a real blind-SSRF (incl. cloud-metadata `169.254.169.254`).
- **Tests:** `safeFetch.test.js` (9) — allowlist, metadata/localhost/private/redirect rejection.

### #3 — Upload type + size validation ✅ merged
- **What changed:** New `utils/uploadValidation.js` + `upload/route.js`. Allowlist of the types the app actually uploads (images, PDF, CSV/XLSX — the route is deliberately mime-agnostic across vet documents and provider price-lists), excluding all active-markup types (`text/html`, `image/svg+xml`, …); 25 MB cap; the route stores the **validated** mime, never the raw client-declared one.
- **Why safe:** I traced every `/api/upload` caller — PDFs (vet docs) and CSV/XLSX (price-lists) genuinely flow through it, so an image-only allowlist would have broken real features; this list keeps them working while blocking stored-XSS vectors.
- **Tests:** `uploadValidation.test.js` (7) + `upload/route.test.js` (4).

### #6 — Rate limits on sensitive routes ✅ merged
- **What changed:** New buckets in `utils/rateLimit.js` applied (existing Postgres-backed limiter) to the public emergency tag/card lookups + relay (IP-keyed — no auth there), `payments/checkout`, DM message writes, and uploads.
- **Why safe:** generous limits (a real user/vet never trips them); the limiter fails **open**; reads are never limited except the two public emergency GETs (defense-in-depth against token probing).
- **Tests:** extended `rateLimit.test.js` (bucket catalog, 429 per new bucket, IP-keying).

---

## Tier B — held for your review (do NOT merge without a look)

### #4 — Lock the WebView auth-success `postMessage` to the app origin ✅ implemented, HELD
- **File:** `anything/apps/web/src/app/api/auth/expo-web-success/route.js` (+ test).
- **What changed:** the page posted the JWT to `window.parent` with target origin `'*'` (any framing page could read the token) and interpolated the provider-controlled name/email into an inline `<script>` (a `</script>` breakout). Now it posts to the configured app origin (`APP_WEB_ORIGIN || AUTH_URL`) — matching the mobile receiver's existing `event.origin === EXPO_PUBLIC_PROXY_BASE_URL` check — falling back to `'*'` **only in development**, refusing to broadcast in production when no origin is configured, and escaping `<` in the payload.
- **Why held:** auth-core-adjacent. **Before merge:** confirm on a device that login still works, and that the production `AUTH_URL`/`APP_WEB_ORIGIN` origin equals `EXPO_PUBLIC_PROXY_BASE_URL`. If they differ, set `APP_WEB_ORIGIN` to the correct origin.
- **Tests:** `expo-web-success/route.test.js` (5) — origin locked, `</script>` escaped, prod-without-origin refuses, dev `'*'` fallback.

### #1 — Checkout must not trust the client price 🔴 PROPOSAL (needs your decision — NOT coded)

**This is the most important item, and after investigating it I deliberately did NOT change the code — here's the honest why.** The generic `POST /api/payments/checkout` is not a single "shop" endpoint; it is the **shared** payment entry point for several *live* flows, each computing `amount_cents` on the client from a **different** server entity, keyed by a **different** `source_ref`:

| kind | live caller | amount comes from | `source_ref` |
|------|-------------|-------------------|--------------|
| `product` | `rx-fulfillment.jsx` | `rx_fulfillment_orders.price_cents` | `rxf-<id>` (no shop line items) |
| `booking` | `useBookingCheckout` (BookingFormModal) | a service's deposit/full policy | often **none** |
| `subscription` | `insurance-policy.jsx` | `insurance_policies.premium_cents` | `ins-<id>` |
| `adoption_fee` / `donation` | `useAdoptionCheckout` | listing fee / donor-chosen | varies |

There is **no single price table to look up**, the `source_ref` formats are heterogeneous, and `booking` frequently sends none. A correct fix must map each `source_ref` prefix to its owning table+column and verify/override the amount there. Any wrong table/column assumption would **500 a real, untestable payment flow** — and I can't run payments in this environment. Per the run's own rule ("propose, don't apply, anything with a real chance of breaking something you can't verify tonight"), this is a proposal.

**Recommended implementation (for a follow-up with payment testing):** verify `amount_cents` against the server entity named by `source_ref`, per prefix — reject on mismatch, keep everything else:

```
// in POST, after validating kind, BEFORE creating the order:
const expected = await serverAmountFor({ kind, source_ref, items, provider_id, userId });
if (expected != null && expected !== amount_cents) return 400 "amount mismatch";
// (expected == null only for donation, which is legitimately donor-chosen — bound it 100..N cents)
```

with `serverAmountFor` mapping (all confirmed against the code):
- **product / `rxf-<id>`** → `SELECT price_cents FROM rx_fulfillment_orders WHERE id = <id> AND owner_user_id = me`.
- **product / shop line items** (`items[].product_id`) → sum `shop_products.price_cents` scoped to `provider_id AND active`, mirroring `pets/[id]/shop-checkout/route.js` (also fix: the generic route writes `order_items.product_ref`, but the paid-stock hook reads `order_items.product_id` — use `product_id`), and require a `pet_id` if you want the `is_rx` gate.
- **subscription / `ins-<id>`** → `SELECT premium_cents FROM insurance_policies WHERE id = <id> AND owner_user_id = me`.
- **booking** → needs a defined contract: send `source_ref = "service:<provider_services.id>"` + a `full|deposit` selector, then read `provider_services.price_cents`/`deposit_cents` by `payment_policy`. (Today booking sends no `source_ref` — this is the one that needs a small client change.)
- **adoption_fee / `adoption:<id>`** → `SELECT adoption_fee_cents FROM adoptable_listings WHERE id = <id> AND provider_id = <pid>`.
- **donation** → keep client amount, but bound it (min/max).

**Decisions needed from you:** (1) confirm the `booking` `source_ref` contract (the only client change required); (2) confirm `subscription` should even go through generic checkout (recurring billing already runs via the cron as `kind='product'`); (3) min/max donation bounds. Once decided, this is a well-scoped change with per-flow tests — but it must be validated against real (test-mode) payments, not merged blind.

---

## Tier C — prepared, you hand-apply

### #5 — Trim the emergency **tag** medical projection 📄 migration written, NOT applied
- **File:** `supabase/migrations/0122_emergency_tag_medical_least_privilege.sql` (do **not** auto-apply — hand-apply like 0051–0055).
- **Plain English:** when an owner turns on "show medical on tag," the permanent collar-QR API response currently includes more than the tag page shows. The migration gives the internal assembler a scope argument and routes the **tag** through a narrower projection; the vet **link** keeps the full block, unchanged.
- **Fields removed from the tag branch (kept for the vet link):** `extra_notes`, `primary_vet_name`, `primary_clinic_name`, `vet_phone`, `emergency_contact_name`, `emergency_contact_phone`.
- **Fields kept on the tag** (exactly what `p/tag/[token]/page.jsx` renders): `blood_type`, `spayed_neutered_status`, `medical_notes`, `allergies`, `conditions`.
- **How to apply:** run the migration against Supabase; then load a tag page with medical enabled and confirm no vet/emergency-contact fields appear in the network response.

---

## Where each change lives
- Tier A: merged to `main` in PR #498.
- Tier B (#4 code, #1 proposal) + Tier C (#5 migration): this branch / its **held** PR — do not merge #4 or the migration without the review steps above; #1 is a proposal only.
