-- 0096_engagement_welcome_paw.sql
-- Pet Owner engagement wave — unit E6 (Onboarding D1 polish, docs/pet-owner-engagement.md).
--
-- The first session should end with the Care Ring STARTED: a first moment posted, streak day 1,
-- and — the ONE allowed, honest, clearly-LABELLED seeded interaction — a first paw from an official
-- "PawPi Welcome" account. This migration provides the server pieces that behavior needs:
--
--   1. app_welcome_account() — a SECURITY DEFINER helper that LAZILY ensures the single official
--      "PawPi Welcome" account (username 'pawpi_welcome') exists and returns its user_profiles.id. A
--      REAL row, not a fabricated count — the honest, labelled sender of the welcome paw. It has NO pet,
--      so it never appears as a dog anywhere; it only shows up as the actor of the welcome paw + its
--      notification. Lazy (created on first onboarding) rather than a migration INSERT on purpose: the
--      integration harness seeds identity rows with explicit ids, so a migration-time seed would collide
--      with the first test — this keeps the migration free of app-row seed data.
--   2. app_welcome_paw(post_id) — a SECURITY DEFINER helper (pinned search_path, GRANT to pawpi_app,
--      the 0044 app_notify pattern) that inserts the welcome account's paw on the new owner's first
--      post and files a labelled 'welcome' notification. DEFINER because post_paws' write policy (0021)
--      only lets the ACTOR insert their own paw, and the welcome account never authenticates.
--
-- Widens notifications_type_check to allow the 'welcome' type. ADDITIVE only — no existing table's RLS
-- is touched; pet_streaks (0094/0095) is reused for the day-1 streak (seeded by the route under the
-- owner's own RLS, not here). Idempotent. Verify: supabase/verify_0096.sql.
-- HARNESS-ONLY THIS TICKET — hand-applied to Supabase after merge.

-- ── 1. notifications_type_check += 'welcome' ───────────────────────────────────
alter table notifications drop constraint if exists notifications_type_check;
alter table notifications add constraint notifications_type_check
  check (type = any (array[
    'paw','bark','follow','lost_alert','emergency_contact','food_recall','report_received',
    'booking_requested','booking_confirmed','booking_declined','booking_cancelled',
    'adoption_under_review','adoption_approved','adoption_declined',
    'walk_request_targeted','walk_request_broadcast','walk_request_accepted','walk_request_taken',
    'welcome'
  ]::text[]));

-- ── 2. DEFINER helper: lazily ensure the official PawPi Welcome account ─────────
-- Returns its user_profiles.id, creating the auth_users + user_profiles rows on first call. The
-- username is unique, so a concurrent race resolves to the same single account (ON CONFLICT + reselect).
create or replace function app_welcome_account()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id integer;
  v_auth integer;
begin
  select id into v_id from user_profiles where username = 'pawpi_welcome' limit 1;
  if v_id is not null then
    return v_id;
  end if;

  insert into auth_users (name, email) values ('PawPi Welcome', 'welcome@pawpi.system')
  returning id into v_auth;

  insert into user_profiles (auth_user_id, full_name, username, role, onboarding_completed)
  values (v_auth, 'PawPi Welcome', 'pawpi_welcome', 'pet_owner', true)
  on conflict (username) do nothing;

  select id into v_id from user_profiles where username = 'pawpi_welcome' limit 1;
  return v_id;
end;
$$;

grant execute on function app_welcome_account() to pawpi_app;

-- ── 3. DEFINER helper: the welcome account paws the new owner's first post ──────
-- Returns the welcome account id (or NULL when the post is missing — the route degrades cleanly).
-- Idempotent: the (post_id, user_id) unique on post_paws makes a repeat paw a no-op, and app_notify
-- never notifies an actor about their own action.
create or replace function app_welcome_paw(p_post_id integer)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_welcome integer;
  v_owner integer;
begin
  v_welcome := app_welcome_account();
  if v_welcome is null then
    return null;
  end if;

  select user_id into v_owner from posts where id = p_post_id limit 1;
  if v_owner is null or v_owner = v_welcome then
    return v_welcome;  -- nothing to paw / never welcome the official account's own post
  end if;

  insert into post_paws (post_id, user_id)
  values (p_post_id, v_welcome)
  on conflict (post_id, user_id) do nothing;

  perform app_notify(
    v_owner, v_welcome, 'welcome', p_post_id::text,
    'Welcome to PawPi! Here''s your first paw 🐾'
  );

  return v_welcome;
end;
$$;

grant execute on function app_welcome_paw(integer) to pawpi_app;
