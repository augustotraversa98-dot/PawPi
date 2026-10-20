-- Verification for migration 0124 (providers become SEED + CLAIM directory rows). Run in the Supabase SQL
-- editor AFTER applying 0124. EVERY row should read PASS.
--
-- This checks the SCHEMA and the system account only. It does not count loaded directory rows (the
-- loader supabase/seed/directory/load_master.mjs is a separate, later step).
with checks as (
  select 1 as ord, 'providers has the 5 claim/provenance columns' as check_name,
         coalesce(string_agg(column_name, ',' order by column_name), '(none)') as detail,
         case when count(*) = 5 then 'PASS' else 'FAIL' end as status
  from information_schema.columns
  where table_schema = 'public' and table_name = 'providers'
    and column_name in ('source', 'external_source', 'external_id', 'claim_status', 'claimed_at')

  union all
  select 2, 'claim_status defaults to claimed and is NOT NULL (every pre-existing row stays claimed)',
         'default=' || coalesce(column_default, '(none)') || ' nullable=' || is_nullable,
         case when column_default like '%claimed%' and is_nullable = 'NO' then 'PASS' else 'FAIL' end
  from information_schema.columns
  where table_schema = 'public' and table_name = 'providers' and column_name = 'claim_status'

  union all
  select 3, 'no provider row has a NULL claim_status / source',
         (select count(*)::text from providers where claim_status is null or source is null) || ' bad row(s)',
         case when (select count(*) from providers where claim_status is null or source is null) = 0
              then 'PASS' else 'FAIL' end

  union all
  select 4, 'CHECK constraints providers_source_check and providers_claim_status_check present',
         coalesce(string_agg(conname, ',' order by conname), '(none)'),
         case when count(*) = 2 then 'PASS' else 'FAIL' end
  from pg_constraint
  where conrelid = 'public.providers'::regclass and contype = 'c'
    and conname in ('providers_source_check', 'providers_claim_status_check')

  union all
  select 5, 'partial UNIQUE index providers_external_key on (external_source, external_id)',
         coalesce(max(indexdef), '(absent)'),
         case when count(*) = 1 and max(indexdef) like 'CREATE UNIQUE INDEX%' and max(indexdef) like '%WHERE%'
              then 'PASS' else 'FAIL' end
  from pg_indexes
  where schemaname = 'public' and tablename = 'providers' and indexname = 'providers_external_key'

  union all
  select 6, 'provider_locations.pet_policy column present',
         count(*)::text || ' / 1',
         case when count(*) = 1 then 'PASS' else 'FAIL' end
  from information_schema.columns
  where table_schema = 'public' and table_name = 'provider_locations' and column_name = 'pet_policy'

  union all
  select 7, 'system PawPi Directory profile exists (username pawpi_directory, role admin)',
         coalesce(max(id::text || ' / ' || role), '(absent)'),
         case when count(*) = 1 and max(role) = 'admin' then 'PASS' else 'FAIL' end
  from user_profiles where username = 'pawpi_directory'

  union all
  select 8, 'system profile is linked to its auth_users row',
         coalesce(max(a.email), '(absent)'),
         case when count(*) = 1 then 'PASS' else 'FAIL' end
  from user_profiles up join auth_users a on a.id = up.auth_user_id
  where up.username = 'pawpi_directory'
)
select ord, check_name, detail, status from checks order by ord;
