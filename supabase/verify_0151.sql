-- Verification for migration 0151 (tag-open counters age out with the finder data).
-- Run in the Supabase SQL editor AFTER applying 0151. EVERY row should read PASS.
-- Read-only (catalog queries and counts only). Safe to run any number of times.
with
fn as (
  select p.oid, p.prosrc, p.prosecdef, p.proacl, p.pronargs,
         replace(coalesce((select c from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%'), ''), ' ', '') as sp
  from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'app_purge_finder_details'
),
checks as (
  select 1 as ord, 'app_purge_finder_details exists once, with no arguments' as check_name,
         (select count(*) from fn)::text || ' function(s), args=' || coalesce((select pronargs::text from fn limit 1), '-') as detail,
         case when (select count(*) from fn) = 1 and (select pronargs from fn) = 0 then 'PASS' else 'FAIL' end as status

  union all
  select 2, 'it is SECURITY DEFINER with a pinned search_path',
         coalesce((select 'definer=' || prosecdef::text || ' ' || sp from fn), '(missing)'),
         case when exists (select 1 from fn where prosecdef and sp = 'search_path=public,pg_temp') then 'PASS' else 'FAIL' end

  union all
  select 3, 'pawpi_app can execute it; PUBLIC, anon and authenticated cannot',
         coalesce((select 'pawpi_app=' || has_function_privilege('pawpi_app', fn.oid, 'EXECUTE')::text from fn), '(missing)'),
         case when exists (select 1 from fn
                           where has_function_privilege('pawpi_app', fn.oid, 'EXECUTE')
                             and proacl is not null
                             and not exists (select 1 from aclexplode(proacl) a where a.grantee = 0)
                             and not exists (select 1 from pg_roles r where r.rolname in ('anon', 'authenticated')
                                              and has_function_privilege(r.oid, fn.oid, 'EXECUTE')))
              then 'PASS' else 'FAIL' end

  union all
  select 4, 'the purge removes tag-open counters (emergency_public_read) as well as the finder-message counters, at 90 days',
         coalesce((select (position('emergency_public_read' in prosrc) > 0)::text || '/' || (position('emergency\_relay%' in prosrc) > 0)::text from fn), '(missing)'),
         case when exists (select 1 from fn
                           where position('emergency\_relay%' in prosrc) > 0
                             and position('bucket = ''emergency_public_read''' in prosrc) > 0
                             and position('interval ''90 days''' in prosrc) > 0
                             and position('type = ''emergency_contact''' in prosrc) > 0)
              then 'PASS' else 'FAIL' end

  union all
  -- DATA check (counts only): no counter older than the retention period is left.
  select 5, 'no tag-open or finder-message counter older than 90 days is left (run select app_purge_finder_details(); once if this is FAIL right after applying)',
         (select count(*) from rate_limit_hits
           where (bucket like 'emergency\_relay%' or bucket = 'emergency_public_read')
             and window_start < now() - interval '90 days')::text || ' overdue row(s)',
         case when not exists (select 1 from rate_limit_hits
                                where (bucket like 'emergency\_relay%' or bucket = 'emergency_public_read')
                                  and window_start < now() - interval '90 days')
              then 'PASS' else 'FAIL' end
)
select check_name, detail, status from checks order by ord;
