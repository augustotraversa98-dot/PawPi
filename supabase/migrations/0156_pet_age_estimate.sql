-- 0156_pet_age_estimate.sql
--
-- ⚠️ HAND-APPLY (new columns, a new function and two replaced SECURITY DEFINER functions). Run in the Supabase SQL
--    editor, then run supabase/verify_0156.sql: every row must read PASS. Idempotent (safe to run twice). Needs 0152.
--    If 0099, 0146 or 0152 is ever run again afterwards, run this file again too (each restores a function replaced here).
--
-- A pet's age from a birth date, or from an estimate that keeps growing.
--
-- WHAT
--  1. pets: age_estimate_months (the estimated age, in months, when it was given) and age_estimated_on (that date).
--     Both nullable and always set together. No existing row is changed: a pet with only age_years / age_months keeps
--     showing exactly that. The birth date and the adoption date stay in the existing pets.birthday / adoption_date,
--     and an estimate is never written into pets.birthday.
--  2. app_pet_age(...): the one SQL computation of a pet's age. Same rule as the web
--     (anything/apps/web/src/app/api/utils/petAge.js) and the app; the three share
--     anything/apps/web/test/fixtures/petAgeVectors.json. Precedence:
--       birthday                                     → computed from it                          ('birthday');
--       estimate that still matches the stored age   → estimate + whole months since it was given ('estimate');
--       otherwise                                    → age_years / age_months as stored           ('stored').
--     An estimate counts only while age_estimate_months equals age_years * 12 + age_months, so any later change of
--     the stored age replaces it. 1969-12-31 and 1970-01-01 are placeholders, not birth dates.
--     SECURITY INVOKER; it reads no table.
--  3. app_emergency_card_json (replaced): the 0152 function; only 'age_years' / 'age_months' now come from app_pet_age.
--  4. app_activity_cohort (replaced): the 0099 function; only the ages it compares now come from app_pet_age.
--
-- ROW SECURITY: two additive columns on pets, covered by the existing pets policies (row level security stays enabled
-- and forced; no new policy, grant or trigger). pawpi_app already holds DML on the table (0019).
--
-- DEPLOY ORDER: either one first.
--   • new web + old database: birth date and adoption date work; an estimate is saved as a plain age that does not grow;
--   • old web + this migration: the old web code reads and writes age_years / age_months as before; a change of the
--     stored age replaces an estimate (see 2).

-- ── 1. The estimate and the date it was given ───────────────────────────────────────────────────────────────
alter table pets add column if not exists age_estimate_months integer;
alter table pets add column if not exists age_estimated_on date;

comment on column pets.age_estimate_months is
  'Estimated age in months on age_estimated_on; counts only while it equals age_years * 12 + age_months';
comment on column pets.age_estimated_on is
  'The date the estimated age was given; the shown age grows from here. Never used when birthday is set';

do $$
begin
  if not exists (select 1 from pg_constraint
                 where conrelid = 'public.pets'::regclass and conname = 'pets_age_estimate_pair') then
    alter table pets add constraint pets_age_estimate_pair check (
      num_nonnulls(age_estimate_months, age_estimated_on) in (0, 2)
      and (age_estimate_months is null or age_estimate_months between 0 and 1200)
    );
  end if;
end
$$;

