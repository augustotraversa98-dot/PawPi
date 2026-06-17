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

## 🌊 WAVE 3 + WAVE 4 — IN PROGRESS (tickets 2.15–2.31)

Build order + blockers in [`docs/phase2-tickets/00-README.md`](phase2-tickets/00-README.md). Status mirror
(✅ merged · 🔨 building · ⛔ blocked-on-prereq · ☐ queued):

- ✅ **2.15** mobile capability multi-select — merged (#130), no migration.
- ✅ **2.16** encrypt payment tokens — merged (#131), no migration.
- ✅ **2.17** sub auto-charge cron — merged (#132), migration 0039 (fn only).
- ✅ **2.18** telehealth — merged (#133), migration 0040 (telehealth_sessions + 2 widened CHECKs).
- ✅ **2.19** More-tab nav fix — merged (#134), no migration (service screens → root `service/` stack).
- ✅ **2.20** provider onboarding links — merged (#135), migration 0041 (4 link columns).
- ✅ **2.21** AI enrichment (confirm-first) — merged (#136), no migration (proposes a draft; applies via existing routes).
- ✅ **2.23** service/product images — merged, migration 0043 (provider_services.image_urls[]).
- ☐ 2.22 storefront (⛔2.20/2.23) · ☐ 2.24 calendar
- ☐ 2.25 search/discover · ☐ 2.26 notifications · ☐ 2.27 owner DMs · ☐ 2.28 share frame
- ☐ 2.30 adoption deep-link (⛔2.19) · ☐ 2.29 i18n · ☐ 2.31 docs hygiene

Migrations 0039–0045 pending hand-apply (see [`docs/test-backlog.md`](test-backlog.md) ACTION 1).

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
