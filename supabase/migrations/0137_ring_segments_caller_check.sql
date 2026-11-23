-- 0137_ring_segments_caller_check.sql
-- Family-sharing audit (docs/family-sharing-audit-2026-11.md, gap A2): app_pet_ring_segments
-- authorises its caller.
--
-- WHY. app_pet_ring_segments(pet, tz, day) (0102, last redefined in 0119) is SECURITY DEFINER so it can
-- count EVERY contributor's logs by pet_id (owner AND caregivers each carry their own owner_user_id under
-- the per-actor RLS). But it had NO check on WHO is asking: any session that can pass an arbitrary pet id
-- learns whether a walk / daily moment / care entry exists for that pet on that day. Its sibling
-- app_household_leaderboard (0104) already guards on owner-or-active-grantee; this brings the ring
-- derivation in line. The two routes that call it (care-ring, household) only ever pass owned or co-cared
-- ids, so no legitimate caller changes behaviour.
--
-- WHAT. Same signature + return type + body as 0119; the single SELECT gains
--     WHERE app_owns_pet(p_pet) OR app_user_has_pet_access(p_pet)
-- (both are 0049 DEFINER helpers keyed on current_app_user_id(), which is NULL with no identity → deny).
-- A denied caller gets ZERO ROWS (not an error): the care-ring route already treats "no row" as "fall back
-- to the owner-scoped derivation" and the household route's LATERAL join simply yields no ring, so neither
-- can 500. An owner, an ACTIVE+UNEXPIRED family or caregiver grantee gets exactly the 0119 row.
--
-- Idempotent (CREATE OR REPLACE + the template's revoke/grant pair). No table or RLS change.
-- HAND-APPLIED after merge (it re-states the function's EXECUTE grants, i.e. it REVOKEs) — verify with
-- supabase/verify_0137.sql (every row PASS). Proven as pawpi_app in
-- test/integration/family-sharing-journey.integration.test.ts.

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
    ) as care_done
  where app_owns_pet(p_pet) or app_user_has_pet_access(p_pet);
$$;

revoke execute on function app_pet_ring_segments(integer, text, date) from public;
do $$
declare r text;
begin
  -- REVOKE ... FROM a role that does not exist is a hard error; the integration harness has no anon/authenticated.
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke execute on function app_pet_ring_segments(integer, text, date) from %I', r);
    end if;
  end loop;
end
$$;
grant execute on function app_pet_ring_segments(integer, text, date) to pawpi_app;
