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
| 4 | **VetRecord "Add Record" primary CTA is a dead end** — every type opened a "Coming Soon" alert. Now the 2 real types route to their flow; the rest are badged "Soon" with honest feedback. | P1 | ✅ Fixed |
| 5 | **A vet's note produced zero awareness** — no notification/badge; notes section collapsed + lazy-loaded. Now surfaced in the bell ("Dr. X added a note to Mango"). | P1 | ✅ Fixed |
| 6 | **Vet note could render as "You"** — only free-text `vet_name` stored (null → "You"). Write path now guarantees attribution (name → email → "Veterinario"). Owner-can-delete stays a proposal. | P1 | ✅ Fixed (attribution) / Proposed (delete) |
| 7 | **No search/filter on provider lists** — no search-by-name, no sort by rating, no type-ahead across 7 discovery screens. | P1 | ✅ Fixed |
| 8 | **No discovery map for vets/providers** — Map components render pins but the discover API returns no coordinates. | P1 | Proposed (E) |
| 9 | **Provider detail conversion was weak** — no price near the CTA, two co-equal CTAs, rating not pinned, reviews buried. | P1 | ✅ Fixed (quick wins) |
| 10 | **Services taxonomy siloed** — Vet/Grooming/Telehealth are separate screens for what the schema already models as one multi-capability provider. | P1 | Proposed (C) |

**Also flagged (P2):** ✅ **Fixed** — Feed and Community fetch failures now show a real error + Retry (was: looked "empty"). **Still open:** dead components with hardcoded fake vet data (`VetInformation.jsx` — "Happy Paws Veterinary Clinic / Dr. Sarah Johnson", plus unused `RecentRecords.jsx`/`RecordCard.jsx`); PII in logs (`useFeedData.js` logs auth email + user id every render); onboarding submit failure shows a raw `alert(error.message)`.

**Follow-up directions completed this session:** (1) every audit-added string routed through the existing i18n system with en+es keys (neutral LatAm Spanish); (2) currency now renders ARS as "$" with es-AR grouping ($1.500), ISO prefix only for non-ARS; (3) Flow A frontend fixes shipped; (4) the two P1s above fixed. C and E remain **held for sign-off** — decision briefs below.

---

## Findings — detail

### A. Vet note trace (mandatory) — traced; gaps proposed

**Flow (verified):** vet note → `vet_notes` table → surfaced inline in the owner's Vet Record.

- **Storage & scoping — OK.** Owner path: `components/Health/VetRecord/AddVetNoteModal.jsx:43` → POST `/api/vet-record/notes` → `INSERT vet_notes(pet_id, owner_user_id, vet_name, note_date, note, appointment_id)` (`apps/web/.../api/vet-record/notes/route.js:75`). Vet path (the `vet@vet.com` case) is the **web/provider** route `apps/web/.../api/providers/[id]/pets/[petId]/notes/route.js`, gated by `assertCareAccess(petId, providerId, "medical_write")`, stamping `owner_user_id` from `pets.owner_user_id`. There is **no mobile UI** for a vet to write a note (expected — vets use the web dashboard). Scoping by `pet_id` + `owner_user_id` is correct; data cannot cross pets or owners.
- **Owner sees it — OK.** `components/Health/HealthVetRecord.jsx:252` GET `/api/vet-record/notes?petId=` → rendered `HealthVetRecord.jsx:1722`; also aggregated in `useVetSummary.js` → `/api/vet-record/full-summary`.
- **Attribution — ✅ Fixed (commit `c72d9eb`), no migration.** `vet_notes` has only the denormalized `vet_name` (no author FK), so a vet note stored with a null name renders as "You". The provider notes route now resolves `vet_name` through staff/username/provider name → the acting user's **email** → `"Veterinario"`, so a vet note is **always** attributed and never collapses to "You". (A structured author FK stays a proposal — see below. Legacy notes already stored with a null name can't be re-attributed without that column.)
- **Awareness — ✅ Fixed (commit `c72d9eb`), no migration.** New `useRecentVetNotes` hook + `notifications.jsx` surface vet-authored notes for the current pet in the bell ("Dr. X added a note to Mango"), reusing fix B's pattern. Bounded by a 14-day window (no read-state store), owner-authored notes (no `vet_name`) never surface, tap opens the Health tab. Copy localized (`notifications.vetNoteBody`, en+es). *Limitation:* scoped to the current pet (the notes API is per-pet); a cross-pet feed would need a new endpoint or the notifications-table row below.
- **Integrity — owner can delete a vet note (P1) — Proposed (unchanged).** `apps/web/.../api/vet-record/notes/route.js:118` deletes by `id AND owner_user_id`; vet notes carry the owner's id, so the owner's trash icon (`HealthVetRecord.jsx:1762`) removes them — contradicting `AddVetNoteModal.jsx:134` ("Vets… can't edit or delete them — only you can"). **Held for sign-off** — options in Bigger Bets; no policy/backend change made.
- **Dead code (P2).** `components/Health/VetRecord/VetInformation.jsx` (hardcoded fake clinic/vet), `RecentRecords.jsx`, `RecordCard.jsx` have zero importers.

