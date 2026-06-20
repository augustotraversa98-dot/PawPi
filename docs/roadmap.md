# PawPi Roadmap — active build queue (synced from Cowork's plan)

**This is a derived view, not the strategy.** The strategy lives in
[`docs/phase2-superapp-master-plan.md`](phase2-superapp-master-plan.md) (Cowork + Tats own it) and
the priority order in `PawPi_instructions.md`. **The authoritative build queue is Cowork's
paste-ready tickets in [`docs/phase2-tickets/`](phase2-tickets/00-README.md)** (2.0 → 2.14, with build
order + shared conventions in its README). Build those in order; this file is the status mirror.
Phone-checkable items land in [`docs/test-backlog.md`](test-backlog.md). See
[`docs/dev-pipeline.md`](dev-pipeline.md) for the loop.

**The bridge:** Cowork writes strategy/priorities into the master plan + instructions → Code (me)
derives this queue, builds, and writes status back here + into the instructions status block, then
commits. Keep this file in step with the master plan every time priorities change.

## Status legend
`READY` build-eligible · `BATCH:n` assigned · `BUILDING` draft PR open · `DEVICE` waiting on your
phone test · `BLOCKED` has a predecessor · `IDEA` needs scoping.
Tags: **scope** fe/be/db · **safe-parallel** yes only if it touches files no other READY item touches.

---

## ✅ PHASE 2 COMPLETE (2026-06-17) — all 15 tickets merged

2.0 nav · 2.1 capabilities · 2.2 reviews · 2.3 payments · 2.4 booking · 2.5 chat · 2.6 grooming ·
2.7 walking · 2.8 daycare · 2.9 sitting · 2.10 training · 2.11 shop · 2.12 adoption · 2.13 feed ·
2.14 dashboards. PRs #109–#127. Migrations 0027–0038 pending hand-apply to Supabase (see
[`docs/test-backlog.md`](test-backlog.md) ACTION 1). Device tests + go-live actions also in the backlog.

### Phase 2 follow-ups (noted by build agents — not blocking, schedule when wanted)
- **Payments:** recurring-subscription scheduler/cron (fire `next_charge_at` → order+charge); encrypt provider OAuth tokens at rest.
- **Capabilities:** mobile provider-onboarding multi-select + owner discovery filter chips by capability.
- **Adoption:** per-listing deep-link from feed/discovery (currently opens the adoption hub); foster workflow; urgent/featured listings; multi-pet bulk import.
- **Native uploads:** photo/video upload for visit/session media needs real-device re-test (shared fetch.ts path).
- **Docs hygiene:** `ARCHITECTURE.md` says a standalone `useCurrentPet.js` exists — it actually lives in `usePetProfile.js`; `supabase/SCHEMA_NOTES.md` migration-order line stops at 0011. Refresh both.
- **Social mock chat:** the old pet-friend chat (`messages.jsx`/`chat.jsx`) still uses mock data (separate from the new provider chat) — convert off mock or retire.

## 🌊 WAVE 3 + WAVE 4 — COMPLETE (tickets 2.15–2.31, all merged)

Build order + blockers in [`docs/phase2-tickets/00-README.md`](phase2-tickets/00-README.md). Status mirror
(✅ merged · 🔨 building · ⛔ blocked-on-prereq · ☐ queued):

