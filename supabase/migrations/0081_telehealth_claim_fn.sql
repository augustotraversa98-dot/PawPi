-- 0081_telehealth_claim_fn.sql
-- Multi-vet telehealth "session at booking" + staff SELF-CLAIM. PURELY ADDITIVE — two SECURITY
-- DEFINER functions + grants + ONE partial UNIQUE index. NO table change, NO 0040 policy change,
-- NO rename/drop. Same definer pattern as app_provider_solo_telehealth_staff (0078),
-- app_get_provider_payment_account (0072), app_is_active_staff_of (0023).
--
-- WHY: 0078's session-at-booking only fires for SOLO providers — when EXACTLY ONE eligible
-- (owner|vet) active staffer exists, the booking route pre-creates the consult ASSIGNED to that
-- vet. For a MULTI-VET clinic (>=2 eligible), 0078 returns NULL and no session is created. We now
-- want a multi-vet clinic to ALSO get a joinable consult at booking: the OWNER pre-creates an
-- UNASSIGNED session (staff_user_id NULL), and whichever eligible vet opens it CLAIMS it.
--
-- The claim CANNOT be pure app-side SQL under the vet's identity: telehealth_sessions RLS (0040)
-- scopes staff SELECT/UPDATE to `staff_user_id = current_app_user_id()`, so a vet can neither SEE
-- nor UPDATE an UNASSIGNED row (NULL = caller is never true). These definers close exactly that
-- gap — find + atomically compare-and-swap the assignment server-side — while leaving the 0040
-- perimeter (FORCE RLS + all four policies) untouched. Once claimed (staff_user_id = self), the
-- vet's normal staff_read/staff_update access lights up for join / inbox / end-consult.
--
-- ⚠️ HAND-APPLIED AFTER MERGE (this PR carries a migration, so it does NOT auto-merge; see the PR
-- body). STEP 0 verified on prod: 0 telehealth_sessions rows, 0 duplicate booking_id groups, so
-- the partial UNIQUE index applies cleanly.

-- ════════════════════════════════════════════════════════════════════════════════
-- 1. app_provider_has_telehealth_staff — does the provider have >=1 eligible active staffer?
-- ════════════════════════════════════════════════════════════════════════════════
-- The booking route needs to tell ZERO eligible staff apart from MULTIPLE — 0078 collapses both
-- to NULL and cannot. Combined with 0078: solo id non-null => exactly one (assign it); else this
-- boolean true => >=2 (insert UNASSIGNED); else zero (insert nothing). Read-only + STABLE.
create or replace function app_provider_has_telehealth_staff(p_provider_id integer)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from provider_staff ps
    where ps.provider_id = p_provider_id
      and ps.status = 'active'
      and ps.role = any (array['owner', 'vet']::text[])
  )
$$;

grant execute on function app_provider_has_telehealth_staff(integer) to pawpi_app;

-- ════════════════════════════════════════════════════════════════════════════════
-- 2. app_claim_telehealth_session — an eligible vet atomically claims an unassigned session.
-- ════════════════════════════════════════════════════════════════════════════════
-- Contract (returns the telehealth_sessions row, or NULL):
--   * Caller must be an ACTIVE, telehealth-eligible (owner|vet) staffer of the booking's
--     provider AND the booking must be a telehealth booking — else NULL (the caller has no
--     business claiming this consult; the ensure route falls back to its legacy self-insert).
--   * Atomic compare-and-swap: UPDATE ... SET staff_user_id = caller WHERE booking_id = ? AND
--     staff_user_id IS NULL. The loser of a two-vet race updates 0 rows — Postgres re-evaluates
--     the `staff_user_id IS NULL` qual on the now-assigned row (EvalPlanQual) — so there is never
--     a double-assignment.
--   * If nothing was claimed (already assigned to me on a re-call, or to another vet), return the
--     most-recent existing session for the booking; NULL when no session exists yet.
-- VOLATILE (it writes) — NOT marked stable. security definer bypasses the 0040 staff RLS so the
-- function can see + swap the unassigned row; every OTHER path still goes through 0040.
create or replace function app_claim_telehealth_session(p_booking_id integer)
returns telehealth_sessions
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_caller integer := current_app_user_id();
  v_row    telehealth_sessions;
begin
  -- Eligibility: active owner|vet staff of the booking's provider, and the booking is telehealth.
  if not exists (
    select 1
    from vet_appointments va
    join provider_staff ps on ps.provider_id = va.provider_id
    where va.id = p_booking_id
      and va.capability = 'telehealth'
      and ps.user_profile_id = v_caller
      and ps.status = 'active'
      and ps.role = any (array['owner', 'vet']::text[])
  ) then
    return null;
  end if;

  -- Atomic compare-and-swap — claim only while still unassigned.
  update telehealth_sessions
     set staff_user_id = v_caller, updated_at = now()
   where booking_id = p_booking_id
     and staff_user_id is null
  returning * into v_row;
  if found then
    return v_row;
  end if;

  -- Nothing claimed: return the existing session (assigned to me on a re-call, or to another
  -- vet), most-recent first. NULL when the booking has no session at all.
  select *
    into v_row
    from telehealth_sessions
   where booking_id = p_booking_id
   order by created_at desc, id desc
   limit 1;
  return v_row;
end;
$$;

grant execute on function app_claim_telehealth_session(integer) to pawpi_app;

-- ════════════════════════════════════════════════════════════════════════════════
-- 3. One session per booking — a partial UNIQUE index (STEP 0 confirmed zero existing dups).
-- ════════════════════════════════════════════════════════════════════════════════
-- Guarantees at most one telehealth_sessions row per booking, so "claim the existing one" is
-- unambiguous and no race between the at-booking insert and a stale ensure-insert can create a
-- duplicate. NULL booking_id (an unlinked session) is exempt.
create unique index if not exists uq_telehealth_sessions_booking_id
  on telehealth_sessions (booking_id)
  where booking_id is not null;
