-- Verification for migration 0137 (app_pet_ring_segments authorises its caller; sharing audit gap A2).
-- Run in the Supabase SQL editor AFTER applying 0137. EVERY row should read PASS.
-- Read-only: catalog queries plus one call to the function with NO identity in scope (the SQL editor
-- never sets app.current_user_id), which must return zero rows. Safe to run any number of times.
with
fn as (
  select p.oid, p.proowner, p.proacl, p.prosecdef, p.proconfig, pg_get_functiondef(p.oid) as def
  from pg_proc p
  where p.pronamespace = 'public'::regnamespace and p.proname = 'app_pet_ring_segments'
),
anyone as (
  -- With no identity (the editor), the guard must deny EVERY pet: zero rows for the lowest real pet id.
  select count(*)::int as n_rows,
         (select count(*) from pets)::int as n_pets
  from app_pet_ring_segments((select coalesce(min(id), 0) from pets), 'UTC', current_date)
),
checks as (
  select 1 as ord, 'app_pet_ring_segments(integer,text,date) exists exactly once' as check_name,
         (select count(*) from fn)::text || ' found' as detail,
         case when (select count(*) from fn) = 1 then 'PASS' else 'FAIL' end as status

  union all
  select 2, 'it is SECURITY DEFINER and pins search_path = public, pg_temp',
         coalesce(array_to_string(proconfig, ' '), '(none)'),
         case when prosecdef
               and exists (select 1 from unnest(coalesce(proconfig, '{}')) c
                           where replace(c, ' ', '') = 'search_path=public,pg_temp') then 'PASS' else 'FAIL' end
  from fn

  union all
  select 3, 'the body now authorises the caller (owner or active grantee)',
         case when def ilike '%app_owns_pet(p_pet)%' then 'app_owns_pet present' else 'app_owns_pet MISSING' end
         || ' / ' ||
         case when def ilike '%app_user_has_pet_access(p_pet)%' then 'app_user_has_pet_access present' else 'app_user_has_pet_access MISSING' end,
         case when def ilike '%app_owns_pet(p_pet)%' and def ilike '%app_user_has_pet_access(p_pet)%' then 'PASS' else 'FAIL' end
  from fn

  union all
  select 4, 'no identity in scope (SQL editor) gets ZERO rows',
         n_rows::text || ' row(s) returned (' || n_pets::text || ' pet(s) exist)',
         case when n_rows = 0 then 'PASS' else 'FAIL' end
  from anyone

  union all
  select 5, 'pawpi_app can EXECUTE it',
         has_function_privilege('pawpi_app', oid, 'EXECUTE')::text,
         case when has_function_privilege('pawpi_app', oid, 'EXECUTE') then 'PASS' else 'FAIL' end
  from fn

  union all
  select 6, 'PUBLIC has no EXECUTE',
         count(*)::text || ' grant(s)',
         case when (select count(*) from fn) = 1 and count(*) = 0 then 'PASS' else 'FAIL' end
  from fn f
  where exists (select 1 from aclexplode(coalesce(f.proacl, acldefault('f', f.proowner))) a
                where a.grantee = 0 and a.privilege_type = 'EXECUTE')

  union all
  select 7, 'anon / authenticated have no EXECUTE (roles absent = PASS)',
         count(*)::text || ' grant(s)',
         case when (select count(*) from fn) = 1 and count(*) = 0 then 'PASS' else 'FAIL' end
  from fn f
  join pg_roles r on r.rolname in ('anon', 'authenticated')
  where has_function_privilege(r.oid, f.oid, 'EXECUTE')
)
select ord, check_name, detail, status from checks order by ord;
