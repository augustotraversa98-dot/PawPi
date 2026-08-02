# PawPi — End-to-End Product / UX / QA Audit

**Base branch:** `main` @ `54cbc63` · **Audit branch:** `audit/app-ux-review`
**HEAD:** see appendix · **Date:** 2026-08-02
**Scope:** mobile (`anything/apps/mobile/src`) primary; web API (`anything/apps/web`) traced for data flow.

> **Status:** **Fixed on branch** (committed here) · **Proposed** (needs sign-off) · **Open** (noted)
> **Severity:** **P0** breaks/loses data or blocks a core task · **P1** major confusion/friction · **P2** polish
> **K/G** = Kid (7) & Grandparent (75) test.

This audit traced real code and data flows (UI → state → DB write → refetch → resurface). Safe, additive
fixes were implemented on this branch with tests; structural/backend changes are proposed with concrete plans.
No fake/mock data was introduced; nothing was merged, pushed to main, or deployed.

---

## Executive summary — top 10 by impact

| # | Issue | Sev | Status |
|---|-------|-----|--------|
| 1 | **Vet/business access requests never reached the Notifications bell** — visible only on More → Data Access, per pet, if the owner navigated there. No badge, no push. | P1 | ✅ Fixed |
| 2 | **HealthTrack: tapping 5 of 14 tracker cards did nothing** — worst: a fully-built Weight modal was unreachable (missing `action`). Reads as "app is broken." | P1 | ✅ Fixed |
| 3 | **Same price shows two different currencies** — `shop.jsx` renders `price_cents` as `ARS X`, `provider.jsx` renders the identical value as `$X` (USD-looking). Trust/conversion bug. | P1 | ✅ Fixed |
| 4 | **VetRecord "Add Record" primary CTA is a dead end** — every type opens a "Coming Soon" alert, while the real add paths are hidden in collapsed sections. | P1 | Proposed |
| 5 | **A vet's note produces zero awareness** — no notification/badge; the notes section is collapsed + lazy-loaded, so the owner never knows a note was added. | P1 | Proposed (backend) |
| 6 | **Vet note attribution is weak; owner can delete vet notes** — only free-text `vet_name` stored (null → renders as "You"); owner can hard-delete despite UI promising they can't. | P1 | Proposed |
| 7 | **No search/filter on provider lists** — no search-by-name, no sort by rating, no type-ahead across 7 discovery screens. | P1 | ✅ Fixed |
| 8 | **No discovery map for vets/providers** — Map components render pins but the discover API returns no coordinates. | P1 | Proposed (E) |
| 9 | **Provider detail conversion was weak** — no price near the CTA, two co-equal CTAs, rating not pinned, reviews buried. | P1 | ✅ Fixed (quick wins) |
| 10 | **Services taxonomy siloed** — Vet/Grooming/Telehealth are separate screens for what the schema already models as one multi-capability provider. | P1 | Proposed (C) |

**Also flagged (P2):** dead components with hardcoded fake vet data (`VetInformation.jsx` — "Happy Paws Veterinary Clinic / Dr. Sarah Johnson", plus unused `RecentRecords.jsx`/`RecordCard.jsx`); missing error states on Feed and Community (a fetch failure looks like "empty"); PII in logs (`useFeedData.js` logs auth email + user id every render); onboarding submit failure shows a raw `alert(error.message)`.

---

## Findings — detail

### A. Vet note trace (mandatory) — traced; gaps proposed

**Flow (verified):** vet note → `vet_notes` table → surfaced inline in the owner's Vet Record.

