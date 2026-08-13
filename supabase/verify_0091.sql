-- Verification for migration 0091 (booking pay_with_credit, ticket B4).
-- Run in the Supabase SQL editor AFTER applying 0091. EVERY row should read PASS.
with checks as (
  select 1 as ord,
         'vet_appointments.pay_with_credit exists' as check_name,
         count(*)::text||' / 1' as detail,
         case when count(*)=1 then 'PASS' else 'FAIL' end as status
  from information_schema.columns
  where table_schema='public' and table_name='vet_appointments' and column_name='pay_with_credit'

  union all
  select 2,
         'pay_with_credit is boolean NOT NULL DEFAULT false',
         'type='||coalesce(data_type,'?')||' nullable='||coalesce(is_nullable,'?')||' default='||coalesce(column_default,'(none)'),
         case when data_type='boolean' and is_nullable='NO' and column_default like 'false%' then 'PASS' else 'FAIL' end
  from information_schema.columns
  where table_schema='public' and table_name='vet_appointments' and column_name='pay_with_credit'
)
select ord, check_name, detail, status from checks order by ord;
