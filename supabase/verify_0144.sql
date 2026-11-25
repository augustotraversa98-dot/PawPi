-- Verification for migration 0144 (who logged each health entry). Run in the Supabase SQL editor AFTER applying 0144.
-- EVERY row should read PASS. Read-only (catalog queries only).
with
t(name) as (
  values
    ('health_food_logs'),
    ('health_general_checks'),
    ('health_medical_care_logs'),
    ('health_mobility_logs'),
    ('health_pee_logs'),
    ('health_photo_checks'),
    ('health_poo_logs'),
    ('health_vomit_logs'),
    ('health_walk_logs'),
    ('health_weight_logs'),
    ('health_wellness_logs')
),
fn as (select p.oid, p.prosecdef, p.proconfig, p.proacl, p.proowner, pg_get_functiondef(p.oid) as def from pg_proc p
       where p.pronamespace = 'public'::regnamespace and p.proname = 'app_stamp_logged_by'),
checks as (
  select 1 as ord, 'all 11 log tables have logged_by_user_id (integer, nullable)' as check_name,
         (select count(*) from t join information_schema.columns c on c.table_schema = 'public' and c.table_name = t.name
            and c.column_name = 'logged_by_user_id' and c.data_type = 'integer' and c.is_nullable = 'YES')::text || ' / 11' as detail,
         case when (select count(*) from t join information_schema.columns c on c.table_schema = 'public' and c.table_name = t.name
            and c.column_name = 'logged_by_user_id' and c.data_type = 'integer' and c.is_nullable = 'YES') = 11 then 'PASS' else 'FAIL' end as status

  union all
  select 2, 'all 11 have logged_by_known (boolean, not null, default false)',
         (select count(*) from t join information_schema.columns c on c.table_schema = 'public' and c.table_name = t.name
            and c.column_name = 'logged_by_known' and c.data_type = 'boolean' and c.is_nullable = 'NO' and c.column_default = 'false')::text || ' / 11',
         case when (select count(*) from t join information_schema.columns c on c.table_schema = 'public' and c.table_name = t.name
            and c.column_name = 'logged_by_known' and c.data_type = 'boolean' and c.is_nullable = 'NO' and c.column_default = 'false') = 11 then 'PASS' else 'FAIL' end

  union all
  select 3, 'each logged_by_user_id references user_profiles with ON DELETE SET NULL',
         (select count(*) from t join pg_constraint k on k.conrelid = ('public.' || t.name)::regclass and k.contype = 'f'
            and k.confrelid = 'public.user_profiles'::regclass and k.confdeltype = 'n'
            and pg_get_constraintdef(k.oid) like 'FOREIGN KEY (logged_by_user_id)%')::text || ' / 11',
         case when (select count(*) from t join pg_constraint k on k.conrelid = ('public.' || t.name)::regclass and k.contype = 'f'
            and k.confrelid = 'public.user_profiles'::regclass and k.confdeltype = 'n'
            and pg_get_constraintdef(k.oid) like 'FOREIGN KEY (logged_by_user_id)%') = 11 then 'PASS' else 'FAIL' end

  union all
  select 4, 'each table has the stamping trigger, enabled, before insert or update',
         (select count(*) from t join pg_trigger g on g.tgrelid = ('public.' || t.name)::regclass and g.tgname = 'trg_stamp_logged_by' and g.tgenabled = 'O')::text || ' / 11',
         case when (select count(*) from t join pg_trigger g on g.tgrelid = ('public.' || t.name)::regclass and g.tgname = 'trg_stamp_logged_by'
                    and g.tgenabled = 'O' and pg_get_triggerdef(g.oid) ilike '%BEFORE INSERT OR UPDATE%') = 11 then 'PASS' else 'FAIL' end

  union all
  select 5, 'every log table still has RLS enabled and forced',
         (select count(*) from t join pg_class c on c.oid = ('public.' || t.name)::regclass and c.relrowsecurity and c.relforcerowsecurity)::text || ' / 11',
         case when (select count(*) from t join pg_class c on c.oid = ('public.' || t.name)::regclass and c.relrowsecurity and c.relforcerowsecurity) = 11 then 'PASS' else 'FAIL' end

  union all
  select 6, 'app_stamp_logged_by is SECURITY INVOKER, pins search_path and stamps the request identity',
         (select count(*) from fn)::text || ' / 1',
         case when (select count(*) from fn) = 1 and (select bool_and(not prosecdef and def ilike '%current_app_user_id()%'
                    and exists (select 1 from unnest(coalesce(proconfig, '{}')) c where replace(c, ' ', '') = 'search_path=public,pg_temp')) from fn)
              then 'PASS' else 'FAIL' end

  union all
  select 7, 'pawpi_app can EXECUTE it; PUBLIC / anon / authenticated cannot',
         coalesce((select has_function_privilege('pawpi_app', oid, 'EXECUTE')::text from fn), '(missing)'),
         case when (select count(*) from fn) = 1
               and (select bool_and(has_function_privilege('pawpi_app', oid, 'EXECUTE')) from fn)
               and not exists (select 1 from fn f where exists (select 1 from aclexplode(coalesce(f.proacl, acldefault('f', f.proowner))) a where a.grantee = 0 and a.privilege_type = 'EXECUTE'))
               and not exists (select 1 from fn f join pg_roles r on r.rolname in ('anon', 'authenticated') where has_function_privilege(r.oid, f.oid, 'EXECUTE'))
              then 'PASS' else 'FAIL' end
)
select ord, check_name, detail, status from checks order by ord;
