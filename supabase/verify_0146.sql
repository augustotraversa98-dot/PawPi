-- Verification for migration 0146 (emergency finder flow). Run in the Supabase SQL editor AFTER applying 0146.
-- EVERY row should read PASS (19 rows). Read-only (catalog queries only).
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
    and p.proname in ('app_emergency_finder_message', 'app_emergency_card_json', 'app_emergency_relay_contact',
                      'app_emergency_published_contact', 'app_purge_finder_details')
),
finder as (select * from fn where proname = 'app_emergency_finder_message'),
assembler as (select * from fn where proname = 'app_emergency_card_json'),
published as (select * from fn where proname = 'app_emergency_published_contact'),
purge as (select * from fn where proname = 'app_purge_finder_details'),
cols as (
  select table_name, column_name, data_type, is_nullable, column_default
  from information_schema.columns
  where table_schema = 'public' and table_name in ('notifications', 'pet_emergency_cards')
),
checks as (
  select 1 as ord, 'notifications.finder_contact exists (jsonb)' as check_name,
         coalesce((select data_type from cols where table_name = 'notifications' and column_name = 'finder_contact'), '(missing)') as detail,
         case when exists (select 1 from cols where table_name = 'notifications' and column_name = 'finder_contact' and data_type = 'jsonb')
              then 'PASS' else 'FAIL' end as status

  union all
  select 2, 'notifications.finder_urgent exists (boolean)',
         coalesce((select data_type from cols where table_name = 'notifications' and column_name = 'finder_urgent'), '(missing)'),
         case when exists (select 1 from cols where table_name = 'notifications' and column_name = 'finder_urgent' and data_type = 'boolean')
              then 'PASS' else 'FAIL' end

  union all
  select 3, 'emergency contact on the tag is an owner opt-in: boolean, required, default OFF',
         coalesce((select data_type || ' nullable=' || is_nullable || ' default=' || coalesce(column_default, '(none)')
                   from cols where table_name = 'pet_emergency_cards' and column_name = 'show_emergency_contact_on_tag'), '(missing)'),
         case when exists (select 1 from cols where table_name = 'pet_emergency_cards' and column_name = 'show_emergency_contact_on_tag'
                             and data_type = 'boolean' and is_nullable = 'NO' and column_default = 'false')
              then 'PASS' else 'FAIL' end

  union all
  select 4, 'app_emergency_finder_message exists once, with the 6 expected arguments',
         coalesce((select string_agg(args, ' | ') from finder), '(missing)'),
         case when (select count(*) from finder) = 1
                and (select args from finder limit 1) = 'p_tag_token text, p_message text, p_finder_name text, p_finder_phone text, p_finder_email text, p_allow_urgent boolean'
              then 'PASS' else 'FAIL' end

  union all
  select 5, 'it is SECURITY DEFINER with a pinned search_path',
         coalesce((select 'secdef=' || prosecdef::text || ' config=' || config from finder limit 1), '(missing)'),
         case when exists (select 1 from finder where prosecdef and config like 'search_path=%') then 'PASS' else 'FAIL' end

  union all
  select 6, 'the app role can run it; PUBLIC / anon / authenticated cannot',
         coalesce((select 'pawpi_app=' || app_can::text || ' exposed=' || exposed::text from finder limit 1), '(missing)'),
         case when exists (select 1 from finder where app_can and not exposed) then 'PASS' else 'FAIL' end

  union all
  select 7, 'the owners of the writer and the purge bypass row security (needed to save / delete finder details)',
         coalesce((select string_agg(f.proname || ' owner=' || r.rolname || ' super=' || r.rolsuper::text || ' bypassrls=' || r.rolbypassrls::text, ' | ')
                   from fn f join pg_roles r on r.oid = f.proowner
                   where f.proname in ('app_emergency_finder_message', 'app_purge_finder_details')), '(missing)'),
         case when (select count(*) from fn f join pg_roles r on r.oid = f.proowner
                    where f.proname in ('app_emergency_finder_message', 'app_purge_finder_details')
                      and (r.rolsuper or r.rolbypassrls)) = 2
              then 'PASS' else 'FAIL' end

  union all
  select 8, 'it only takes messages for an active card in relay mode, or phone / email mode with nothing saved',
         coalesce((select 'length=' || length(prosrc)::text from finder limit 1), '(missing)'),
         case when exists (select 1 from finder
                           where prosrc like '%c.active = true%'
                             and prosrc like '%c.contact_mode = ''relay''%'
                             and prosrc like '%app_emergency_published_contact(c.contact_mode, c.contact_value) is null%')
              then 'PASS' else 'FAIL' end

  union all
  select 9, 'per-pet limits: 5 per 10 min and 30 per day; urgent 1 per 10 min and 4 per day; parallel calls are serialised',
         coalesce((select 'lock=' || (prosrc like '%pg_advisory_xact_lock%')::text
                          || ' messages=' || (prosrc like '%v_recent >= 5 or v_today >= 30%')::text
                          || ' urgent=' || (prosrc like '%v_urg_recent < 1 and v_urg_today < 4%')::text
                   from finder limit 1), '(missing)'),
         case when exists (select 1 from finder
                           where prosrc like '%pg_advisory_xact_lock%'
                             and prosrc like '%v_recent >= 5 or v_today >= 30%'
                             and prosrc like '%v_urg_recent < 1 and v_urg_today < 4%')
              then 'PASS' else 'FAIL' end

  union all
  select 10, 'it also notifies only ACTIVE, unexpired family / caregivers of that pet',
         coalesce((select 'reads pet_caregivers=' || (prosrc like '%from pet_caregivers g%')::text from finder limit 1), '(missing)'),
         case when exists (select 1 from finder
                           where prosrc like '%from pet_caregivers g%'
                             and prosrc like '%g.pet_id = v_pet%'
                             and prosrc like '%g.status = ''active''%'
                             and prosrc like '%g.expires_at is null or g.expires_at > now()%')
              then 'PASS' else 'FAIL' end

  union all
  select 11, 'publish rule: a phone / email is public only when it matches the chosen mode; app-only',
         coalesce((select 'pawpi_app=' || app_can::text || ' exposed=' || exposed::text from published limit 1), '(missing)'),
         case when (select count(*) from published) = 1
                and exists (select 1 from published
                            where app_can and not exposed
                              and prosrc like '%p_mode = ''phone'' and position(''@'' in p_value) = 0%'
                              and prosrc like '%p_mode = ''email'' and position(''@'' in p_value) > 0%')
              then 'PASS' else 'FAIL' end

  union all
  select 12, 'card assembler: one version, DEFINER, pinned, not exposed to PUBLIC / anon / authenticated',
         coalesce((select string_agg('secdef=' || prosecdef::text || ' config=' || config || ' exposed=' || exposed::text, ' | ') from assembler), '(missing)'),
         case when (select count(*) from assembler) = 1
                and exists (select 1 from assembler where prosecdef and config like 'search_path=%' and not exposed)
              then 'PASS' else 'FAIL' end

  union all
  select 13, 'card assembler publishes the owner contact through the publish rule only',
         coalesce((select 'uses rule=' || (prosrc like '%''value'', app_emergency_published_contact(c.contact_mode, c.contact_value)%')::text from assembler limit 1), '(missing)'),
         case when exists (select 1 from assembler
                           where prosrc like '%''value'', app_emergency_published_contact(c.contact_mode, c.contact_value)%'
                             and prosrc not like '%''value'', c.contact_value%'
                             and prosrc not like '%then c.contact_value%')
              then 'PASS' else 'FAIL' end

  union all
  select 14, 'public TAG medical block still excludes vet / emergency-contact details (0122 intact)',
         'tag branch length = ' || coalesce((select length(substring(prosrc from 'p_medical_scope = ''tag'' then (.*?)else jsonb_build_object'))::text from assembler limit 1), '(not found)'),
         case when exists (
                select 1 from (
                  select substring(prosrc from 'p_medical_scope = ''tag'' then (.*?)else jsonb_build_object') as t from assembler
                ) s
                where s.t is not null and s.t not like '%vet_phone%' and s.t not like '%emergency_contact%'
                  and s.t not like '%extra_notes%' and s.t not like '%primary_vet_name%' and s.t like '%blood_type%')
              then 'PASS' else 'FAIL' end

  union all
  select 15, 'public TAG shows the emergency contact only when the owner opted in',
         coalesce((select 'opt-in guard=' || (prosrc like '%when p_medical_scope = ''tag'' and c.show_emergency_contact_on_tag%')::text from assembler limit 1), '(missing)'),
         case when exists (select 1 from assembler
                           where prosrc like '%when p_medical_scope = ''tag'' and c.show_emergency_contact_on_tag%')
              then 'PASS' else 'FAIL' end

  union all
  select 16, 'full vet LINK carries the emergency contact only when the finder setting is Phone or Email',
         coalesce((select 'emergency_contact_phone mentions=' ||
                     ((length(prosrc) - length(replace(prosrc, '''emergency_contact_phone'', mp.emergency_contact_phone', '')))
                      / length('''emergency_contact_phone'', mp.emergency_contact_phone'))::text
                   from assembler limit 1), '(missing)'),
         -- exactly one place hands out the link's emergency contact, and it sits behind the mode check
         case when exists (select 1 from assembler
                           where prosrc ~ 'when c\.contact_mode in \(''phone'', ''email''\) then jsonb_build_object\(\s*''emergency_contact_name'', mp\.emergency_contact_name,\s*''emergency_contact_phone'', mp\.emergency_contact_phone'
                             and (length(prosrc) - length(replace(prosrc, '''emergency_contact_phone'', mp.emergency_contact_phone', '')))
                                 = length('''emergency_contact_phone'', mp.emergency_contact_phone'))
              then 'PASS' else 'FAIL' end

  union all
  select 17, 'retention purge: DEFINER, pinned, app-only, no arguments, fixed at 90 days',
         coalesce((select 'args=[' || args || '] secdef=' || prosecdef::text || ' pawpi_app=' || app_can::text || ' exposed=' || exposed::text from purge limit 1), '(missing)'),
         case when (select count(*) from purge) = 1
                and exists (select 1 from purge
                            where args = '' and prosecdef and config like 'search_path=%' and app_can and not exposed
                              and prosrc like '%interval ''90 days''%'
                              and prosrc like '%type = ''emergency_contact''%')
              then 'PASS' else 'FAIL' end

  union all
  select 18, 'the old relay function is still there for the previous web version',
         coalesce((select args || ' pawpi_app=' || app_can::text from fn where proname = 'app_emergency_relay_contact' limit 1), '(missing)'),
         case when exists (select 1 from fn where proname = 'app_emergency_relay_contact' and args = 'p_tag_token text, p_message text' and app_can and not exposed)
              then 'PASS' else 'FAIL' end

  union all
  select 19, 'notifications and pet_emergency_cards still have RLS enabled and forced',
         coalesce((select string_agg(relname || ' enabled=' || relrowsecurity::text || ' forced=' || relforcerowsecurity::text, ' | ' order by relname)
                   from pg_class where oid in ('public.notifications'::regclass, 'public.pet_emergency_cards'::regclass)), '(missing)'),
         case when (select count(*) from pg_class
                    where oid in ('public.notifications'::regclass, 'public.pet_emergency_cards'::regclass)
                      and relrowsecurity and relforcerowsecurity) = 2
              then 'PASS' else 'FAIL' end
)
select ord, check_name, detail, status from checks order by ord;
