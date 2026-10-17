# Walker Marketplace + Business Polish + Owner Nav — Wave Plan

**Status:** PLAN + decisions locked with Tats (2026-08-13). Tickets are written one at a time and
built by a separate Claude Code chat (one branch per ticket → gates green → PR → STOP → Tats merges).
**Method:** investigate the real repo first (assume a feature exists until grepped — the "adoption
lesson" / "walk lesson"); discuss design forks before writing tickets; then house-format grey-box
tickets, sequenced by dependency.

Sibling ticket files in this folder use the `A1 / A2 / B1…` prefixes from this plan.

---

## 0. Investigation — what already exists vs. net-new (verified against code)

- Checkout is current `main` (PR #360 business hub v2, #361 live walk map both present). Migrations
  live in `supabase/migrations/`, latest **0087 → next free 0088** (each ticket takes the next free
  number at build time).
- **`docs/SERVICES_HUB_PLAN.md` has largely SHIPPED.** The owner **Services tab is already a unified
  hub**: a `[Discover | My Activity]` segmented shell (`(tabs)/services.jsx` → `ServicesDiscovery` +
  `MyActivity`). Discover is the merged provider discovery with category chips + geo. So the owner-nav
  redesign (D) is a **re-carve of an already-unified hub**, not a green field.
- **Discovery + geo already done:** `/api/providers/discover` returns `capabilities[]` + primary-location
  `lat/lng` + accepts `?lat/&lng/&radius/&capability/&q/&openNow`.
- **"Available now": net-new.** `provider_availability` is *recurring weekly windows* (weekday/start/end/
  slot) for booking slots — no live presence/online toggle exists anywhere.
- **Packages/credits: net-new.** No credit/balance primitive; walks today go through the shared booking
  modal (`capability='walker'`; on-demand = one-off slot, recurring = weekly-pack *bookings*).
- **Walk sessions strong base:** `walk_sessions` (migration 0033) has `status`
  (scheduled→in_progress→finished→cancelled), `started_at/ended_at`, `distance_m`, `duration_s`,
  `route` jsonb `[{lat,lng,t}]`, `photo_urls[]`. **No pickup-location column.** `walker-walks.jsx` is the
  walker's *active* check-in/track/finish workspace (reuses `WalkerLiveMap`); there is **no walker-facing
  past-walks history browser** (PR #361 added history to the owner's vet record only).
- **Transport** (`transport_trips`, migration 0052; trip lifecycle + `/track` live pings) is the template
  for pickup/lifecycle + a confirm/claim action.
- **Adoption applications:** managed on **web only** (`provider/components/ProviderAdoption.jsx` + routes
  `providers/[id]/adoption-applications` and `.../[applicationId]`). Not on the mobile business hub.
- **Owner tabs today:** Feed / Health / Training / Services / Profile. **Training tab = DIY self-training
  curriculum** (distinct from hiring a trainer). Pet-friendly places/cafés already exist (`places`,
  migration 0075).

## 1. Locked decisions

- **Owner IA (D): Split by intent.** Rename **Services → "Stores & Vets"** (vets, clinics, shops,
  places/cafés); grow the **Training tab into a "Care" hub** (DIY training + walkers + trainers +
  daycare + sitting). (Note: re-carves the recently-unified Discover hub — relocate, don't rebuild.)
- **Walker-needed (C): direct request (v1) + broadcast to nearby available walkers (v2).** No request
  board.
- **Packages (#4/#5): prepaid walk-credit balance.** Walker sets the discount; default offerings
  **single / 10-pack / 20-pack**. Owner buys → balance of walks. Credits are **schedulable with the
  walker**, and a **QR scan at pickup deducts one** credit and starts the walk.
- **Available now (#3): both** — a live "accepting walks" toggle *and* keep the recurring availability
  windows.

## 2. Open micro-decisions (defaults chosen; confirm before B2/B3)

- **QR direction (default):** the **owner's app shows the QR, the walker scans it** at pickup — proves
  they're physically together and ties the deduction to a real handover. Server verifies + deducts +
  starts the `walk_session`.
- **Credit scoping (default):** credits are **per owner↔walker (provider)**, usable across that owner's
  pets. Purchase requires the walker's payments to be set up (reuse existing MercadoPago checkout).

## 3. Sequenced ticket plan (migration flags)

**Wave A — cheap wins (do now)**
- **A1 — Business hub pull-to-refresh** (Today + Bookings; reuse `RefreshableScrollView`). *No migration.*
- **A2 — Adoption applications on the mobile business hub** (review inbox: list + approve/decline/
  under-review + contact; reuse the existing web routes). *No migration.* **[MERGED]**
- **A3 — Adoption applications: group by dog + search + declined-at-bottom + message the applicant**
  (A2 follow-up; adds one provider-initiated "open thread" route, reuses provider-chat). *No migration.* **[MERGED, PR #364]**
- **A4 — Adoption applications on the WEB dashboard: group by dog + message the applicant** (web parity
  for A2/A3; reuses A3's thread route + deep-links `/provider/chats?thread=`). *No migration. Web-only.*
  **[MERGED, PR #365]**

**Wave B — walker marketplace core** — ✅ **COMPLETE & LIVE.** Ran as an autonomous chain
(`WAVE-B-README-walker-marketplace.md` + `B1`–`B5`). All 5 PRs merged (#366 B1, #367 B2, #368 B3,
#369 B4, #370 B5). Migrations **0088–0091 applied + verified on Supabase** (+ verify-helper fix #372).
Gates on `main`: web vitest 1920 · integration 855 · mobile jest 1708. Remaining: on-device pass on a
real build (camera scan + live GPS can't be exercised by simulators/tests).
- **B1 — "Available now" live toggle** (presence flag + optional current area; windows untouched).
  *Migration.* Foundational for the C2 broadcast.
- **B2 — Walk offerings + credit packs** (walker sets single/10/20 + discount; owner buys → balance;
  checkout reuses payments). *Migration.*
- **B3 — QR pickup check-in that deducts a credit** (owner shows QR → walker scans → one action starts
  the `walk_session` AND decrements the balance; capture pickup location). *Migration.* Depends on B2.
- **B4 — Schedule a credit walk with the walker** (owner books against the balance; walker confirms).
  *Small/no migration* (reuses booking + B2's credit link).
- **B5 — Walker walk history with map** (past finished sessions; route drawn, which dog, pickup point).
  *No migration* once B3 adds pickup capture.

**A4 + Wave C + Wave D — SECOND AUTONOMOUS RUN** — ✅ **COMPLETE & LIVE.** Ran `A4 → C1 → C2 → D1 → D2`
auto-merging each when green. PRs: A4 #365 (pre-existing), C1 #373, C2 #374, D1 #375, D2 #376 (+ docs #377).
Migrations **0092 (walk_requests + accept DEFINER + notify types) & 0093 (broadcast read policy + DEFINER
staff-reader + live index) applied + verified on Supabase.** Gates on `main`: web vitest 1920 · integration
872 · mobile jest 1724. Notable: the accept-booking is created inside the DEFINER helper (no provider
INSERT policy on `vet_appointments`); a DEFINER staff-reader fixed a latent gap where request notifications
reached nobody; `/service/walking` (C1/C2 owner surfaces) is now reachable via Care→Hire. Remaining:
on-device pass (camera QR + live GPS).

**Wave C — walker-needed request**
- **C1 — Direct "request this walker"** (reuse booking + messaging). *Low/no migration.*
- **C2 — Broadcast "walker needed" to nearby available walkers** → alerts → accept/claim (transport_trips
  template). *Migration.* Depends on B1.

**Wave D — owner IA re-carve**
- **D1 — Rename Services → "Stores & Vets"** + scope its Discover to vets/clinics/shops/places/cafés.
  *No migration* (config + i18n).
- **D2 — Grow Training → "Care" hub** (DIY training + hire walkers/trainers/daycare/sitters; relocate,
  don't rebuild, the walker/credit surfaces here). *No migration.*

**Sequencing note:** D re-homes where owners find walkers, so it lands *after* the walker features exist
(relocate finished surfaces, don't build owner entry points twice). D1 is cosmetic and may jump earlier
if the rename should be visible sooner.

## 4. Parked "anything else?" candidates (Tats to pull in as desired)

Walker ratings/reviews (discover already surfaces some rating data), recurring bookings, package
expiry / refunds / cancellation policy, ETA + geofenced auto-pickup, in-walk live chat/photos (walk
sessions already carry photos), tipping, walker verification/onboarding, safety/SOS (share-live-location
already exists — SOS is a small add).
