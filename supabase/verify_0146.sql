-- Verification for migration 0146 (emergency finder contact). Run in the Supabase SQL editor AFTER applying 0146.
-- EVERY row should read PASS. Read-only (catalog queries only).
with
fn as (
  select p.oid, p.proname, p.prosecdef, p.prosrc, p.proowner,
         pg_get_function_identity_arguments(p.oid) as args,
         coalesce(array_to_string(p.proconfig, ','), '(none)') as config,
         exists (
           select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
           where a.privilege_type = 'EXECUTE'
             and (a.grantee = 0 or a.grantee in (select oid from pg_roles where rolname in ('anon', 'authenticated')))
         ) as exposed,
         has_function_privilege('pawpi_app', p.oid, 'EXECUTE') as app_can
  from pg_proc p
  where p.pronamespace = 'public'::regnamespace
    and p.proname in ('app_emergency_finder_message', 'app_emergency_card_json', 'app_emergency_relay_contact')
),
finder as (select * from fn where proname = 'app_emergency_finder_message'),
assembler as (select * from fn where proname = 'app_emergency_card_json'),
checks as (
  select 1 as ord, 'notifications.finder_contact exists (jsonb)' as check_name,
         coalesce((select data_type from information_schema.columns
                   where table_schema = 'public' and table_name = 'notifications' and column_name = 'finder_contact'), '(missing)') as detail,
         case when exists (select 1 from information_schema.columns
                           where table_schema = 'public' and table_name = 'notifications' and column_name = 'finder_contact' and data_type = 'jsonb')
              then 'PASS' else 'FAIL' end as status

  union all
  select 2, 'app_emergency_finder_message exists once, with 5 text arguments',
         coalesce((select string_agg(args, ' | ') from finder), '(missing)'),
         case when (select count(*) from finder) = 1
                and (select args from finder limit 1) = 'p_tag_token text, p_message text, p_finder_name text, p_finder_phone text, p_finder_email text'
              then 'PASS' else 'FAIL' end

  union all
  select 3, 'it is SECURITY DEFINER with a pinned search_path',
         coalesce((select 'secdef=' || prosecdef::text || ' config=' || config from finder limit 1), '(missing)'),
         case when exists (select 1 from finder where prosecdef and config like 'search_path=%') then 'PASS' else 'FAIL' end

  union all
  select 4, 'the app role can run it; PUBLIC / anon / authenticated cannot',
         coalesce((select 'pawpi_app=' || app_can::text || ' exposed=' || exposed::text from finder limit 1), '(missing)'),
         case when exists (select 1 from finder where app_can and not exposed) then 'PASS' else 'FAIL' end

  union all
  select 5, 'its owner bypasses row security (needed to save the finder contact)',
         coalesce((select r.rolname || ' super=' || r.rolsuper::text || ' bypassrls=' || r.rolbypassrls::text
                   from finder f join pg_roles r on r.oid = f.proowner limit 1), '(missing)'),
         case when exists (select 1 from finder f join pg_roles r on r.oid = f.proowner where r.rolsuper or r.rolbypassrls)
              then 'PASS' else 'FAIL' end

  union all
  select 6, 'it only reaches cards that are active and in relay mode, capped per pet per hour',
         coalesce((select 'length=' || length(prosrc)::text from finder limit 1), '(missing)'),
         case when exists (select 1 from finder
                           where prosrc like '%c.active = true%' and prosrc like '%c.contact_mode = ''relay''%' and prosrc like '%v_recent >= 20%')
              then 'PASS' else 'FAIL' end

  union all
  select 7, 'card assembler: one version, DEFINER, pinned, not exposed to PUBLIC / anon / authenticated',
         coalesce((select string_agg('secdef=' || prosecdef::text || ' config=' || config || ' exposed=' || exposed::text, ' | ') from assembler), '(missing)'),
         case when (select count(*) from assembler) = 1
                and exists (select 1 from assembler where prosecdef and config like 'search_path=%' and not exposed)
              then 'PASS' else 'FAIL' end

  union all
  select 8, 'card assembler publishes a phone / email only when it matches the chosen mode',
         'guard present = ' || coalesce((select (prosrc like '%position(''@'' in c.contact_value) = 0%')::text from assembler limit 1), 'false'),
         case when exists (select 1 from assembler
                           where prosrc like '%c.contact_mode = ''phone'' and position(''@'' in c.contact_value) = 0%'
                             and prosrc like '%c.contact_mode = ''email'' and position(''@'' in c.contact_value) > 0%')
              then 'PASS' else 'FAIL' end

  union all
  select 9, 'public TAG still excludes vet / emergency-contact details (0122 intact)',
         'tag branch length = ' || coalesce((select length(substring(prosrc from 'p_medical_scope = ''tag'' then (.*?)else jsonb_build_object'))::text from assembler limit 1), '(not found)'),
         case when exists (
                select 1 from (
                  select substring(prosrc from 'p_medical_scope = ''tag'' then (.*?)else jsonb_build_object') as t from assembler
                ) s
                where s.t is not null and s.t not like '%vet_phone%' and s.t not like '%emergency_contact%'
                  and s.t not like '%extra_notes%' and s.t not like '%primary_vet_name%' and s.t like '%blood_type%')
              then 'PASS' else 'FAIL' end

  union all
  select 10, 'the old relay function is still there for the previous web version',
         coalesce((select args || ' pawpi_app=' || app_can::text from fn where proname = 'app_emergency_relay_contact' limit 1), '(missing)'),
         case when exists (select 1 from fn where proname = 'app_emergency_relay_contact' and args = 'p_tag_token text, p_message text' and app_can and not exposed)
              then 'PASS' else 'FAIL' end

  union all
  select 11, 'notifications still has RLS enabled and forced',
         coalesce((select 'enabled=' || relrowsecurity::text || ' forced=' || relforcerowsecurity::text from pg_class where oid = 'public.notifications'::regclass), '(missing)'),
         case when exists (select 1 from pg_class where oid = 'public.notifications'::regclass and relrowsecurity and relforcerowsecurity) then 'PASS' else 'FAIL' end
)
select ord, check_name, detail, status from checks order by ord;
