-- Verification for migration 0071 (provider_services.nightly_rate_cents — additive column).
-- Run in the Supabase SQL editor AFTER applying 0071. EVERY row should read PASS.
with checks as (
  select 1 as ord,
         'provider_services.nightly_rate_cents present' as check_name,
         count(*)::text||' / 1' as detail,
         case when count(*)=1 then 'PASS' else 'FAIL' end as status
  from information_schema.columns
  where table_schema='public' and table_name='provider_services'
    and column_name='nightly_rate_cents'

  union all
  select 2,
         'nightly_rate_cents is integer + nullable',
         coalesce(data_type||' / nullable='||is_nullable,'MISSING'),
         case when data_type='integer' and is_nullable='YES' then 'PASS' else 'FAIL' end
  from information_schema.columns
  where table_schema='public' and table_name='provider_services' and column_name='nightly_rate_cents'

  union all
  select 3,
         'CHECK provider_services_nightly_rate_check present (>= 0 or null)',
         coalesce(string_agg(con.conname, ','),'(none)'),
         case when count(*)=1 then 'PASS' else 'FAIL' end
  from pg_constraint con
  join pg_class c on c.oid=con.conrelid and c.relname='provider_services'
  where con.contype='c' and con.conname='provider_services_nightly_rate_check'
)
select ord, check_name, detail, status from checks order by ord;
