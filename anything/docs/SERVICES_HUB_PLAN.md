# Services Hub — Marketplace Redesign Plan

**Status:** PLAN ONLY — no feature code, no schema changes in this pass. Do not build until approved.
**Branch:** `claude/services-hub-marketplace-plan-c0eb55` (based on latest `main`, SHA `14c4b32`).
**Author:** design + phasing pass. Every fact below was verified against the code, not assumed.

---

## 0. One-page summary

Today the Services tab (`app/(tabs)/services.jsx`) is a **category grid**: 11 cards (Veterinary, Telehealth, Grooming, Walking, Daycare, Sitting, Training, Shop, Adoption, Transport, Insurance), each routing to a **separate per-capability discovery screen** (`app/service/vet.jsx`, `grooming.jsx`, …). Pet-friendly places live in a **twelfth, unrelated flow** (`app/service/places.jsx`) backed by Google Places. This is a silo IA.

The redesign turns Services into a **two-layer marketplace**:

**Layer 1 — Discovery (Airbnb/Booking split).** One screen. The user finds *anything* pet-related nearby — vets, grooming, telehealth, shops, and pet-friendly places — as a **single result stream** rendered as a **list + map** with **search, category filters, distance, rating, open-now, price**. Tapping a pin highlights its list card and vice-versa.
- **Web:** true side-by-side split (list left, map right).
- **Mobile:** full-screen map + draggable **bottom-sheet list**, **filter chips pinned on top**, and a **list⇄map toggle** (mobile cannot do a true side-by-side split).
- This **merges** the Vet/Grooming/Telehealth silos into one **"Veterinary"** provider umbrella (one profile, capability chips) and folds **pet-friendly places** in as a filter category. This is a **mobile-IA change, not a migration** — the backend already models one provider with many capabilities.

