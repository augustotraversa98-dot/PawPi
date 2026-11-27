-- 0163_money_bigint.sql
--
-- Prices are stored in cents. As integer columns they stopped at $21.474.836,47; in pesos a real price can pass that
-- (owner decision 2026-11-27). Every cents column becomes bigint. The app's own limit is $999.999.999.999,99
-- (apps/web/src/lib/decimal.js MAX_PRICE_CENTS).
--
-- ⚠️ DEPLOY THE SERVER FIRST. utils/sql.js must already read bigint as a number: an older server would receive these
-- prices as text. Hand-applied; run supabase/verify_0163.sql afterwards (every row PASS). Safe to run again.
--
-- The two insurance_policies owner rules name premium_cents, so Postgres requires dropping them around the change; they
-- are recreated exactly as in 0058, in the same transaction. app_payment_for_webhook returns the amount, so it is
-- recreated with the wider type (same body, same grants).

drop policy if exists insurance_policies_owner_insert on insurance_policies;
drop policy if exists insurance_policies_owner_update on insurance_policies;

alter table adoptable_listings    alter column adoption_fee_cents type bigint;
alter table insurance_policies    alter column premium_cents      type bigint;
alter table order_items           alter column unit_cents         type bigint;
alter table orders                alter column amount_cents       type bigint;
alter table payments              alter column amount_cents       type bigint,
                                  alter column commission_cents   type bigint;
alter table payouts               alter column amount_cents       type bigint;
alter table provider_services     alter column price_cents        type bigint,
                                  alter column deposit_cents      type bigint,
                                  alter column nightly_rate_cents type bigint;
alter table rx_fulfillment_orders alter column price_cents        type bigint;
alter table shop_products         alter column price_cents        type bigint,
                                  alter column compare_at_cents   type bigint;
alter table walk_packages         alter column price_cents        type bigint;

create policy insurance_policies_owner_insert on insurance_policies
  for insert
  with check (
    owner_user_id = current_app_user_id()
    and status = 'application'
    and policy_number is null
    and premium_cents is null
  );

create policy insurance_policies_owner_update on insurance_policies
  for update
  using (owner_user_id = current_app_user_id())
  with check (
    owner_user_id = current_app_user_id()
    and status = any (array['application','cancelled']::text[])
    and (
      status = 'cancelled'
      or (policy_number is null and premium_cents is null)
    )
  );

-- A function's return type cannot be replaced in place.
drop function if exists app_payment_for_webhook(text);
create function app_payment_for_webhook(p_ref text)
returns table (
  id           integer,
  order_id     integer,
  provider_id  integer,
  rail         text,
  status       text,
  external_id  text,
  amount_cents bigint
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
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke execute on function app_payment_for_webhook(text) from %I', r);
    end if;
  end loop;
end
$$;
grant execute on function app_payment_for_webhook(text) to pawpi_app;
