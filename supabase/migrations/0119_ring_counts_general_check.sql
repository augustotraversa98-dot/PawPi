-- 0119_ring_counts_general_check.sql
-- QC-C (docs/night-run-2026-08-18b.md) — a completed Quick Check fills the Care Ring.
--
-- The Care Ring's `care_done` segment (unit E1) was derived from food / medical-care /
-- wellness / photo-check logs only — a completed Quick Check (health_general_checks),
-- which IS a real care action, never filled the Care segment. This extends the shared
-- ring-derivation function app_pet_ring_segments (0102) so `care_done` is ALSO true when
-- a general check with >=1 recorded observation exists for the pet on the owner-tz day.
--
-- GUARD: only a general check that recorded at least one observation counts — any
-- non-null status column OR non-empty notes. An all-empty "completion" (every area left
-- unassessed, no notes) must NOT fill the ring. Photos-only rows are intentionally not
-- counted here (the spec's observation = status OR notes).
--
-- Counts by pet_id ONLY (like every other branch here), so the SHARED ring fills whether
-- the owner or any caregiver logged the check. CREATE OR REPLACE keeps the exact 0102
-- signature/return type. The inline owner-scoped fallback in the care-ring route
-- (deriveSegmentsOwnerScoped) is updated to match. ADDITIVE + idempotent. Verify:
-- supabase/verify_0119.sql. HARNESS-ONLY this ticket — hand-applied after merge.

create or replace function app_pet_ring_segments(p_pet integer, p_tz text, p_day date)
returns table (walk_done boolean, moment_done boolean, care_done boolean)
language sql
security definer
set search_path = public, pg_temp
as $$
  select
    exists (
      select 1 from health_walk_logs w
      where w.pet_id = p_pet and (w.start_time at time zone p_tz)::date = p_day
    ) as walk_done,
    exists (
      select 1 from posts po
      where po.pet_id = p_pet and po.is_daily_update = true and po.post_date = p_day
    ) as moment_done,
    (
      exists (select 1 from health_food_logs f
        where f.pet_id = p_pet and (f.logged_at at time zone p_tz)::date = p_day)
      or exists (select 1 from health_medical_care_logs m
        where m.pet_id = p_pet and (m.given_at at time zone p_tz)::date = p_day)
      or exists (select 1 from health_wellness_logs wl
        where wl.pet_id = p_pet and (wl.logged_at at time zone p_tz)::date = p_day)
      or exists (select 1 from health_photo_checks pc
        where pc.pet_id = p_pet and (pc.created_at at time zone p_tz)::date = p_day)
      or exists (select 1 from health_general_checks gc
        where gc.pet_id = p_pet and (gc.logged_at at time zone p_tz)::date = p_day
          and (
            gc.eyes_status is not null or gc.ears_status is not null
            or gc.teeth_status is not null or gc.skin_fur_status is not null
            or gc.paws_status is not null or gc.face_status is not null
            or gc.mood is not null or gc.energy is not null
            or (gc.notes is not null and gc.notes <> '')
          ))
    ) as care_done;
$$;

grant execute on function app_pet_ring_segments(integer, text, date) to pawpi_app;
