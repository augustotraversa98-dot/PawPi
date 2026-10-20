-- Verification for migration 0125 (provider_claims + app_claim_provider). Run in the Supabase SQL editor
-- AFTER applying 0125 (and 0124). EVERY row should read PASS.
with checks as (
  select 1 as ord, 'provider_claims table exists with RLS ENABLE + FORCE' as check_name,
         coalesce('enabled=' || relrowsecurity::text || ' forced=' || relforcerowsecurity::text, '(absent)') as detail,
         case when coalesce(relrowsecurity and relforcerowsecurity, false) then 'PASS' else 'FAIL' end as status
  from (select 1) x
  left join pg_class c on c.oid = to_regclass('public.provider_claims')

  union all
  select 2, 'policies: SELECT + INSERT + UPDATE present, NO DELETE (withdrawals are soft)',
         coalesce(string_agg(cmd, ',' order by cmd), '(none)'),
         case when count(*) filter (where cmd = 'SELECT') = 1
               and count(*) filter (where cmd = 'INSERT') = 1
               and count(*) filter (where cmd = 'UPDATE') = 1
               and count(*) filter (where cmd = 'DELETE') = 0
              then 'PASS' else 'FAIL' end
  from pg_policies where schemaname = 'public' and tablename = 'provider_claims'

  union all
  select 3, 'INSERT policy only admits an UNCLAIMED listing, as yourself',
         left(coalesce(max(with_check), '(none)'), 120),
         case when max(with_check) like '%unclaimed%' and max(with_check) like '%current_app_user_id%'
              then 'PASS' else 'FAIL' end
  from pg_policies
  where schemaname = 'public' and tablename = 'provider_claims' and cmd = 'INSERT'

  union all
  select 4, 'UNIQUE (provider_id, claimant_user_profile_id) present',
         coalesce(string_agg(conname, ','), '(none)'),
         case when count(*) = 1 then 'PASS' else 'FAIL' end
  from pg_constraint
  where conrelid = to_regclass('public.provider_claims') and contype = 'u'
    and conname = 'provider_claims_provider_claimant_key'

  union all
  select 5, 'status and method CHECKs present',
         count(*)::text || ' check constraint(s)',
         case when count(*) >= 2 then 'PASS' else 'FAIL' end
  from pg_constraint
  where conrelid = to_regclass('public.provider_claims') and contype = 'c'

  union all
  select 6, 'three lookup indexes present',
         coalesce(string_agg(indexname, ',' order by indexname), '(none)'),
         case when count(*) = 3 then 'PASS' else 'FAIL' end
  from pg_indexes
  where schemaname = 'public' and tablename = 'provider_claims'
    and indexname in ('idx_provider_claims_provider', 'idx_provider_claims_claimant', 'idx_provider_claims_status')

  union all
  select 7, 'app_claim_provider(int,int) is SECURITY DEFINER with a pinned search_path',
         'secdef=' || p.prosecdef::text || ' config=' || coalesce(array_to_string(p.proconfig, ','), '(none)'),
         case when p.prosecdef and exists (
                select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')
              then 'PASS' else 'FAIL' end
  from pg_proc p
  where p.pronamespace = 'public'::regnamespace and p.proname = 'app_claim_provider'

  union all
  select 8, 'app_claim_provider EXECUTE granted to pawpi_app',
         has_function_privilege('pawpi_app', p.oid, 'EXECUTE')::text,
         case when has_function_privilege('pawpi_app', p.oid, 'EXECUTE') then 'PASS' else 'FAIL' end
  from pg_proc p
  where p.pronamespace = 'public'::regnamespace and p.proname = 'app_claim_provider'

  union all
  select 9, 'app_claim_provider re-checks the admin inside the function',
         'body mentions "is not an admin" = ' || (p.prosrc like '%is not an admin%')::text,
         case when p.prosrc like '%is not an admin%' then 'PASS' else 'FAIL' end
  from pg_proc p
  where p.pronamespace = 'public'::regnamespace and p.proname = 'app_claim_provider'
)
select ord, check_name, detail, status from checks order by ord;
