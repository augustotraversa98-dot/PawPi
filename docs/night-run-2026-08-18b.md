# PawPi — Night Run 2026-08-18b (Quick Check completeness) — autonomous, 3 PRs

**Designed in Cowork:** 2026-08-18, from on-device testing of the NR1 Quick Check rework. Three tickets,
each its own PR, built IN ORDER, CI-green → merge → deploy → log, **without asking** — take the
recommended defaults; log any deviation.

**Standing rules (every ticket):** no fake/seed data (empty states); **EN+ES on every surface**; integer
IDs; `owner_user_id = user_profiles.id` via the identity chain; additive numbered migrations each with
`verify_XXXX.sql`; tables ENABLE+FORCE RLS + app runs as `pawpi_app`; scope reads/writes by `pet_id` +
`owner_user_id`; never break prod (degrade cleanly). Keep `docs/roadmap.md`, `supabase/SCHEMA_NOTES.md`
and this file current. **Migration high-water: 0117 applied — next free is 0118, then 0119.**

> **VERIFY ON THE iOS SIMULATOR, not just jest.** These bugs (dead photo buttons; progress bar tied to
> position) all passed jest but failed on device. For every ticket, launch the Simulator, RENDER Quick
> Check, and TAP through the flow (screenshot it). Jest-green is necessary, not sufficient. If the
> Simulator is unavailable, say so and mark NEEDS ON-DEVICE CONFIRMATION.

All files in `anything/apps/mobile` unless noted. Build in order.

---

## QC-A — Progress reflects POSITION, not completion (wrong %)

**File:** `src/components/Health/GeneralCheck/GeneralCheckModal.jsx`.

**Root cause (verified):** `const progress = ((currentAreaIndex + 1) / CHECK_AREAS.length) * 100;` and the
"X of 8" label uses `currentAreaIndex + 1`. Because the NR1 stepper lets you jump to any area, tapping
"Teeth" shows "3 of 8 / 38%" and tapping the last area ("Energy") shows "100% complete" — even though you
assessed nothing. Progress is driven by which area you're *viewing*, not what you've *done*.

**Fix:** compute progress from **areas actually assessed** — the count of areas with a non-null `status`
(the owner made a choice), out of 8 — not `currentAreaIndex`. The stepper position stays as-is for
navigation, but the progress bar + "% complete" must reflect assessed areas. Keep the "X of 8" area
counter if useful, but relabel so it doesn't read as completion (e.g. show "3 assessed" / the bar = 
assessed÷8). EN+ES. **Default:** `assessed = Object.values(checkData).filter(a => a.status).length`;
bar width + percent = `assessed / 8`. Update the test to assert progress tracks assessed count, not the
current index. Verify on the Simulator: jumping between areas does NOT change the % until you pick a
status.

---

## QC-B — "Add photo" is dead + per-area detail (photos, changes) isn't persisted

**Files:** `src/components/Health/GeneralCheck/GeneralCheckModal.jsx`, `src/hooks/useHealthTracking.js`
(`useLogGeneralCheck`), `apps/web/src/app/api/health/general-checks/route.js`, migration **0118**.

**Root cause (verified against prod, pet 18):**
- The "Take photo" / "Choose photo" `TouchableOpacity`s have **no `onPress`** — dead buttons.
- Per-area **status** DOES persist (the row saved ears=usual, skin_fur=changed, energy=usual across 3
  areas — multi-area status works). But the table `health_general_checks` only has flat status columns +
  mood + energy + ONE `notes` field. So the **per-area "what changed" selections** (the `changes[]`
  checkboxes) and **per-area photos** are **dropped entirely**, and per-area notes get flattened into one
  concatenated string. The owner sees "only 1 saved" because the richer detail vanishes.

