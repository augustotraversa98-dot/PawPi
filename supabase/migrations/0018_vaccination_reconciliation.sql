-- 0018_vaccination_reconciliation.sql
-- Make pet_vaccinations the single source of truth for vaccination HISTORY without
-- touching the reminder engine. See docs/provider-design.md §2 "Vet-type reuse" and
-- the WATCH-ITEM in PawPi_instructions.md (reconcile pet_vaccinations with the OLD
-- medical-care "Vaccine" logs).
--
-- BEFORE: two stores ran in parallel with no bridge —
--   OLD: health_medical_care_logs (care_type='vaccine'), written ONLY by owners
--        completing a Vaccine routine reminder. ALSO the reminder-RESOLUTION record
--        (reminderResolution.js exact-day match) — load-bearing, UNCHANGED here.
--   NEW: pet_vaccinations, written ONLY by providers (vaccinations_write).
-- AFTER: owner vaccine completions WRITE THROUGH into pet_vaccinations too (see the
--        medical-care-logs POST), and existing owner-logged vaccines are backfilled
--        here. The vet-record summary count switches to pet_vaccinations.
--
-- This migration is ADDITIVE + idempotent / safely re-runnable. Hand-apply to
-- Supabase AFTER merge (do NOT auto-apply). Matches supabase_schema.sql (addendum).
-- Identity convention: every user reference is user_profiles(id), NEVER auth_users.

-- 1. Provenance columns. source distinguishes owner write-through / backfill from
--    provider writes; source_medical_care_log_id links a pet_vaccinations row back
--    to the medical-care log that produced it so write-through and backfill never
--    duplicate and can re-run safely. ON DELETE SET NULL: a deleted log must not
--    delete the vaccination history it produced, only unlink it.
alter table pet_vaccinations
  add column if not exists source                      text,
  add column if not exists source_medical_care_log_id  integer
    references health_medical_care_logs(id) on delete set null;

-- A given medical-care log maps to AT MOST one vaccination row (idempotency anchor
-- for both the write-through ON CONFLICT and the backfill NOT EXISTS). Partial so
-- provider rows (source_medical_care_log_id IS NULL) are unconstrained.
create unique index if not exists ux_pet_vaccinations_source_log
  on pet_vaccinations (source_medical_care_log_id)
  where source_medical_care_log_id is not null;

-- 2. Backfill source for existing rows: provider rows carry administered_by_provider_id;
--    everything else is owner-originated. Free-text now (matching the T3/T6 source
--    convention); a CHECK can come in a later hardening migration.
update pet_vaccinations
set source = case
      when administered_by_provider_id is not null then 'provider'
      else 'owner'
    end
where source is null;

-- 3. Backfill pet_vaccinations from existing owner-logged vaccines. One row per
--    ADMINISTERED vaccine log (status in ('given','completed') — the administered
--    set read from mobile reminderLogFlow.js: the vaccine routine flow emits
--    'completed'; 'given' is the generic medical-care administered status. A
--    skipped / 'issue_reported' log is NOT administered → no vaccination row).
--    Field mapping mirrors the write-through: name (coalesced — pet_vaccinations.name
--    is NOT NULL), given_at::date→date_given, source='owner', link=log.id;
--    expires_on/lot/administered_by_provider_id left null (routine completions don't
--    capture them). NOT EXISTS + the unique index make this safely re-runnable.
insert into pet_vaccinations (
  pet_id, owner_user_id, name, date_given, source, source_medical_care_log_id, created_at, updated_at
)
select
  l.pet_id,
  l.owner_user_id,
  coalesce(l.name, 'Vaccine'),
  l.given_at::date,
  'owner',
  l.id,
  now(),
  now()
from health_medical_care_logs l
where l.care_type = 'vaccine'
  and l.status in ('given', 'completed')
  and not exists (
    select 1 from pet_vaccinations v
    where v.source_medical_care_log_id = l.id
  );
