-- 0102_engagement_shared_ring.sql
-- Pet Owner engagement WAVE 2 — unit E13 PR1 (Shared custody: the SHARED ring/streak,
-- docs/pet-owner-engagement.md).
--
-- E13's caregiver MODEL already exists — ticket 2.47 / migration 0049 shipped `pet_caregivers`
-- (person↔person grants: role family|caregiver, status pending/active/revoked, invite/accept/revoke via
-- /api/pet-caregivers), the SECURITY DEFINER gates (app_owns_pet, app_user_has_pet_access = ANY active
-- grantee, app_user_has_pet_family = FAMILY only), and the owner-OR-caregiver RLS generalization across
-- pets / routines / pet_medical_profiles / all health logs. ROLE MAPPING for E13: pet OWNER = Owner/Admin;
-- 0049 'family' = E13 "Caregiver" (full day-to-day: post the moment, log care/health, close the ring);
-- 0049 'caregiver' = E13 "Viewer" (read + emergency/feeding). This migration extends that generalization
-- to the E0–E2 ENGAGEMENT layer, which did not exist when 0049 shipped, so the ring + streak become
-- SHARED ("our dog, our streak"):
--   1. pet_care_days + pet_streaks — a permissive "active caregiver" FOR ALL policy alongside the owner
--      own-row policy (0094). ANY active grantee (family OR caregiver) can read + write the shared ring.
--   2. app_pet_ring_segments() — derive the three ring segments by PET (across ALL contributors: owner +
--      every caregiver), DEFINER so it counts each contributor's own-scoped logs uniformly regardless of
--      whose owner_user_id they carry. A solo owner is a household of one → identical result (no-op).
--
-- ADDITIVE + idempotent — the owner own-row policies are untouched, so a solo owner is byte-for-byte
-- unchanged. Verify: supabase/verify_0102.sql. HARNESS-ONLY THIS TICKET — hand-applied after merge. The
-- care-ring route DEGRADES CLEANLY (a missing function/policy or an RLS denial for a caregiver on a
-- pre-migration DB → derived-only, never a 500).

-- ── 1. pet_care_days + pet_streaks — active-caregiver access (permissive, ORs with owner own-row) ──
drop policy if exists pet_care_days_caregiver_all on pet_care_days;
create policy pet_care_days_caregiver_all on pet_care_days
  for all
  using (app_user_has_pet_access(pet_id))
  with check (app_user_has_pet_access(pet_id));

drop policy if exists pet_streaks_caregiver_all on pet_streaks;
create policy pet_streaks_caregiver_all on pet_streaks
  for all
  using (app_user_has_pet_access(pet_id))
  with check (app_user_has_pet_access(pet_id));

-- ── 2. app_pet_ring_segments — SHARED ring derivation across all contributors ───
-- Counts by pet_id ONLY (not owner_user_id), so a walk/moment/care log from the owner OR any caregiver
-- fills the shared segment. DEFINER so it reads every contributor's logs uniformly (each carries its own
-- actor's owner_user_id under the existing per-actor RLS). Matches the owner-only derivation in
-- pets/[id]/care-ring for a household of one.
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
    ) as care_done;
$$;

grant execute on function app_pet_ring_segments(integer, text, date) to pawpi_app;
