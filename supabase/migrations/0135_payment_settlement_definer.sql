-- 0135_payment_settlement_definer.sql
-- Payment settlement (docs/qa/flow-matrix-2026-10-17.md F3-01, with the F3-03 monotonic guard inside).
--
-- ⚠️ HAND-APPLY AFTER REVIEW, BEFORE ANY REAL MERCADOPAGO CHARGE
--    (docs/db-migration-runbook-0135-payment-settlement.md). Human-applied: ships supabase/verify_0135.sql
--    (every row must read PASS). Adds two SECURITY DEFINER functions only: no table, no policy, no data change,
--    nothing revoked from anything the app uses. Idempotent (create or replace + guarded revokes).
--
-- THE BUG. The MercadoPago webhook is called by MercadoPago, not by a logged-in user, so its DB session has NO
-- request identity: `current_app_user_id()` is NULL. `payments` and `orders` are ENABLE + FORCE ROW LEVEL SECURITY
-- (0029) and the app connects as `pawpi_app` (NOBYPASSRLS), so with no identity BOTH tables read as EMPTY. The
-- webhook therefore could never find the payment: it answered 200 "ignored / unknown_reference" while the order
-- stayed `pending` forever, stock was never decremented, walk credits were never granted and the provider's
-- PATCH confirm always 409'd "unpaid". A real payment could be TAKEN and never settled.
--
-- THE FIX (same posture as app_adjust_order_stock 0037 / app_grant_walk_credits 0089 / app_get_provider_payment_account
-- 0072): two narrow SECURITY DEFINER functions the trusted payment layer calls. They run as the function owner (RLS
-- bypassed for exactly these statements), pin search_path, and are executable ONLY by pawpi_app.
--
--   app_payment_for_webhook(p_ref text)
--       Finds ONE payment row by the reference a rail's notification carries and returns just what the webhook
--       needs (ids, rail, status, the paying provider). Matches, in priority order: payments.external_id, then
--       payments.idempotency_key, then the ORDER id (the reference PawPi puts in MercadoPago's
--       `external_reference`). Read-only; returns zero rows for an unknown reference.
--
--   app_apply_payment_status(p_payment_id int, p_status text, p_raw text)
--       Atomically (one statement = one transaction, row-locked) flips the payment AND its order and runs the
--       once-only side effects. MONOTONIC (F3-03): `refunded` is terminal; `approved` can only become `refunded`;
--       a repeated status is a no-op. Side effects fire only on a REAL order transition, so a duplicate or
--       re-ordered notification can never double-handle them:
--           product order     paid     -> stock decremented ONCE  (app_adjust_order_stock -1)
--                             refunded -> restocked ONCE, and only if it had actually been paid
--           walk_package      paid     -> prepaid walk credits granted ONCE (app_grant_walk_credits is itself idempotent)
--           booking           paid     -> the linked booking is CONFIRMED when its provider opted in to
--                                         auto-confirm (0079 left such bookings 'requested' "until payment clears")
--       Returns one row describing what happened (applied = false when the guard or idempotency skipped it), or
--       zero rows when the payment does not exist.
--
-- It does NOT change commission logic, OAuth, or any RLS policy. The identity-ful paths (provider refund, status
-- reconcile) call the same function, so there is exactly one implementation of the status machine.

