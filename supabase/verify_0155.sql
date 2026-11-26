-- Verification for migration 0155 (a friend's current streak, read-only function).
-- Run in the Supabase SQL editor AFTER applying 0155. EVERY row should read PASS.
-- Read-only (catalog queries only). Safe to run any number of times.
with
fn as (
  select p.oid, p.prosrc, p.prosecdef, p.proacl, p.provolatile,
         pg_get_function_identity_arguments(p.oid) as args,
         pg_get_function_result(p.oid) as result,
         replace(coalesce((select c from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%'), ''), ' ', '') as sp
  from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'app_friend_streaks'
),
checks as (
  select 1 as ord, 'app_friend_streaks exists once and takes a list of pet ids' as check_name,
         (select count(*) from fn)::text || ' function(s), args=' || coalesce((select args from fn limit 1), '-') as detail,
         case when (select count(*) from fn) = 1 and (select args from fn limit 1) = 'p_pet_ids integer[]' then 'PASS' else 'FAIL' end as status

  union all
  select 2, 'it returns the pet id and the streak number, nothing else',
         coalesce((select result from fn limit 1), '(missing)'),
         case when (select result from fn limit 1) = 'TABLE(pet_id integer, streak integer)' then 'PASS' else 'FAIL' end

  union all
  select 3, 'it is SECURITY DEFINER with a pinned search_path and is read-only (stable)',
         coalesce((select 'definer=' || prosecdef::text || ' volatility=' || provolatile::text || ' ' || sp from fn limit 1), '(missing)'),
         case when exists (select 1 from fn where prosecdef and provolatile = 's' and sp = 'search_path=public,pg_temp') then 'PASS' else 'FAIL' end

  union all
  select 4, 'pawpi_app can execute it; PUBLIC, anon and authenticated cannot',
         coalesce((select 'pawpi_app=' || has_function_privilege('pawpi_app', fn.oid, 'EXECUTE')::text from fn limit 1), '(missing)'),
         case when exists (select 1 from fn
                           where has_function_privilege('pawpi_app', fn.oid, 'EXECUTE')
                             and proacl is not null
                             and not exists (select 1 from aclexplode(proacl) a where a.grantee = 0)
                             and not exists (select 1 from pg_roles r where r.rolname in ('anon', 'authenticated')
                                              and has_function_privilege(r.oid, fn.oid, 'EXECUTE')))
              then 'PASS' else 'FAIL' end

  union all
  select 5, 'the viewer comes from the request identity, blocks are honoured, and only streaks of 7 or more are returned',
         coalesce((select (position('current_app_user_id()' in prosrc) > 0)::text || '/'
                          || (position('app_user_is_blocked' in prosrc) > 0)::text || '/'
                          || (position('current_count >= 7' in prosrc) > 0)::text from fn limit 1), '(missing)'),
         case when exists (select 1 from fn
                           where position('current_app_user_id()' in prosrc) > 0
                             and position('app_user_is_blocked' in prosrc) > 0
                             and position('current_count >= 7' in prosrc) > 0)
              then 'PASS' else 'FAIL' end
)
select check_name, detail, status from checks order by ord;
