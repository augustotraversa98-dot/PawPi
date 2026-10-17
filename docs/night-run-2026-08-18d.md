# PawPi — Night Run 2026-08-18d — AI document ingestion ("digitize everything") — autonomous

**Designed in Cowork:** 2026-08-18. THE core "upload anything → PawPi reads it → it becomes the pet's
history" feature (phase 2 of Vet Record documents). Owner takes a photo or uploads a PDF → the file is
stored → an AI reads it → proposes structured records → owner reviews & confirms → records land in
Medical history (with attribution) → the file stays downloadable. This makes the pet's data owner-owned
in PawPi so vets/businesses/owners can all access it without depending on the personal vet to share.

**Decisions (Cowork):** AI = **Claude / Anthropic** (vision: reads images AND PDFs, structured JSON).
Write mode = **review-before-save** (propose → owner confirms; never auto-write medical data). Build the
whole pipeline **gated behind an env key** (`ANTHROPIC_API_KEY`; reuse `ENRICHMENT_LLM_KEY` only if that
is already an Anthropic vision key — confirm) so it 503s cleanly ("not set up yet") until the key is set.
**Go-live is Tats's step: set the key on Railway.**

**Standing rules:** no fake/invented data (extract ONLY what's clearly in the document — never guess a
date/dose); EN+ES; integer IDs; `owner_user_id = user_profiles.id`; owner-OR-Editor gating via
`resolvePetLogOwner`; never break prod (feature dormant without the key; malformed file FAILS SOFT — the
file is still stored, no 500); additive migrations only if truly needed (+ verify). Keep `docs/roadmap.md`,
`SCHEMA_NOTES.md`, this doc current. Migration high-water: **0121 → next 0122** (only if used).

Reuse the EXISTING confirm-first seam: `apps/web/src/app/api/utils/enrichment/` (config.js, document.js —
env-gated, transient input, propose-nothing-on-failure, applies via existing CRUD) and the VR-B record
routes (`vet-record/{allergies,conditions,surgeries,lab-results,notes,documents}`, `pet_vaccinations`,
`pet_medications`) with 0120 attribution.

Build in order.

---

## AI-1 — Backend: read a stored document into a proposed record set (Claude vision), gated, confirm-first

**Files:** new `apps/web/src/app/api/utils/enrichment/petRecords.js`; extend `enrichment/config.js`; new
route `apps/web/src/app/api/vet-record/documents/extract/route.js`.

**Do:**
1. `config.js`: add `anthropicConfig()` → `{ apiKey }` from `ANTHROPIC_API_KEY` (or the confirmed
   existing key), null when unset. Add an `isPetExtractionConfigured()` helper.
2. `petRecords.js`: `extractPetRecordsFromDocument({ url, filename, mimeType })`:
   - Fetch the stored file as transient bytes (reuse the `toBuffer` pattern). Support **images**
     (jpg/png/heic/webp) AND **PDF**. For images send an Anthropic image content block; for PDF send a
     document (PDF) content block. (Follow current Anthropic Messages API docs for image + PDF blocks +
     structured output via a tool / strict JSON; pick a current vision-capable Claude model.)
   - Prompt: "You are reading a pet's veterinary document. Extract ONLY records clearly present; never
     invent values (dates YYYY-MM-DD or null)." Return JSON:
     `{ docType, records: { vaccinations:[{name,date_given,expires_on,lot,clinic_name,notes}],
     medications:[{name,dose,frequency,start_date,end_date,prescribed_by,notes}],
     surgeries:[{procedure,surgery_date,surgeon,clinic,notes}],
     labResults:[{test_name,result,unit,reference_range,date,notes}],
     allergies:[{allergen,severity,reaction,diagnosed_date,notes}],
     conditions:[{condition,status,diagnosed_date,notes}],
     visitNotes:[{note_date,vet_name,note}] } }`.
     Map extracted fields to the EXACT columns the VR-B routes accept.
   - Gating: unset key → throw `EnrichmentNotConfiguredError` (503). Any parse/model error → FAIL SOFT:
     return an empty proposal `{ docType:'other', records:{} }`, never throw to the caller.
   - Bound cost/latency: cap PDF pages/file size; one model call; server-side timeout.
3. Route `POST /api/vet-record/documents/extract` — body `{ petId, url, filename, mimeType }` (or a stored
   `documentId` to look up the file). Gate with `resolveUserId` + `resolvePetLogOwner` (owner-OR-Editor;
   Viewer 403). Call the extractor. **Write NOTHING** — return `{ proposal, docType, applied:false }`.
   503 when dormant; fail-soft empty proposal on unreadable file.
4. Tests (mock the model — never hit the network in CI): a fixture "vaccination card" text → proposes a
   vaccination row mapped to the pet_vaccinations columns; a lab PDF → lab rows; unreadable → empty
   proposal (no 500); dormant (no key) → 503; access gate (Viewer 403). Do NOT require a real key in CI.

---

## AI-2 — Mobile: upload → "reading…" → review sheet → confirm → records land in history

