# Phase 2 tickets — pet super-app (READ THIS FIRST)

Paste-ready ticket prompts for Phase 2 (the pet super-app of services). One file per build item. The
strategy + full rationale is in `docs/phase2-superapp-master-plan.md`. CC: read THIS README + the
master plan before any Phase-2 ticket, so you build without guessing.

## How to use
Each ticket file (`2.x-*.md`) is a complete prompt: open it, paste its body into a fresh Claude Code
chat, build on a fresh branch off `origin/main`, squash-merge. The tickets are intentionally lean
because the SHARED context below applies to all of them — don't re-derive it.

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

## POST-CORE ADD-ONS (not ticketed — note when relevant)
Transport/pet-taxi (`transport`), pharmacy/Rx fulfillment (`pharmacy`) [`ALLOWED_CAPABILITIES` already
reserves both], pet-insurance marketplace, lost&found + microchip alerts, pet-friendly places directory,
events/meetups, nutrition plans, memorials. All slot onto the same spine/capability/discovery patterns
when prioritized.

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
