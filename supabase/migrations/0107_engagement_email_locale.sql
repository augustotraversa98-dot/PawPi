-- 0107 — per-user email locale for the E11 weekly digest + E12 win-back senders (FF1).
--
-- The E11/E12 EMAILS are server-rendered, but PawPi had no per-user locale, so the senders
-- defaulted every email to the app's Spanish (es-AR) fallback — an English user would get a
-- Spanish email (breaks the EN+ES guardrail). This migration adds an honest per-owner locale
-- signal and threads it into the two cross-owner DEFINER enumerators the senders read.
--
-- PURELY ADDITIVE. No existing table's RLS is touched (user_profiles keeps its owner-private
-- policy from the RLS arc; a nullable column rides it). Consumers degrade cleanly: pre-migration
-- the old enumerators simply don't return the column → the senders fall back to es-AR exactly as
-- before, and the /user-profile/locale writer 200-no-ops on undefined_column.
--
-- Idempotent (add column if not exists + drop-if-exists/re-create the CHECK; drop/recreate the
-- two functions since RETURNS TABLE gains a column, which CREATE OR REPLACE cannot do).
-- Verify: supabase/verify_0107.sql.

-- ── 1. user_profiles.preferred_locale ─────────────────────────────────────────
-- NULLABLE, no default — honest: empty until the owner's device/Settings locale is written.
-- Values are the two shipped app languages ('en' | 'es'); NULL means "no signal → es-AR fallback".
alter table user_profiles add column if not exists preferred_locale text;

alter table user_profiles drop constraint if exists user_profiles_preferred_locale_check;
alter table user_profiles
  add constraint user_profiles_preferred_locale_check
  check (preferred_locale is null or preferred_locale in ('en', 'es'));

-- ── 2. app_weekly_digest_due — carry the owner's preferred_locale ──────────────
-- (Re-created verbatim from 0100 with `preferred_locale` added; RETURNS TABLE gains a column so
-- the function must be dropped first.)
drop function if exists app_weekly_digest_due(timestamptz, integer);
create function app_weekly_digest_due(p_now timestamptz, p_limit integer)
returns table (
  owner_user_id integer,
  pet_id integer,
  pet_name text,
  tz text,
  week_start date,
  email text,
  preferred_locale text,
  push_enabled boolean,
  email_enabled boolean
)
language sql
security definer
set search_path = public, pg_temp
as $$
  select
    p.owner_user_id,
    p.id as pet_id,
    p.name as pet_name,
    coalesce(u.timezone, 'America/Buenos_Aires') as tz,
    (date_trunc('week', (p_now at time zone coalesce(u.timezone, 'America/Buenos_Aires'))))::date as week_start,
    au.email,
    u.preferred_locale,
    coalesce(pr.push_enabled, true) as push_enabled,
    coalesce(pr.email_enabled, false) as email_enabled
  from pets p
  join user_profiles u on u.id = p.owner_user_id
  join auth_users au on au.id = u.auth_user_id
  left join weekly_digest_prefs pr on pr.owner_user_id = p.owner_user_id
  where extract(dow  from (p_now at time zone coalesce(u.timezone, 'America/Buenos_Aires'))) = 0
    and extract(hour from (p_now at time zone coalesce(u.timezone, 'America/Buenos_Aires'))) >= 18
    and not exists (
      select 1 from weekly_digest_state s
      where s.pet_id = p.id
        and s.week_start = (date_trunc('week', (p_now at time zone coalesce(u.timezone, 'America/Buenos_Aires'))))::date
    )
  order by p.owner_user_id, p.id
  limit greatest(coalesce(p_limit, 500), 1);
$$;

grant execute on function app_weekly_digest_due(timestamptz, integer) to pawpi_app;

-- ── 3. app_reengagement_due — carry the owner's preferred_locale ───────────────
-- (Re-created verbatim from 0101 with `preferred_locale` added.)
drop function if exists app_reengagement_due(timestamptz, integer, integer, integer);
create function app_reengagement_due(
  p_now timestamptz, p_lapsed_days integer, p_cap_days integer, p_limit integer
)
returns table (
  owner_user_id integer,
  pet_id integer,
  pet_name text,
  tz text,
  email text,
  preferred_locale text,
  birthday date,
  adoption_date date,
  friend_name text,
  last_active_day date,
  today date
)
language sql
security definer
set search_path = public, pg_temp
as $$
  with base as (
    select
      p.id as pet_id,
      p.owner_user_id,
      p.name as pet_name,
      p.birthday,
      p.adoption_date,
      coalesce(u.timezone, 'America/Buenos_Aires') as tz,
      au.email,
      u.preferred_locale,
      (p_now at time zone coalesce(u.timezone, 'America/Buenos_Aires'))::date as today,
      greatest(
        (select max((w.start_time at time zone coalesce(u.timezone,'America/Buenos_Aires'))::date)
           from health_walk_logs w where w.pet_id = p.id and w.owner_user_id = p.owner_user_id),
        (select max(po.post_date) from posts po where po.pet_id = p.id and po.is_daily_update = true),
        (select max((f.logged_at at time zone coalesce(u.timezone,'America/Buenos_Aires'))::date)
           from health_food_logs f where f.pet_id = p.id and f.owner_user_id = p.owner_user_id)
      ) as last_active_day
    from pets p
    join user_profiles u on u.id = p.owner_user_id
    join auth_users au on au.id = u.auth_user_id
  )
  select
    b.owner_user_id,
    b.pet_id,
    b.pet_name,
    b.tz,
    b.email,
    b.preferred_locale,
    b.birthday,
    b.adoption_date,
    (
      select fp.name
      from pet_friendships fr
      join pets fp on fp.id = case
        when fr.requester_pet_id = b.pet_id then fr.receiver_pet_id else fr.requester_pet_id end
      where fr.status = 'accepted'
        and (fr.requester_pet_id = b.pet_id or fr.receiver_pet_id = b.pet_id)
        and exists (
          select 1 from posts p2
          where p2.pet_id = fp.id and p2.is_daily_update = true
            and p2.post_date > b.today - 7
        )
      order by fp.id
      limit 1
    ) as friend_name,
    b.last_active_day,
    b.today
  from base b
  left join reengagement_state s on s.pet_id = b.pet_id
  where b.last_active_day is not null
    and b.last_active_day < b.today - p_lapsed_days
    and coalesce(s.opted_out, false) = false
    and (s.last_winback_sent is null or s.last_winback_sent < p_now - make_interval(days => p_cap_days))
  order by b.owner_user_id, b.pet_id
  limit greatest(coalesce(p_limit, 500), 1);
$$;

grant execute on function app_reengagement_due(timestamptz, integer, integer, integer) to pawpi_app;
