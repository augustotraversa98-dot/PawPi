-- Verification for migration 0145 (the dog's owner may delete any daily moment of that dog). Run in the Supabase SQL
-- editor AFTER applying 0145. EVERY row should read PASS. Read-only (catalog queries only).
with
p as (select policyname, cmd, permissive, coalesce(qual, '') as qual, coalesce(with_check, '') as with_check
      from pg_policies where schemaname = 'public' and tablename = 'posts'),
checks as (
  select 1 as ord, 'the new policy exists, for DELETE only' as check_name,
         coalesce((select cmd from p where policyname = 'posts_pet_owner_delete_moment'), '(missing)') as detail,
         case when exists (select 1 from p where policyname = 'posts_pet_owner_delete_moment' and cmd = 'DELETE') then 'PASS' else 'FAIL' end as status

  union all
  select 2, 'it is limited to daily moments of a pet the caller owns',
         coalesce((select qual from p where policyname = 'posts_pet_owner_delete_moment'), '(missing)'),
         case when exists (select 1 from p where policyname = 'posts_pet_owner_delete_moment'
                           and qual ilike '%is_daily_update%' and qual ilike '%app_owns_pet(pet_id)%' and with_check = '') then 'PASS' else 'FAIL' end

  union all
  select 3, 'the author policy is unchanged (ALL, user_id = current user)',
         coalesce((select cmd || ' ' || qual from p where policyname = 'posts_author_all'), '(missing)'),
         case when exists (select 1 from p where policyname = 'posts_author_all' and cmd = 'ALL'
                           and qual ilike '%user_id = current_app_user_id()%' and with_check ilike '%user_id = current_app_user_id()%') then 'PASS' else 'FAIL' end

  union all
  select 4, 'no other policy lets someone else UPDATE or INSERT a post',
         coalesce((select string_agg(policyname || ':' || cmd, ', ' order by policyname) from p where cmd in ('INSERT', 'UPDATE', 'ALL')), '(none)'),
         case when (select string_agg(policyname, ',' order by policyname) from p where cmd in ('INSERT', 'UPDATE', 'ALL')) = 'posts_author_all' then 'PASS' else 'FAIL' end

  union all
  select 5, 'posts still has RLS enabled and forced',
         coalesce((select 'enabled=' || relrowsecurity::text || ' forced=' || relforcerowsecurity::text from pg_class where oid = 'public.posts'::regclass), '(missing)'),
         case when exists (select 1 from pg_class where oid = 'public.posts'::regclass and relrowsecurity and relforcerowsecurity) then 'PASS' else 'FAIL' end
)
select ord, check_name, detail, status from checks order by ord;