**Fix — capture everything the form collects:**
1. **Wire the photo buttons.** Use the app's existing pattern: `expo-image-picker` (camera for "Take
   photo", library for "Choose photo" — see `AddDogModal.jsx` / `VetRecord/AddDocumentModal.jsx`) →
   upload each image via `useUpload` (`@/utils/useUpload`, POSTs to `/api/upload`, returns a hosted URL —
   same as `PhotoCheck/PhotoCheckCaptureModal.jsx`). Store the returned URL(s) on the current area's
   `photos[]`. Show a thumbnail + remove control. Handle permission denial gracefully (EN+ES).
2. **Persist full per-area detail.** Migration **0118**: add `areas jsonb` to `health_general_checks`
   (additive; table already has RLS). Store, per assessed area,
   `{ status, changes: [...], notes, photos: [url...] }`. Keep the existing flat status columns populated
   too (write both) so current GET/consumers keep working. Update the route POST to accept + store the
   `areas` jsonb, `useLogGeneralCheck` to send the FULL per-area object (status + changes + notes +
   photo URLs, not just status), and the GET to return `areas`. `verify_0118.sql` confirms the column
   exists and is jsonb.
3. Multi-area logging must round-trip: assessing 3 areas with notes/changes/photos saves all 3 in
   `areas`. Verify on the Simulator: add a photo + a change + a note to 2–3 areas → complete → the row's
   `areas` jsonb has them all (check via a GET or the DB).

**Default:** one `areas jsonb` column (not a child table) — simplest, captures everything, additive.

---

## QC-C — Completing a Quick Check does NOT fill the Care Ring "care" segment

**Files:** `apps/web/src/app/api/pets/[id]/care-ring/route.js` (inline owner-scoped `deriveSegmentsOwnerScoped`
`care_done` clause), the shared SQL function `app_pet_ring_segments` (defined in
`supabase/migrations/0102_engagement_shared_ring.sql`), new migration **0119**.

**Root cause (verified):** the ring's `care_done` is derived from food / medical-care / wellness /
photo-check logs only — **`health_general_checks` is not counted**. So a completed Quick Check (a real
care action) never fills the Care segment. In prod the derivation uses the shared function
`app_pet_ring_segments` (0102); the route's inline block is only a pre-0102 fallback.

**Fix:** count a same-day general check as a **care** contributor, in BOTH places (they must agree):
1. Migration **0119**: `CREATE OR REPLACE FUNCTION app_pet_ring_segments(...)` (read 0102 for the exact
   signature/body) so `care_done` also returns true when a `health_general_checks` row exists for the
   pet on the owner-tz day. `verify_0119.sql`.
2. Update the inline `deriveSegmentsOwnerScoped` `care_done` clause in `care-ring/route.js` to add the
   same `EXISTS (SELECT 1 FROM health_general_checks ...)` branch (owner+pet+day).
**Guard:** only count a general check that recorded at least one observation (any non-null status OR
notes) — an all-empty completion shouldn't fill the ring. Add an integration test: a general check today
→ ring `care_done` true. Confirm 0119 applies on the real-Postgres integration DB.

> After merge, apply 0118 + 0119 to Supabase and run their verify scripts (the "deploy" step for a
> migration), same as 0117.

---

## DRIVER PROMPT (paste to Claude Code)