### B. Vet access request → owner awareness (mandatory) — ✅ Fixed on branch

**Confirmed bug:** a pending `care_access_grants` request surfaced **only** on `app/(tabs)/more/data-access.jsx` (per-pet, `useCareAccessGrants(petId)`), which the owner had to open manually. It was **absent from `app/notifications.jsx`**, which merges only social notifications (`/api/notifications` = paw/bark/follow) + local reminders. The `care_access_grants` and `notifications` tables are separate and nothing bridged them.

**Fix (commit `ba315c1`):** `notifications.jsx` now merges the owner's **pending** grants (owner-scoped `useAllCareAccessGrants`, reactive, survives restart) as tappable items → route to Data Access to approve/deny; added a **"Requests"** filter chip; and `FeedHeader.jsx` counts pending requests toward the **bell badge** so a request can't be missed. Additive/client-side, no schema change. Tests: surfacing, pending-only filtering, tap-through, chip.
**Re-traced:** a pending grant for "Mango" now appears in the bell with the provider name and routes to approve/deny. ✅

### C. DECISION BRIEF — merge Vet + Grooming + Telehealth into one provider surface

**Held for your sign-off. Not implemented.**

**The call:** worth doing, and cheaper than it looks — the data model is *already* unified; this is a mobile-IA refactor, not a migration.

**Why it's cheap.** A `providers` row is decoupled from service type via the `provider_capabilities` join table; discovery already matches on capability, not `provider_type` (display-only since ticket 2.1 — `apps/web/.../utils/providerAuth.js:24`). One provider already surfaces under multiple types today (`discover/route.js`: a "vet shop" appears under both `?type=vet` and `?type=shop`). `app/service/provider.jsx` is **already the type-agnostic unified profile**. What's siloed is only the mobile IA: `vet.jsx`, `grooming.jsx`, `telehealth.jsx` are ~95%-identical scaffolds each hardcoding one capability.

| | |
|---|---|
| **Effort** | ~M (1–2 days). Mostly deleting duplicated scaffolding + one new parameterized screen. |
| **Risk** | **Low–Med.** No schema/data change in the core plan. Main hazard is booking default (below). |
| **Reversible?** | Yes — ship the shared screen alongside the old ones, cut over `services.jsx` routes, delete old screens only after parity is verified. |
| **Migration** | **None required.** Optional additive nicety only: nullable `provider_services.capability` to group line-items by type (NULL = untyped). |

**Exact files touched.** Mobile: `app/(tabs)/services.jsx` (repoint Vet/Grooming/Telehealth tiles); **new** `app/service/discover.jsx` (the one parameterized screen); extract the triplicated `ProviderCard`/`EmptyState` into `components/Providers/`; `app/service/provider.jsx` (render `capabilities[]` as chips; let Book choose the service); retire `app/service/{vet,grooming,telehealth}.jsx` + their `.test.jsx`; `hooks/useProviders.js` (optionally expose `capabilities`). Web: none (unless the optional `provider_services.capability` — then `providers/public/[slug]/route.js` + `test/integration/db.ts`).

