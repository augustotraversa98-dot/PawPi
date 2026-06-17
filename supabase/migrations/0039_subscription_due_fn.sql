-- 0039_subscription_due_fn.sql — SECURITY DEFINER enumerator for the shop auto-reorder
-- charger (Phase 2 ticket 2.17). FUNCTION ONLY — NO new table, so there is no RLS-table
-- change and the RLS completeness guard is unaffected (every RLS-on table still has a policy).
--
-- WHY DEFINER: the auto-charge cron (POST /api/payments/subscriptions/run) has NO single
-- owner identity and the due-scan crosses owners, so it cannot read `subscriptions` (owner
-- FOR ALL RLS) under any one caller. This enumerator runs as its privileged owner with a
-- pinned search_path and returns ONLY the minimal due set the cron needs. It mirrors the
-- 0019/0024 helper pattern (DEFINER, STABLE, GRANT EXECUTE to pawpi_app).
--
-- It also surfaces the provider's CONNECTED RAIL (mercadopago preferred, else binance) —
-- reading provider_payment_accounts (provider-admin-only RLS, no owner branch) is otherwise
-- impossible from the owner-scoped charge transaction. It returns WHICH rail is connected,
-- NEVER the token (the token is loaded + decrypted later by loadProviderAccount). This is the
-- one deviation from the ticket's column list, made because an owner-identity cron physically
-- cannot read that admin-only table — documented in the PR.
--
-- READ-ONLY: it only SELECTs subscriptions + provider_payment_accounts. No policy calls it
-- back, so there is no recursion. Re-runnable (create or replace).

create or replace function app_due_subscriptions()
returns table (
  id integer,
  owner_user_id integer,
  provider_id integer,
  product_id integer,
  quantity integer,
  plan text,
  next_charge_at timestamptz,
  connected_rail text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    s.id,
    s.owner_user_id,
    s.provider_id,
    s.product_id,
    s.quantity,
    s.plan,
    s.next_charge_at,
    (
      -- The provider's connected payment rail, mercadopago preferred. NULL when none.
      select ppa.rail
      from provider_payment_accounts ppa
      where ppa.provider_id = s.provider_id
        and ppa.status = 'connected'
      order by case ppa.rail
                 when 'mercadopago' then 0
                 when 'binance' then 1
                 else 2
               end
      limit 1
    ) as connected_rail
  from subscriptions s
  where s.status = 'active'
    and s.product_id is not null
    and s.next_charge_at is not null
    and s.next_charge_at <= now()
$$;

grant execute on function app_due_subscriptions() to pawpi_app;