- ✅ **2.15** mobile capability multi-select — merged (#130), no migration.
- ✅ **2.16** encrypt payment tokens — merged (#131), no migration.
- ✅ **2.17** sub auto-charge cron — merged (#132), migration 0039 (fn only).
- ✅ **2.18** telehealth — merged (#133), migration 0040 (telehealth_sessions + 2 widened CHECKs).
- ✅ **2.19** More-tab nav fix — merged (#134), no migration (service screens → root `service/` stack).
- ✅ **2.20** provider onboarding links — merged (#135), migration 0041 (4 link columns).
- ✅ **2.21** AI enrichment (confirm-first) — merged (#136), no migration (proposes a draft; applies via existing routes).
- ✅ **2.23** service/product images — merged (#137), migration 0043 (provider_services.image_urls[]).
- ✅ **2.22** storefront + posts — merged (#138), migration 0042 (provider_posts + providers.cover_image_url).
- ✅ **2.24** web bookings calendar — merged (#139), no migration (week/day grid; reuses inbox actions).
- ✅ **2.25** search/discover real data — merged (#140), no migration (/api/search + /api/discover; mock data removed).
- ✅ **2.26** notifications real data — merged (#141), migration 0044 (notifications + app_notify DEFINER insert).
- ✅ **2.27** owner↔owner DMs — merged (#142), migration 0045 (dm_threads + dm_messages, participant RLS).
- ✅ **2.28** daily share frame — merged (#143), no migration (react-native-view-shot + expo-sharing).
- ✅ **2.30** adoption deep-link — merged (#144), no migration (feed "Adopt me" → that exact listing).
- ✅ **2.29** i18n EN/ES — merged (#145), no migration (i18next + react-i18next + expo-localization; framework + core + Settings toggle).
- ✅ **2.31** docs hygiene — merged, docs-only (ARCHITECTURE single useCurrentPet; SCHEMA_NOTES migration order → 0045 + source-of-truth pointer).

Migrations 0039–0045 pending hand-apply (see [`docs/test-backlog.md`](test-backlog.md) ACTION 1).

## 🌊 WAVE 5 — polish, fixes, big features + the "epic four" (tickets 2.32–2.50)

Built unattended per the Wave 5 autonomy preamble in `00-README.md`. Status mirror
(✅ merged · 🔨 building · ⛔ blocked-on-prereq · ☐ queued):

- ✅ **2.32** password security rules — merged (#148), no migration (shared `passwordStrength` validator; server-enforced on sign-up only, existing logins untouched; live strength meter).
- ✅ **2.33** notifications filter-chips layout fix — merged (#149), no migration (horizontal chip row centers items so chips size to content instead of stretching into tall rectangles).
- ✅ **2.34** current-pet header sync — merged (#150), no migration (More header reads the reactive `useCurrentPet` instead of a stale AsyncStorage snapshot; updates on switch/create).
- ✅ **2.35** onboarding required fields — merged (#151), no migration (@handle required + format rule in a pure `validateHandle` util; KeyboardAwareScrollView so inputs clear the keyboard).
- ✅ **2.36** feed daily-post fixes — merged (#152), no migration (owner-only DELETE /api/posts/[id]; own posts now in the feed; view-today fixed).
- ✅ **2.37** feed streak + birthday — merged (#153), no migration (🔥 consecutive-day streak via /api/posts/streak; 🎂 + orange frame on birthday/adoption day).
- ✅ **2.38** profile fixes — merged (#154), no migration (profile/feed share button reuses the 2.28 branded share; real `formatRelativeTime(created_at)` replaces fake "Just now").
- ✅ **2.39** Instagram nav — merged (#155), no migration (bottom-right tab is now Profile; the former More menu lives behind a top-right ☰ burger; 2.19 nav fix intact).
- ✅ **2.40** unified messages — merged (#156), no migration (one Messages hub: People DMs + Businesses threads + All/People/Businesses filter + owner search → start DM; two backends stay separate).
- ✅ **2.41** vet-record owner upload — merged (#157), no migration (owner Add/open/delete documents into existing owner-scoped `vet_documents`; medical-profile edit already persists).
- ✅ **2.42** vet-record history log — merged (#158), no migration (append-only History view over `vet_notes`: author label vet/"You" + dated entries + derived summary + owner add/delete; append-only integrity already RLS-proven in provider-records integration).
- ✅ **2.43** walks with buddies — merged, migration `0046` (social_walks `lat/lng/location_name` + new `social_walk_invites` table; map picker + public/private toggle + nearby bounding-box discovery + invited view; private walks RLS-invisible to non-invitees, harness-proven).
- ✅ **2.44** community forum — merged, migration `0047` (Reddit-style `forum_threads`/`forum_comments`/`forum_votes`; any-authed read + author-only write/soft-delete; idempotent voting via the `forum_vote` DEFINER helper that recomputes score; mobile category/sort browse + thread detail + compose + comment + vote; COMMUNITY_POSTS mock removed).
- ✅ **2.45** training supreme — merged, migration `0048` (`training_progress_self`, owner-scoped per-pet completion; 8-program AKC-style researched curriculum in the static `trainingCurriculum` content module; training.jsx rebuilt as program→session→detail with Mark-complete + progress bars per active pet; TRAINING_LESSONS mock removed; "Want a pro?" banner still links to the provider service).
- ✅ **2.46** Apple/Google sign-in — merged, NO migration (additive + env-gated `@auth/core` Google + Apple providers via `socialProviders(env)`; Credentials path untouched; buttons appear only when keys configured, else "Coming soon"; new OAuth users get a `user_profiles` row via the existing lazy path; env keys flagged for Tats).
- ✅ **2.47** family/caregiver sharing — merged, migration `0049` (`pet_caregivers` person↔person grants + audit mirroring care_access; family co-manage vs caregiver scoped read-only + expiry + instant revoke; additive per-table RLS via `app_user_has_pet_access`/`app_user_has_pet_family` helpers + `pets_guard_owner_transfer` trigger; owner-only delete preserved; proven hard in `family-caregiver-rls.integration.test.ts`).
- ✅ **2.48** lost & found — merged, migration `0050` (`lost_reports` + `lost_sightings`; active alert any-authed read, owner-only resolve, sighting-on-active RLS via `app_owns_lost_report`/`app_lost_report_active`; widened `notifications` type for `lost_alert`; best-effort `app_notify` to followers/owner; mobile `lost-found.jsx` near-me browse + mark-lost map pin + sighting + resolve).
- ✅ **2.49** memories & wrapped — merged, NO migration (pure TZ-safe aggregation in `memoriesWrapped.js`: on-this-day, milestone detection [birthday/gotcha/streak/post-count], Wrapped tallies + slides, all empty-safe; one read route `posts/history`; `memories.jsx` + `wrapped.jsx` reusing the 2.28 capture+share flow via `ShareableMemoryCard`/`MemoryShareButton`).
- ✅ **2.50** AI health intelligence + real Vet Summary — merged, NO migration (date-ranged owner+pet-scoped aggregation route `vet-record/full-summary` replaces the fake `mockSummaryData`; pure tested trend helpers `healthInsights.js` [weight/vomit/stool/urinary/appetite/med-adherence flags, empty-safe, non-diagnostic] + `buildRecap`; `VetSummaryModal`/`VetSummaryDashboard` rewired to real data + insight flags + range selector + questions-for-vet + share-as-text via `vetSummaryText.js`; disclaimer intact). **Wave 5 COMPLETE.**

---

## 🌊 WAVE 6 — UX fix-pack + trust + new capabilities (tickets 2.51–2.66) — IN PROGRESS

Authoritative spec + build order: [`docs/phase2-tickets/00-README.md`](phase2-tickets/00-README.md)
(Wave 6 section). Decided with Tats 2026-06-18 (+ an on-device UX fix-pack). Built per the ⚡ Wave 5
autonomy preamble. Status mirror (☐ queued · 🔨 building · ✅ merged):

**Part A — mobile UX fix-pack (do FIRST; NO migrations): ✅ COMPLETE** — all 9 built unattended, CI-green,
squash-merged to `origin/main` (PRs #168–#176; planning #167). No migrations (as expected). Next: Part B.
- ✅ **2.55** remove "Phoebe" + avatar fallback — do first (avatar fallback reused by 2.60).
- ✅ **2.62** share frame attaches the real daily-moment photo (capture was firing before image load).
- ✅ **2.63** app-wide keyboard: tap field first, then keyboard (kill auto-focus on bark/comments).
- ✅ **2.64** double-tap image → Paw/like (brand-color animation).
- ✅ **2.65** edit own daily-update caption (owner-only PATCH posts/[id]).
- ✅ **2.66** Health → Today "Today's Progress" on real logged data (kills hardcoded chips).
- ✅ **2.59** floating IG-style tab bar (edits `(tabs)/_layout.jsx`).
- ✅ **2.60** Profile tab → active pet's social profile + pet-photo icon — ⛔ after 2.59 + 2.55.
- ✅ **2.61** followers/following lists + paw follow/unfollow + search — ⛔ after 2.60 (no migration).

**Part A device feedback (Tats, 2026-06-18):** tests pass; one device bug found — tapping Followers/
Following lands on expo-router **+not-found** (the 2.61 `/follows` route doesn't resolve on the running
build; likely a stale Metro route tree needing `expo start --clear`, plus an embedded empty-`petId` edge).
Logged as a follow-up fix:
- ✅ **2.67** fix Followers/Following → +not-found (robust nav + embedded petId fallback) — no migration.
  Absolute-href nav to the root `/follows` route + active-pet fallback so the tab never pushes an empty
  petId; counts non-interactive while the pet loads (no dead tap). `follows` falls back to the active pet
  on a paramless open. Reproduction finding: route file + `_layout` registration are correct on main, so
  the device +not-found is a stale Metro route tree (clean `expo start --clear` resolves it) — the code
  fixes are hardening for the embedded entry point.

**Part B — capabilities + loose ends (migrations 0051–0055):**
- ✅ **2.56** adoption public single-listing GET — no migration. Public GET on
  `adoptable-listings/[listingId]` returns the dog IFF published + available (public
  columns only, exact browse visibility; no RLS change); the 2.30 feed deep-open now
  fetches the single listing directly (resolves a dog not in the loaded browse list),
  keeping the graceful "no longer available" path + the 2.19 nav.
- ✅ **2.51** emergency mode + printable medical-card tag QR + revocable vet link — migration **0051**.
  Two owner-only tables + 3 SECURITY DEFINER public-read fns (tag basic/medical-opt-in; revocable+expiring
  vet link; relay contact). Two PUBLIC no-login web pages (`/p/tag/[token]`, `/p/card/[token]`); mobile
  Emergency Card screen (assembled card + image share reusing 2.28 + printable tag QR + create/revoke vet
  links). LOST banner from 2.48. Harness-proven RLS + completeness guard. Migration flagged in test-backlog.
- ✅ **2.52** transport / pet-taxi — migration **0052**. `transport_trips` on the spine (owner +
  provider-staff + assigned-driver RLS; owner can't self-advance status). Capability-gated
  (`transport`); a trip IS a generalized booking (2.4) so it surfaces in the existing inbox/calendar;
  fare via payments (2.3), chat via 2.5. Mobile transport screen (discovery + map-picker booking form +
  trips list + cancel/message). Harness-proven; migration flagged in test-backlog.
- ✅ **2.53** vet Rx (inside Veterinary) — migration **0053** (strictest medical RLS). `prescriptions`
  (owner READ-ONLY, append-only — vet issues, owner can't forge) + `rx_refill_requests` (owner files,
  vet decides via `decide_rx_refill` DEFINER which decrements refills; no provider UPDATE policy). Web:
  vet issue/list/cancel + refill queue/decision; owner read + request-refill. Mobile: Vet Record
  Prescriptions section ("Prescribed by {clinic}", request refill, no owner edit). Harness-proven; flagged.
- ✅ **2.54** insurance marketplace — migration **0054**. New `insurance` capability (CHECKs widened
  +ALLOWED_CAPABILITIES). `insurance_plans` (published-public read, admin-managed) + `insurance_leads`
  (owner-or-provider scoped). Lead-gen v1 (no binding/payment, no Vet Record sent). Web: plans editor +
  leads inbox/status. Mobile: marketplace (discovery → plans → compare → quote form prefilled from the
  pet → lead). Harness-proven; migration flagged.
- ✅ **2.57** adoption foster/urgent flags — migration **0055**; ⛔ after 2.56. Additive columns riding
  the existing adoption RLS: `placement_type` (adopt/foster/both), `is_urgent`/`urgent_reason`,
  `is_featured`/`featured_until` on listings + `requested_placement` on applications. Web: editor +
  applications view fields, featured-first ordering, public read returns flags. Mobile: URGENT badge +
  placement chips on cards, urgent banner + foster/adopt picker in the detail. Harness-proven; flagged.
- ✅ **2.58** feed "Suggested" divider + ARCHITECTURE.md/SCHEMA_NOTES.md — no migration; built LAST.
  `mergeFeed` tags each post `feed_group`; the feed shows a "Suggested for you" divider at the
  Following→Suggested boundary (only when followed content sits above real suggested content). Docs:
  ARCHITECTURE.md gained a Wave 6 feature-surfaces section (2.51–2.58 + tables/RLS); SCHEMA_NOTES.md
  migration-order line advanced to 0055.

**Wave 6 COMPLETE (2026-06-18).** Part A (2.55, 2.59–2.66) + 2.67 fix + Part B (2.56, 2.51–2.54, 2.57,
2.58) all built, CI-green, squash-merged. Migrations **0051–0055** are **APPLIED + VERIFIED on Supabase
(2026-06-18)** — see [`docs/test-backlog.md`](test-backlog.md) ACTION 1. Part A added none.

---

## 🌊 WAVE 7 — money/transport loops + discovery/community/health add-ons (tickets 2.68–2.75) — ✅ COMPLETE

Authoritative spec + build order: [`docs/phase2-tickets/00-README.md`](phase2-tickets/00-README.md) (Wave 7
section). Scoped + ticketed with Tats 2026-06-18 from the un-ticketed post-core list (memorials dropped;
widgets/Apple-Watch deferred to a dedicated attended effort). Cross-cutting requirement: **Apple Maps in
every section that captures/shows a location** — 2.68 builds the shared component first; the rest reuse it.
Build per the ⚡ Wave 5 autonomy preamble. Status mirror (☐ queued · 🔨 building · ✅ merged):

- ✅ **2.68** Shared Apple-Maps location component — mobile, no migration. **Built FIRST** (foundation):
  `src/components/Map/{MapLocationPicker,MapLocationView,LocationField}.jsx` (Apple Maps via
  `PROVIDER_DEFAULT`); `WalkMapPicker` is now a thin wrapper over the shared picker, transport adopts
  `MapLocationPicker` directly; i18n `map.*` EN+ES; mobile jest +7.
- ✅ **2.69** Provider Sales / payouts + reconciliation UI — web, **no migration** (read-only surfacing of
  2.3 money): `GET /api/providers/[id]/sales` (active-staff-scoped: revenue net/gross series + ledger
  [payments × orders] + payouts/pending + aggregate reconciliation, no money mutated) → enabled `Sales`
  dashboard section (`provider/sales/page.jsx` + `ProviderSales.jsx`, recharts + empty states). web vitest +6.
- ✅ **2.70** Transport live-GPS tracking — migration **0056** (`transport_trip_locations`; append-only
  driver pings; INSERT only by the assigned driver while en_route via `app_can_post_trip_location`, SELECT by
  owner+driver+staff via `app_can_read_trip_location`; harness-proven as pawpi_app + completeness guard).
  Driver ping POST + owner/staff `/track` GET; owner live Apple-map screen (`transport-track.jsx`, reuses 2.68
  `MapLocationView`, 5s polling) + driver "Share live location" (`expo-location`, en_route-only). i18n EN+ES.
- ✅ **2.71** Rx fulfillment (delivery/pickup + charging) — migration **0057** (`rx_fulfillment_orders`;
  owner-creates-only-on-owned-refillable-Rx via `app_owns_fulfillable_rx`, pharmacy-staff advance, the
  `fulfill_rx_order` DEFINER consumes a refill on the 2.53 safe path — prescriptions stay append-only;
  harness-proven + completeness guard). `pharmacy` already in the CHECK (0040) — no widen. Owner routes +
  provider queue routes; mobile request flow (delivery via 2.68 `LocationField` / pickup, pay via 2.3) +
  provider dashboard `Rx Fulfillment` queue. i18n EN+ES.
- ✅ **2.72** Insurance in-app binding + payment — migration **0058** (`insurance_policies`; owner applies +
  accepts terms but can't self-issue number/premium or self-activate; insurer staff issue/advance but can't
  set `active`; `activate_insurance_policy` DEFINER is the only path to active, requiring an approved 2.3
  payment; harness-proven + completeness guard). `insurance` already in the CHECK (0054). Owner apply/pay/hub
  + provider dashboard `Policies` view; non-underwriting disclaimer (insurer = party-of-record). i18n EN+ES.
- ✅ **2.73** Pet-friendly places directory — migration **0059** (`saved_places` owner-FOR-ALL RLS; NO cache
  table — the proxy fetches live; harness-proven + completeness guard). Server-side key-gated Google Places
  proxy (`/api/places/search|[placeId]`, degrades clean to `configured:false`, key never reaches the client)
  + owner favorites; mobile Places screen (2.68 Apple map + list + category chips + Saved tab + directions
  hand-off, permission/empty/not-set-up states). i18n EN+ES. Reuses `GOOGLE_PLACES_API_KEY`.
- ✅ **2.74** Events / meetups — migration **0060** (`events` + `event_rsvps`; forum-style published-public
  read + host-only writes/soft-delete + own-only RSVP toggle, COUNT-on-read attendee count, no DEFINER
  [non-recursive EXISTS subquery]; harness-proven + completeness guard). Web events CRUD + rsvp upsert;
  mobile Events section in Community (2.68 Apple map + list + RSVP + directions + create via the 2.68
  picker/DateField/TimeField + host cancel). i18n EN+ES. (Best-effort RSVP notify deferred — no CHECK widen.)
- ✅ **2.75** Nutrition plans + food-recall alerts — migration **0061** (`nutrition_plans` owner-RLS [family
  follow-up noted]; `food_recalls` public reference data [any-authed read, DEFINER-only `ingest_food_recall`];
  `pet_food_recall_matches` owner-RLS; `match_food_recall` DEFINER links a recall→plan + best-effort
  `food_recall` notify; notifications CHECK widened; harness-proven + completeness guard). Owner nutrition
  CRUD + secret-gated idempotent recall ingest (`/api/recalls/ingest`, degrade-clean) + owner recall-matches;
  mobile Nutrition card (non-diagnostic disclaimer) + dismissible recall alerts. i18n EN+ES. Needs `CRON_SECRET`
  + an external scheduler to post the feed.

Migrations **0056–0061 (+ 0062 account-deletion) are APPLIED + VERIFIED on Supabase 2026-06-19** — all 30
checks PASS via `supabase/verify_0056_0062.sql`; the live DB is at **0062**, none pending. 2.69/2.71/2.72/2.75
were parallel-safe; the map-dependent trio (2.70/2.73/2.74) rode on 2.68.

### ✅ 2.78 — App Store readiness pass (final step of the autonomous run; PRs #197–#199)
Pre-submission hardening against Apple's current guidelines: iOS permission usage strings + privacy manifest
+ metadata (name PawPi, placeholder bundle id); removed the `wrongPets` debug query (2.3.1); privacy/terms
config slot wired into welcome (5.1.1); **in-app account deletion** (migration **0062** `delete_my_account()`
DEFINER + `DELETE /api/account` + Settings danger-zone; FK-clean cascade, self-only; harness-proven) per
5.1.1(v); wired two "coming soon" no-ops (weight-log delete + profile photo) to real functionality (2.1).
Sign in with Apple parity (4.8) + non-diagnostic disclaimers (1.4.1) verified. The handoff —
FIXED / FLAGGED policy items / account-gated submission checklist — is in
[`docs/app-store-readiness.md`](app-store-readiness.md). Code+config is submission-ready; the EAS build +
App Store Connect upload need the Apple Developer account.

## 🌊 WAVE 8 — calendar integration (tickets 2.79–2.80) — ✅ COMPLETE

Scoped with Tats 2026-06-20 from the un-ticketed post-core list: the buildable, CI-verifiable half of
calendar integration (true two-way EventKit sync deferred to a later attended device pass). Authoritative
spec + build order: [`docs/phase2-tickets/00-README.md`](phase2-tickets/00-README.md) (Wave 8 section). Built
per the ⚡ Wave 5 autonomy preamble. Foundation-first (mirrors 2.68). Status mirror (☐ queued · 🔨 building ·
✅ merged):

- ✅ **2.79** Calendar foundation — mobile refactor + web ICS route, **no migration**. De-duped
  `calendarIntegration.js` into one generic layer (`getOrCreatePawPiCalendar` + `upsertCalendarEvent` +
  `deleteCalendarEvent`) + an expo-free, jest-covered `calendarFormat` module; walk/vet wrappers + call-sites
  unchanged; owner-scoped `GET /api/calendar/booking/[id].ics` (RFC 5545, harness-proven owner-scoped read).
- ✅ **2.80** Calendar everywhere — mobile + web, migration **0063**. Add/update/remove on generalized
  bookings (BookingFormModal toggle, incl. telehealth), transport trips, and RSVP'd events; persists the
  device event id (bookings/transport/telehealth → `vet_appointments.calendar_event_id`; events → new
  `event_rsvps.calendar_event_id`); added `GET /api/calendar/event/[id].ics`. One additive column, no RLS
  policy change (rides existing own-row policies); degrade-clean when calendar permission is denied.

Migration **0063** (`event_rsvps.calendar_event_id`) is left in `supabase/migrations/` at the next free
number, harness-proven, **PENDING hand-apply** — flagged in [`docs/test-backlog.md`](test-backlog.md)
ACTION 1. 2.79 added none. Last applied on Supabase = 0062.

---

## 🌊 WAVE 9 — business magic-onboarding + calendar import + adoption browse (tickets 2.81–2.87) — IN PROGRESS

Scoped with Tats 2026-06-20. Authoritative spec + build order:
[`docs/phase2-tickets/00-README.md`](phase2-tickets/00-README.md) (Wave 9 section). Built per the ⚡ Wave 5
autonomy preamble. Status mirror (☐ queued · 🔨 building · ✅ merged):

- ✅ **2.81** Provider location map pin — mobile + web, **no migration**. Mobile onboarding shows the shared
  `LocationField` and persists the pin as the provider's primary `provider_locations` row; web Locations form
  gets an interactive `LocationMapPicker` (reuses `@vis.gl/react-google-maps`) that degrades to manual lat/lng
  inputs when `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY` is unset. lat/lng already exist (0014) — no schema change.
- ✅ **2.82** Enrichment: document catalog source — web, no migration. `fetchDocumentCatalog` (3rd
  enrichment source): CSV/XLSX rows → catalog (plain parsing, no LLM); PDF text → LLM-structured
  (dormant default). `POST .../enrich/document` (owner|admin, dormant behind `ENRICHMENT_LLM_KEY`,
  writes nothing) + a confirm-first `DocumentCatalogImport` panel that applies rows via the existing
  services/shop-products CRUD. Adds `xlsx` (lazy-loaded).
- ☐ **2.83** Mobile "magic onboarding" wizard — mobile, no migration. ⛔ after 2.81 + 2.82.
- ✅ **2.84** Business calendar import (ICS feed → busy blocks) — web, migration **0064**.
  `provider_calendar_feeds` + `provider_calendar_busy` (owner/staff RLS; busy is read-only — only the
  DEFINER `app_sync_calendar_feed` writes it). Pure ICS parser; feed CRUD + "Refresh now" +
  CRON_SECRET sync endpoint; availability subtracts imported busy and the book route 409s on overlap
  (via `app_provider_busy_windows`). Web dashboard `/provider/calendar-import`. Provider mgmt is
  web-primary, so no separate mobile screen. Migration 0064 PENDING hand-apply.
- ☐ **2.85** Adoption listing image + video upload — provider editor, no migration.
- ☐ **2.86** Adoption browse: gallery, nearest-first, filters — mobile + web, no migration. ⛔ after 2.85.
- ☐ **2.87** Adoption detail page — mobile, no migration. ⛔ after 2.85.

New go-live env keys (degrade clean until set): `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY` (2.81 web pin),
`ENRICHMENT_LLM_KEY` (2.82, already listed), `CRON_SECRET` + external scheduler (2.84).

---

## NATIVE + REDESIGN TRACKS (sequenced separately from Wave 7)

- **2.76 Widgets / Live Activities / Apple Watch (ATTENDED).** **Phase 1 (Home/Lock-screen widget) STAGED**
  on draft **PR #187** (2026-06; mobile 979/979 + web suites green in CI; code dormant until the Apple
  Developer account lands ~2 days out). Used `@bacons/apple-targets`; added the `pawpi://` deep-link scheme;
  finish-checklist in `docs/native-widgets.md`. Phases 2 (Live Activity) + 3 (Apple Watch) are later PRs,
  ⛔ after the account + Phase 1 merge (Phase 2's transport half soft-needs 2.70). **Held** while CC builds
  Wave 7 (decided 2026-06).
- **2.77 iOS 27 "Liquid Glass" redesign (cross-cutting).** Ticketed; **DO LAST**, after Wave 7 + 2.76 reach
  a clean point — visual/motion only, foundation-first then small per-screen PRs.

---

## ★ PREVIOUS PRIORITY — Phase 2: the pet-services super-app (now done; reference below)

From the master plan's sequenced roadmap (§6). Surface-what's-live first, then the cross-cutting
unlocks (payments/reviews/chat/booking) that make every later service cheap, then roll out types.

### Ready now (gate 1 — you approve which go in the next batch)

- [ ] **2.0 NAV-SURFACE** Promote "Pet Services" to a quick-access nav spot; move Community into More; feature only live types (Veterinary only for now). Makes the built vet loop reachable. *(Cowork notes a ticket is already written — I'll pull its spec before building.)* scope: fe. safe-parallel: yes.
- [ ] **2.1 REVIEWS** Surface existing `provider_reviews`: write-a-review after a completed booking; show aggregate rating on discovery + profiles (one review per completed booking). scope: fe+be. safe-parallel: yes (separate files from 2.0).

### Next, in order (the cross-cutting unlocks — mostly sequential, each its own gate)

- [ ] **2.2 PAYMENTS** Payments foundation: money tables (+RLS+harness proofs), provider-agnostic payment layer (createCheckout/handleWebhook/getStatus/refund/payout), MercadoPago split adapter + Binance adapter (key-stubbed), provider OAuth connect, signed webhooks. Big cross-cutting unlock — everything monetizable depends on it. scope: db+be. safe-parallel: no. Needs a plan-approval gate.
- [ ] **2.3 BOOKING-GEN** Generalize `vet_appointments` → cross-type booking + calendar (recurring, 2-way sync). scope: db+be. BLOCKED by direction set in 2.2 area.
- [ ] **2.4 CHAT** Owner↔provider booking-scoped messaging (new RLS participant-scoped tables). scope: db+be.
- [ ] **2.5 TYPES** Service-type rollout, one ticket each: Groomer → Walker (GPS) → Daycare/Boarding → Sitter → Trainer. Each builds on payments+booking+chat. BLOCKED until 2.2–2.4 land.
- [ ] **2.6 SHOP** Catalog/inventory/orders + product payments + subscriptions. BLOCKED by 2.2.
- [ ] **2.7 ADOPTION** `adoption` provider type + adoptable-dog listings (dog-profile format) + application workflow + fee/donation payments. BLOCKED by 2.2.
- [ ] **2.8 FEED** Surface businesses/services in the social feed. 
- [ ] **2.9 DASHBOARDS** Provider revenue/bookings/reviews/occupancy; owner orders/bookings hub.

**Rule from the master plan:** every NEW Phase-2 table ships with RLS policies + real-Postgres
harness proofs from the start (no retro-RLS), and the completeness guard must stay green.

---

## Awaiting YOUR device test (gate 2 — only you can clear; independent of build work)

Phase-1 work that's built + CI-green but never physically verified. Clear whenever; doesn't block Phase 2.

- [ ] **DEV-1** Combined wellness reminder device pass (each cadence saves→fires; multi-day weekly Wed&Fri; biweekly; edit round-trip; back-compat; collapsed-card label for Yearly/Hourly/Once; "15 min before" fires early while Today row stays at real time).
- [ ] **DEV-2** Keyboard fix device pass (PR #40 — bottom-of-screen inputs not covered; MedicationModal focus-switch; VetSummary pinned button).
- [ ] **DEV-3** Date/time pickers device pass (PR #38 — birthday ×3, MedicationModal vaccine+preventive, all routine modals; "21 April 2025" display, correct values in Supabase).
- [ ] **DEV-4** Pull-to-refresh device pass (PR #36 — all 4 Health tabs render/scroll/switch).
- [ ] **DEV-5** PhotoCheck combined device pass (PR #57 — cadences fire; same-vs-custom mode; early push; back-compat).

---

## Deferred — Phase 1 reminder polish (NOT current priority; revisit after Phase 2 momentum)

The reminders engine is feature-complete; these are the remaining template rollouts. Lower priority
than Phase 2 per Cowork's reset. Pull back up only if you decide to finish the scheduling polish.

- [ ] **P3-FEED / P3-WALK / P3-VET / P3-REMIND** Roll the wellness ScheduleBlock template into the Feeding / Walk / VetAppointment / ReminderCreation modals (one PR each, safe-parallel). Gated on DEV-1 first (they copy the wellness template).
- [ ] **P3-CARD** Shared ReminderSettingsCard extraction. BLOCKED until the four above land.

---

## Done (recent)

- **QW-DEADCODE** — removed the unreachable SimpleRoutineModal create/edit UI; legacy GENERAL/WEIGHT enums + handlers kept. Draft **PR #109**, CI green (mobile 627, web 394). Awaiting merge. (2026-06-16, first pipeline run.)
- **QW-PHOTOAREA** — already live before the roadmap existed (PhotoCheck body-area collapsible header). Verified 2026-06-16.
- Phase 1: RLS arc complete + LIVE in Supabase (Jun 16); reminders engine (P1/P2 + cadence); date/time pickers (#38); keyboard (#37/#40); pull-to-refresh (#36); provider/vet spine end-to-end.