**Files:** `apps/mobile/src/components/Health/VetRecord/AddDocumentModal.jsx` + a new review component;
reuse the VR-B add hooks/routes; EN+ES.

**Do:**
1. After a document is uploaded+stored (existing flow, keep it working), automatically call the extract
   route with the stored file. Show a "Reading your document…" state.
2. **Review sheet** — "PawPi read your document — here's what we found." Group the proposal by type
   (Vaccines / Medications / Surgeries / Labs / Allergies / Conditions / Visit notes). Each proposed
   record is **editable** (pre-filled) and can be added or skipped; a primary "Add all" applies the rest.
   Nothing is written until the owner confirms. Show a short line that AI read the file (transparency).
3. On confirm, create each accepted record through the EXISTING VR-B routes/hooks (so 0120 attribution
   applies — created_by = the owner; add a note/source marker like "Digitized from uploaded document").
   Refetch → the records appear in the Medical-history sub-tabs; the file stays in Documents (downloadable).
4. Graceful states (no dead ends): dormant/503 → "Saved to Documents. Automatic reading isn't switched on
   yet." Empty proposal → "We saved your file. We couldn't pull structured info from this one — you can add
   records manually." Extraction error → same, file still stored. EN+ES for everything.
5. Make the entry point obvious: a prominent "Scan or upload a document" affordance on Vet Record (photo
   or file), since easy bulk upload is the whole point.

**Tests:** review sheet renders a mocked proposal, edits + skip work, confirm calls the right add
hooks, dormant/empty/error states render (EN+ES). Verify on the iOS Simulator with a MOCKED proposal (UI
+ apply path). NOTE: a true end-to-end "photo → real records" test needs `ANTHROPIC_API_KEY` in the env —
if it's set in the dev/test env, do one real extraction on a sample doc; otherwise mark the real-model
path NEEDS ON-DEVICE CONFIRMATION (Tats verifies after setting the key on Railway).

---

## Go-live (Tats)
Set `ANTHROPIC_API_KEY` (Anthropic account; small per-document cost) on Railway. Until then the feature is
dormant (clean "not set up yet"), uploads still store + download, and manual record-add (VR-B) works.
Privacy: documents are read by the AI model — reflect that in the app privacy copy.

---

## DRIVER PROMPT (paste to Claude Code)

```
NIGHT RUN 2026-08-18d — PawPi AI document ingestion (autonomous, 2 PRs: AI-1 backend → AI-2 mobile).
UNATTENDED: build in order, each its own PR, CI-green → merge → deploy → log, without asking. Take the
recommended defaults; log deviations.

ORIENTATION: read ARCHITECTURE.md + SCHEMA_NOTES.md, then docs/night-run-2026-08-18d.md for the full
design + decisions. Reuse the existing confirm-first enrichment seam
(apps/web/src/app/api/utils/enrichment/) and the VR-B record routes with 0120 attribution. Standing
rules: no invented data (extract only what's in the doc); EN+ES; owner-OR-Editor via resolvePetLogOwner;
feature GATED behind ANTHROPIC_API_KEY (503 dormant when unset; malformed file fails soft — file still
stored, never 500); never break prod.

Decisions: AI = Claude/Anthropic (vision — reads images AND PDFs, structured JSON). Write mode =
REVIEW-BEFORE-SAVE (propose → owner confirms; never auto-write). Gate behind ANTHROPIC_API_KEY.

AI-1 (backend): add anthropicConfig() to enrichment/config.js; new enrichment/petRecords.js
extractPetRecordsFromDocument({url,filename,mimeType}) — fetch the stored file, send image OR PDF blocks
to the Anthropic Messages API (current vision Claude model), return structured JSON
{docType, records:{vaccinations,medications,surgeries,labResults,allergies,conditions,visitNotes}} mapped
to the exact VR-B route columns; unset key → 503; unreadable → empty proposal (no 500). New route POST
/api/vet-record/documents/extract (owner-OR-Editor gate) that returns the proposal and WRITES NOTHING.
Tests mock the model (no network in CI): vaccination card → vaccination proposal; unreadable → empty;
dormant → 503; Viewer → 403.

AI-2 (mobile): after a document uploads (existing flow intact), call extract, show "Reading your
document…", then a REVIEW SHEET grouping proposed records by type — each editable, add/skip, "Add all" —
writing nothing until confirmed; on confirm create each via the existing VR-B add routes/hooks
(attribution applies; mark source "Digitized from uploaded document"); refetch so they appear in Medical
history; the file stays in Documents (downloadable). Graceful dormant/empty/error states (EN+ES), a
prominent "Scan or upload a document" entry on Vet Record. Verify the UI + apply path on the Simulator
with a MOCKED proposal; if ANTHROPIC_API_KEY is in the dev env do one real sample extraction, else mark
the real-model path NEEDS ON-DEVICE CONFIRMATION.

Report per PR: what changed, tests, CI, Simulator verification, merge commit. Flag clearly that go-live
needs ANTHROPIC_API_KEY set on Railway.
```
