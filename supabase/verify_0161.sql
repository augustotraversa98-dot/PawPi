-- Verification for migration 0161 (family members follow as the shared dog). Run in the Supabase SQL editor AFTER applying
-- 0161. EVERY row should read PASS (4 rows). Read-only (catalog queries only).
with
pol as (
  select policyname, cmd, permissive, coalesce(qual, '') as qual, coalesce(with_check, '') as with_check
  from pg_policies where schemaname = 'public' and tablename = 'pet_follows'
),
checks as (
  select 1 as ord, 'a family member of the follower dog may insert a follow, and nothing else is accepted by that rule' as check_name,
         coalesce((select cmd || ' check=' || with_check from pol where policyname = 'pet_follows_family_insert'), '(missing)') as detail,
         case when exists (select 1 from pol where policyname = 'pet_follows_family_insert' and cmd = 'INSERT'
                             and with_check = 'app_user_has_pet_family(follower_pet_id)')
              then 'PASS' else 'FAIL' end as status

  union all
  select 2, 'a family member of the follower dog may delete its follow, and nothing else is accepted by that rule',
         coalesce((select cmd || ' using=' || qual from pol where policyname = 'pet_follows_family_delete'), '(missing)'),
         case when exists (select 1 from pol where policyname = 'pet_follows_family_delete' and cmd = 'DELETE'
                             and qual = 'app_user_has_pet_family(follower_pet_id)')
              then 'PASS' else 'FAIL' end

  union all
  select 3, 'row security is forced and the table has exactly these four rules',
         coalesce((select string_agg(policyname || ':' || cmd, ' ' order by policyname) from pol), '(none)'),
         case when (select string_agg(policyname || ':' || cmd, ' ' order by policyname) from pol) =
                   'pet_follows_authed_read:SELECT pet_follows_family_delete:DELETE pet_follows_family_insert:INSERT pet_follows_owner_write:ALL'
                and exists (select 1 from pg_class where oid = to_regclass('public.pet_follows') and relrowsecurity and relforcerowsecurity)
              then 'PASS' else 'FAIL' end

  union all
  select 4, 'family means an active, unexpired family grant of the signed-in person',
         coalesce((select left(prosrc, 160) from pg_proc where oid = to_regprocedure('public.app_user_has_pet_family(integer)')), '(missing)'),
         case when exists (select 1 from pg_proc where oid = to_regprocedure('public.app_user_has_pet_family(integer)')
                             and prosecdef and array_to_string(proconfig, ',') like 'search_path=%pg_temp%'
                             and prosrc like '%g.grantee_user_id = current_app_user_id()%'
                             and prosrc like '%g.role = ''family''%'
                             and prosrc like '%g.status = ''active''%'
                             and prosrc like '%g.expires_at is null or g.expires_at > now()%')
              then 'PASS' else 'FAIL' end
)
select ord, check_name, detail, status from checks order by ord;
