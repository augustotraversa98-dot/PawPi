-- 0093_walk_requests_broadcast_read.sql
-- Ticket C2 (docs/phase2-tickets/C2-broadcast-find-a-walker-now.md) — "find a walker now": an owner
-- posts a BROADCAST walk request (walk_requests row with target_provider_id NULL, from 0092); every
-- walker business that is live-available now (B1) and near the pickup point is notified; the first to
-- accept wins (the C1 accept path already handles a NULL target). DECISION LOCK 3.
--
-- The C1 provider read policy (walk_requests_provider_read, 0092) only admits rows TARGETED at a
-- provider the caller staffs (target_provider_id IS NOT NULL). A broadcast row is target-NULL, so a
-- notified walker cannot yet SELECT it to open/accept. This migration adds the broadcast read.
--
-- FOUR additive changes (NO new table, NO change to existing policies):
--   1. app_staffs_a_walker() — a SECURITY DEFINER boolean: does the CURRENT request identity actively
--      staff ANY provider that holds the 'walker' capability? DEFINER so it reads provider_staff +
--      provider_capabilities without tripping their RLS (mirrors app_is_active_staff_of). Used by the
--      broadcast read policy so ONLY walker staff (not arbitrary users/owners) can read broadcast rows.
--   2. app_provider_active_staff_ids(provider_ids[]) — a SECURITY DEFINER set of the active-staff
--      user_profile_ids for the given providers. The request-CREATE notify runs as the OWNER, who
--      canNOT read another provider's provider_staff under RLS — so resolving "who to notify" needs a
--      DEFINER reader. Used to fan out walk_request_targeted (direct) and walk_request_broadcast.
--   3. walk_requests_broadcast_read — active WALKER staff may SELECT OPEN, non-expired BROADCAST rows
--      (target_provider_id IS NULL AND status='open' AND expires_at>now()). Radius is enforced at the
--      API/candidate layer (JS haversine over provider_live_availability), not in RLS. The accept
--      transition stays the 0092 DEFINER helper (app_accept_walk_request already treats target-NULL as
--      eligible for any active-staff caller). Notification types (walk_request_broadcast/_taken) were
--      already added to notifications_type_check in 0092 — no notify migration needed here.
--   4. An index on provider_live_availability(accepting) for the broadcast fan-out candidate scan.
--
-- ⚠️ HARNESS-ONLY THIS TICKET — proven as pawpi_app in the integration harness, NOT applied to
-- Supabase here (hand-applied by Tats after the Wave-C/D run; flagged in the PR body + test-backlog
-- ACTION 1). The consumer code DEGRADES CLEANLY while this is absent (broadcast create still inserts
-- the row and the fan-out simply finds no candidates / the ?scope=broadcast list reads empty — never
-- a 500). Idempotent DDL. The DEFINER helper gets an EXECUTE grant.

-- ── 1. app_staffs_a_walker — "does the caller actively staff a walker provider?" ──
create or replace function app_staffs_a_walker()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from provider_staff ps
    join provider_capabilities pc on pc.provider_id = ps.provider_id
    where ps.user_profile_id = current_app_user_id()
      and ps.status = 'active'
      and pc.capability = 'walker'
  );
$$;

grant execute on function app_staffs_a_walker() to pawpi_app;

-- ── 2. app_provider_active_staff_ids — DEFINER reader for the CREATE notify fan-out ──
-- The request-create route runs as the OWNER; owner RLS cannot see another provider's provider_staff,
-- so resolving notification recipients (the walker's staff) requires a DEFINER reader.
create or replace function app_provider_active_staff_ids(p_provider_ids integer[])
returns setof integer
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select distinct user_profile_id
  from provider_staff
  where provider_id = any(p_provider_ids) and status = 'active';
$$;

grant execute on function app_provider_active_staff_ids(integer[]) to pawpi_app;

-- ── 3. broadcast read policy — walker staff read OPEN, live broadcast requests ─────
drop policy if exists walk_requests_broadcast_read on walk_requests;
create policy walk_requests_broadcast_read on walk_requests
  for select using (
    target_provider_id is null
    and status = 'open'
    and expires_at > now()
    and app_staffs_a_walker()
  );

-- ── 4. fan-out candidate scan index ───────────────────────────────────────────────
create index if not exists idx_provider_live_availability_accepting
  on provider_live_availability (accepting);
