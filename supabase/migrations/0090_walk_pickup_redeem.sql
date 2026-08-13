-- 0090_walk_pickup_redeem.sql
-- Ticket B3 (docs/phase2-tickets/B3-qr-pickup-deduct-credit.md) — QR pickup: the owner shows a QR,
-- the walker scans it, and ONE atomic action (a) deducts 1 prepaid credit from the owner's balance
-- with that provider, (b) checks in the walk (creates the walk_session, in_progress), and (c)
-- captures the walker's current GPS as the pickup point (DECISION LOCK 5).
--
-- TWO additive changes:
--   1. walk_sessions gains pickup_lat / pickup_lng (the handover point) + credit_pack_id (which
--      walk_credit_packs row a credit was spent from; NULL for non-credit walks). Additive only —
--      every existing consumer keeps working; NO RLS change (0033's participant policy still governs).
--   2. app_redeem_walk_credit(provider_id, pet_id, pickup_lat, pickup_lng, booking_id?) — the ONLY
--      path that decrements a credit (the owner cannot self-decrement — walk_credit_packs has no
--      write policy, 0089). SECURITY DEFINER, atomic (mirrors app_grant_walk_credits / the adoption
--      approve style): authorizes the caller is ACTIVE STAFF of the provider (raises 42501 if not),
--      finds the OLDEST active pack with remaining credit (FOR UPDATE SKIP LOCKED — no double-spend),
--      increments walks_used, inserts the in_progress walk_session assigned to the caller with the
--      pickup point + credit_pack_id, and RETURNS the new session id. Returns NULL when the owner has
--      NO credits (the route turns that into a friendly 409) — no session created, no decrement.
--
-- ⚠️ HARNESS-ONLY THIS TICKET — proven as pawpi_app in the integration harness, NOT applied to
-- Supabase here (hand-applied by Tats after the Wave-B run; flagged in the PR body + test-backlog
-- ACTION 1). The consumer code DEGRADES CLEANLY while these are absent (the redeem route catches
-- undefined_function/undefined_column and returns "not available yet"; the existing non-credit
-- check-in is untouched). Idempotent. The DEFINER helper gets an explicit EXECUTE grant.

-- ── 1. walk_sessions pickup columns (additive) ────────────────────────────────
alter table walk_sessions add column if not exists pickup_lat numeric(9,6);
alter table walk_sessions add column if not exists pickup_lng numeric(9,6);
alter table walk_sessions add column if not exists credit_pack_id integer references walk_credit_packs(id);

-- ── 2. app_redeem_walk_credit — the atomic pickup/redeem ──────────────────────
create or replace function app_redeem_walk_credit(
  p_provider_id integer,
  p_pet_id      integer,
  p_pickup_lat  numeric,
  p_pickup_lng  numeric,
  p_booking_id  integer default null
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner_id   integer;
  v_pack_id    integer;
  v_session_id integer;
begin
  -- Defense-in-depth authorization: the caller must be ACTIVE STAFF of this provider. Reads the
  -- request identity GUC (set_config app.current_user_id) even though we run as DEFINER, so the
  -- ACTUAL caller is authorized, not the function owner. The route also gates (capability + role).
  if not app_is_active_staff_of(p_provider_id) then
    raise exception 'not active staff of provider %', p_provider_id using errcode = '42501';
  end if;

  select owner_user_id into v_owner_id from pets where id = p_pet_id;
  if v_owner_id is null then
    return null; -- unknown pet → nothing to redeem (route → 409, friendly)
  end if;

  -- Oldest active pack of this owner↔provider with remaining credit, row-locked so two concurrent
  -- scans can't spend the same credit twice.
  select id into v_pack_id
  from walk_credit_packs
  where owner_user_id = v_owner_id
    and provider_id = p_provider_id
    and active = true
    and walks_used < walks_total
  order by purchased_at asc, id asc
  for update skip locked
  limit 1;

  if v_pack_id is null then
    return null; -- no credits → the route returns 409 "buy a pack"; NO session, NO decrement
  end if;

  update walk_credit_packs set walks_used = walks_used + 1 where id = v_pack_id;

  insert into walk_sessions (
    booking_id, pet_id, owner_user_id, provider_id, staff_user_id,
    status, started_at, pickup_lat, pickup_lng, credit_pack_id
  ) values (
    p_booking_id, p_pet_id, v_owner_id, p_provider_id, current_app_user_id(),
    'in_progress', now(), p_pickup_lat, p_pickup_lng, v_pack_id
  )
  returning id into v_session_id;

  return v_session_id;
end;
$$;

grant execute on function app_redeem_walk_credit(integer, integer, numeric, numeric, integer) to pawpi_app;