-- ── 2. The computation ──────────────────────────────────────────────────────────────────────────────────────
create or replace function app_pet_age(
  p_birthday date,
  p_estimate_months integer,
  p_estimated_on date,
  p_age_years integer,
  p_age_months integer,
  p_today date
)
returns table (age_years integer, age_months integer, basis text)
language sql
immutable
set search_path = public, pg_temp
as $$
  select
    case when t.total is null then p_age_years else t.total / 12 end,
    case when t.total is null then p_age_months else t.total % 12 end,
    s.basis
  from (
    -- The date the age is counted from, and the months it already had on that date.
    select
      case
        when b.birthday is not null then 'birthday'
        when p_estimate_months is not null and p_estimated_on is not null
             and (p_age_years is not null or p_age_months is not null)
             and p_estimate_months = coalesce(p_age_years, 0) * 12 + coalesce(p_age_months, 0) then 'estimate'
        else 'stored'
      end as basis,
      b.birthday
    from (
      select case when p_birthday in (date '1969-12-31', date '1970-01-01') then null else p_birthday end as birthday
    ) b
  ) s
  cross join lateral (
    select case s.basis when 'birthday' then s.birthday when 'estimate' then p_estimated_on end as since,
           case s.basis when 'birthday' then 0 when 'estimate' then p_estimate_months end as already
  ) f
  cross join lateral (
    -- Whole months: a month is complete on the same day of the month, or the first day after a shorter month.
    select case when f.since is not null then
      f.already + greatest(0,
        (extract(year from p_today)::integer - extract(year from f.since)::integer) * 12
        + (extract(month from p_today)::integer - extract(month from f.since)::integer)
        - case when extract(day from p_today) < extract(day from f.since) then 1 else 0 end)
    end as total
  ) t
$$;

revoke execute on function app_pet_age(date, integer, date, integer, integer, date) from public;
do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke execute on function app_pet_age(date, integer, date, integer, integer, date) from %I', r);
    end if;
  end loop;
end
$$;
grant execute on function app_pet_age(date, integer, date, integer, integer, date) to pawpi_app;

-- ── 3. Public card assembler: 0152 with the computed age ──────────────────────────────────────────────────
create or replace function app_emergency_card_json(
  p_card_id integer,
  p_include_medical boolean,
  p_medical_scope text
)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'pet', jsonb_build_object(
      'name', p.name,
      'species', p.species,
      'breed', p.breed,
      'age_years', age.age_years,
      'age_months', age.age_months,
      'gender', p.gender,
      'avatar_url', p.avatar_url,
      'has_home', true
    ),
    'microchip_id', mp.microchip_id,
    'contact', jsonb_build_object(
      'mode', c.contact_mode,
      -- raw owner contact is exposed ONLY for the channel the owner chose, and only if the value matches it.
      'value', app_emergency_published_contact(c.contact_mode, c.contact_value),
      'accepts_message', c.contact_mode = 'relay'
        or (c.contact_mode in ('phone', 'email')
            and app_emergency_published_contact(c.contact_mode, c.contact_value) is null)
    )
    -- Only for a card saved with the two switches: each channel on its own. Other cards: the same object as before.
    || case when c.contact_phone_enabled is null then '{}'::jsonb else jsonb_build_object(
      'phone', case when c.contact_mode in ('phone', 'email') and c.contact_phone_enabled
                    then app_emergency_published_contact('phone', c.contact_phone) end,
      'email', case when c.contact_mode in ('phone', 'email') and c.contact_email_enabled
                    then app_emergency_published_contact('email', c.contact_email) end
    ) end,
    'emergency_contact', case
      when p_medical_scope = 'tag' and c.show_emergency_contact_on_tag
           and coalesce(nullif(btrim(mp.emergency_contact_name), ''), nullif(btrim(mp.emergency_contact_phone), '')) is not null
      then jsonb_build_object(
        'name', nullif(btrim(mp.emergency_contact_name), ''),
        'phone', nullif(btrim(mp.emergency_contact_phone), '')
      )
      else null
    end,
    'lost', (
      select case when lr.id is null then null else jsonb_build_object(
        'active', true,
        'reward', lr.reward,
        'last_seen_area', lr.last_seen_area,
        'report_id', lr.id
      ) end
      from lost_reports lr
      where lr.pet_id = c.pet_id and lr.status = 'active'
      order by lr.created_at desc
      limit 1
    ),
    'non_diagnostic', true,
    'medical', case
      when not p_include_medical then null
      -- TAG scope: only the fields the public tag page renders. NO vet/emergency contact details.
      when p_medical_scope = 'tag' then jsonb_build_object(
        'blood_type', c.blood_type,
        'spayed_neutered_status', mp.spayed_neutered_status,
        'medical_notes', mp.medical_notes,
        'allergies', coalesce((
          select jsonb_agg(jsonb_build_object(
            'allergen', a.allergen, 'severity', a.severity, 'reaction', a.reaction
          ) order by a.id)
          from pet_allergies a where a.pet_id = c.pet_id
        ), '[]'::jsonb),
        'conditions', coalesce((
          select jsonb_agg(jsonb_build_object(
            'condition', cd.condition, 'status', cd.status
          ) order by cd.id)
          from pet_conditions cd where cd.pet_id = c.pet_id
        ), '[]'::jsonb)
      )
      -- FULL scope (the vet LINK); the last two keys depend on the finder setting, see below.
      else jsonb_build_object(
        'blood_type', c.blood_type,
        'spayed_neutered_status', mp.spayed_neutered_status,
        'medical_notes', mp.medical_notes,
        'extra_notes', c.extra_notes,
        'primary_vet_name', mp.primary_vet_name,
        'primary_clinic_name', mp.primary_clinic_name,
        'vet_phone', mp.vet_phone,
        'allergies', coalesce((
          select jsonb_agg(jsonb_build_object(
            'allergen', a.allergen, 'severity', a.severity, 'reaction', a.reaction
          ) order by a.id)
          from pet_allergies a where a.pet_id = c.pet_id
        ), '[]'::jsonb),
        'conditions', coalesce((
          select jsonb_agg(jsonb_build_object(
            'condition', cd.condition, 'status', cd.status
          ) order by cd.id)
          from pet_conditions cd where cd.pet_id = c.pet_id
        ), '[]'::jsonb)
      ) || case
        when c.contact_mode in ('phone', 'email') then jsonb_build_object(
          'emergency_contact_name', mp.emergency_contact_name,
          'emergency_contact_phone', mp.emergency_contact_phone
        )
        else '{}'::jsonb
      end
    end
  )
  from pet_emergency_cards c
  join pets p on p.id = c.pet_id
  cross join lateral app_pet_age(p.birthday, p.age_estimate_months, p.age_estimated_on,
                                 p.age_years, p.age_months,
                                 (now() at time zone 'America/Argentina/Buenos_Aires')::date) age
  left join pet_medical_profiles mp on mp.pet_id = c.pet_id and mp.deleted_at is null
  where c.id = p_card_id;
