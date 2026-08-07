-- 0076_provider_slot_config.sql
-- Appointment slots PR-1 of 3 (foundation): make the existing (orphaned) slot engine
-- CORRECT and SEEDED so the mobile picker (PR-2) has real data. Additive, idempotent,
-- re-runnable. Does NOT touch the booking write path — no enforcement lands here.
--
-- Three additive changes:
--   1. providers.time_zone — the provider's IANA zone, so an availability window's
--      "09:00" means 09:00 LOCAL (the slot engine now composes wall-clock times in this
--      zone instead of UTC). Defaults to Buenos Aires (the launch market). NOT NULL so the
--      slot engine always has a zone; existing rows backfill to the default.
--   2. provider_availability.location_id — an optional per-branch scope for a window
--      (NULL = all locations, the current behaviour). Additive only; the availability/book
--      routes do not filter on it yet (a later PR wires per-location slots).
--   3. SEED default Mon–Fri 09:00–18:00 @ 30-min windows for PUBLISHED, appointment-capable
--      providers that have NO windows yet — so PR-2 shows real slots before the Phase-2
--      extranet editor exists. Fixed-slot capabilities only (vet/groomer/trainer/telehealth);
--      daycare/sitting/walking are NOT seeded (they are not fixed-slot bookings).
--
-- ⚠️ HARNESS-ONLY THIS PR — the integration harness applies this to a throwaway Postgres.
-- It is NOT auto-applied to Supabase; hand-apply after merge (see the PR body's
-- "MIGRATION TO APPLY IN SUPABASE" block). Plain idempotent DDL (no functions /
-- dollar-quoting) so the harness runs the whole file in one simple-query call.

-- ════════════════════════════════════════════════════════════════════════════════
-- 1. providers.time_zone — IANA zone for local slot composition.
-- ════════════════════════════════════════════════════════════════════════════════
alter table providers
  add column if not exists time_zone text not null default 'America/Argentina/Buenos_Aires';

-- ════════════════════════════════════════════════════════════════════════════════
-- 2. provider_availability.location_id — optional per-branch window scope.
-- ════════════════════════════════════════════════════════════════════════════════
alter table provider_availability
  add column if not exists location_id integer references provider_locations(id) on delete cascade;

create index if not exists idx_provider_availability_provider_location
  on provider_availability (provider_id, location_id);

-- ════════════════════════════════════════════════════════════════════════════════
-- 3. SEED — default weekly windows for appointment-capable published providers.
-- ════════════════════════════════════════════════════════════════════════════════
-- One row per (provider, weekday) for Mon–Fri (weekday 0..4, the 0030 convention where
-- 0=Mon), 09:00–18:00 in 30-min slots, provider-wide (staff_user_id NULL) and
-- all-capability (capability NULL, which the availability read matches for any capability).
--
-- Idempotent: only providers with ZERO existing windows are seeded (the NOT EXISTS
-- guard), so a re-run inserts nothing. Appointment-capable = holds a fixed-slot capability
-- either as a provider_capabilities row (vet/groomer/trainer — telehealth is not a valid
-- value there) OR as its primary provider_type (which is how a telehealth provider is
-- represented). Multi-capability providers (e.g. a vet that also boards) still qualify via
-- their appointment capability; daycare/sitter/walker-only providers do not.
insert into provider_availability
  (provider_id, staff_user_id, capability, weekday, start_time, end_time, slot_minutes, active)
select p.id, null, null, wd.weekday, time '09:00', time '18:00', 30, true
from providers p
cross join (values (0), (1), (2), (3), (4)) as wd(weekday)
where p.status = 'published'
  and (
    exists (
      select 1 from provider_capabilities pc
      where pc.provider_id = p.id
        and pc.capability = any (array['vet', 'groomer', 'trainer']::text[])
    )
    or p.provider_type = any (array['vet', 'groomer', 'trainer', 'telehealth']::text[])
  )
  and not exists (
    select 1 from provider_availability pa where pa.provider_id = p.id
  );