**Layer 2 — Storefront (Rappi/Glovo enter-a-store).** Tapping a result enters that provider/store/place. **One storefront shell** adapts its **primary action by type** (read from `capabilities[]`, which the profile API already returns):
- **Store/shop** → mini storefront: search-in-store, category browse, product grid → **product detail** (image carousel, price, description read-more, stock/Rx) → **Add to cart** → **cart + checkout** (reuses the existing shop commerce loop).
- **Vet / grooming / telehealth** → **Book** primary CTA (the audit's Book-primary + trust strip), about/info, services, ratings & reviews. Booking passes the **selected capability** so a grooming booking doesn't book as a vet.
- **Pet-friendly place (café/park/…)** → "learn about it" profile: about/info, photos, hours/open-now, directions, save. No cart unless it also sells.

**The convergence is smaller than it looks.** `app/service/provider.jsx` is *already* the type-agnostic profile and *already* receives `products` and `capabilities[]` from `/api/providers/public/[slug]`; `app/service/shop.jsx` *already* has the product grid + cart + checkout. The storefront work is mostly **wiring the shop's commerce into the provider profile and branching the primary action on `capabilities[]`** — plus a new product-detail sheet.

**The only true backend gap for discovery is coordinates:** `/api/providers/discover` returns no `lat`/`lng` and no `capabilities[]`, and takes only a single `?type=`. Coordinates already exist on `provider_locations` (`lat numeric(9,6)`, `lng numeric(9,6)`, `hours_json`) — the discover query just doesn't project them. **Additive only, no destructive migration.**

**Maps ship iOS-first** on Apple Maps (`react-native-maps` `PROVIDER_DEFAULT`, free, no key — already how `MapLocationView` renders). **Android** needs a Google Maps SDK key + billing + a location permission in `app.json` — a later phase; until then the hub **degrades to list-only** on Android. **Pet-friendly places** additionally need `GOOGLE_PLACES_API_KEY` (server-only, currently unset) and degrade to an empty/unconfigured state gracefully.

**Phasing (recommended spine):** P1 backend coords + query params → P2 unified discovery list (search + filters) → P3 iOS map + marker-tap + bottom-sheet/toggle → P4 unified storefront (converge profile + shop, per-type CTA, product detail, cart/checkout) → P5 fold in pet-friendly places → P6 retire the merged screens after parity → **Android map as a later phase.** Each phase is independently reviewable; P1–P3 are shippable without touching the storefront.

---

## 1. Discovery UX / IA (Layer 1)

### 1.1 Entry point

`app/(tabs)/services.jsx` stops being a category grid and becomes the **Services Hub**. The 11-card grid is replaced by the discovery surface. (The grid's category concepts survive as **filter chips**, so nothing is lost.)

### 1.2 Web layout — true split

```
┌───────────────────────────────────────────────────────────┐
│  [Search box………………]  [Category ▾][Distance ▾][Rating ▾]   │  ← sticky filter bar
│                          [Open now][Price ▾][Map/List]      │
├──────────────────────────────┬────────────────────────────┤
│  RESULT LIST (scroll)        │  MAP (sticky)              │
│  ┌────────────────────────┐  │    📍 ← pins, one per      │
│  │ ResultCard (provider)  │  │    📍   result             │
│  │  logo·name·chips·★·$·mi │  │  📍                        │
│  ├────────────────────────┤  │       📍(highlighted)      │
│  │ ResultCard (place)     │  │                            │
│  └────────────────────────┘  │  hover card ⇄ hover pin    │
└──────────────────────────────┴────────────────────────────┘
```
- Left column: filtered, sorted result list. Right column: map with one pin per result.
- **Bi-directional highlight:** hovering/selecting a card focuses its pin; clicking a pin scrolls to and highlights its card.
- Web maps already available via `@teovilla/react-native-web-maps` (a dependency) which shims `react-native-maps` on web — so the same `HubMap` component can render on both, or web can use a thin web-only variant. Recommend reusing the RN component through the shim to avoid a second map codebase.

### 1.3 Mobile layout — full-screen map + bottom sheet + toggle

Mobile cannot show a true side-by-side split. The pattern:

```
LIST MODE (default)                MAP MODE (toggle)
┌─────────────────────┐            ┌─────────────────────┐
│ [Search…]      [Map] │            │ [Search…]     [List] │  ← toggle button
│ [Vet][Shop][Places]…│ chips      │ [Vet][Shop][Places]…│  chips pinned on top
├─────────────────────┤            │        📍   📍       │
│ ResultCard          │            │   📍       📍(sel)   │  full-screen map
│ ResultCard          │            │ ┌─────────────────┐ │
│ ResultCard          │            │ │▁▁ bottom sheet ▁│ │  ← draggable
│ …                   │            │ │ ResultCard (sel)│ │     (peek → half → full)
└─────────────────────┘            │ └─────────────────┘ │
```
- **Filter chips** are pinned at the top in **both** modes (horizontal scroll row).
- **Map mode:** full-screen `HubMap`; a **draggable bottom sheet** (peek / half / full detents) holds the result list. Tapping a pin snaps the sheet to *half* and scrolls the tapped result to the top / selects it. Dragging the sheet to *full* hides the map behind the list.
- **List⇄Map toggle:** a single button in the filter bar switches modes; state persists within the session.
- Bottom sheet: use `@gorhom/bottom-sheet` if already present, else a lightweight `Animated`/`PanResponder` sheet. **Confirm dependency in P3** (see open questions).

### 1.4 Filter taxonomy

Categories map to **capability sets** (a provider is matched if it holds *any* capability in the set) plus the Places source. This is a config table, not hardcoded branching:

| Category chip        | Source                | Capabilities matched                     |
|----------------------|-----------------------|------------------------------------------|
| **Veterinary**       | providers             | `vet`, `groomer`, `telehealth` *(founder's explicit merge)* |
| **Care & boarding**  | providers             | `walker`, `daycare`, `sitter`, `trainer` |
| **Shops**            | providers             | `shop`, `pharmacy`                        |
| **Transport**        | providers             | `transport`                              |
| **Insurance**        | providers             | `insurance`                              |
| **Adoption**         | providers             | `adoption`                               |
| **Pet-friendly places** | Google Places      | park / café / restaurant / hotel / beach / pet_store |

Notes:
- The `capabilities[]` and `provider_type` truths come from `providerAuth.js` (`ALLOWED_CAPABILITIES = vet, groomer, walker, daycare, sitter, trainer, shop, adoption, transport, pharmacy, telehealth, insurance`). **`provider_type` is display-only**; all matching is by capability.
- Grouping grooming under "Veterinary" is the founder's stated merge; it's a config choice and can be re-slotted without code changes.
- **Other filters** (apply across categories):
  - **Distance** — 1 / 3 / 5 / 10 / 25 km (needs user location; when denied, distance filter disables and sort falls back to relevance).
  - **Rating** — 4.5+ / 4.0+ / any (uses `avg_rating`).
  - **Open now** — providers via `hours_json`; places via Google `open_now` (see §6 open-now).
  - **Price** — `$ / $$ / $$$` (providers from cheapest service/product `price_cents` band; places from Google `price_level`).

### 1.5 Search + type-ahead

- One search box, debounced. **Client-side type-ahead** over the already-fetched result set (this is exactly what `useProviderListFilter` in `ProviderListControls.jsx` already does — matches `name`/`bio`/`provider_type`). Extend it to also match place names and capability labels.
- **Server search** (`?q=`) is added to `/api/providers/discover` for the case where results exceed the client page. v1 can be client-only over a generous page (e.g. 50) and add `?q=` server-side when result volume grows.

### 1.6 Sort

Reuse `PROVIDER_SORTS` (`relevance` / `rating` / `reviews`) from `ProviderListControls.jsx` and add **`distance`** (nearest first) as the default sort when location is granted. Places interleave by the same sort keys (rating/distance), so the merged list stays coherent.

### 1.7 Screen states (all real — no fabricated data)

| State                     | Behaviour |
|---------------------------|-----------|
| **Loading**              | Skeleton cards in list; map shows a spinner overlay. |
| **No location permission** | Banner: "Allow location to sort by distance and see what's near you." List still loads (unsorted by distance); map centers on a neutral default region and disables distance filters. Reuse the `places.locationDenied` copy pattern. |
| **Empty (no data at all)** | "No providers or places yet." (Real: providers table empty + places unconfigured.) No mock fallback. |
| **No results (filters too narrow)** | "No results for these filters." + a **Clear filters** action. Reuse `providers.noMatchBody`. |
| **Error**                | "Couldn't load results. Retry." with a retry button; each source (providers/places) fails independently — one failing does not blank the other. |
| **Places unconfigured**  | If `GOOGLE_PLACES_API_KEY` unset, the Places category shows "Pet-friendly places aren't available yet" (the proxy already returns `{configured:false, places:[]}` — no crash). Providers still show. |
| **Android (no maps key)** | Map toggle hidden; list-only. Banner optional. |

---

## 2. Storefront UX / IA (Layer 2)

### 2.1 One shell, primary action by type

`app/service/provider.jsx` becomes the **Storefront shell** for *all* provider results; a lightweight place variant handles Google-Places results. The shell branches on **`capabilities[]`** (already returned by `/api/providers/public/[slug]` but **currently not read** — the screen branches on array *presence* today). The primary-action decision:

| Storefront type (derived)                    | Primary action | Secondary |
|----------------------------------------------|----------------|-----------|
| Holds `shop`/`pharmacy` and has products     | **Shop** (in-store catalog → cart → checkout) | Message |
| Holds `vet`/`groomer`/`telehealth`/`walker`/`daycare`/`sitter`/`trainer`/`transport` | **Book** (pick service → capability-aware booking) | Message |
| Holds both shop *and* bookable capabilities  | Show **both** — a "Shop" tab and a "Book" CTA (a "vet shop" is explicitly supported by the capability model) | Message |
| Pet-friendly place (Google Places result)    | **Directions** + **Save** | — (no cart/booking) |

Every storefront supports the four invariants from the vision: **search within it**, **learn about it** (about/info), **see what they offer** (catalog or services), and the **type-appropriate primary action**.

### 2.2 Storefront shell structure

Reuses today's `provider.jsx` scaffolding (cover banner, header card with logo/name/`RatingBadge`, `bio`, `ProviderLinks`, Locations via `MapLocationView`, Services, Reviews, trust strip, Book CTA bar). Additions:
- Read `capabilities[]` → render **capability chips** in the header and choose the primary action.
- **In-store search** field (client-side over the fetched `services`/`products`).
- **Tabs** when a provider has both shop + services: `[Shop] [Services] [About] [Reviews]`.

### 2.3 Store/shop storefront (Rappi/Glovo)

- **Catalog:** the profile already receives `products[]` (`shop_products`: `id, name, description, image_urls, price_cents, currency, category, is_rx`). Today the profile's items section **redirects to `/service/shop`**; instead render an **in-storefront product grid** with add-to-cart.
- **Product detail sheet (NEW component):**
  - **v1 (data that exists):** image **carousel** (`image_urls[]`), title, price (`price_cents`+`currency`), description with **read-more**, stock line (`stock_qty` → "Sold out"), **Rx badge** (`is_rx`), **Add to cart** with quantity stepper.
  - **Deferred (no backing data yet — do NOT fake):** per-product **rating + review count**, **approval %**, **Q&A count**, **"from X/month" financing**, **delivery/pickup** info. These require schema + real data; show them **only once the data exists**. Listed as additive-column candidates in §3.6. Until then they are simply absent (real empty states, not placeholders).
- **Cart + checkout:** reuse the existing loop from `shop.jsx`:
  - Cart state today is `{ [productId]: qty }` **local to `ShopCatalogModal`** — must be **lifted** into a shared cart store (context or a hook) so it survives navigating between product detail ⇄ grid, and so the storefront (not a modal) owns it. **Scope: per-store cart** (checkout is per-provider anyway).
  - Quantity steppers exist (`setQty`, clamps to stock). **Select-all** and **delivery address** are **NEW** (address is a genuine gap — see §3.6 and open questions). Checkout today sends `{provider_id, items, rail}` with **no address**.
  - Checkout: `POST /api/pets/{petId}/shop-checkout` → `{order, payment, checkoutUrl, deeplink, qrContent}`. Server takes unit price from the catalog (client price is never trusted), does stock + Rx-relationship gating, creates an `orders` row `kind='product'`, and hands to the shared payments layer (`createCheckout`, rail currently hardcoded `mercadopago`). **Reuse as-is.**

### 2.4 Vet / grooming / telehealth storefront (Book)

- Primary CTA **Book** (already present). The audit's Book-primary + trust strip already live in `provider.jsx`.
- **Booking picks the service → capability.** The booking gotcha: `POST /api/providers/[id]/book` defaults `capability` to `'vet'` when none is passed. The unified flow must pass the capability of the **service the user selected** (or the category they arrived from). `BookingFormModal` already accepts a `capability` prop; the storefront must supply it (today `provider.jsx` only forwards a `capability` *route param*, and `vet.jsx` navigates **without** one — fine for vet, wrong for grooming). Fix: derive capability from the chosen `provider_services` row (map service → capability) or from the arriving filter category, and pass it into `BookingFormModal`.
- Telehealth's "video consult" primary action routes into the existing telehealth session flow rather than a physical booking (branch inside the Book action when capability = `telehealth`).

### 2.5 Pet-friendly place storefront (learn about it)

- Google-Places result → a **place profile** (not the provider shell). Fetch detail via `GET /api/places/[placeId]` (returns `name, address, lat, lng, rating, user_ratings_total, open_now, price_level, phone, website, google_maps_url, hours` weekday_text).
- Sections: photos (if available), about/info, **hours / open-now**, **directions** (hand-off to Apple/Google Maps — pattern already in `places.jsx` `openDirections`), **Save** (writes `saved_places` via `POST /api/saved-places`). **No cart, no booking.**

---

## 3. Data & API

### 3.1 Extend `/api/providers/discover` (the one real gap)

File: `apps/web/src/app/api/providers/discover/route.js`. Today it returns `id, slug, name, provider_type, bio, logo_url, avg_rating, review_count` and accepts only `?type=<capability>`. **Additive changes:**

**New/changed response fields per provider:**
- `lat`, `lng`, `location_name`, `address`, `hours_json` — from the **primary location** via `LEFT JOIN LATERAL`.
- `capabilities` — `string[]`, so cards render chips and the map/filters can group by category without a second call.
- `distance_km` — computed when `?lat/&lng` supplied.

**New query params:** `?lat=`, `?lng=`, `?radius=` (km), `?capability=` (accept a **comma list** to support a category's capability set; keep back-compat with the singular `?type=`), `?q=` (name/bio ILIKE), `?openNow=` (bool).

**Sketch (additive; porsager tagged-template style, one card per provider):**
```sql
SELECT
  p.id, p.slug, p.name, p.provider_type, p.bio, p.logo_url,
  (SELECT ROUND(AVG(r.rating)::numeric,1) FROM provider_reviews r WHERE r.provider_id = p.id) AS avg_rating,
  (SELECT COUNT(*)::int    FROM provider_reviews r WHERE r.provider_id = p.id) AS review_count,
  (SELECT array_agg(pc.capability) FROM provider_capabilities pc WHERE pc.provider_id = p.id) AS capabilities,
  loc.lat, loc.lng, loc.name AS location_name, loc.address, loc.hours_json
FROM providers p
LEFT JOIN LATERAL (
  SELECT lat, lng, name, address, hours_json
  FROM provider_locations pl
  WHERE pl.provider_id = p.id
  ORDER BY pl.id ASC              -- no is_primary flag today; lowest id = primary (see §6)
  LIMIT 1
) loc ON true
WHERE p.status = 'published'
  -- optional: capability-set filter, q ILIKE, radius via haversine on loc.lat/lng
ORDER BY /* distance when lat/lng given, else name */ ;
```
- **Distance/radius:** compute haversine from `?lat/&lng` to `loc.lat/lng` in SQL; filter by `?radius`; `ORDER BY distance`. No PostGIS needed; no schema change.
- **Dedupe:** one row per provider (chips carry the multi-capability info), so a multi-capability provider appears **once** — unlike today's `?type=` DISTINCT-per-query behaviour.
- **Providers with no location** return `lat=null` → they appear in the **list** but not on the **map** (and are excluded when a radius filter is active). This is honest and correct.

### 3.2 Places source & unification

- **Places stay a separate source** (verified: no `places` table; data is live from **Google Places** via the key-gated proxy `GET /api/places/search?lat&lng&category&radius`; favorites persist in `saved_places` keyed by Google `place_id`). **Do not convert places to provider rows** and do not add a "place" capability.
- **Unification is federation at the hub, not in the DB.** A new `useDiscover` hook fires **both** requests in parallel:
  1. `GET /api/providers/discover?…` → providers
  2. `GET /api/places/search?…` (only when a place category is active or "all") → places
  and merges into one `ResultCard[]` tagged `source: 'provider' | 'place'`. Sort/filter apply across the merged list. Each source **fails/loads independently**.
- **Why federation:** zero migration, respects the existing Google proxy + billing model, and keeps the provider booking/commerce spine clean. The place storefront is intentionally lightweight (no cart), which matches "learn about it."

### 3.3 `capabilities[]` → chips

- Discovery: chips come straight from the new `capabilities` array on each discover row.
- Storefront: `/api/providers/public/[slug]` **already returns `capabilities[]`** — the storefront just needs to **read** it (today it's returned but ignored).

### 3.4 Storefront catalog vs services (already wired)

`/api/providers/public/[slug]` already returns, in one call: `provider, locations, services` (active only, with `price_cents`/`image_urls`), `capabilities`, `products` (active `shop_products`), `posts`. **No new endpoint needed** to render the storefront — the profile screen already fetches everything; the work is UI (grid + product detail + cart) not API.

### 3.5 Booking contract (unchanged, used correctly)

`POST /api/providers/[id]/book` already generalizes to any capability and validates that the provider holds it. **No API change** — the fix is client-side: pass the right `capability`.

### 3.6 Additive-column candidates (flag; none required for v1; NO destructive migration)

| Want | Column(s) | Needed for | Recommendation |
|------|-----------|-----------|----------------|
| Deterministic "primary location" | `provider_locations.is_primary boolean default false` | map pin accuracy | **Optional.** v1 uses lowest `id`; add later if providers have many locations. |
| Delivery address on orders | `orders.shipping_address jsonb` (or reuse a saved address on `user_profiles`) | shop checkout with delivery | **Additive, only if delivery ships in P4.** Default v1 to **pickup** and defer address. |
| Per-product ratings / approval % / Q&A | new `product_reviews` / `product_questions` tables | rich product detail | **Deferred.** Omit from v1 detail (no fake data). |
| Product financing ("from X/month") | pricing/financing model | product detail line | **Deferred** (needs a financing provider). |
| Delivery/pickup capability per store | `shop_products`/provider flag | product detail delivery info | **Deferred.** |

All are **additive**. Nothing in this plan requires dropping or rewriting a column.

---

## 4. Component plan

### 4.1 Reuse as-is / lightly extend

| Component | File | Change |
|-----------|------|--------|
| `MapLocationView` | `components/Map/MapLocationView.jsx` | **Add `onMarkerPress(index)`** (markers currently have title/description but no press handler) + a `selectedIndex` highlight + allow `interactive` for the hub map. Already `PROVIDER_DEFAULT` (Apple on iOS) + multi-marker + auto-fit region. |
| `ProviderListControls` + `useProviderListFilter` | `components/Providers/ProviderListControls.jsx` | Extend the filter hook with **capability / distance / open-now / price**; add filter chips + a filter sheet. Search + sort reused verbatim. |
| `RatingBadge` | `components/Providers/RatingBadge.jsx` | Reuse in ResultCard + storefront. |
| `BookingFormModal` | `components/Providers/BookingFormModal.jsx` | Already accepts `capability`; ensure the storefront passes it from the chosen service. |
| Shop commerce (grid, `ProductRow`, cart, `doCheckout`) | `app/service/shop.jsx` | **Extract** `ShopCatalogModal`/`ProductRow`/cart/checkout into a reusable `StorefrontCommerce` module; **lift cart state** out of the modal. |
| Places list+map + `usePlaces` hooks | `app/service/places.jsx`, `hooks/usePlaces.js` | Reuse the search/save/directions/open-now patterns for the place storefront + the Places source in the hub. |
| `RefreshableScrollView`, `Card`, `GlassSurface`, `PressableScale` | `components/ui`, etc. | Reuse. |
| `formatMoney` | `utils/money.js` | Reuse. |
| `expo-location` permission pattern | e.g. `app/nearby-walks.jsx` (`requestForegroundPermissionsAsync` + `getCurrentPositionAsync`) | Reuse for the hub's location gate. |

### 4.2 Extract shared (new, but built from existing pieces)

| New component | Built from | Purpose |
|---------------|-----------|---------|
| `ResultCard` | `vet.jsx` `ProviderCard` + `places.jsx` place card | One card for both providers and places (logo/name/chips/★/price/distance; place variant shows open-now + address). |
| `HubMap` | wraps extended `MapLocationView` | Discovery map: one pin per result, marker-tap ↔ card-select sync. |
| `HubFilters` | extends `ProviderListControls` | Category chips + distance/rating/open-now/price + list⇄map toggle. |
| `DiscoverBottomSheet` | `@gorhom/bottom-sheet` (confirm) or `Animated`/`PanResponder` | Mobile draggable list over the map. |
| `StorefrontShell` | generalized `provider.jsx` | Type-adaptive storefront; primary action from `capabilities[]`. |
| `StorefrontCommerce` | extracted from `shop.jsx` | In-store catalog + cart + checkout, embeddable in the storefront. |
| `ProductDetailSheet` | **new** | Carousel + price + read-more + stock/Rx + add-to-cart. |
| `PlaceStorefront` | `places.jsx` detail patterns | Google-Places "learn about it" profile. |
| `useDiscover` | new hook | Federates providers + places into one result stream. |

### 4.3 Screens to retire vs keep

| Screen | Fate |
|--------|------|
| `app/(tabs)/services.jsx` | **Becomes the Hub** (grid → discovery). |
| `app/service/vet.jsx`, `grooming.jsx`, `telehealth.jsx` | **Retire after P6 parity** — folded into the Veterinary category + storefront (the explicit merge). |
| `app/service/walking.jsx`, `daycare.jsx`, `sitting.jsx`, `training.jsx` | **Retire after parity** (Care & boarding category) — same discover-list shape as vet.jsx. Lower priority than the Vet merge. |
| `app/service/shop.jsx` | **Keep the route** but its catalog/cart/checkout are extracted into `StorefrontCommerce`; the standalone "Shops" browse becomes a hub category. Orders/Subscriptions tabs stay reachable. |
| `app/service/places.jsx` | **Fold into the hub** as the Places category + `PlaceStorefront`; keep the "Saved" places view reachable. |
| `app/service/provider.jsx` | **Becomes `StorefrontShell`** (generalized). |
| `app/service/adoption.jsx`, `insurance.jsx`, `transport.jsx` | **Keep as specialized flows** (adoption browse, insurance marketplace/quote, transport booking are not plain provider discovery). Optionally surface as hub categories that deep-link into these flows. |

---

## 5. Phased rollout

Each phase is independently reviewable. Effort is rough (1 = ~day, 5 = ~week+).

### P1 — Backend: coords + query/capability params  ·  Effort 2  ·  Risk Low  ·  Shippable alone ✅
- **Files:** `apps/web/src/app/api/providers/discover/route.js` (+ its test).
- **Do:** add `lat/lng/location_name/address/hours_json` (LATERAL join), `capabilities[]`, `distance_km`; add `?lat/&lng/&radius/&capability(comma)/&q/&openNow`; keep `?type=` back-compat.
- **Risk:** query correctness under RLS (route is already `withRequestContext`, published-only, no consent). Dedupe (one row/provider).
- **Test:** unit tests for each param combo; providers with no location return `lat=null` and are excluded by radius; capability-set matching; back-compat `?type=` unchanged. Integration test as `pawpi_app` if it touches RLS-scoped tables.
- **Ship:** no UI consumes the new fields yet → safe to merge.

### P2 — Unified discovery list (list + filters + search)  ·  Effort 3  ·  Risk Low  ·  Shippable alone ✅
- **Files:** `app/(tabs)/services.jsx` (grid → list), new `ResultCard`, `HubFilters`, `useDiscover` (providers only in this phase), extend `useProviderListFilter`; i18n keys.
- **Do:** render the merged-ready list (providers only for now) with category/distance/rating/price filters + search + sort + all screen states. **No map yet.**
- **Risk:** IA change is visible to users; keep the old per-capability screens reachable until P6 so nothing breaks.
- **Test:** filter/sort/search unit tests; state snapshots (loading/empty/no-results/error/no-permission).
- **Ship:** yes — a strictly better list even without the map.

### P3 — iOS map + marker tap + list⇄map / bottom sheet  ·  Effort 3  ·  Risk Med  ·  Shippable alone ✅ (iOS)
- **Files:** extend `MapLocationView` (`onMarkerPress`, `selectedIndex`, `interactive`), new `HubMap`, `DiscoverBottomSheet`, toggle in `HubFilters`; confirm/add bottom-sheet dep.
- **Do:** iOS Apple-Maps map, one pin per result, pin↔card highlight; mobile bottom-sheet + toggle; **web split** (list left / map right) via the web-maps shim.
- **Risk:** map performance with many pins; bottom-sheet gesture conflicts with list scroll; **Android must degrade to list-only** (guard the map behind a platform/key check).
- **Test:** marker-tap selects card; card-tap focuses pin; Android renders list-only; region auto-fit with mixed/absent coords.
- **Ship:** yes on iOS + web; Android unaffected (list-only).

### P4 — Unified storefront (converge profile + shop)  ·  Effort 5  ·  Risk Med-High  ·  Shippable alone ✅
- **Files:** `app/service/provider.jsx` → `StorefrontShell`; extract `StorefrontCommerce` from `app/service/shop.jsx`; new `ProductDetailSheet`; lift cart state; wire capability-aware Book.
- **Do:** read `capabilities[]` → per-type primary action; embed in-store product grid + product detail + cart + checkout (reuse `shop-checkout`); pass the selected service's capability into booking.
- **Risk:** **the booking-capability gotcha** (must pass capability or grooming books as vet); cart-state lift must not regress the working shop loop; checkout is real money — **do not alter the server contract**, only the client wiring; product detail must **omit** fields with no data (no fakes).
- **Test:** port `shop.*.test`/`provider.*.test` coverage; a grooming booking sends `capability='groomer'`; add-to-cart → checkout still hits `shop-checkout` with catalog-priced items; product detail renders with only real fields.
- **Ship:** yes — behind the storefront entry; the old `/service/shop` route stays until parity.

### P5 — Fold in pet-friendly places  ·  Effort 2  ·  Risk Low  ·  Shippable alone ✅
- **Files:** `useDiscover` (add Places source), `ResultCard` place variant, new `PlaceStorefront`, reuse `usePlaces`/`saved-places`.
- **Do:** Places category in the hub (federated), place pins on the map, "learn about it" storefront (directions/save/hours), Saved view reachable.
- **Risk:** `GOOGLE_PLACES_API_KEY` currently **unset** → Places degrade to unconfigured/empty (proxy already returns `{configured:false}`); billing is a Google-side dependency.
- **Test:** unconfigured-key path shows the graceful empty state and does **not** blank providers; save/unsave; open-now from Google.
- **Ship:** yes — providers work regardless of the Places key.

### P6 — Retire merged screens after parity  ·  Effort 2  ·  Risk Med  ·  Shippable alone ✅
- **Files:** remove/redirect `app/service/vet.jsx`, `grooming.jsx`, `telehealth.jsx` (then optionally `walking/daycare/sitting/training`); migrate their test coverage onto the hub/storefront; update any deep links.
- **Do:** only after the hub + storefront reach feature parity; leave `redirect` stubs for existing deep links (`/service/vet` → hub with the Veterinary filter).
- **Risk:** losing test coverage or breaking deep links → **port tests first**, add redirects.
- **Test:** deep-link redirects resolve; retired screens' behaviours are covered by hub/storefront tests.
- **Ship:** yes, incrementally (retire vet/grooming/telehealth first).

### Later — Android map  ·  Effort 2  ·  Risk Med  ·  Depends on Google Cloud
- **Files:** `apps/mobile/app.json` — add `android.config.googleMaps.apiKey`, add `ACCESS_FINE_LOCATION`/`ACCESS_COARSE_LOCATION` to `android.permissions`; remove the Android list-only guard.
- **Needs (state exactly):** (1) a **Google Maps SDK for Android** API key, (2) **billing enabled** on the Google Cloud project, (3) the key wired via `app.json` (or an env-injected config), (4) a new EAS build. Until all four exist, Android stays **list-only**.
- **Test:** Android renders the map with markers; permission prompt uses the existing location strings.

---

## 6. Risks & open questions (with recommended defaults)

1. **Booking-capability gotcha.** `POST /api/providers/[id]/book` defaults `capability='vet'`; `vet.jsx` navigates to the profile with no capability param. → **Default:** the storefront derives capability from the **selected service** (map `provider_services` → capability) and passes it into `BookingFormModal`; the arriving hub category seeds a fallback. Add a test asserting a grooming booking sends `capability='groomer'`.

2. **Places data model.** Places are live Google Places, not provider rows; no `places` table. → **Default:** **federate** — hub queries providers + places in parallel and merges; place storefront is "learn about it" (no cart). No migration.

3. **Primary location (no `is_primary`).** `provider_locations` has no primary flag. → **Default:** v1 picks the **lowest `id`** as primary for the map pin; add `is_primary boolean` (additive) later if multi-location providers need control.

4. **Open-now for providers.** Places get `open_now` free from Google; providers only have `hours_json`. → **Default:** compute open-now **client-side** from `hours_json` + device time for v1 (timezone edge cases accepted); server `?openNow=` filter can follow once a timezone strategy is set. If `hours_json` shape is unproven, **ship open-now for places only in P5** and add providers when the data is confirmed.

5. **Delivery address at checkout.** `shop-checkout` collects **no address** today. → **Default:** v1 ships **pickup-only** (no address); add `orders.shipping_address jsonb` (additive) + a select-all cart + address step only if delivery is in scope for P4. Keeps real-money checkout unchanged initially.

6. **Rich product-detail fields (rating/approval %/Q&A/financing/delivery).** No backing data. → **Default:** **omit** from v1 (no fake data); list as additive future tables/columns. Product detail v1 = carousel + price + read-more + stock + Rx + add-to-cart.

7. **Cart state lift.** Cart is `{productId:qty}` local to `ShopCatalogModal`. → **Default:** lift to a **per-store** cart hook/context; do not attempt a cross-store cart (checkout is per-provider). Port the existing shop tests to guard the loop.

8. **Bottom-sheet dependency.** → **Default:** use `@gorhom/bottom-sheet` **if already a dependency**; otherwise a minimal `Animated`/`PanResponder` sheet to avoid a new native dep. **Confirm in P3.**

9. **Web map reuse.** `@teovilla/react-native-web-maps` is a dependency. → **Default:** reuse the RN `HubMap` through the web shim rather than authoring a second web-only map, unless the shim can't do bi-directional highlight — then a thin web variant.

10. **Retiring screens = losing tests.** → **Default:** **port coverage first**, add deep-link redirects, retire vet/grooming/telehealth before the care-&-boarding set.

11. **Android maps + Places billing.** Two separate Google costs: **Maps SDK (Android)** and **Places API (all platforms)**. → **Default:** iOS-first (Apple Maps free); Android map is a later phase; Places degrade gracefully until `GOOGLE_PLACES_API_KEY` + billing exist.

12. **Payment/checkout implications.** Checkout is real money via the shared payments layer (MercadoPago live). → **Default:** P4 changes **only the client wiring**; the `shop-checkout` server contract and `createCheckout` are untouched. One live E2E test before enabling the storefront checkout for all users.

---

## 7. i18n (note only — no strings added this pass)

- **Every** new user-facing string must go through `t()` — no hardcoded English in the eventual build.
- Keys land in `apps/mobile/src/i18n/locales/en.json` **and** `es.json` (neutral LatAm Spanish, "tú"), reusing existing namespaces where they fit: `services.*`, `providers.*`, `places.*`, `map.*`, `search.*`, `common.*`. New sub-trees like `services.hub.*` and `storefront.*` for the net-new surfaces.
- Reusable strings already present: `providers.book`, `providers.bookFromPrice`, `providers.fromPrice`, `providers.searchPlaceholder`, `providers.sort*`, `providers.noMatchBody`; `places.openNow/closed/directions/locationDenied/noResults/nearby/saved`; `map.myLocation/noLocation`. Extend, don't duplicate.
- Keep the three profile types distinct (Dog Social / Dog Profile / Pet Medical) — untouched by this redesign.

---

## Appendix — verified facts (confirm-don't-re-derive)

- **One provider, many capabilities** — `providers` + `provider_capabilities`; `ALLOWED_CAPABILITIES` in `apps/web/src/app/api/utils/providerAuth.js`; `provider_type` display-only. ✔
- **`provider.jsx` is already type-agnostic** and fetches `{provider, locations, services, capabilities, products, posts}` from `/api/providers/public/[slug]`; branches on array presence, **does not read `capabilities[]`** yet. ✔
- **Working commerce loop** in `app/service/shop.jsx` (product list, `{productId:qty}` cart, steppers, `shop-checkout`); **no product detail, no select-all, no address, no in-store search, no favorites** today. ✔
- **`MapLocationView`** — `PROVIDER_DEFAULT` (Apple on iOS), multi-marker + auto-fit; **markers have no `onPress`**; `interactive` defaults false. ✔
- **`places.jsx`** — working list+map (single `ScrollView`, `MapLocationView` on top); Google Places via `/api/places/search`; `saved_places` favorites; **not providers**. ✔
- **`ProviderListControls` + `useProviderListFilter`** — client-side search + sort, additive; reuse for filters. ✔
- **Discover gap** — `/api/providers/discover` returns **no `lat/lng`, no `capabilities[]`**, single `?type=`. Coords exist on `provider_locations` (`lat/lng numeric(9,6)`, `hours_json`). ✔
- **Booking defaults to `vet`** — `POST /api/providers/[id]/book` (`capability ?? 'vet'`), validates the provider holds the capability. ✔
- **Maps deps** — `react-native-maps@1.20.1`, `@teovilla/react-native-web-maps@0.9.5`, `expo-location@~19.0.8`. iOS has `NSLocationWhenInUseUsageDescription`; **Android app.json has no Maps key and no location permission**. `GOOGLE_PLACES_API_KEY` server-only, currently unset. ✔