-- ── 1. app_payment_for_webhook ───────────────────────────────────────────────
create or replace function app_payment_for_webhook(p_ref text)
returns table (
  id           integer,
  order_id     integer,
  provider_id  integer,
  rail         text,
  status       text,
  external_id  text,
  amount_cents integer
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.id, p.order_id, o.provider_id, p.rail, p.status, p.external_id, p.amount_cents
  from payments p
  join orders o on o.id = p.order_id
  where p_ref is not null
    and length(p_ref) between 1 and 200
    and (
         p.external_id = p_ref
      or p.idempotency_key = p_ref
      -- the ORDER id (MercadoPago's external_reference). CASE guarantees the cast only runs on digits.
      or p.order_id = case when p_ref ~ '^[0-9]{1,9}$' then p_ref::integer end
    )
  order by
    case when p.external_id = p_ref then 0 when p.idempotency_key = p_ref then 1 else 2 end,
    p.id desc
  limit 1
$$;

revoke execute on function app_payment_for_webhook(text) from public;
do $$
declare r text;
begin
  -- REVOKE from a role that does not exist is a hard error; the integration harness has no anon/authenticated.
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke execute on function app_payment_for_webhook(text) from %I', r);
    end if;
  end loop;
end
$$;
grant execute on function app_payment_for_webhook(text) to pawpi_app;

-- ── 2. app_apply_payment_status ──────────────────────────────────────────────
create or replace function app_apply_payment_status(
  p_payment_id integer,
  p_status     text,
  p_raw        text
)
returns table (
  applied               boolean,
  out_order_id          integer,
  out_order_kind        text,
  prev_payment_status   text,
  new_payment_status    text,
  prev_order_status     text,
  new_order_status      text,
  confirmed_booking_ids integer[]
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_pay       payments%rowtype;
  v_ord       orders%rowtype;
  v_target    text;
  v_confirmed integer[] := '{}';
begin
  if p_status is null or p_status not in ('pending', 'approved', 'refunded', 'failed') then
    raise exception 'app_apply_payment_status: invalid status %', p_status using errcode = '22023';
  end if;

  -- Lock payment then order (always this order) so two concurrent deliveries of the same event serialise:
  -- the second sees the first's committed state and takes the no-op branch below.
  select * into v_pay from payments where id = p_payment_id for update;
  if not found then
    return;
  end if;
  select * into v_ord from orders where id = v_pay.order_id for update;

  -- MONOTONIC GUARD (F3-03). refunded is terminal; approved may only move to refunded; a repeated status is a
  -- no-op (idempotent redelivery). Everything else — approved->pending/failed (late or unknown events),
  -- refunded->anything — is ignored instead of regressing the ledger.
  if v_pay.status = p_status
     or v_pay.status = 'refunded'
     or (v_pay.status = 'approved' and p_status <> 'refunded') then
    return query select
      false, v_ord.id, v_ord.kind, v_pay.status, v_pay.status, v_ord.status, v_ord.status, v_confirmed;
    return;
  end if;

  update payments
  set status = p_status, raw_status = p_raw, updated_at = now()
  where id = v_pay.id;

  -- The order mirrors the payment, with its own monotonic guard (an order can have several payment rows).
  v_target := case p_status
                when 'approved' then 'paid'
                when 'refunded' then 'refunded'
                when 'failed'   then 'failed'
                else null
              end;
  if v_ord.status = 'refunded'
     or (v_ord.status = 'paid' and v_target is distinct from 'refunded') then
    v_target := null;
  end if;

  if v_target is not null and v_target <> v_ord.status then
    update orders set status = v_target, updated_at = now() where id = v_ord.id;

    -- Once-only side effects, on the REAL transition only.
    if v_ord.kind = 'product' then
      if v_target = 'paid' then
        perform app_adjust_order_stock(v_ord.id, -1);
      elsif v_target = 'refunded' and v_ord.status = 'paid' then
        -- restock only what was actually decremented: a never-paid order has nothing to give back
        perform app_adjust_order_stock(v_ord.id, 1);
      end if;
    elsif v_ord.kind = 'walk_package' and v_target = 'paid' then
      perform app_grant_walk_credits(v_ord.id);   -- idempotent on order_id
    elsif v_ord.kind = 'booking' and v_target = 'paid' then
      with confirmed as (
        update vet_appointments va
        set booking_status = 'confirmed', updated_at = now()
        from providers pr
        where va.order_id = v_ord.id
          and pr.id = va.provider_id
          and pr.auto_confirm_bookings
          and va.booking_status = 'requested'
          and va.status = 'scheduled'
          and va.deleted_at is null
        returning va.id
      )
      select coalesce(array_agg(c.id), '{}') into v_confirmed from confirmed c;
    end if;
  end if;

  return query select
    true, v_ord.id, v_ord.kind, v_pay.status, p_status, v_ord.status,
    coalesce(v_target, v_ord.status), v_confirmed;
end;
$$;

revoke execute on function app_apply_payment_status(integer, text, text) from public;
do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke execute on function app_apply_payment_status(integer, text, text) from %I', r);
    end if;
  end loop;
end
$$;
grant execute on function app_apply_payment_status(integer, text, text) to pawpi_app;