$$;

-- CREATE OR REPLACE keeps the existing privileges; re-asserted so the result does not depend on history.
revoke execute on function app_emergency_card_json(integer, boolean, text) from public;
do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke execute on function app_emergency_card_json(integer, boolean, text) from %I', r);
    end if;
  end loop;
end
$$;
grant execute on function app_emergency_card_json(integer, boolean, text) to pawpi_app;

-- ── 4. Activity cohort: 0099 with the computed age ────────────────────────────────────────────────────────
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
  v_today date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
begin
  if not exists (select 1 from pets where id = p_pet and owner_user_id = p_owner) then
    return;
  end if;
  select p.breed, a.age_years into v_breed, v_age
  from pets p
  cross join lateral app_pet_age(p.birthday, p.age_estimate_months, p.age_estimated_on,
                                 p.age_years, p.age_months, v_today) a
  where p.id = p_pet;
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
  cross join lateral app_pet_age(p.birthday, p.age_estimate_months, p.age_estimated_on,
                                 p.age_years, p.age_months, v_today) a
  where lower(p.breed) = lower(v_breed)
    and a.age_years is not null and abs(a.age_years - v_age) <= 1;

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

revoke execute on function app_activity_cohort(integer, integer, date, integer) from public;
do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke execute on function app_activity_cohort(integer, integer, date, integer) from %I', r);
    end if;
  end loop;
end
$$;
grant execute on function app_activity_cohort(integer, integer, date, integer) to pawpi_app;