**Top risks to watch.** (1) Booking default is `vet` (`book/route.js:78`) — a merged profile MUST pass the user-selected capability or a grooming booking silently books as vet. (2) Telehealth's unique "My consults" + Join surface must move to a standalone section, not be lost. (3) Each retired screen's `.test.jsx` needs equivalent coverage on the shared screen before deletion.

### D. Provider search & filters — ✅ Fixed on branch

**Confirmed:** the 7 discovery screens used `useDiscoverProviders(type)` → flat `.map()` with no search/filter/sort/type-ahead; only `adoption.jsx` had a filter pattern.

**Fix (commit `23cc3e3`):** new shared `components/Providers/ProviderListControls.jsx` (search box + sort chips) + `useProviderListFilter` hook, both **client-side over the already-fetched list** (purely additive, no backend change): instant type-ahead name search (name/bio/type), sort by Suggested / Top rated (`avg_rating`) / Most reviewed (`review_count`), and a dedicated "No matching …" empty state. Wired into **vet, grooming, walking, sitting, daycare, training**. Tests cover filtering, no-match, and rating sort.
**Deeper filters (distance / price / availability) are Proposed** — they need new columns/params in `discover/route.js` (not currently projected).

### E. DECISION BRIEF — nearby-provider discovery map (list⇄map toggle)

**Held for your sign-off. Not implemented.**

**The call:** worthwhile and mostly built already — the blocker is one small backend addition (coords) plus an Android maps key, not the map itself.

**Why the UI is nearly free.** `components/Map/MapLocationView.jsx` **already renders multiple markers and auto-fits**, and `places.jsx:152-222` is a working list+map reference screen (also used by `events.jsx`, `transport-track.jsx`). The gaps are specific and small.

| | |
|---|---|
| **Effort** | ~M (~1 day): a 6-line backend query change, a marker-tap prop, and a toggle copied from `places.jsx`. |
| **Risk** | **Low–Med.** The backend change is additive (new columns in the `discover` response; existing callers ignore them) but touches the large web test baseline (`discover/route.test.js`, `test/integration/db.ts`). |
| **Blockers** | (1) **Discover returns no coordinates** — `discover/route.js:44-57` projects no `lat`/`lng` (they live on `provider_locations`, returned only by the single-provider route). (2) `MapLocationView` markers have **no `onPress`** to open a profile. (3) **Android has no Google Maps key** (`app.json`); iOS works keyless via `PROVIDER_DEFAULT`/Apple Maps. |

**Backend coords work (the one real dependency).** Add `lat, lng, location_name` to both `discover/route.js` queries via a `LEFT JOIN LATERAL` on the provider's primary `provider_locations` row; optionally accept `?lat=&lng=&radius=` to sort nearest-first (mirror the adoption-listings distance contract already in `useProviders.js`). Update `discover/route.test.js` + `apps/web/test/integration/db.ts`.

**Android maps-key work.** Configure a Google Maps API key (app config / `app.json` `react-native-maps` plugin) before shipping the map to Android — otherwise the map is blank there. iOS needs nothing. This is a prerequisite the existing `places.jsx` map already lives with, so it's a known, bounded task.

**Exact files touched.** `apps/web/.../api/providers/discover/route.js` (+ its test + `test/integration/db.ts`); `hooks/useProviders.js` (`useDiscoverProviders` pass-through); `components/Map/MapLocationView.jsx` (add optional `onMarkerPress(index)`, additive); `app/service/vet.jsx` (add `viewMode` list⇄map toggle — copy `places.jsx:152-175` pill + `:69-89` device-location — rendering `<MapLocationView points={providers.map(p => ({lat,lng,title:p.name}))} interactive onMarkerPress={…}/>`); app config (Android Maps key). Providers without a saved location have no coords → they stay in the list, absent from the map (component already filters invalid coords).

### F. "Inviting to buy" — conversion — ✅ Quick wins fixed; redesign proposed

Both provider-detail and shop use **real API data** with working empty states; weaknesses were visual hierarchy + CTA prominence, plus one real currency bug.

