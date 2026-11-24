-- 0142_sharing_lifecycle.sql
-- Family-sharing series PR 4/7 (docs/family-sharing-audit-2026-11.md §5, owner decision 1 of 2026-11-23): leave, resend, lifecycle
-- notifications, and account deletion that PRESERVES a member's contributions (anonymised) instead of deleting them.
--
-- WHAT
--  1. pet_caregivers gets a 'left' status (a member leaves a shared pet; the row and its audit trail are KEPT), plus left_at,
--     last_notified_at and resend_count (rate-limiting "resend invite"). pet_caregiver_audit accepts 'leave' / 'resend'.
--     A 'left' row is not live (the live-unique index only covers pending/active), so the owner can re-invite the same person.
--  2. notifications_type_check is widened with the six sharing types (pet_share_invite / _accepted / _declined / _revoked / _left /
--     _owner_deleted). Same drop+re-add pattern as 0110; the existing set is carried over unchanged.
--  3. leave_pet_caregiver(grant_id) — SECURITY DEFINER (the grantee may not UPDATE pet_caregivers directly: the owner-only UPDATE policy
--     stays). Pins grantee = caller, only an ACTIVE grant, flips it to 'left', writes the audit row. Idempotent for the caller (a second
--     call raises the same 'no active grant for caller' the route maps to a friendly answer).
--  4. app_delete_my_account(p_delete_contributions) — the account-deletion engine, and delete_my_account() (0062) becomes a thin wrapper
--     with the SAME signature and return type, so a route deployed before or after this migration keeps working.
--       • MEMBER deleting their own account (a person who held a grant on someone else's pet): their posts on pets they do NOT own, their
--         vet-record attribution (created_by_user_id on the 8 record tables) and their grant/audit history are RE-ATTRIBUTED to a fresh
--         anonymous "Former member" profile (random username, no avatar, no e-mail, cannot sign in) instead of being deleted or nulled
--         ("Editor · Editor"). With p_delete_contributions = true their POSTS on others' pets are deleted instead (the vet-record
--         attribution is still anonymised: those records belong to the pet's owner). Logs a member wrote are already stored under the pet
--         OWNER's id (0049 / FF2) and never carried the author, so they simply stay.
--       • OWNER deleting their account: unchanged — the pet and everything on it go with the account (cascade). The route notifies the members
--         BEFORE calling this (same transaction).
--       • Reactions the member made on other posts (paws/barks) and their notifications / push tokens are personal data and are deleted.
--     SECURITY DEFINER, pinned search_path, REVOKE/GRANT pair. The anonymous profile is only created when the caller actually held a grant.
--
-- IDEMPOTENT. HAND-APPLIED after merge: supabase/verify_0142.sql (every row PASS); rollback: supabase/rollback_0142.sql (restores the
-- 0062 delete_my_account body, drops the new functions; the widened CHECKs and the extra columns are harmless supersets and stay).
-- Without it the API degrades: leave/resend answer a friendly 503 `sharing_lifecycle_unavailable`; invite/accept/revoke notifications that
-- need a new type are skipped (the action still succeeds); account deletion keeps the previous behaviour (cascade).

-- ── 1. pet_caregivers / audit ─────────────────────────────────────────────────────────────────────────────────
alter table pet_caregivers drop constraint if exists pet_caregivers_status_check;
alter table pet_caregivers add constraint pet_caregivers_status_check
  check (status = any (array['pending','active','revoked','declined','expired','left']::text[]));

alter table pet_caregivers add column if not exists left_at          timestamptz;
alter table pet_caregivers add column if not exists last_notified_at timestamptz;
alter table pet_caregivers add column if not exists resend_count     integer not null default 0;

alter table pet_caregiver_audit drop constraint if exists pet_caregiver_audit_action_check;
alter table pet_caregiver_audit add constraint pet_caregiver_audit_action_check
  check (action = any (array['grant','accept','decline','revoke','read','write','leave','resend']::text[]));

-- ── 2. notification types ─────────────────────────────────────────────────────────────────────────────────────
alter table notifications drop constraint if exists notifications_type_check;
alter table notifications add constraint notifications_type_check
  check (type = any (array[
    -- existing (through 0110)
    'paw','bark','follow','lost_alert','emergency_contact','food_recall','report_received',
    'booking_requested','booking_confirmed','booking_declined','booking_cancelled',
    'adoption_under_review','adoption_approved','adoption_declined',
    'walk_request_targeted','walk_request_broadcast','walk_request_accepted','walk_request_taken',
    'welcome','pack_invite','pack_accepted','boop','weekly_digest','winback',
    'biz_booking','biz_booking_change','biz_order','biz_message','biz_adoption_application',
    'biz_review','biz_payout','biz_post_engagement','biz_follow',
    -- family sharing (this migration)
    'pet_share_invite','pet_share_accepted','pet_share_declined','pet_share_revoked','pet_share_left','pet_share_owner_deleted'
  ]::text[]));

-- ── 3. leave ─────────────────────────────────────────────────────────────────────────────────────────────────
create or replace function leave_pet_caregiver(p_grant_id integer)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid integer := current_app_user_id();
  g pet_caregivers;
begin
  if v_uid is null then
    raise exception 'no identity';
  end if;
  select * into g from pet_caregivers
    where id = p_grant_id and grantee_user_id = v_uid and status = 'active';
  if not found then
    raise exception 'no active grant for caller';
  end if;

  update pet_caregivers
    set status = 'left', left_at = now(), updated_at = now()
    where id = p_grant_id;

  insert into pet_caregiver_audit (grant_id, owner_user_id, actor_user_id, action)
    values (p_grant_id, g.owner_user_id, v_uid, 'leave');

  return 'left';
end;
$$;

revoke execute on function leave_pet_caregiver(integer) from public;
do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke execute on function leave_pet_caregiver(integer) from %I', r);
    end if;
  end loop;
end
$$;
grant execute on function leave_pet_caregiver(integer) to pawpi_app;

-- ── 4. account deletion that preserves (anonymises) a member's contributions ────────────────────────────────
create or replace function app_delete_my_account(p_delete_contributions boolean default false)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid       integer := current_app_user_id();
  v_auth      integer;
  v_anon_auth integer;
  v_anon      integer;
  t           text;
  record_tables text[] := array[
    'pet_allergies', 'pet_conditions', 'pet_surgeries', 'pet_lab_results',
    'vet_notes', 'vet_documents', 'pet_vaccinations', 'pet_medications'
  ];
begin
  if v_uid is null then
    return false;
  end if;

  select auth_user_id into v_auth from user_profiles where id = v_uid;

  -- MEMBER side: only when the caller actually held a grant on someone else's pet.
  if exists (select 1 from pet_caregivers where grantee_user_id = v_uid) then
    insert into auth_users (name) values ('Former member') returning id into v_anon_auth;
    insert into user_profiles (auth_user_id, username, full_name, role, onboarding_completed)
      values (v_anon_auth, 'former_member_' || substr(md5(random()::text || clock_timestamp()::text), 1, 10), 'Former member', 'pet_owner', true)
      returning id into v_anon;

    -- posts on pets the caller does NOT own: kept under the anonymous author, or deleted when the caller asked for that
    if p_delete_contributions then
      delete from posts where user_id = v_uid and pet_id in (select id from pets where owner_user_id <> v_uid);
    else
      update posts set user_id = v_anon
        where user_id = v_uid and pet_id in (select id from pets where owner_user_id <> v_uid);
    end if;

    -- vet-record attribution ("Added by …"): never "Editor · Editor" — it reads "Former member"
    foreach t in array record_tables loop
      execute format(
        'update %I set created_by_user_id = $1 where created_by_user_id = $2 and owner_user_id <> $2', t
      ) using v_anon, v_uid;
    end loop;

    -- grant history: live grants end as 'left' (with an audit row); every grant row + audit row is kept, re-pointed at the anonymous profile
    insert into pet_caregiver_audit (grant_id, owner_user_id, actor_user_id, action)
      select id, owner_user_id, v_anon, 'leave' from pet_caregivers
      where grantee_user_id = v_uid and status in ('pending', 'active');
    update pet_caregiver_audit set actor_user_id = v_anon where actor_user_id = v_uid;
    update pet_caregivers
      set status = case when status in ('pending', 'active') then 'left' else status end,
          left_at = case when status in ('pending', 'active') then now() else left_at end,
          updated_at = now(),
          grantee_user_id = v_anon
      where grantee_user_id = v_uid;
  end if;

  if v_auth is null then
    delete from health_medical_care_logs where owner_user_id = v_uid;
    delete from user_profiles where id = v_uid;
    return true;
  end if;

  -- Clear the no-cascade health table first so the cascading delete below doesn't hit an FK block.
  delete from health_medical_care_logs where owner_user_id = v_uid;

  -- Delete the auth identity -> cascades auth_sessions/accounts + user_profiles + everything the caller OWNS (their pets and all that is on
  -- them, including members' posts on those pets) and nulls ON DELETE SET NULL references. The account can no longer log in.
  delete from auth_users where id = v_auth;
  return true;
end;
$$;

revoke execute on function app_delete_my_account(boolean) from public;

-- delete_my_account() keeps its exact signature and return type; it now delegates (default: keep + anonymise contributions).
create or replace function delete_my_account()
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  return app_delete_my_account(false);
end;
$$;

revoke execute on function delete_my_account() from public;
do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke execute on function app_delete_my_account(boolean) from %I', r);
      execute format('revoke execute on function delete_my_account() from %I', r);
    end if;
  end loop;
end
$$;
grant execute on function app_delete_my_account(boolean) to pawpi_app;
grant execute on function delete_my_account() to pawpi_app;
