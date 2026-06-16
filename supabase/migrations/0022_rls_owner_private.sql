-- 0022_rls_owner_private.sql
-- RLS hardening R2c (docs/rls-hardening.md §R2c): the OWNER-ONLY PRIVATE table
-- group. These are a pet's private health/scheduling data — read AND written ONLY
-- by the pet's owner. This is the OPPOSITE of the social/public-read group (R2b):
-- there is NO any-authed read and NO provider access on ANY of these tables today.
--
-- The access predicate is UNIFORM across every table: a single FOR ALL policy with
--   USING / WITH CHECK  owner_user_id = current_app_user_id()
-- current_app_user_id() returns the caller's user_profiles.id (NULL when unset →
-- the int comparison is NULL/false → deny by default; no identity reads/writes zero).
-- This mirrors the routes exactly: every read/write of these tables is scoped
-- `WHERE owner_user_id = me`; no route exposes them to a provider or another user.
--
-- ⚠️ PROVIDER EXCLUSION IS DELIBERATE. The provider record route reads ONLY
-- pet_medical_profiles / vet_notes / pet_vaccinations (R2d) — NONE of the tables
-- below. So a provider, EVEN WITH an active care grant, gets ZERO rows from these
-- (the integration test proves this). The grant/booking helpers (0019) are NOT used
-- here; they gate the R2d medical-record tables, where read-vs-write scope matters.
--
-- FUTURE-PROVIDER NOTE (do NOT build here): the care-access scope set includes
-- health_logs_read / health_logs_write, intended for a FUTURE provider type (e.g. a
-- walker writing walk logs, a groomer writing coat notes). No route grants providers
-- access to the health_* tables today, so they are owner-only NOW. When such a route
-- ships, THAT feature's ticket updates the relevant policy (OR an
-- app_provider_has_grant(pet_id, 'health_logs_read'/'…write') branch). See
-- docs/rls-hardening.md §R2c.
--
-- ⚠️ HARNESS-ONLY THIS TICKET — proven as `pawpi_app` in the integration harness,
-- NOT applied to Supabase. R3 applies the whole accumulated R2 set at the
-- DATABASE_URL cutover to pawpi_app. Enabling FORCE RLS in prod now (privileged
-- owner connection, only pilot routes set identity) would make non-identity routes
-- read zero rows — an outage. See docs/rls-hardening.md.
--
-- DML + sequence grants for these tables are ALREADY provided by 0019's blanket
-- `GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES` + `GRANT USAGE ON ALL SEQUENCES`
-- (these tables predate 0019), exactly as pets (0020) / social (0021) relied on. No
-- per-table re-grant here; the as-pawpi_app integration test is the proof.

-- The policy is identical for every table, so apply it in a loop over the table
-- list (greppable + impossible to drift one table's predicate from another's). Each
-- statement is idempotent: ENABLE/FORCE are no-ops if already set, and the policy is
-- DROPped-if-exists before CREATE so the whole migration is safe to re-run.
do $$
declare
  t text;
  owner_private_tables text[] := array[
    -- Health logs (0008) — the 12 health_* tracking tables.
    'health_food_logs',
    'health_general_checks',
    'health_medical_care_logs',
    'health_mobility_logs',
    'health_pee_logs',
    'health_photo_checks',
    'health_poo_logs',
    'health_vomit_logs',
    'health_walk_logs',
    'health_weight_logs',
    'health_wellness_logs',
    'health_timeline_events',
    -- Vet-record extras (0005) — NOT the provider-readable medical records (R2d).
    'pet_allergies',
    'pet_conditions',
    'pet_lab_results',
    'pet_surgeries',
    'vet_documents',
    -- Scheduling (0006 / 0011).
    'routines',
    'reminder_dismissals'
  ];
begin
  foreach t in array owner_private_tables loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
    execute format('drop policy if exists %I on %I', t || '_owner_all', t);
    execute format(
      'create policy %I on %I for all '
      || 'using (owner_user_id = current_app_user_id()) '
      || 'with check (owner_user_id = current_app_user_id())',
      t || '_owner_all', t
    );
  end loop;
end
$$;