- **Storage & scoping — OK.** Owner path: `components/Health/VetRecord/AddVetNoteModal.jsx:43` → POST `/api/vet-record/notes` → `INSERT vet_notes(pet_id, owner_user_id, vet_name, note_date, note, appointment_id)` (`apps/web/.../api/vet-record/notes/route.js:75`). Vet path (the `vet@vet.com` case) is the **web/provider** route `apps/web/.../api/providers/[id]/pets/[petId]/notes/route.js`, gated by `assertCareAccess(petId, providerId, "medical_write")`, stamping `owner_user_id` from `pets.owner_user_id`. There is **no mobile UI** for a vet to write a note (expected — vets use the web dashboard). Scoping by `pet_id` + `owner_user_id` is correct; data cannot cross pets or owners.
- **Owner sees it — OK.** `components/Health/HealthVetRecord.jsx:252` GET `/api/vet-record/notes?petId=` → rendered `HealthVetRecord.jsx:1722`; also aggregated in `useVetSummary.js` → `/api/vet-record/full-summary`.
- **Attribution — WEAK (P1).** Only free-text `vet_name` is stored — no author id/email; `vet@vet.com` is never persisted. `HealthVetRecord.jsx:1751` renders `{note.vet_name || "You"}`, so a vet note with a null name is **misattributed to the owner as "You."**
- **Awareness — MISSING (P1).** Nothing writes a `notifications` row on note creation; the notes section defaults **collapsed** (`HealthVetRecord.jsx:99`) and only fetches when expanded (`:262`). The owner gets no signal a note exists.
- **Integrity — owner can delete a vet note (P1).** `apps/web/.../api/vet-record/notes/route.js:118` deletes by `id AND owner_user_id`; vet notes carry the owner's id, so the owner's trash icon (`HealthVetRecord.jsx:1762`) removes them — contradicting the modal copy `AddVetNoteModal.jsx:134` ("Vets… can't edit or delete them — only you can").
- **Dead code (P2).** `components/Health/VetRecord/VetInformation.jsx` (hardcoded fake clinic/vet), `RecentRecords.jsx`, `RecordCard.jsx` have zero importers.

→ Awareness + attribution + append-only enforcement are **Proposed** (backend + migration) — see Bigger Bets.

### B. Vet access request → owner awareness (mandatory) — ✅ Fixed on branch

**Confirmed bug:** a pending `care_access_grants` request surfaced **only** on `app/(tabs)/more/data-access.jsx` (per-pet, `useCareAccessGrants(petId)`), which the owner had to open manually. It was **absent from `app/notifications.jsx`**, which merges only social notifications (`/api/notifications` = paw/bark/follow) + local reminders. The `care_access_grants` and `notifications` tables are separate and nothing bridged them.

**Fix (commit `ba315c1`):** `notifications.jsx` now merges the owner's **pending** grants (owner-scoped `useAllCareAccessGrants`, reactive, survives restart) as tappable items → route to Data Access to approve/deny; added a **"Requests"** filter chip; and `FeedHeader.jsx` counts pending requests toward the **bell badge** so a request can't be missed. Additive/client-side, no schema change. Tests: surfacing, pending-only filtering, tap-through, chip.
**Re-traced:** a pending grant for "Mango" now appears in the bell with the provider name and routes to approve/deny. ✅

### C. Services taxonomy (Vet + Grooming + Telehealth) — Proposed (no migration needed)

**Key finding: the unified multi-service model already exists in the backend.** A `providers` row is decoupled from service type via a `provider_capabilities` join table; discovery already matches on capability, not `provider_type` (which is display-only since ticket 2.1 — `apps/web/.../utils/providerAuth.js:24`). A provider already surfaces under multiple types today (`discover/route.js` comment: a "vet shop" appears under both `?type=vet` and `?type=shop`). What is siloed is the **mobile IA**: `app/service/vet.jsx`, `grooming.jsx`, `telehealth.jsx` are ~95% identical scaffolds each hardcoding one capability. `app/service/provider.jsx` is **already the type-agnostic unified profile**.

**Proposal (analysis only — needs sign-off):**
1. Collapse the Vet/Telehealth/Grooming tiles into one parameterized discovery screen (`/service/discover?type=…`); keep the `services.jsx` grid as the entry point. Extract the triplicated `ProviderCard`/`EmptyState` into `components/Providers/`.
2. On `provider.jsx`, render the `capabilities[]` the API already returns as chips ("Vet · Grooming · Telehealth"), and let the Book CTA pick which service when several are offered.
3. Move Telehealth's unique "My consults" + Join surface into a small standalone section so it survives the merge.
4. **Data model: none required.** Optional additive nicety: a nullable `provider_services.capability` column to group service line-items by type.
**Risks:** booking default is `vet` (`book/route.js:78`) — a merged profile must pass the selected capability explicitly or a grooming booking books as vet; each retired screen has a `.test.jsx` needing equivalent coverage on the shared screen before deletion.
**Files:** `app/(tabs)/services.jsx`, new `app/service/discover.jsx`, `app/service/provider.jsx`, retire `vet/grooming/telehealth.jsx`, `hooks/useProviders.js` (optional expose of `capabilities`).

### D. Provider search & filters — ✅ Fixed on branch

**Confirmed:** the 7 discovery screens used `useDiscoverProviders(type)` → flat `.map()` with no search/filter/sort/type-ahead; only `adoption.jsx` had a filter pattern.

