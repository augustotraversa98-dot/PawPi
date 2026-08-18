-- 0118_general_check_areas_jsonb.sql
-- QC-B (docs/night-run-2026-08-18b.md) — Quick Check per-area detail.
--
-- The Quick Check form (GeneralCheckModal) collects, PER body area, a status +
-- "what changed" selections + a note + photos. `health_general_checks` (0008) only
-- had flat *_status columns + `mood` + `energy` + one `notes` field, so the per-area
-- `changes[]` selections and per-area photos were dropped entirely and per-area notes
-- were flattened into a single concatenated string. This adds ONE additive jsonb
-- column that stores the FULL per-area object, keyed by area:
--   { eyes: { status, changes: [...], notes, photos: [url...] }, ears: {...}, ... }
-- The flat *_status columns are still written alongside (the route writes both), so
-- every current GET consumer keeps working unchanged.
--
-- ADDITIVE + idempotent. The table's existing owner-private RLS (0022) is UNTOUCHED —
-- this column rides it. The route degrades cleanly while this is unapplied (a 42703
-- undefined_column on the areas insert is isolated in a SAVEPOINT and retried without
-- the column), so a pre-migration deploy behaves exactly as before.
-- Verify: supabase/verify_0118.sql. HARNESS-ONLY this ticket — hand-applied after merge.

alter table health_general_checks
  add column if not exists areas jsonb;
