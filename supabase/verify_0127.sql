-- Verification for migration 0127 (pawpi_app statement / idle-in-transaction timeouts).
-- Run in the Supabase SQL editor AFTER applying 0127. EVERY row should read PASS.
with cfg as (
  select unnest(rolconfig) as setting from pg_roles where rolname = 'pawpi_app'
),
checks as (
  select 1 as ord, 'pawpi_app statement_timeout = 15s' as check_name,
         coalesce((select setting from cfg where setting like 'statement_timeout=%'), '(unset)') as detail,
         case when exists (select 1 from cfg where setting = 'statement_timeout=15s') then 'PASS' else 'FAIL' end as status
  union all
  select 2, 'pawpi_app idle_in_transaction_session_timeout = 30s',
         coalesce((select setting from cfg where setting like 'idle_in_transaction_session_timeout=%'), '(unset)'),
         case when exists (select 1 from cfg where setting = 'idle_in_transaction_session_timeout=30s') then 'PASS' else 'FAIL' end
)
select ord, check_name, detail, status from checks order by ord;
