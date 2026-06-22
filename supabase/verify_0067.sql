-- Verification for migration 0067 (legal_consents — Terms/Privacy consent ledger).
-- Run in the Supabase SQL editor AFTER applying 0067. EVERY row should read PASS.
with checks as (
  -- 1. table exists
  select 1 as ord,
         'table present: legal_consents' as check_name,
         (count(*))::text as detail,
         case when count(*)=1 then 'PASS' else 'FAIL' end as status
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relname='legal_consents'

  union all
  -- 2. RLS enabled + FORCED
  select 2,
         'RLS on+forced: legal_consents',
         (c.relrowsecurity and c.relforcerowsecurity)::text,
         case when c.relrowsecurity and c.relforcerowsecurity then 'PASS' else 'FAIL' end
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relname='legal_consents'

  union all
  -- 3. exactly 1 policy (admin SELECT; writes via DEFINER only, append-only = no upd/del)
  select 3,
         'policies: legal_consents (expect 1: select)',
         count(*)::text||' / 1 cmds='||coalesce(string_agg(distinct cmd, ','),'(none)'),
         case when count(*)=1 then 'PASS' else 'FAIL' end
  from pg_policies where schemaname='public' and tablename='legal_consents'

  union all
  -- 4. expected columns present (8)
  select 4,
         'legal_consents columns present (expect 8)',
         count(*)::text||' / 8',
         case when count(*)=8 then 'PASS' else 'FAIL' end
  from information_schema.columns
  where table_schema='public' and table_name='legal_consents'
    and column_name in ('id','auth_user_id','terms_version','privacy_version',
                        'source','user_agent','accepted_at','created_at')

  union all
  -- 5. auth_user_id FK → auth_users with ON DELETE CASCADE
  select 5,
         'legal_consents.auth_user_id FK → auth_users (cascade)',
         coalesce(string_agg(con.confdeltype, ','),'(none)'),
         case when bool_or(con.confdeltype='c') then 'PASS' else 'FAIL' end
  from pg_constraint con
  join pg_class c on c.oid=con.conrelid and c.relname='legal_consents'
  join pg_class f on f.oid=con.confrelid and f.relname='auth_users'
  where con.contype='f'

  union all
  -- 6. the SECURITY DEFINER helper exists and prosecdef=true
  select 6,
         'SECURITY DEFINER fn: app_record_consent',
         coalesce('prosecdef='||bool_or(p.prosecdef)::text, 'MISSING'),
         case when bool_or(p.prosecdef) then 'PASS' else 'FAIL' end
  from pg_proc p
  where p.proname='app_record_consent'
    and p.pronamespace=(select oid from pg_namespace where nspname='public')

  union all
  -- 7. pawpi_app has EXECUTE on the helper
  select 7,
         'pawpi_app EXECUTE on app_record_consent',
         has_function_privilege('pawpi_app', p.oid, 'EXECUTE')::text,
         case when has_function_privilege('pawpi_app', p.oid, 'EXECUTE') then 'PASS' else 'FAIL' end
  from pg_proc p
  where p.proname='app_record_consent'
    and p.pronamespace=(select oid from pg_namespace where nspname='public')

  union all
  -- 8. pawpi_app has SELECT + INSERT on the table (rides 0019's blanket + default privileges;
  --    RLS — not a missing grant — is what denies the direct path)
  select 8,
         'pawpi_app SELECT/INSERT on legal_consents',
         (has_table_privilege('pawpi_app','public.legal_consents','SELECT')
            and has_table_privilege('pawpi_app','public.legal_consents','INSERT'))::text,
         case when has_table_privilege('pawpi_app','public.legal_consents','SELECT')
               and has_table_privilege('pawpi_app','public.legal_consents','INSERT') then 'PASS' else 'FAIL' end
)
select check_name, detail, status from checks order by ord, check_name;
