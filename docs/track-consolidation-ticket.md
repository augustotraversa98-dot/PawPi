# PawPi — Health → Track consolidation (pet-owner UX polish) — design ticket

**Designed in Cowork:** 2026-08-18 · Parallel pet-owner UX polish pass (pre–App-Store). This is the
DESIGN of record (Rule 5/6); live build status stays in `docs/roadmap.md`. Mobile-only; **no migration**
expected (reuses existing endpoints). Standing rules: no fake data (empty states, never mock); **EN+ES on
every surface**; `pet_id` + `owner_user_id` scoping; persist real writes (refetch after save); never break
prod (degrade cleanly); one PR per change, CI-green → merge → deploy → log.

Relates to: **Care Ring integrity** (`docs/track-ring-integrity-ticket`-equivalent / item 3 of this pass)
— the ring must stay honest; this redesign must preserve the invariant that only REAL logs fill a segment.

## Problem

`components/Health/HealthTrack.jsx` hardcodes **14 tracker tiles** (and the whole screen's copy is
English-only — an EN+ES violation). It is overwhelming and redundant:

- **Duplicates:** "Food & Treats" and "Water Intake" open the *same* `FoodWaterTrackerModal` (just a
  different initial tab).
- **Overlap:** "Pee & Urination", "Poo & Digestion", "Vomit / Digestive Events" are all one theme
  (bathroom / digestion). "Symptoms & Behavior" (Soon) overlaps "General Check" (eyes/ears/skin/mood/
  energy already covers it).
- **4 dead "Soon" tiles:** "Symptoms & Behavior", "Vital Signs", "Vet Visits", "Vaccinations" — tapping
  each only shows an Alert. Two of them duplicate features that already exist elsewhere: **Vaccinations**
  lives in the built **Medications & Care** modal (`MedicationModal`, `vaccines` tab), and **Vet Visits**
  can be recorded via the built Vet Record surfaces (`AddVetNoteModal` → `POST /api/vet-record/notes`,
  `AddDocumentModal` → `POST /api/vet-record/documents`).
- **Inconsistent persistence:** some tracker modals POST to the API (Pee, Vomit, Weight) while others
  appear to write only to a local store (Food & Water, Poo, Walk/Activity, General Check, Medication).
  A quick log that doesn't persist can't fill the Care Ring or Today's Progress and violates the
  no-fake-data / must-persist rule — so consolidation must also close these gaps.

## Chosen direction — **Everyday vs. Health Records** (two sections)

Maps to how owners think and to the screen's stated purpose ("track changes over time to share with your
vet"). ~14 tiles → ~9, with only **one** honest "Soon" remaining.

### Section A — Everyday (quick daily logs; these fill the Care Ring / Today's Progress)

| New tile | Merges / from | Opens | Notes |
|---|---|---|---|
| **Food & Water** | Food & Treats + Water Intake | `FoodWaterTrackerModal` (accepts `initialType`) | One tile; food/water toggle inside. |
| **Bathroom & Digestion** | Pee + Poo + Vomit | one modal with pee / poo / digestive-event tabs (or a chooser) | Fold the three existing modals behind one entry. |
| **Walk & Activity** | Exercise & Walks | `WalkActivityModal` | Fills Walk segment. |
| **Weight** | Weight | `WeightModal` | Unchanged. |
| **Quick Check** | General Check **+ Symptoms & Behavior** | `GeneralCheckModal` | Symptoms/behavior folded in (the modal already checks mood/energy/skin/etc.); the standalone "Symptoms" Soon tile is removed. |

### Section B — Health Records (care / medical; for the vet)

| New tile | From | Opens | Ship now? |
|---|---|---|---|
| **Medications & Care** | built | `MedicationModal` (`initialTab="medications"`) | ✅ already real |
| **Vaccines** | was "Vaccinations (Soon)" | `MedicationModal` (`initialTab="vaccines"`) | ✅ **make real by wiring** to the existing built tab |
| **Vet Visits** | was "Vet Visits (Soon)" | a real "log a vet visit" flow persisted via the Vet Record notes/documents endpoints (date, clinic, reason, notes, optional attachment) | ✅ **make real** by reusing `AddVetNoteModal` / `AddDocumentModal` (already POST to `/api/vet-record/*`) |
| **Photo Check** | built | `PhotoCheckModal` | ✅ already real |

### Stays "Soon" (genuinely not built — keep it honest)

- **Vital Signs** (temperature / heart rate / breathing) — needs a real capture flow. Keep the single
  "Soon" badge here, or fold as optional numeric fields into Quick Check later. Do **not** wire it to any
  write until built.

## Ship-now vs. later

**Ship now (this pass):**
- The merges above (Food & Water; Bathroom & Digestion; Symptoms folded into Quick Check).
- Localize the **entire** Track screen EN+ES (labels, descriptions, section headers, the info box, the
  "Soon" copy) — replace the current hardcoded English.
- Make **Vaccines** and **Vet Visits** real by wiring to the already-built surfaces (no net-new backend).
- Persistence audit: ensure every Everyday quick-log actually POSTs to its API and thereby fills the Care
  Ring / Today's Progress; fix any local-only modals (Food & Water, Poo, Walk, General Check) so a saved
  log is real and survives reopen. (No fake data; refetch after save.)

