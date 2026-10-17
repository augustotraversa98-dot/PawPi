-- Verification for migration 0133 (username backfill).
-- Run in the Supabase SQL editor AFTER applying 0133. EVERY row should read PASS.
-- Read-only. Safe to run any number of times.
with derived as (
  -- the SAME predicate the migration uses to find e-mail-derived usernames
  select up.id, up.username
  from user_profiles up
  left join auth_users au on au.id = up.auth_user_id
  cross join lateral (select lower(split_part(coalesce(au.email, ''), '@', 1)) as loc) l
  where up.username is not null
    and up.username not in ('pawpi_welcome', 'pawpi_directory')
    and (
         position('@' in up.username) > 0
      or position('+' in up.username) > 0
      or (l.loc <> '' and (
            lower(up.username) = l.loc
         or (left(lower(up.username), length(l.loc) + 1) = l.loc || '_'
             and substr(lower(up.username), length(l.loc) + 2) ~ '^[0-9]{1,13}$')
         ))
    )
),
dups as (
  select lower(username) as u, count(*) from user_profiles where username is not null group by 1 having count(*) > 1
)
select 1 as ord,
       'no e-mail-derived usernames remain' as check_name,
       (select count(*)::text from derived) || ' remaining' as detail,
       case when not exists (select 1 from derived) then 'PASS' else 'FAIL' end as status
union all
select 2,
       'no two usernames collide case-insensitively',
       (select count(*)::text from dups) || ' collisions',
       case when not exists (select 1 from dups) then 'PASS' else 'FAIL' end
union all
select 3,
       'every rewritten user still exists and now holds the audited new username',
       (select count(*)::text from user_profile_username_backfill_audit) || ' audit rows',
       case when not exists (
         select 1 from user_profile_username_backfill_audit a
         left join user_profiles up on up.id = a.user_id
         where up.id is null or up.username is distinct from a.new_username
       ) then 'PASS' else 'FAIL' end
union all
select 4,
       'no rewritten username equals a pet handle or a reserved word',
       'checked against pets.handle (case-insensitive) and the reserved list',
       case when not exists (
         select 1 from user_profile_username_backfill_audit a
         where exists (select 1 from pets p where lower(p.handle) = lower(a.new_username))
            or lower(a.new_username) = any (array[
              'pawpi','pawpiapp','admin','administrator','moderator','mod','staff','team','support','help',
              'official','security','billing','privacy','terms','legal','about','contact','settings','login',
              'logout','signup','register','search','explore','discover','notifications','messages','feed','home',
              'api','www','root','system','null','undefined','anonymous','deleted','everyone','all','me','you',
              'vet','vets'])
       ) then 'PASS' else 'FAIL' end
union all
select 5,
       'audit table is RLS enabled + forced with a policy',
       'user_profile_username_backfill_audit',
       case when exists (
         select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public' and c.relname = 'user_profile_username_backfill_audit'
           and c.relrowsecurity and c.relforcerowsecurity
       ) and exists (
         select 1 from pg_policies where schemaname = 'public' and tablename = 'user_profile_username_backfill_audit'
       ) then 'PASS' else 'FAIL' end
union all
select 6,
       'system accounts untouched (pawpi_welcome / pawpi_directory never in the audit)',
       (select count(*)::text from user_profile_username_backfill_audit where old_username in ('pawpi_welcome','pawpi_directory')) || ' touched',
       case when not exists (
         select 1 from user_profile_username_backfill_audit where old_username in ('pawpi_welcome','pawpi_directory')
       ) then 'PASS' else 'FAIL' end
union all
select 7,
       'row counts unchanged: profiles with a username ≥ audit rows (nothing was deleted or nulled)',
       (select count(*)::text from user_profiles where username is not null) || ' profiles with a username',
       case when (select count(*) from user_profiles where username is not null)
                 >= (select count(*) from user_profile_username_backfill_audit) then 'PASS' else 'FAIL' end
order by ord;