**Fix (commit `23cc3e3`):** new shared `components/Providers/ProviderListControls.jsx` (search box + sort chips) + `useProviderListFilter` hook, both **client-side over the already-fetched list** (purely additive, no backend change): instant type-ahead name search (name/bio/type), sort by Suggested / Top rated (`avg_rating`) / Most reviewed (`review_count`), and a dedicated "No matching …" empty state. Wired into **vet, grooming, walking, sitting, daycare, training**. Tests cover filtering, no-match, and rating sort.
**Deeper filters (distance / price / availability) are Proposed** — they need new columns/params in `discover/route.js` (not currently projected).

### E. Vet/provider map view — Proposed (backend dependency + platform gap)

**Confirmed:** `components/Map/MapLocationView.jsx` **already renders multiple markers and auto-fits** (used this way in `places.jsx`, `events.jsx`, `transport-track.jsx`), so the display half is nearly free. **But** the discovery API returns **no coordinates** — `discover/route.js:44-57` projects no `lat`/`lng`; coords live on `provider_locations` and are returned only by the single-provider public route. `react-native-maps` uses `PROVIDER_DEFAULT` (Apple Maps, keyless on iOS); **Android has no Google Maps key configured** (`app.json`). `MapLocationView` markers also have no `onPress` to navigate to a profile.

**Why proposed not shipped:** a working nearby-providers map requires a backend change (add coords to `discover`) that touches the large web test baseline, plus a marker-tap prop, plus Android key config — cross-cutting and partly outside the mobile branch. Per "when unsure, propose."

**Concrete plan (ready to implement):**
1. **Backend:** add `lat, lng, location_name` to both `discover/route.js` queries via `LEFT JOIN LATERAL` on the provider's primary `provider_locations` row; optionally accept `?lat=&lng=&radius=` (mirror the adoption listings distance contract). Update `discover/route.test.js` + `apps/web/test/integration/db.ts`.
2. **Hook:** `useProviders.js` `useDiscoverProviders` passes the params through (already returns `data.providers`).
3. **Component:** add optional `onMarkerPress(index)` to `MapLocationView.jsx` (additive, existing callers unaffected).
4. **Screen:** add a `viewMode` list⇄map toggle to `vet.jsx` (copy `places.jsx:152-175` pill + `:69-89` device-location), render `<MapLocationView points={providers.map(p => ({lat,lng,title:p.name}))} interactive onMarkerPress={…}/>`.
5. Configure a Google Maps key for Android before shipping to that platform (parity with the existing `places.jsx` map).

### F. "Inviting to buy" — conversion — ✅ Quick wins fixed; redesign proposed

Both provider-detail and shop use **real API data** with working empty states; weaknesses were visual hierarchy + CTA prominence, plus one real currency bug.

**Fixed (commit `ef9bdb0`):**
- **Currency bug** — unified `src/utils/money.js` (`formatMoney`) prefixes the ISO code (disambiguating the `$` shared by USD/ARS/MXN) + thousands grouping; both `shop.jsx` and `provider.jsx` route through it. Products pass their `currency`; services (no currency column) default to ARS.
- **Provider Book CTA** — Book is now the dominant CTA (2× width vs Message), both show a **"from &lt;price&gt;"** teaser, and a **pinned rating + review-count trust strip** sits above the bar so cost and social proof are visible without scrolling up.

**Proposed (redesign):** collapsing full-bleed hero with overlaid name/rating/verified badge; inline availability strip ("Next: Tue 3pm"); per-service Book buttons; a real product-detail sheet with gallery/description/product-level ratings; trust cluster at checkout (shipping/returns/secure-payment); fix storefront item tap (`provider.jsx:351` dumps to generic `/service/shop`); add loading/error branches to provider reviews (`provider.jsx:475` treats a failed fetch as "No reviews yet") and the shop catalog modal.

---

## Per-core-flow scorecard (Kid & Grandparent test)

Ranking best → worst: **Onboarding ▸ Shop ▸ Services/Booking ▸ Community ▸ Reminders ▸ Feed ▸ Vet Record ▸ Health Track.**

