# PawPi — PROMPT 3: Services Hub + Storefronts — PLAN FIRST (do not build yet)

Paste into a fresh Claude Code conversation on its own branch. This is a PLANNING task:
it produces a spec + phased implementation plan for sign-off, and stops before building.

---

```
ROLE
You are planning a redesign of PawPi's Services tab into the app's primary marketplace —
a discovery surface (map + list + filters) that leads into per-store "storefronts" the
user can browse and buy/book from. This is a PLAN-FIRST task: produce a complete design +
phased implementation plan and STOP. Do NOT implement until I approve the plan. Small
zero-risk scaffolding is fine; no feature code and no schema changes in this pass.

BRANCH & SAFETY
- Base on the latest `main` (git fetch first — the audit fixes and payment work are on
  main). Branch `feat/services-hub` (worktree if the folder is shared).
- Deliverable is the plan doc; commit only that. Do NOT merge, push to main, or deploy.

THE VISION (founder — build the plan around this)
The Services tab becomes PawPi's main sales/business area. It has TWO layers:

LAYER 1 — DISCOVERY (map + list + filters). Reference: an Airbnb/Booking-style split.
- The user opens Services and can find ANYTHING pet-related nearby: vets, grooming,
  telehealth, shops/stores, and pet-friendly places (cafés, restaurants, etc.).
- A LIST of results and a MAP with location pins, plus SEARCH and FILTERS to narrow by
  category, distance, rating, open-now, price, etc. Tapping a pin highlights its list
  card and vice-versa.
- WEB can show the true side-by-side split (list left, map right). MOBILE cannot — plan
  the mobile pattern as a full-screen map with a draggable BOTTOM-SHEET list + filter
  chips pinned on top, AND a list⇄map toggle. Specify both layouts.
- This MERGES today's silos: Vet + Grooming + Telehealth collapse into one "Veterinary"
  provider umbrella (one profile, capability chips), and the current pet-friendly Places
  section folds in as a filter category. Shops appear here too.

LAYER 2 — STOREFRONT (enter a result → browse → buy/book). Reference: Rappi / Glovo.
When the user taps a result, they enter that provider/store/place. The storefront adapts
its primary action to the TYPE:
- Store/shop: a mini storefront — search within the store, browse categories, see a
  product grid (with favorites), open a PRODUCT DETAIL (image carousel, title, rating +
  review count, approval %, Q&A count, price [+ optional "from X/month" financing line],
  description with "read more", delivery/pickup info) and ADD TO CART. A CART with
  per-item quantity steppers, select-all, delivery address, and CHECKOUT.
- Vet / grooming / telehealth: the profile leads to BOOK (pick the capability/service),
  with about/info, services offered, ratings & reviews, and the audit's Book-primary CTA
  + trust strip.
- Pet-friendly place (café/restaurant/park): about/info, photos, hours/open-now,
  directions/map, save — a "learn about it" profile, no cart unless it also sells.
The storefront always supports: search within it, learn about it (about/info), see what
they offer (catalog or services), and the type-appropriate primary action (buy or book).

WHAT'S ALREADY TRUE IN THE CODE (verified in the audit — confirm, don't re-derive)
- Backend ALREADY models one provider with multiple capabilities: `providers` +
  `provider_capabilities`; discovery matches on capability; `provider_type` is
  display-only (apps/web/.../utils/providerAuth.js). `app/service/provider.jsx` is ALREADY
  the type-agnostic unified profile. Merging Vet/Grooming/Telehealth is a mobile-IA
  change, NOT a migration.
- A working commerce loop ALREADY exists: `app/service/shop.jsx` has product grid, cart
  with quantity steppers, and checkout (the audit rated Shop the most complete flow).
  REUSE and generalize it into the storefront rather than rebuilding — the plan should
  say exactly how provider profiles and the shop converge into one storefront pattern.
- `components/Map/MapLocationView.jsx` already renders multiple markers + auto-fits;
  `app/service/places.jsx` is a working list+map+location reference. The audit added
  `components/Providers/ProviderListControls.jsx` (search + sort) — reuse for filters.
- GAP: the discover API returns NO coordinates — `discover/route.js` projects no lat/lng
  (coords live on `provider_locations`). The map needs coords added to discover.
- GAP: `MapLocationView` markers have no onPress (need marker-tap → highlight/open).
- Booking defaults to `vet` (book/route.js) — a merged profile MUST pass the selected
  capability or a grooming booking books as a vet.
- Pet-friendly places currently live in `app/service/places.jsx` as a separate flow —
  plan how they unify (are places `providers` rows with a "place" capability, or a
  separate source the hub queries alongside providers?). Recommend an approach.

MAPS — PLATFORM DECISION (already made)
- iOS-FIRST using Apple Maps (react-native-maps PROVIDER_DEFAULT, free, no key). Plan the
  map to ship on iOS now.
- Android needs a Google Maps API key + billing (not yet in app.json). Plan Android as a
  later phase; the map should degrade to list-only on Android until the key exists. State
  exactly what Android needs.

PRODUCE THIS PLAN → anything/docs/SERVICES_HUB_PLAN.md
1. Discovery UX/IA: the hub layout for BOTH web (split) and mobile (map + bottom-sheet
   list + toggle); the filter taxonomy (categories: Veterinary [vet/grooming/telehealth],
   Shops, Pet-friendly places, + others); search/type-ahead; sort; and all screen states
   (loading / no-location-permission / empty / no-results / error).
2. Storefront UX/IA: the per-type storefront (store vs vet vs place) — how one component/
   pattern adapts primary action by type; the product-detail sheet; the cart & checkout
   (reusing shop.jsx); and how vet/grooming/telehealth Book picks the service.
3. Data & API: exactly what `discover` must return (add lat/lng/location_name via LEFT
   JOIN LATERAL on the primary provider_locations; params ?lat=&lng=&radius=&capability=
   &q=&openNow=), how places are sourced/unified, how capabilities[] render as chips, and
   how the storefront pulls catalog (products) vs services. Additive columns only — flag
   anything that would need a destructive migration (avoid).
4. Component plan: reuse (MapLocationView + new onMarkerPress; ProviderListControls;
   places.jsx list+map pattern; shop.jsx cart/checkout), extract shared (ProviderCard,
   ResultCard, EmptyState, Storefront shell), and which screens retire
   (vet/grooming/telehealth) vs keep.
5. Phased rollout — sequence into safe, independently-reviewable phases, each with files
   touched, risk, test plan, and whether it's shippable alone. Suggested spine:
   P1 backend coords + query/capability params; P2 unified discovery screen (list +
   filters + search); P3 iOS map + marker tap + list⇄map/bottom-sheet; P4 unified
   storefront (converge provider profile + shop, per-type primary action, product detail,
   cart/checkout); P5 fold in pet-friendly places; P6 retire old screens after test
   parity; Android map as a later phase.
6. Risks & open questions: booking-capability gotcha, places data model, porting retired
   screens' test coverage, payment/checkout implications, Android key — with your
   recommended default for each open question.
7. i18n: note ALL new user-facing strings must go through t() (keys in
   src/i18n/locales/en.json + es.json, neutral LatAm Spanish "tú"); no hardcoded English
   in the eventual build. (Note only — no strings this pass.)

RULES
- Do NOT ask me questions — put genuine unknowns in "Open questions" with your best
  default for each.
- No fake/mock data in the design; real empty states only.
- Keep the three profile types distinct (Dog Social / Dog Profile / Pet Medical) — this
  redesign is the Services/provider/storefront surface, not those.

STOP after writing SERVICES_HUB_PLAN.md and give me: a one-page summary of the hub +
storefront, the phase list with effort/risk per phase, and the open questions with your
recommended answers. Wait for my go-ahead before building anything.
```
