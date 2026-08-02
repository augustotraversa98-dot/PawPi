-- Verification for migration 0070 (provider_services.payment_policy — additive column).
-- Run in the Supabase SQL editor AFTER applying 0070. EVERY row should read PASS.
with checks as (
  -- 1. the new column exists
  select 1 as ord,
         'provider_services.payment_policy present' as check_name,
         count(*)::text||' / 1' as detail,
         case when count(*)=1 then 'PASS' else 'FAIL' end as status
  from information_schema.columns
  where table_schema='public' and table_name='provider_services'
    and column_name='payment_policy'

  union all
  -- 2. NOT NULL with a 'none' default (so every existing service is pay-in-person)
  select 2,
         'payment_policy NOT NULL default none',
         coalesce(is_nullable||' / default='||coalesce(column_default,'(none)'), 'MISSING'),
         case when is_nullable='NO' and column_default like '%''none''%' then 'PASS' else 'FAIL' end
  from information_schema.columns
  where table_schema='public' and table_name='provider_services' and column_name='payment_policy'

  union all
  -- 3. the CHECK constraint is present (none/deposit/full)
  select 3,
         'CHECK provider_services_payment_policy_check present',
         coalesce(string_agg(con.conname, ','),'(none)'),
         case when count(*)=1 then 'PASS' else 'FAIL' end
  from pg_constraint con
  join pg_class c on c.oid=con.conrelid and c.relname='provider_services'
  where con.contype='c' and con.conname='provider_services_payment_policy_check'

  union all
  -- 4. every existing row defaulted to 'none' (no accidental up-front charges on legacy services)
  select 4,
         'all existing services default to none',
         count(*) filter (where payment_policy <> 'none')::text||' non-none rows',
         case when count(*) filter (where payment_policy is null) = 0 then 'PASS' else 'FAIL' end
  from provider_services
)
select ord, check_name, detail, status from checks order by ord;