| Flow | K/G | Verdict (biggest issue → file) |
|------|-----|--------------------------------|
| **Onboarding** | **Excellent** | Best flow: one field/screen, reassurance, progress, review-before-create. Nit: raw `alert(error.message)` on submit failure (`onboarding.jsx:381`); handle step forced-required. |
| **Shop** | Good | Most complete e-commerce loop, best state coverage. Currency label now fixed (F); small icon-only cart steppers (`shop.jsx:441`). |
| **Services / booking** | OK/Good | Hub→provider→book chain is solid; one shared booking modal, clear field guards. All 11 category tiles hardcoded `live:true` so the "Coming soon" path is dead code. |
| **Community** | Good | Familiar forum. **No error state** — a failed `useForumThreads` renders blank (`community.jsx`). |
| **Reminders / Today** | OK | Best-instrumented (real save-error alerts, great empty state). Five stacked sections (Overdue/Snoozed/Due Soon/Upcoming/Next Up) are a lot to parse (`HealthToday.jsx:531`). |
| **Feed** | OK | Polished, but the whole feed is locked/blurred until you post with no plain explanation (`index.jsx:194`); **no list error state** (`useFeedData.js:27`) + PII logging. |
| **Vet Record** | **Confusing** | Primary "Add Record" CTA → all "Coming Soon" alerts (`HealthVetRecord.jsx:355`) while real add paths hide in collapsed sections. Rich empty states otherwise. |
| **Health Track** | **Confusing → improved** | Was: 5/14 cards did nothing on tap. **Fixed:** Weight reconnected; unbuilt trackers now show a "Soon" badge + feedback (`HealthTrack.jsx`). |

---

## Quick wins (fixed on this branch)

| Fix | Files | Commit |
|-----|-------|--------|
| B — access requests in the Notifications bell + badge | `notifications.jsx`, `FeedHeader.jsx` (+test) | `ba315c1` |
| HealthTrack — reconnect Weight modal; honest "Soon" state for unbuilt trackers | `HealthTrack.jsx` (+test) | `797ec45` |
| F — unified currency formatter (ARS/USD bug); Book primary CTA + price + pinned rating | `utils/money.js`, `shop.jsx`, `provider.jsx` (+tests) | `ef9bdb0` |
| D — provider search + sort (type-ahead) across 6 discovery lists | `ProviderListControls.jsx` + 6 screens (+test) | `23cc3e3` |

## Bigger bets (need your sign-off)

- **C — unify Vet/Grooming/Telehealth into one capability-based provider surface.** No migration required (schema already multi-capability). Plan + files above.
- **E — nearby-provider discovery map (list⇄map toggle).** Needs coords added to `discover` (backend), a `MapLocationView.onMarkerPress` prop, and an Android Maps key. Plan above.
- **A — vet-note awareness + attribution + append-only.** Backend + migration: (1) insert an owner-targeted `notifications` row when a vet note is created (then it rides the bell surfacing from B); (2) add a structured author column (vet user id) so attribution never falls back to "You"; (3) enforce append-only against the owner (route guard / RLS) to match the UI promise.
- **F — provider & shop conversion redesign** (hero, availability, product detail sheet, checkout trust cluster).
- **VetRecord "Add Record"** — make the primary CTA open a working add flow (or hide the not-yet-built types behind a "Soon" state, mirroring the HealthTrack fix) instead of a dead "Coming Soon" picker.

## Data-integrity notes (ID scoping / persistence / leakage)

- **Vet notes** scoped by `pet_id` + `owner_user_id` (owner path uses caller `user_profiles.id`; vet path derives owner from `pets.owner_user_id`). ✅ No cross-pet/owner leak.
- **Care-access grants** owner-scoped (`owner_user_id = me`); another owner's grants never match. The B fix reads the same owner-scoped route — no new exposure. ✅
- **Notifications** recipient-scoped (`recipient_user_id = me`). ✅
- **Risk (P1):** owner can hard-delete vet notes (A) — contradicts stated append-only; not a cross-user leak but a trust/integrity gap. Proposed enforcement above.
- No fake/mock data introduced by any fix; all new empty/error states show real "no data" copy.

## Appendix

- **Base:** `main` @ `54cbc63`. **Audit commits (branch `audit/app-ux-review`):** `ba315c1` (B), `797ec45` (HealthTrack), `ef9bdb0` (F), `23cc3e3` (D), plus report commits.
- **Verification:** changed mobile suites run green (notifications, HealthTrack, money, provider, vet/grooming/walking/sitting/training). No web code changed → no web build/typecheck needed. Full-suite run recorded in the branch.
- **Deliberately not done (safety):** structural merge C, map backend E, vet-note backend A — all cross-cutting (schema/web-baseline/config) and proposed with plans rather than executed, per the fix-vs-propose rule. `node_modules` was symlinked into the worktree to run tests and is intentionally not committed.