**Fixed (commits `ef9bdb0` + `c17e280`):**
- **Currency bug** — unified `src/utils/money.js` (`formatMoney`); both `shop.jsx` and `provider.jsx` route through it. For the Argentina launch, ARS renders as a bare **"$" with es-AR grouping** (e.g. `$1.500`, comma decimals, decimals hidden when whole) — not the "ARS" ISO prefix, which read as foreign. A non-ARS currency (rare) keeps its ISO prefix (`USD 49.00`) so a foreign price is never mistaken for pesos. Products pass their `currency`; services (no currency column) default to ARS.
- **Provider Book CTA** — Book is now the dominant CTA (2× width vs Message), both show a **"from &lt;price&gt;"** teaser, and a **pinned rating + review-count trust strip** sits above the bar so cost and social proof are visible without scrolling up. All CTA/strip copy is localized (`providers.*`, en+es).

**Proposed (redesign):** collapsing full-bleed hero with overlaid name/rating/verified badge; inline availability strip ("Next: Tue 3pm"); per-service Book buttons; a real product-detail sheet with gallery/description/product-level ratings; trust cluster at checkout (shipping/returns/secure-payment); fix storefront item tap (`provider.jsx:351` dumps to generic `/service/shop`); add loading/error branches to provider reviews (`provider.jsx:475` treats a failed fetch as "No reviews yet") and the shop catalog modal.

---

## Per-core-flow scorecard (Kid & Grandparent test)

Ranking best → worst: **Onboarding ▸ Shop ▸ Services/Booking ▸ Community ▸ Reminders ▸ Feed ▸ Vet Record ▸ Health Track.**

| Flow | K/G | Verdict (biggest issue → file) |
|------|-----|--------------------------------|
| **Onboarding** | **Excellent** | Best flow: one field/screen, reassurance, progress, review-before-create. Nit: raw `alert(error.message)` on submit failure (`onboarding.jsx:381`); handle step forced-required. |
| **Shop** | Good | Most complete e-commerce loop, best state coverage. Currency label now fixed (F); small icon-only cart steppers (`shop.jsx:441`). |
| **Services / booking** | OK/Good | Hub→provider→book chain is solid; one shared booking modal, clear field guards. All 11 category tiles hardcoded `live:true` so the "Coming soon" path is dead code. |
| **Community** | Good | Familiar forum. **Error state ✅ Fixed** — a failed fetch now shows an error + Retry, not a blank/empty. |
| **Reminders / Today** | OK | Best-instrumented (real save-error alerts, great empty state). Five stacked sections (Overdue/Snoozed/Due Soon/Upcoming/Next Up) are a lot to parse (`HealthToday.jsx:531`). |
| **Feed** | OK | Polished; **error state ✅ Fixed** (real error + Retry when the feed fails with no cache). Remaining: locked/blurred-until-you-post has no plain explanation (`index.jsx:194`) + PII logging (open). |
| **Vet Record** | **Confusing → improved** | **Fixed:** "Add Record" now routes its 2 real types and badges the rest "Soon" (no dead primary CTA). Rich empty states otherwise. |
| **Health Track** | **Confusing → improved** | Was: 5/14 cards did nothing on tap. **Fixed:** Weight reconnected; unbuilt trackers now show a "Soon" badge + feedback (`HealthTrack.jsx`). |

---

## Quick wins (fixed on this branch)

| Fix | Files | Commit |
|-----|-------|--------|
| B — access requests in the Notifications bell + badge | `notifications.jsx`, `FeedHeader.jsx` (+test) | `ba315c1` |
| HealthTrack — reconnect Weight modal; honest "Soon" state for unbuilt trackers | `HealthTrack.jsx` (+test) | `797ec45` |
| F — unified currency formatter; Book primary CTA + price + pinned rating | `utils/money.js`, `shop.jsx`, `provider.jsx` (+tests) | `ef9bdb0` |
| D — provider search + sort (type-ahead) across 6 discovery lists | `ProviderListControls.jsx` + 6 screens (+test) | `23cc3e3` |
| Dir 2 — ARS shown as "$" with es-AR grouping ($1.500); ISO only for non-ARS | `utils/money.js` (+test) | `c17e280` |
| Dir 1 — all audit-added strings via i18n (en+es); shared test i18n mock | locales, `testMock.js`, notifications/HealthTrack/providers + 8 screens (+tests) | `1cc5dfe` |
| Dir 3 — Flow A: vet-note attribution (write path) + bell awareness signal | notes `route.js`, `useRecentVetNotes.js`, `notifications.jsx`, locales (+tests) | `c72d9eb` |
| Dir 4 — no dead-end "Add Record" CTA; real error+Retry on Feed & Community | `HealthVetRecord.jsx`, `community.jsx`, `index.jsx`, `useFeedData.js` (+tests) | `ea24ba2` |