**Later / out of scope here:**
- Vital Signs capture (stays Soon).
- Any new medical schema (none required — reuse `/api/vet-record/notes`, `/api/vet-record/documents`,
  the medication store, and the existing health-log endpoints).

## Invariant to preserve (ties to Care Ring integrity)

A "Soon" / not-yet-built control is **presentational only**: badge + honest empty/coming-soon Alert. It
must never open a real logging modal, write a log, or invalidate `["care-ring"]`. Only real actions fill
the ring. The redesign must keep this true (add/keep a guard + test).

## Open decisions (defaults taken if unanswered)

1. **Bathroom & Digestion** UI: single modal with pee/poo/vomit tabs (default) vs. a small chooser sheet.
2. **Vet Visits** scope: reuse `AddVetNoteModal` with a "visit" category (default, cheapest, real) vs. a
   dedicated visit form. Default keeps it shippable now.
3. **Photo Check** placement: under Records (default) vs. Everyday.

## Revision — 2026-08-18 (after on-device test of PR #433)

Tats tested the draft on iOS and flagged four things; the Health Records section is revised accordingly.
This supersedes the "Health Records" table above.

1. **Vaccines was redundant with Medications & Care.** Both tiles open the *same* `MedicationModal`
   (just a different tab). **Remove the standalone Vaccines tile** and fold it in — Medications & Care
   already has meds / vaccines / preventives tabs. Its description must mention vaccines & preventives
   so owners still find them.
2. **Vet Visits does not belong on Track.** A vet visit is part of the pet's medical *history* and is
   authored on the **vet/business side**, surfaced read-only in the owner's Vet Record — it is not an
   owner quick-log. **Remove the Vet Visits tile** (and its `AddVetNoteModal` wiring) from Track.
3. **Vital Signs — hide entirely**, not just "Soon". Remove the tile. Also: the owner reported tapping
   it filled a Care Ring segment. The current branch's structural guard returns after the Alert and
   writes nothing, so this is either a stale build or mis-attribution — but removing the tile plus a
   reproduce-and-confirm pass closes it for good. The Care Ring integrity invariant stands.
4. **Quick Check flow is confusing.** The General Check modal requires selecting a per-area status
   ("Looks usual" / "Something changed") before **Next** enables, but the choice isn't discoverable, so
   it reads as "nothing to click / dead Next." Make the status selection obvious and the disabled Next
   understandable. The modal is also hardcoded English — localize EN+ES while here.

### Revised structure (final)

- **Everyday:** Food & Water · Bathroom & Digestion · Walk & Activity · Weight · Quick Check.
- **Health records:** Medications & Care (incl. vaccines & preventives) · Photo Check.
- **Removed:** Vaccines (folded in), Vet Visits (vet-authored in Vet Record), Vital Signs (hidden).
- **"Soon" tiles remaining:** none.

Remove the now-unused i18n keys (`vaccinesLabel/Desc`, `vetVisitsLabel/Desc`, `vitalSignsLabel/Desc`)
in both en.json and es.json, and any now-dead imports/state in HealthTrack.jsx.

### Revision status — ✅ BUILT 2026-08-18 (PR #433, mobile-only, no migration)

All four device-feedback items shipped on `feat/track-consolidation-everyday-vs-records`:

1. ✅ **Vaccines tile removed** — folded into Medications & Care; `medicationsDesc` (EN+ES) now names
   vaccines & preventives. Dead `Syringe` import + `vaccines` case removed from `HealthTrack.jsx`.
2. ✅ **Vet Visits tile removed** — `vetVisits` tracker, its case, `AddVetNoteModal` import/instance, and
   `vetVisitModalVisible` state all deleted. No owner write added elsewhere (vet-authored history lives in Vet Record).
3. ✅ **Vital Signs removed entirely** (not "Soon") — `vitalSigns` tracker + `Heart` import gone. Zero
   coming-soon tiles remain; the structural guard + `comingSoonTrackersHaveNoAction` invariant hold
   vacuously. The reported ring-fill could NOT be reproduced on this branch (guard returns before dispatch)
   → pre-guard build / mis-attribution; tile removal closes it. Care Ring integrity test kept (rewritten).
4. ✅ **Quick Check** (`GeneralCheckModal`) — status choice made the obvious first action (prominent prompt
   + coral "Choose an option to continue" hint while Next is disabled, hidden on select); modal fully
   localized EN+ES under `health.generalCheck.*` (was hardcoded English).

Also: removed `vaccines/vetVisits/vitalSigns` `Label/Desc` keys from en.json + es.json (parity 1063=1063).
Tests: `HealthTrack.test.jsx` rewritten to the 7-tile set; new `GeneralCheckModal.test.jsx`. Mobile jest
1920 (default) + 4 (tz-negative) green.

**Final tile count:** Everyday 5 · Health records 2 = **7 tiles, 0 "Soon".**

## Build prompt

The paste-ready grey-box Claude Code build prompt for this ticket is delivered alongside this doc in the
Cowork session (kept out of the design doc so the design stays the source of truth per Rule 5/6).
