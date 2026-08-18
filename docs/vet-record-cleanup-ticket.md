# PawPi — Vet Record cleanup + Vet Summary fix — design ticket

**Designed in Cowork:** 2026-08-18, from on-device testing. DESIGN of record (Rule 5/6). Mobile + web.
**No migration** (all tables/routes exist). Standing rules: no fake data (empty states); **EN+ES on every
surface**; owner+pet scoped; never break prod; one PR per ticket, CI-green → merge → deploy → log.
Verify interaction on the iOS Simulator, not just jest.

Screen: `apps/mobile/src/components/Health/HealthVetRecord.jsx` (+ VetRecord/VetSummary subcomponents).

## VR1 — Vet Summary reports "0 things logged" (BUG — ships first, own PR)

**Root cause (verified vs prod, pet 18):** `apps/web/src/app/api/vet-record/full-summary/route.js`
aggregates food/poo/pee/vomit/weight/meds/photos/walks/wellness/allergies/conditions/vaccinations/notes
over the selected period, but **never queries `health_general_checks`**. Quick Checks therefore never
count; the pet had 2 general checks and nothing else in the window → the summary shows 0. The dashboard
`totalLogs` also omits weight and general checks.

**Fix:** add `health_general_checks` to the full-summary query (owner+pet scoped, over [from,to]) with a
count + recent per-area detail from the `areas` jsonb (status/changes/notes, and which areas were
flagged "changed"); include general checks + weight in `VetSummaryDashboard.totalLogs`, the
`VetSummaryModal` stat list, and `summaryToText`; optionally surface "changed" areas in
`detectHealthFlags`. EN+ES. Extend the full-summary integration test. (Grey-box prompt delivered in the
Cowork session.)

## VR2 — Consolidate Vet Record (13 sections → 3 groups) + localize EN+ES — ✅ BUILT 2026-08-18 (own PR; mobile-only, no migration; full jest gate green)

The screen currently stacks 13 separate collapsible sections, all with **hardcoded English titles**.
Restructure to three groups; localize every title/label/empty-state (new `health.vetRecord.*` keys,
EN+ES).

**1. Medical profile** — unchanged (EditMedicalProfileModal: microchip, insurance, clinic,
spayed/neutered, emergency contact).

**2. Next visit** — MERGE "Upcoming Appointments" + "Prepare for Next Visit" into one card:
- the next upcoming appointment (date/time/clinic/reason) from `/api/vet-appointments`, or an empty
  state ("No upcoming appointment");
- the prep affordance: the **Create Vet Summary** action (period report) + a short readiness hint
  (`vet-summary-readiness`).
- Use the SAME appointment data source as the Health → Today `VetAppointmentCountdownCard` — one source
  of truth, no second/duplicate representation. Past/completed visits move to history (below).

**3. Medical history — GROUPED (owner picked this).** One parent "Medical history" section with a
compact horizontal sub-nav (segmented chips, scrollable — like the Quick Check area stepper). Each
sub-tab reuses the EXISTING list/query/modal, with its count badge + empty state:
- Vaccines (`pet_vaccinations`)
- Visits & procedures (completed vet visits + Surgery History)
- Medications (current medications)
- Labs (lab results)
- Conditions & allergies (merge the two)
- Notes (the append-only clinical History log — Add/Delete note)
- Documents (Add document / open / delete)
- Photos (Photo History)
Default to the first sub-tab (or first non-empty). Keep all existing add/edit/delete flows working
(AddVetNoteModal, AddDocumentModal, etc.). Collapses 10 top-level sections into 1 parent + sub-nav.

**Also:** localize the ENTIRE screen EN+ES (all section titles, empty states, buttons, the medical
profile, the summary card). No migration. Verify on the Simulator: the three groups render, the history
sub-nav switches lists, add/delete still works, EN+ES both render.

**Out of scope:** any new record type or backend; this is a restructure + localization only.

## Build prompt

Delivered alongside this doc in the Cowork session (kept out of the design doc per Rule 5/6).