## Bigger bets (need your sign-off)

- **C — unify Vet/Grooming/Telehealth into one capability-based provider surface.** No migration required. **Decision brief in §C above.**
- **E — nearby-provider discovery map (list⇄map toggle).** Needs coords added to `discover` (backend), a `MapLocationView.onMarkerPress` prop, and an Android Maps key. **Decision brief in §E above.**
- **A (remaining) — structured vet-note author + append-only enforcement.** Attribution + bell awareness are now shipped (§A). Still needs sign-off, because both need schema/policy change: (1) a structured author column (vet `user_profiles.id`) so attribution is robust for *legacy* null-name notes and cross-pet queries, and to optionally write an owner-targeted `notifications` row on note create (a durable, cross-pet, mark-readable alternative to the 14-day client window); (2) **owner-can-delete-a-vet-note** — enforce append-only against the owner via a route guard / RLS to match the UI promise. **Options:** (a) block owner DELETE when `vet_name IS NOT NULL` (smallest, no migration — a route guard); (b) soft-delete/hide instead of hard delete; (c) full RLS append-only policy (largest). Recommend (a) now, (c) at the RLS hardening pass.
- **F — provider & shop conversion redesign** (hero, availability, product detail sheet, checkout trust cluster).

## Data-integrity notes (ID scoping / persistence / leakage)

- **Vet notes** scoped by `pet_id` + `owner_user_id` (owner path uses caller `user_profiles.id`; vet path derives owner from `pets.owner_user_id`). ✅ No cross-pet/owner leak.
- **Care-access grants** owner-scoped (`owner_user_id = me`); another owner's grants never match. The B fix reads the same owner-scoped route — no new exposure. ✅
- **Notifications** recipient-scoped (`recipient_user_id = me`). ✅
- **Risk (P1):** owner can hard-delete vet notes (A) — contradicts stated append-only; not a cross-user leak but a trust/integrity gap. Held for sign-off with options in Bigger Bets.
- **Vet-note attribution write path** derives `owner_user_id` from `pets.owner_user_id` and `vet_name` from the acting provider/staff/email — no cross-pet/owner leak introduced. ✅
- No fake/mock data introduced by any fix; all new empty/error states show real "no data" or real error copy.

## Appendix

- **Base:** `main` @ `54cbc63`. **Audit commits (branch `audit/app-ux-review`), oldest→newest:** `ba315c1` (B), `797ec45` (HealthTrack), `ef9bdb0` (F), `23cc3e3` (D), `a689efc` (report), `c17e280` (Dir 2 currency), `1cc5dfe` (Dir 1 i18n), `c72d9eb` (Dir 3 Flow A), `ea24ba2` (Dir 4 P1s), + this report update.
- **Verification (latest):** mobile jest **163 suites / 1292 tests green** (+ tz-negative config). Web (touched by Dir 3): **vitest 1471 green**, notes route **7/7**, **build passes**, and typecheck adds **0 new errors** over the repo's pre-existing 124-error baseline (jsx-declaration noise, unrelated to changed files — confirmed by stashing the change).
- **i18n:** every audit-added string goes through `t()` with keys in **both** `en.json` and `es.json` (neutral LatAm Spanish, "tú"); `i18n.test.js` asserts the new keys exist in both languages with matching `{{vars}}`. Existing pre-audit hardcoded strings are intentionally left to the parallel `feat/i18n-es-ar` extraction branch (not new debt).
- **Deliberately not done (safety):** structural merge **C**, map backend **E**, and the remaining **A** items (structured author column, append-only/delete enforcement) — all cross-cutting (schema/policy/config) and delivered as decision briefs rather than executed, per the fix-vs-propose rule. `node_modules` was symlinked into the worktree (mobile + web) to run tests and is intentionally **not committed**.
