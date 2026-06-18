# Phase 2 tickets — pet super-app (READ THIS FIRST)

Paste-ready ticket prompts for Phase 2 (the pet super-app of services). One file per build item. The
strategy + full rationale is in `docs/phase2-superapp-master-plan.md`. CC: read THIS README + the
master plan before any Phase-2 ticket, so you build without guessing.

## How to use
Each ticket file (`2.x-*.md`) is a complete prompt: open it, paste its body into a fresh Claude Code
chat, build on a fresh branch off `origin/main`, squash-merge. The tickets are intentionally lean
because the SHARED context below applies to all of them — don't re-derive it.

## ⚡ WAVE 5 AUTONOMY PREAMBLE (applies to every 2.32–2.50 ticket — overnight unattended run)
Tats is away while these are built. Operate fully autonomously:
- **Never ask questions / never stop for input.** If any choice is ambiguous, pick the most sensible,
  standard, on-brand option and proceed. A "doubt" is resolved by choosing the recommended option, not by
  pausing.
- **Merge policy:** build each ticket on its own fresh branch off `origin/main`; if CI is **green**,
  squash-merge automatically. If CI is **red**, debug, fix, and merge once green. Never leave a ticket
  half-done because of a question.
- **Keep going** down the Wave 5 queue (in the build order below) for as long as tokens last. If the
  token limit is reached, STOP cleanly (don't leave a broken tree) and CONTINUE from the next ticket when
  the limit resets.
- **Build order matters** (some tickets touch the same files / depend on a predecessor) — follow the
  order; honor every ⛔ blocker; verify `origin/main` actually contains a prerequisite before building on
  it.
- **Migrations:** leave each new migration in `supabase/migrations/` using the **next free number** at
  build time (check the dir — Wave 5 starts at ≥0046), and FLAG it in `docs/test-backlog.md` ACTION 1 for
  Tats to hand-apply. Do NOT auto-apply to Supabase. RLS on every new table from day one (+ harness proofs
  + completeness guard).
- **Auth tickets (2.32, 2.46) are high-blast-radius:** additive only, never break the existing
  email/password login; env-gate new providers so an install without keys is unchanged.
- **No fake data** anywhere (empty states only). Update the status block + roadmap + test-backlog per
  ticket as you merge, same as Waves 3/4.

## SHARED CONVENTIONS (apply to EVERY Phase-2 ticket)
- **Spine reuse:** every service is the unified provider spine (`providers`, `provider_staff`,
  `provider_locations`, `provider_services`, discovery `/api/providers/discover` + `/public/[slug]`,
  booking, consent `care_access_grants` + `assertCareAccess`) + a capability-specific module. Do NOT
  rebuild onboarding/profile/staff/discovery per service — extend them.
- **Workflow:** one prompt = one fresh branch off `origin/main`; squash-merge when green; migrations
  hand-applied to Supabase AFTER merge (never auto-applied / never from CC).
- **Tests = two-suite canary:** `npm test` (mocked vitest, the PR gate) MUST stay green + unchanged
  except your net-new; `npm run test:integration` (real-Postgres harness) for anything DB/RLS. Mobile
  = jest. Confirm the baseline before you start; after = baseline + net-new, zero pre-existing broken.
- **RLS IS LIVE — non-negotiable:** EVERY new table ships with RLS policies (ENABLE+FORCE) + as-`pawpi_app`
  zero-rows harness proofs, classified by the completeness guard (RLS-on+policy, or documented
  RLS_EXEMPT). Owner-scoped / provider-staff-scoped / consent-scoped / participant-scoped as fits the
  routes. Money + medical tables = strictest. The helpers exist: `current_app_user_id()`,
  `app_provider_has_grant(pet_id, scope)`, `app_provider_has_booking(pet_id)`, `app_is_active_staff_of(provider_id)`,
  `app_is_provider_admin(provider_id)` — reuse them (add new SECURITY-DEFINER helpers the same way if
  a predicate must read another RLS table; mind recursion).
- **Provider web dashboard** lives in `anything/apps/web/src/app/provider/` (React Router v7, auth-gated
  shell, React Query + React Table + Tailwind + recharts). **Owner/consumer UI** is the Expo mobile app
  (`anything/apps/mobile`). Reuse both shells; don't scaffold new ones.
- **Media** (photos/video, report cards, before/after, walk pics) reuse the existing Supabase Storage
  upload path; route relevant media into the pet's health/profile timeline where it fits.
- **No fake data** (project rule): real API only; empty → empty states; only feature live capabilities.

## ⚠️ CORE MODEL — providers have MANY capabilities (not one provider_type)
A business offers several services at once (a "vet shop" = consultation + vaccination + grooming +
store). Ticket **2.1** introduces `provider_capabilities` (many-to-many) + `providerHasCapability()`.
From 2.1 on, EVERY service module gates on a CAPABILITY, never on `provider_type`. Onboarding is
multi-select; discovery `?type=<cap>` matches providers HAVING that capability; a provider appears
under every capability it holds. Capability ≠ data access (consent/RLS still gate pet data).

## BUILD ORDER (dependencies matter)
1. **2.0** surface nav (mobile)  — independent, do first (visible win).
2. **2.1** provider capabilities  — FOUNDATIONAL; do before any service module.
3. **2.2** reviews surfacing      — independent, quick.
4. **2.3** payments foundation    — cross-cutting unlock; do before monetized services.
5. **2.4** generalized booking    — before non-vet service bookings.
6. **2.5** chat/messaging         — before walker/sitter/adoption (they lean on it).
7. **2.6–2.10** service modules   — grooming → walking → daycare/boarding → sitting → training
   (each needs 2.1; booking via 2.4; pay via 2.3; chat via 2.5).
8. **2.11** shop/e-commerce       — needs 2.3.
9. **2.12** adoption              — needs 2.1, 2.3 (fees/donations), 2.5 (chat).
10. **2.13** feed integration.
11. **2.14** dashboards/analytics.

You can parallelize the independent ones (2.0/2.2), but service modules (2.6+) should follow 2.1–2.5.

## WAVE 3 — post-Phase-2 add-ons + loose ends (2.15–2.18, build in this order)
2.0–2.14 are all built + merged. The next wave hardens the foundation, then adds telehealth. Build order
(⛔ = a HARD blocker: the dependent ticket must NOT start until its prerequisite is merged to `origin/main`):
1. **2.15** mobile capability multi-select — frontend-only, no migration; closes the multi-capability gap
   on phones (web POST already accepts `capabilities[]`). *(Independent — start anytime.)*
2. **2.16** encrypt payment tokens at rest — backend-only, no migration; pre-launch security on 2.3.
   *(Independent — start anytime.)*
3. **2.17** subscription auto-charge cron — needs 2.3+2.11; ⛔ **must NOT start until 2.16 is merged**
   (reuses 2.16's token-decrypt seam); adds migration **0039** (a SECURITY DEFINER enumerator function
   only — no table).
4. **2.18** telehealth (vet video consult) — new `telehealth` capability; reuses booking 2.4 / payments
   2.3 / chat 2.5 / consent + clinical write; ⛔ **must NOT start until 2.15 is merged** (appends
   `telehealth` to 2.15's onboarding multi-select); adds migration **0040** (one table + widens two
   capability CHECKs).

2.15 and 2.16 are independent of each other and can be built in parallel; 2.17 and 2.18 each wait on their
prerequisite above. Each ticket states its blocker at the top of its file too.

## WAVE 4 — nav fix + provider expansion + feed real-data + share + i18n (2.19–2.29)
The next product wave (decided with Tats). Order is by DEPENDENCY (⛔ = hard blocker, must be merged to
`origin/main` first); independent items can interleave. Recommended sequence:
1. **2.19** Fix More-tab nav corruption — mobile, independent, no migration. **Do first** (broken core flow).
2. **2.20** Provider onboarding: capture links — ⛔ **after 2.15** (shared onboarding form; also sequence
   after 2.18 — same file). Migration **0041** (link columns).
3. **2.21** AI enrichment from links (confirm-first import) — ⛔ **after 2.20** (links are its input). No
   migration (writes existing fields via the owner routes).
4. **2.23** Service/product image uploads — migration **0043**. **Recommended before 2.22** (storefront
   renders the images); otherwise independent.
5. **2.22** Provider storefront profile + posts — migration **0042** (`provider_posts` + cover). Soft-needs
   2.23 for rich media; reuses reviews/shop/booking/chat.
6. **2.24** Web bookings calendar view — independent web, no migration.
7. **2.25** Search & Discover real data — mobile, no migration, independent.
8. **2.26** Notifications real data — migration **0044** (`notifications` + DEFINER notify helper).
9. **2.27** Real owner↔owner messaging — migration **0045** (DM tables). Decision: BUILD (not retire);
   separate from the provider chat.
10. **2.28** Daily photo shareable frame (IG/X) — mobile, no migration, independent.
11. **2.29** i18n English/Spanish — mobile, no migration. **Recommended last** (translate stable screens
    once, not twice; new screens adopt `t()` as built).

Loose-end clean-ups (slot in anywhere they fit):
- **2.30** Adoption per-listing deep-link — mobile, no migration, ⛔ **after 2.19** (deep-links into the
  `more/` stack that 2.19 restructures).
- **2.31** Docs hygiene (ARCHITECTURE.md + SCHEMA_NOTES.md) — docs-only, no code/migration, fully independent.
- Native photo/video upload (shared `fetch.ts` path) for visit/session media = a **device re-test**, not a
  build ticket — tracked in `docs/test-backlog.md` (no code unless it fails).

Independent + parallel-safe (touch isolated files): 2.19, 2.24, 2.25, 2.28 can slot in anytime. The
provider chain 2.20→2.21 and the image/storefront pair 2.23→2.22 are the ordered ones. Migration numbers
0041–0045 assume this order; if branches land out of order, take the next free sequential number and update
`docs/test-backlog.md` ACTION 1.

⚠️ **Shared-file sequencing (don't run these as parallel branches):**
- `apps/mobile/.../vet-business-access.jsx` — edited by **2.15 → 2.18 → 2.20** (sequential; each waits for
  the prior to merge).
- `apps/web/.../providers/public/[slug]/route.js` — edited by **2.20 → 2.22** (2.22 after 2.20).
- `apps/web/.../providers/[id]/route.js` (profile PATCH) — **2.20**; the **2.21** enrichment "Import" UI
  lands on the same web profile screen → 2.21 after 2.20 (already its hard blocker).
- provider dashboard sidebar — **2.22** (Storefront) + **2.24** (Calendar) each add a nav entry; if built
  in parallel, rebase the second on the first (trivial conflict, just flagged).
- `apps/mobile/.../(tabs)/_layout.jsx` — **2.19** (nav fix, first) and **2.29** (i18n translates the tab
  labels, last) both touch it; the recommended order already separates them, no action needed.

⚠️ Migration numbering: 2.17=0039, 2.18=0040 (build order). If branches land out of order, take the next
free sequential number and update `docs/test-backlog.md` ACTION 1. (NOT relevant this wave: transport,
pharmacy — deliberately deferred.)

## WAVE 5 — polish, fixes, big features + the "epic four" (2.32–2.50)
✅ **COMPLETE (2026-06).** All 19 tickets (2.32–2.50) built, CI-green, squash-merged to `origin/main`
(PRs #148–#166). No-migration tickets: 2.32–2.42, 2.46, 2.49, 2.50. Pending hand-apply to Supabase:
migrations **0046–0050** (2.43/2.44/2.45/2.47/2.48) — see `docs/test-backlog.md` ACTION 1. Pending env
keys: Apple + Google OAuth (2.46) — buttons stay "Coming soon" until set. The order below is kept for
reference.

Built UNATTENDED per the ⚡ Wave 5 autonomy preamble at the top. Build in this order (dependency-driven;
single agent works serially, so shared files are fine as long as order holds). Migrations use the **next
free number ≥0046** at build time — flag each in `docs/test-backlog.md` ACTION 1; Tats hand-applies.

Quick wins / bugs first (momentum + testability):
1. **2.32** Password security rules — auth, additive, no migration. Don't break existing login.
2. **2.33** Notifications filter-chips layout fix — mobile, trivial.
3. **2.34** Current-pet header sync (More shows active pet) — mobile bug.
4. **2.35** Onboarding required fields (@handle/name/species) + keyboard fix — mobile.
Feed / profile / nav cluster (ordered — shared feed+profile files):
5. **2.36** Feed daily-post fixes (delete/reupload, view-today, own post in feed) — adds post DELETE route.
6. **2.37** Feed streak 🔥 + birthday 🎂 frame — ⛔ after 2.36.
7. **2.38** Profile fixes (share button + real timestamps) — ⛔ after 2.37.
8. **2.39** Instagram nav: bottom-right Profile + More-as-burger — ⛔ after 2.38; honor the 2.19 nav fix.
Messaging + vet record:
9. **2.40** Unified Messages (people + businesses tabs + owner search) — reuses 2.27 DMs + 2.5 chat.
10. **2.41** Vet Record owner upload + complete info — `vet_documents` exists (check before migrating).
11. **2.42** Vet Record append-only dated history log — ⛔ after 2.41; integrity is RLS (prove it).
Big features:
12. **2.43** Walks with buddies (map + public/private + invites) — extends `social_walks` (migration).
13. **2.44** Community forum (Reddit-style) — new tables (migration).
14. **2.45** Training supreme (researched curriculum + progress) — new progress table (migration).
15. **2.46** Sign in with Apple + Google — auth, additive + env-gated; never break existing login.
The epic four:
16. **2.47** Family/caregiver consent sharing — person↔person grants mirroring `care_access` (migration).
17. **2.48** Lost & Found (lost mode + local alerts + sightings) — new tables (migration).
18. **2.49** Memories & Wrapped (on-this-day/milestones/year-in-review) — reuses 2.28 share; no migration.
19. **2.50** AI health intelligence + real Vet Summary — ⛔ after 2.41+2.42; biggest, do LAST.

If tokens run out mid-wave: stop cleanly and resume at the next un-built ticket. The auth tickets (2.32,
2.46) and the access-control ticket (2.47) are the highest-risk — additive + RLS-proven only.

## 🌊 WAVE 6 — UX fix-pack first, then trust + new capabilities (2.51–2.66)
Decided with Tats (2026-06-18, expanded with a UX fix-pack from on-device feedback). Built per the ⚡ Wave 5
autonomy preamble above (same rules: no questions, CI-green → auto squash-merge, RLS + harness proofs +
completeness guard on every new table, migrations left at the next free number for Tats to hand-apply, no
fake data). Build in this order; each ticket is a fresh branch off `origin/main`. **Last applied migration =
0050; the only Wave 6 migrations are 0051–0055 (the feature tickets) — the entire fix-pack (2.55, 2.59–2.66)
adds NO migration.** Always take the NEXT FREE number in `supabase/migrations/` at build time and update
`docs/test-backlog.md` ACTION 1.

### Part A — UX fix-pack (mobile bugs/polish Tats is hitting on-device; do FIRST, no migrations)
1. **2.55** Remove "Phoebe" + avatar fallback — cleanup; also provides the shared avatar fallback that
   2.60 reuses. **Do first.**
2. **2.62** Share frame attaches the REAL daily-moment photo (capture was firing before the image loaded).
3. **2.63** App-wide keyboard UX — tap the field first, then the keyboard (kill auto-focus on bark/comments).
4. **2.64** Double-tap an image → Paw (brand-color like animation); reuses the paw endpoint.
5. **2.65** Edit my daily update's caption (owner-only PATCH on posts/[id]); text only, photo/daily-lock untouched.
6. **2.66** Health → Today "Today's Progress" on REAL logged data (kills the hardcoded "Fed 2 times" chips).
7. **2.59** Floating Instagram-style tab bar (visual only; preserve 2.19 + 2.39). **Edits `(tabs)/_layout.jsx`.**
8. **2.60** Bottom "Profile" tab → the active pet's SOCIAL profile + pet-photo avatar icon (refines 2.39).
   ⛔ after **2.59** (same `_layout.jsx`) and **2.55** (avatar fallback).
9. **2.61** Followers/Following — tappable counts → searchable list + paw follow/unfollow toggle + row→profile.
   No migration (`pet_follows` exists; adds read routes). ⛔ after **2.60**.

⚠️ Shared-file sequencing in Part A: 2.62/2.64/2.65 (+2.63) all touch the Feed post components
(PostCard / PostDetailModal / BarkModal) — a single serial agent is fine; if parallelized, rebase. 2.59 → 2.60
are ordered on `(tabs)/_layout.jsx`. 2.61 follows 2.60.

### Part B — trust + new capabilities + remaining loose ends (the migrations live here)
10. **2.56** Adoption public single-listing GET — web, no migration; closes the 2.30 admin-only deviation.
11. **2.51** Emergency mode + shareable/printable medical card — mobile + PUBLIC web page; migration **0051**
    (`pet_emergency_cards` + `pet_emergency_share_links`; public reads via SECURITY DEFINER fns ONLY).
    Headline. Reuses the medical profile + 2.28 share + consent + 2.48 lost. Fixed printable tag QR →
    no-login public web page; revocable vet link; in-app image/PDF share.
12. **2.52** Transport / pet-taxi — new `transport` capability on the spine; migration **0052**
    (`transport_trips`). Reuses booking 2.4 / payments 2.3 / chat 2.5.
13. **2.53** Vet prescriptions / Rx (a section INSIDE Veterinary, NOT a pharmacy storefront) — migration
    **0053** (`prescriptions` + `rx_refill_requests`); STRICTEST medical append-only RLS (clinical-write
    model, like vet_notes).
14. **2.54** Pet-insurance marketplace — new `insurance` capability; migration **0054** (widen the
    capabilities CHECK + `insurance_plans` + `insurance_leads`). Lead-gen v1, no in-app binding/payment.
15. **2.57** Adoption foster workflow + urgent/featured flags — migration **0055** (additive columns riding
    the existing adoption RLS); ⛔ after **2.56** (shared adoption files).
16. **2.58** Feed "Suggested" divider + ARCHITECTURE.md/SCHEMA_NOTES.md expansion — mobile + docs, no
    migration. **Do LAST** so the docs capture every Wave 6 table/feature.

Notes: Part A is all mobile, no migration — safe to run start-to-finish before any DB work. In Part B,
2.56 / 2.51 / 2.52 / 2.54 are mutually independent (different files); 2.57 waits on 2.56; 2.58 is last. The
high-blast-radius tickets are 2.51 (public read of MEDICAL data — DEFINER-only, never a broad SELECT
policy) and 2.53 (clinical Rx — owner read-only, append-only): strictest RLS, harness-proven, leak nothing
beyond whitelisted columns.

## 🌊 WAVE 7 — finish the money/transport loops + discovery/community/health add-ons (2.68–2.75)
Decided with Tats (2026-06-18) from the un-ticketed post-core list. Built per the ⚡ Wave 5 autonomy preamble
above (no questions; CI-green → auto squash-merge; RLS + harness proofs + completeness guard on every new
table; migrations left at the next free number for Tats to hand-apply; no fake data). Continues the 2.NN
numbering (the "Wave" is a grouping label, as in Waves 3–6). **Last applied migration = 0055; Wave 7
migrations are 0056–0061.** Always take the NEXT FREE number in `supabase/migrations/` at build time and
update `docs/test-backlog.md` ACTION 1.

### Cross-cutting requirement (Tats, 2026-06-18): Apple Maps in EVERY location/address section
Every section that captures OR shows an address/location must use a real map (Apple Maps on iOS for now).
The app already uses `react-native-maps` + `PROVIDER_DEFAULT` (= Apple on iOS; no key needed) — **2.68
extracts the shared map components and everything else reuses them.** Build 2.68 FIRST; do not hand-roll a
new picker per screen.

Build order (⛔ = hard blocker, must be merged to `origin/main` first):
1. **2.68** Shared Apple-Maps location component — mobile, NO migration. **Do FIRST** (foundation reused by
   2.70/2.73/2.74).
2. **2.69** Provider Sales / payouts + reconciliation UI — web, expected NO migration (read-only surfacing of
   the 2.3 money tables). Independent — can interleave.
3. **2.70** Transport live-GPS tracking — migration **0056** (`transport_trip_locations`); the planned 2.52
   follow-up, mirrors walker-GPS 2.7. ⛔ after **2.68** (reuses the shared map).
4. **2.71** Rx fulfillment (delivery/pickup + charging) — migration **0057** (`rx_fulfillment_orders` + a new
   `pharmacy` capability). Bridges 2.53 → 2.11 → 2.3; medical-grade RLS, refills only via the 2.53 safe path.
5. **2.72** Insurance in-app binding + payment — migration **0058** (`insurance_policies`). Full in-app
   bind+pay extending 2.54 lead-gen; reuses payments 2.3; insurer is party-of-record (disclaimers, not
   underwriting).
6. **2.73** Pet-friendly places directory — migration **0059** (`saved_places` [+ optional cache]). Google
   Places DATA via a server route (key-gated, degrade-clean), Apple-map display. ⛔ after **2.68**.
7. **2.74** Events / meetups — migration **0060** (`events` + `event_rsvps`). Community feature (forum 2.44 +
   social-walks 2.43 patterns), location via the 2.68 picker. ⛔ after **2.68**.
8. **2.75** Nutrition plans + food-recall alerts — migration **0061** (`nutrition_plans` + `food_recalls`
   [+ optional matches]). Owner+pet health; external recall feed is key/cron-gated + degrade-clean;
   non-diagnostic copy.

Independent + parallel-safe (isolated files): 2.69 (web money), 2.71, 2.72, 2.75. The map-dependent trio
(2.70/2.73/2.74) all wait on 2.68. Migration numbers 0056–0061 assume this order; if branches land out of
order, take the next free sequential number and update `docs/test-backlog.md` ACTION 1. New go-live env keys
this wave: the food-recall feed key + an external scheduler (2.75, like 2.17's CRON_SECRET); 2.73 also
consumes the already-flagged `GOOGLE_PLACES_API_KEY`.

## POST-CORE ADD-ONS (not ticketed — note when relevant)
Un-ticketed after Wave 7 (deferred by choice): **widgets / Apple Watch + Live Activities** (native iOS;
deferred to a dedicated attended effort — can't be CI-verified, needs a dev build + app-store config),
calendar integration, weather-aware nudges, memorials (2.68–2.75 dropped memorials per Tats 2026-06-18). All
slot onto the same spine/capability/discovery patterns when prioritized.

## INDEX
- 2.0-surface-nav.md
- 2.1-provider-capabilities.md
- 2.2-reviews-surfacing.md
- 2.3-payments-foundation.md
- 2.4-generalized-booking.md
- 2.5-chat-messaging.md
- 2.6-grooming.md
- 2.7-walking-gps.md
- 2.8-daycare-boarding.md
- 2.9-sitting.md
- 2.10-training.md
- 2.11-shop-ecommerce.md
- 2.12-adoption.md
- 2.13-feed-integration.md
- 2.14-dashboards-analytics.md
- 2.15-provider-capabilities-mobile.md  (Wave 3 — mobile multi-capability onboarding; no migration)
- 2.16-encrypt-payment-tokens.md        (Wave 3 — encrypt provider tokens at rest; no migration)
- 2.17-subscription-autocharge-cron.md  (Wave 3 — auto-reorder charger; migration 0039, fn only)
- 2.18-telehealth.md                    (Wave 3 — vet video consult; new `telehealth` capability; migration 0040)
- 2.19-nav-more-tab-corruption.md       (Wave 4 — fix More-tab nav corruption; no migration)
- 2.20-provider-onboarding-links.md     (Wave 4 — capture business links; ⛔ after 2.15; migration 0041)
- 2.21-provider-link-enrichment.md      (Wave 4 — confirm-first AI enrichment; ⛔ after 2.20; no migration)
- 2.22-provider-storefront-profile.md   (Wave 4 — storefront + posts; migration 0042; soft-needs 2.23)
- 2.23-service-product-images.md        (Wave 4 — service/product image uploads; migration 0043)
- 2.24-provider-calendar-view.md        (Wave 4 — web bookings calendar; no migration)
- 2.25-feed-search-discover-real.md     (Wave 4 — real search & discover; no migration)
- 2.26-notifications-real.md            (Wave 4 — real notifications; migration 0044)
- 2.27-owner-messaging-real.md          (Wave 4 — real owner↔owner DMs; migration 0045)
- 2.28-daily-share-frame.md             (Wave 4 — shareable daily frame IG/X; no migration)
- 2.29-i18n-spanish.md                  (Wave 4 — English/Spanish i18n; no migration)
- 2.30-adoption-deeplink.md             (Wave 4 — per-listing deep-link; ⛔ after 2.19; no migration)
- 2.31-docs-hygiene.md                  (Wave 4 — refresh ARCHITECTURE.md + SCHEMA_NOTES.md; docs-only)
- 2.32-password-security.md             (Wave 5 — password strength rules; no migration)
- 2.33-notifications-chips-fix.md       (Wave 5 — notif filter-chip layout; no migration)
- 2.34-current-pet-header-sync.md       (Wave 5 — More header shows active pet; no migration)
- 2.35-onboarding-required-fields.md    (Wave 5 — required @handle/name/species + keyboard; no migration)
- 2.36-feed-daily-post-fixes.md         (Wave 5 — delete/reupload + view-today + own-post-in-feed)
- 2.37-feed-streak-birthday.md          (Wave 5 — streak 🔥 + birthday 🎂 frame; ⛔ after 2.36)
- 2.38-profile-fixes.md                 (Wave 5 — share button + real timestamps; ⛔ after 2.37)
- 2.39-nav-profile-and-more-burger.md   (Wave 5 — IG nav: bottom Profile + More burger; ⛔ after 2.38)
- 2.40-unified-messages.md              (Wave 5 — people+businesses tabs + owner search; no migration)
- 2.41-vet-record-owner-upload.md       (Wave 5 — owner docs upload + complete info)
- 2.42-vet-record-history-log.md        (Wave 5 — append-only dated history log; ⛔ after 2.41)
- 2.43-walks-with-buddies.md            (Wave 5 — map + public/private walks; migration ≥0046)
- 2.44-community-forum.md               (Wave 5 — Reddit-style forum; migration ≥0046)
- 2.45-training-supreme.md              (Wave 5 — researched curriculum + progress; migration ≥0046)
- 2.46-social-login-apple-google.md     (Wave 5 — Apple + Google sign-in; additive/env-gated; no migration)
- 2.47-family-caregiver-sharing.md      (Wave 5 — person↔person consent sharing; migration ≥0046)
- 2.48-lost-and-found.md                (Wave 5 — lost mode + local alerts + sightings; migration ≥0046)
- 2.49-memories-wrapped.md              (Wave 5 — on-this-day/milestones/Wrapped; no migration)
- 2.50-ai-health-intelligence-vet-summary.md (Wave 5 — insights + real Vet Summary; ⛔ after 2.41+2.42)
- 2.51-emergency-medical-card.md         (Wave 6 — emergency mode + printable tag QR + revocable vet link + image share; migration 0051)
- 2.52-transport-pet-taxi.md             (Wave 6 — `transport` capability on the spine; migration 0052)
- 2.53-vet-prescriptions-rx.md           (Wave 6 — Rx section inside Veterinary; migration 0053; strictest medical RLS)
- 2.54-insurance-marketplace.md          (Wave 6 — `insurance` capability marketplace, lead-gen; migration 0054)
- 2.55-remove-phoebe-avatar-fallback.md  (Wave 6 — remove hardcoded "Phoebe" + avatar fallback; no migration)
- 2.56-adoption-public-listing-get.md    (Wave 6 — public single-listing GET; closes 2.30 deviation; no migration)
- 2.57-adoption-foster-urgent-flags.md   (Wave 6 — foster workflow + urgent/featured flags; ⛔ after 2.56; migration 0055)
- 2.58-feed-suggested-divider-and-architecture.md (Wave 6 — feed Suggested divider + docs expansion; no migration; build LAST)
- 2.59-floating-tab-bar.md                (Wave 6 fix-pack — floating IG-style tab bar; no migration; edits (tabs)/_layout.jsx)
- 2.60-profile-tab-pet-profile.md         (Wave 6 fix-pack — Profile tab → pet social profile + photo icon; ⛔ after 2.59+2.55; no migration)
- 2.61-followers-following-lists.md        (Wave 6 fix-pack — followers/following lists + follow toggle + search; ⛔ after 2.60; no migration)
- 2.62-share-frame-attach-photo.md         (Wave 6 fix-pack — share frame attaches the real photo; no migration)
- 2.63-keyboard-tap-to-focus.md            (Wave 6 fix-pack — tap field first, then keyboard, app-wide; no migration)
- 2.64-double-tap-paw.md                   (Wave 6 fix-pack — double-tap image → Paw/like; no migration)
- 2.65-edit-daily-update-caption.md        (Wave 6 fix-pack — edit own post caption; owner-only PATCH; no migration)
- 2.66-health-today-real-progress.md       (Wave 6 fix-pack — Today's Progress on real logged data; no migration)
- 2.67-followers-following-route-fix.md     (Wave 6 — device fix: Followers/Following → +not-found; follow-up to 2.61; no migration)
- 2.68-shared-map-location.md               (Wave 7 — shared Apple-Maps location components; no migration; build FIRST)
- 2.69-provider-sales-payouts-reconciliation.md (Wave 7 — provider Sales/payouts/reconciliation UI; web; expected no migration)
- 2.70-transport-live-gps.md                (Wave 7 — transport live GPS; migration 0056; ⛔ after 2.68; 2.52 follow-up)
- 2.71-rx-fulfillment.md                     (Wave 7 — Rx delivery/pickup + charging; migration 0057; new `pharmacy` capability)
- 2.72-insurance-binding-payment.md          (Wave 7 — in-app insurance binding + payment; migration 0058; extends 2.54)
- 2.73-pet-friendly-places-directory.md      (Wave 7 — places directory, Google Places data + Apple map; migration 0059; ⛔ after 2.68)
- 2.74-events-meetups.md                      (Wave 7 — events/meetups + RSVPs + map location; migration 0060; ⛔ after 2.68)
- 2.75-nutrition-plans-food-recalls.md        (Wave 7 — nutrition plans + food-recall alerts; migration 0061; non-diagnostic)
- 2.76-widgets-watch-live-activities.md        (NATIVE track — Widgets + Live Activities + Apple Watch; ATTENDED, no auto-merge; no migration)
- 2.77-ios27-liquid-glass-redesign.md          (CROSS-CUTTING redesign — iOS 27 Liquid Glass + smoother motion; keep palette; DO LAST, after Wave 7 + 2.76; no migration)
- 2.78-app-store-readiness.md                   (FINAL STEP of the Wave 7 autonomous run — debugging + App Store compliance hardening; auto-fix + flag; aims at submission)
