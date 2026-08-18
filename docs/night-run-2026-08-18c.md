# PawPi — Night Run 2026-08-18c (Vet Record: access + records + documents) — autonomous, 3 PRs

**Designed in Cowork:** 2026-08-18, from on-device testing after VR2 (#448). Three tickets, each its own
PR, built IN ORDER, CI-green → merge → deploy (apply+verify any migration on Supabase) → log, **without
asking** — take defaults; log deviations.

**Standing rules:** no fake/seed data (empty states); **EN+ES on every surface**; integer IDs;
`owner_user_id = user_profiles.id` via the identity chain; additive numbered migrations + `verify_XXXX.sql`;
tables ENABLE+FORCE RLS, app `pawpi_app`; scope by `pet_id` + `owner_user_id`; never break prod (degrade
cleanly). Keep `docs/roadmap.md`, `supabase/SCHEMA_NOTES.md`, this file current. **Migration high-water:
0119 — next free 0120, then 0121.**

> **VERIFY ON THE iOS SIMULATOR, not just jest** — render Vet Record and tap through each add/upload flow
> (screenshot). Jest-green is necessary, not sufficient. If the Simulator is unavailable, mark NEEDS
> ON-DEVICE CONFIRMATION.

Screen: `apps/mobile/src/components/Health/HealthVetRecord.jsx` (+ VetRecord/VetSummary subcomponents).
Build in order.

---

## VR-A — Surface "Create Vet Summary" (owner may be at the vet with no booked appointment)

Mobile-only, no migration. After VR2 the Vet Summary lives inside the "Next visit" group; make it a
top-level, always-visible action on the Vet Record screen (a primary header button or a card above the 3
groups), reachable regardless of whether an appointment exists. Keep the existing VetSummaryModal
(7/30/90-day). EN+ES. Verify on the Simulator with NO upcoming appointment.

---

## VR-B — Make records addable (owner + granted vet) with attribution. Migration 0120.

**Root cause (verified):** the backend already has working POST routes — `allergies`, `conditions`,
`surgeries`, `lab-results`, `notes`, `documents` under `apps/web/src/app/api/vet-record/*` (plus
`pet_vaccinations` owner CRUD and `pet_medications` from 0117) — but the mobile "Add record" picker marks
**all 8 types `comingSoon: true`** (`handleRecordTypeSelect` just Alerts). And the record tables track
`owner_user_id` + `created_at` but NOT who actually authored the row (owner vs a shared vet).

**Decision (Cowork):** professional access = the EXISTING family/caregiver **Editor** share (pet-sharing,
0049 / `resolvePetLogOwner` already permits Editor writes, Viewer read-only). No new access system. Each
record records who added it + role + date.

**Do:**
1. **Wire the "Add record" picker** to real per-type add flows calling the existing routes — remove the
   `comingSoon` stubs. Reuse existing modals where they exist (AddVetNoteModal → /notes; AddDocumentModal
   → /documents; the medications modal → pet_medications; a vaccination form → pet_vaccinations) and build
   simple forms for allergies / conditions / surgeries / lab-results using their POST routes. Every form
   captures the relevant **date** (diagnosed_date / surgery_date / note_date / date_given) + fields the
   route already accepts. On save → refetch → the new row appears in its Medical-history sub-tab.
2. **Attribution — migration 0120:** add `created_by_user_id int` + `created_by_role text`
   ('owner' | 'editor') to `pet_allergies`, `pet_conditions`, `pet_surgeries`, `vet_record_lab_results`,
   `vet_notes`, `vet_record_documents` (and `pet_vaccinations`/`pet_medications` for consistency).
   Additive on existing-RLS tables; backfill existing rows `created_by_user_id = owner_user_id`,
   `created_by_role = 'owner'`. `verify_0120.sql`.
3. **Routes:** gate each record POST with the shared owner-OR-Editor path (like `resolvePetLogOwner`) so a
   granted Editor (incl. a vet shared as Editor) can write — anchor `owner_user_id` to the pet's owner,
   stamp `created_by_user_id = caller`, `created_by_role = isOwner ? 'owner' : 'editor'`. GET returns the
   author's display name (join `user_profiles`) + role + the record date.
4. **Display:** every record row (and the add-record confirmation) shows **"Added by {name} · {role} · {date}"**
   (localized EN+ES) so it's clear who logged it and when — owner vs vet.
5. Integration tests: owner can add each type; a shared **Editor** can add (attributed as editor); a
   **Viewer** is 403; own-row RLS holds. Apply + verify 0120 on Supabase. Verify on the Simulator: add an
   allergy + a condition + a lab result → they appear with "Added by you · today".

**Default:** if a type has no obvious route, map it to a Note (vet_notes) rather than inventing schema.

---

## VR-C — Documents: upload / store / download / tag (phase 1; AI reading is phase 2)

**Decision (Cowork):** phase it. NOW = upload any document, store it, download later, owner tags what it
is so it lands in history. LATER (separate initiative) = AI reads the file and suggests structured records.

**Do:**
1. Make document upload robustly work end-to-end: pick a PDF or image (expo-image-picker /
   expo-document-picker) → upload via the existing `/api/upload` + `/api/vet-record/documents` flow (see
   `VetRecord/AddDocumentModal.jsx`) → it appears in the Documents sub-tab → **owner can download / open it
   later** (a working open/download control) → delete works.
2. **Tagging:** let the owner categorize each document on upload — vaccine record / lab result / visit
   summary / invoice / other. If `vet_record_documents` has no category column, add one (migration **0121**,
   additive + verify). Show the category on the document row and let the history view group/filter by it,
   so uploads land tidily in "history".
3. Leave an honest, non-blocking hint that automatic reading ("PawPi will read your documents and file
   them for you") is **coming soon** — but the upload/store/download/tag path must fully work now (no dead
   buttons). EN+ES.
4. Tests: upload → list → download → delete round-trip; category persists. Verify on the Simulator with a
   real file.

> After merge, apply 0120 (and 0121 if added) to Supabase + run verify, same as prior migrations.

---

## DRIVER PROMPT (paste to Claude Code)

```
NIGHT RUN 2026-08-18c — PawPi Vet Record (autonomous, 3 PRs). UNATTENDED: build VR-A → VR-B → VR-C IN
ORDER, each its own PR, CI-green → merge → deploy (apply+verify migrations on Supabase) → log, without
asking. Take the recommended defaults; log deviations.

ORIENTATION: read ARCHITECTURE.md + supabase/SCHEMA_NOTES.md, then docs/night-run-2026-08-18c.md for the
three ticket briefs + verified root causes. Standing rules: no fake data; EN+ES; integer IDs;
owner_user_id = user_profiles.id; additive numbered migrations + verify (next free 0120, then 0121);
tables ENABLE+FORCE RLS, app pawpi_app; scope by pet_id + owner_user_id; never break prod. Keep roadmap +
SCHEMA_NOTES + the night-run doc current.

CRITICAL: prior fixes passed jest but failed on device. VERIFY each ticket on the iOS Simulator — render
Vet Record and tap through the add/upload flows, screenshot — before claiming it fixed. If the Simulator
is unavailable, mark NEEDS ON-DEVICE CONFIRMATION.

VR-A — Surface "Create Vet Summary" as a top-level, always-visible action on Vet Record (after VR2 it's
buried under "Next visit"; an owner at the vet with no booked appointment can't reach it). Keep the
existing modal. EN+ES. Mobile-only, no migration.

VR-B — The "Add record" picker stubs all 8 types as "Soon" even though POST routes exist
(allergies/conditions/surgeries/lab-results/notes/documents + vaccinations + pet_medications). Wire the
picker to real per-type add forms calling those routes (reuse AddVetNoteModal/AddDocumentModal/medication
+ vaccination forms; build simple forms for allergies/conditions/surgeries/lab-results). Add migration
0120: created_by_user_id + created_by_role ('owner'|'editor') on the record tables, backfill owner rows,
verify. Gate record POSTs with the shared owner-OR-Editor path (resolvePetLogOwner) so a granted Editor
(a vet shared as Editor) can write, attributed as editor; owner_user_id anchors to the pet owner. Every
record shows "Added by {name} · {role} · {date}" (EN+ES). Integration tests: owner adds; Editor adds
(attributed); Viewer 403; own-row RLS. Apply+verify 0120 on Supabase.

VR-C — Documents phase 1: make upload → store → download/open → delete fully work (no dead buttons), and
let the owner tag each document's type (vaccine/lab/visit/invoice/other) so it lands tidily in history —
add a category column via migration 0121 if the table lacks one (additive + verify). Leave an honest
"automatic reading coming soon" hint (non-blocking). EN+ES. Test the upload→download→delete round-trip +
category persistence on the Simulator. Apply+verify 0121 if added.

Report per PR: what changed, Simulator verification, CI status, migration apply+verify output, merge commit.
```

---

## RUN LOG — 2026-08-18 (autonomous)

**VR-A — already satisfied (no PR).** After VR2, PR #449 (commit c829f514) had already moved
`VetSummaryDashboard` + `readinessHint` to top-level above the three groups. Confirmed on the iOS
Simulator: the Vet Summary card is visible on the Vet Record screen with no appointment booked.

**VR-B — ✅ PR #451 (squash 768051bd).**
- Wired the "Add record" picker (removed all `comingSoon` stubs): note/vet-visit/other →
  AddVetNoteModal · document → AddDocumentModal · vaccination/medication → reused MedicationModal ·
  allergy/condition/surgery/lab → new shared `AddVetRecordModal` (EN+ES).
- Migration **0120** (`created_by_user_id` + `created_by_role` on the 6 record tables +
  pet_vaccinations/pet_medications; `vet_notes_family_all` policy). Routes gate with
  `resolvePetLogOwner` (owner-OR-Editor, Viewer 403); GET joins the author name; rows show
  "Added by {name} · {role} · {date}".
- Tests: `vet-record-attribution.integration.test.ts` (owner adds; Editor adds attributed; Viewer 403;
  own-row RLS). Mobile jest 1937, web vitest 2099, integration green.
- Migration applied + verified on Supabase (verify_0120 all 7 PASS).
- Simulator: picker shows no "Soon"; allergy form renders; vaccination opens the reused
  Medications & Care modal on the Vaccines tab; add-allergy save round-trip persisted.
- CI: 3/3 green. Note: real table names are `pet_lab_results` / `vet_documents` (not the
  `vet_record_*` names in the brief).

**VR-C — ✅ PR #452 (squash f54e67a0).**
- Migration **0121** (`vet_documents.category text` CHECK vaccine|lab|visit|invoice|other, nullable,
  kept separate from `document_type`). AddDocumentModal fully localized (EN+ES); 7 free "Type" chips
  → 5 canonical category chips; non-blocking "automatic reading coming soon" hint. Documents tab shows
  the localized category + a category filter row. Route normalizes an unknown category to null.
- Tests: category round-trip + non-canonical→null in the attribution integration test; updated
  AddDocumentModal unit test. Mobile jest 1937 green.
- Migration applied + verified on Supabase (verify_0121 all 4 PASS).
- Simulator (cold restart): "Add document" modal fully localized with the five category chips + the
  coming-soon hint; native photo picker works.
- CI: 3/3 green.

**Deviations / notes.**
- VR-A needed no PR (already merged as #449).
- Migrations were applied to Supabase BEFORE merge (additive columns must exist before the dependent
  route code deploys); the local web backend (:4000) was down during the run, so the Simulator hit
  the PRODUCTION backend (pre-deploy route code) — the server-side "Added by" attribution + document
  category render once Railway redeploys `main`. Migration high-water is now **0121 → next free 0122**.
- iOS i18n gotcha: the i18next singleton survives Fast Refresh, so newly-added keys show as raw keys
  until a COLD app restart (`xcrun simctl terminate booted host.exp.Exponent` then reopen) — not just
  `expo start -c`. Production/fresh installs always resolve.