```
NIGHT RUN 2026-08-18b — PawPi Quick Check completeness (autonomous, 3 PRs). UNATTENDED: build QC-A →
QC-B → QC-C IN ORDER, each its own PR, CI-green → merge → deploy (apply + verify any migration on
Supabase) → log, without asking. Take the recommended defaults; log deviations.

ORIENTATION: read ARCHITECTURE.md + supabase/SCHEMA_NOTES.md, then docs/night-run-2026-08-18b.md for the
three ticket briefs + verified root causes. Standing rules: no fake data; EN+ES; integer IDs;
owner_user_id = user_profiles.id; additive numbered migrations + verify (next free 0118, then 0119);
tables ENABLE+FORCE RLS, app pawpi_app; scope by pet_id + owner_user_id; never break prod. Keep
roadmap + SCHEMA_NOTES + the night-run doc current.

CRITICAL: these bugs passed jest but failed on device (dead photo buttons; progress bar tied to
position). VERIFY each ticket on the iOS Simulator — render Quick Check and tap through — before
claiming it fixed; screenshot it. If the Simulator is unavailable, mark NEEDS ON-DEVICE CONFIRMATION.

QC-A — Quick Check progress bar / "% complete" is driven by currentAreaIndex (position), so jumping to
Teeth shows 38% and Energy shows 100% with nothing assessed. Make progress = count of areas with a
non-null status ÷ 8; relabel so the counter doesn't read as completion. Mobile-only, no migration.

QC-B — "Take photo"/"Choose photo" have no onPress (dead), and the table can't hold per-area photos or
the "what changed" selections (only flat status + one notes field), so multi-section detail is lost.
Wire the photo buttons via expo-image-picker + useUpload (see AddDogModal / PhotoCheckCaptureModal);
add migration 0118 (areas jsonb on health_general_checks) storing per-area {status,changes,notes,photos};
update the route POST/GET + useLogGeneralCheck to write/read the full per-area object (keep flat status
columns too). Verify multi-area round-trip on the Simulator.

QC-C — Completing a Quick Check doesn't fill the Care Ring "care" segment (health_general_checks isn't
counted). Add a same-day general check (with ≥1 observation) as a care contributor in BOTH the shared
SQL function app_pet_ring_segments (migration 0119, extend the 0102 definition) AND the inline
deriveSegmentsOwnerScoped fallback in care-ring/route.js. Integration test + apply/verify 0119 on
Supabase.

Report per PR: what changed, Simulator verification result, CI status, migration apply+verify output,
merge commit.
```

---

## COMPLETION LOG — 2026-08-18 (autonomous run)

All three tickets built in order, each its own PR, CI-green → squash-merged → migration
applied + verified on Supabase → verified on the iOS Simulator (iPhone 17 Pro, Expo Go, prod backend).

### QC-A — progress = areas assessed, not stepper position
- **PR:** #443 · **merge:** 17e7fcf8 · mobile-only, no migration.
- Progress now = `Object.values(checkData).filter(a=>a?.status).length / 8`; right counter relabeled
  (`percentComplete` → new `assessedCount` "N of 8 checked"); left "X of 8" stays as navigation position. EN+ES.
- **CI:** mobile jest + web vitest + web integration all green.
- **Simulator:** jumping to Teeth stayed "0 of 8 checked" / empty bar (old bug showed 38%); assessing an
  area ticked it to "1 of 8 checked". ✅

### QC-B — photos wired + full per-area persistence
- **PR:** #444 · **merge:** 21f78ccc · **migration 0118** (`areas jsonb`).
- Take/Choose photo wired (expo-image-picker → useUpload → area `photos[]`, thumbnails + remove, graceful
  permission/upload degrade); `areas jsonb` stores `{status,changes[],notes,photos[]}` per area, flat status
  columns still written; route degrades pre-0118 via SAVEPOINT + 42703 fallback.
- **CI:** all green. **0118 applied + verify_0118 all PASS on Supabase.**
- **Simulator:** "Choose photo" (was dead) → permission prompt → picker → upload → thumbnail → remove worked.
  Areas round-trip confirmed on **prod** (general check id 7: `ears {status:changed, changes:[redness]}`,
  `eyes {status:usual}`). ✅

### QC-C — a completed Quick Check fills the Care Ring
- **PR:** #445 · **merge:** 4fdd7a82 · **migration 0119** (extends `app_pet_ring_segments`).
- `care_done` now also true for a same-day general check with ≥1 observation (status OR non-empty notes;
  all-empty does NOT fill; photos-only excluded). Inline `deriveSegmentsOwnerScoped` kept in sync;
  `useLogGeneralCheck` invalidates `["care-ring", petId]` for a live fill.
- **CI:** all green. **0119 applied + verify_0119 all PASS on Supabase** (empty→false, status→true, notes→true).
- **Simulator:** completing a Quick Check filled the Care Ring's ✓ Care segment (1/3), live. ✅

**Migration high-water: 0119 applied. Next free is 0120.**
