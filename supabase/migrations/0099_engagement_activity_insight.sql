-- 0099_engagement_activity_insight.sql
-- Pet Owner engagement wave — unit E9 (Comparative health insight, docs/pet-owner-engagement.md).
--
-- A positive, behavioral "reward" insight after logging. v1 defaults to the dog's OWN history (this
-- week vs prior weeks) — works with a single user. A breed+age COHORT comparison ("more active than X%
-- of {breed}s his age") only renders when the cohort is dense enough AND the pet is ABOVE median. Below
-- median we NEVER show a negative comparison — the route falls back to personal progress or a gentle
-- forward nudge. The rule is enforced in code (the route), and this migration only provides the
-- cross-owner cohort AGGREGATE (owner-scoped RLS forbids reading other pets' logs directly, so the
-- aggregate runs in a SECURITY DEFINER helper — like app_leaderboard).
--
-- Behavioral only, never diagnostic (existing PawPi health rule; the surface keeps the disclaimer).
-- ADDITIVE — one DEFINER function, no table, no existing RLS touched. Idempotent. Verify:
-- supabase/verify_0099.sql. HARNESS-ONLY THIS TICKET — hand-applied to Supabase after merge. The route
-- DEGRADES CLEANLY while absent (personal-history insight only; the cohort branch never fires).

-- app_activity_cohort — for a pet's breed+age cohort, is this pet at/above the cohort MEDIAN for weekly
-- walks, and what fraction of the cohort is it more active than? Returns a single row. cohort_size < 2
-- or a missing breed/age yields cohort_size 0 (the route then shows personal history only). The metric
-- is weekly WALK COUNT (a behavioral activity proxy) over [week_start, week_start+7) in each owner's tz.
create or replace function app_activity_cohort(
  p_pet integer, p_owner integer, p_week_start date, p_min_cohort integer
)
returns table (cohort_size integer, above_median boolean, percentile integer, breed_label text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_breed text;
  v_age   integer;
  v_my    integer := 0;
  v_size  integer := 0;
  v_below integer := 0;
  v_at_or_below integer := 0;
begin
  if not exists (select 1 from pets where id = p_pet and owner_user_id = p_owner) then
    return;
  end if;
  select breed, age_years into v_breed, v_age from pets where id = p_pet;
  if v_breed is null or btrim(v_breed) = '' or v_age is null then
    return;  -- no breed/age → no cohort; personal history only
  end if;

  -- Weekly walk count per cohort member (same breed, age within ±1 year), computed in each owner's tz.
  create temporary table _cohort_walks on commit drop as
  select p.id as pid,
         (select count(*) from health_walk_logs w
           where w.pet_id = p.id
             and w.start_time >= (p_week_start::timestamp) at time zone coalesce(u.timezone,'America/Buenos_Aires')
             and w.start_time <  ((p_week_start + 7)::timestamp) at time zone coalesce(u.timezone,'America/Buenos_Aires')
         ) as walks
  from pets p join user_profiles u on u.id = p.owner_user_id
  where lower(p.breed) = lower(v_breed)
    and p.age_years is not null and abs(p.age_years - v_age) <= 1;

  select count(*) into v_size from _cohort_walks;
  if v_size < greatest(p_min_cohort, 2) then
    drop table if exists _cohort_walks;
    return query select v_size, false, 0, v_breed;  -- too sparse; route falls back
  end if;

  select walks into v_my from _cohort_walks where pid = p_pet;
  v_my := coalesce(v_my, 0);
  -- Others strictly below me, and others at-or-below me (for the median test).
  select count(*) into v_below from _cohort_walks where pid <> p_pet and walks < v_my;
  select count(*) into v_at_or_below from _cohort_walks where walks <= v_my;

  drop table if exists _cohort_walks;

  return query select
    v_size,
    (v_at_or_below * 2 >= v_size) as above_median,        -- at/above the middle
    case when v_size > 1 then round(100.0 * v_below / (v_size - 1))::integer else 0 end as percentile,
    v_breed;
end;
$$;

grant execute on function app_activity_cohort(integer, integer, date, integer) to pawpi_app;
