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

## POST-CORE ADD-ONS (not ticketed yet — note when relevant)
Transport/pet-taxi (`transport`), pharmacy/Rx fulfillment (`pharmacy`), telehealth, pet-insurance
marketplace, lost&found + microchip alerts, pet-friendly places directory, events/meetups, nutrition
plans, memorials. All slot onto the same spine/capability/discovery patterns when prioritized.

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
