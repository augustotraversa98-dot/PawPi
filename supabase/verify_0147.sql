-- Verification for migration 0147 (vet record sharing by section). Run in the Supabase SQL editor AFTER applying 0147.
-- EVERY row should read PASS (24 rows). Read-only (catalog queries only).
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
),
helpers as (
  select * from fn
  where proname in ('app_provider_has_grant', 'app_pet_has_vet_relationship', 'app_provider_has_section',
                    'app_shared_medical_profile', 'app_expire_care_grants')
),
helper_state as (
  select proname,
         'args=[' || args || '] secdef=' || prosecdef::text || ' config=' || config
           || ' pawpi_app=' || app_can::text || ' exposed=' || exposed::text as detail,
         prosecdef and config like 'search_path=%pg_temp%' and app_can and not exposed as safe,
         args, prosrc
  from helpers
),
pol as (
  select tablename, policyname, cmd, permissive, coalesce(qual, '') as qual, coalesce(with_check, '') as with_check
  from pg_policies
  where schemaname = 'public'
),
section_policies (ord, tbl, section_key, extra) as (
  values (11, 'vet_notes', 'vet_notes', null),
         (12, 'pet_vaccinations', 'vaccines', 'deleted_at IS NULL'),
         (13, 'vet_documents', 'files', null),
         (14, 'health_photo_checks', 'photos', null),
         (15, 'pet_lab_results', 'lab_results', null)
),
con as (
  select conname, convalidated, pg_get_constraintdef(oid) as def
  from pg_constraint
  where conrelid in ('public.care_access_grants'::regclass, 'public.notifications'::regclass)
),
checks as (
  select 1 as ord, 'care_access_grants.sections exists: text[], optional, no default' as check_name,
         coalesce((select data_type || ' ' || udt_name || ' nullable=' || is_nullable || ' default=' || coalesce(column_default, '(none)')
                   from information_schema.columns
                   where table_schema = 'public' and table_name = 'care_access_grants' and column_name = 'sections'), '(missing)') as detail,
         case when exists (select 1 from information_schema.columns
                           where table_schema = 'public' and table_name = 'care_access_grants' and column_name = 'sections'
                             and udt_name = '_text' and is_nullable = 'YES' and column_default is null)
              then 'PASS' else 'FAIL' end as status

  union all
  select 2, 'a grant by section has only the record_sections scope, known sections, and is never pending',
         coalesce((select 'validated=' || convalidated::text || ' ' || def from con where conname = 'care_access_grants_sections_check'), '(missing)'),
         case when exists (select 1 from con c
                           where c.conname = 'care_access_grants_sections_check' and c.convalidated
                             and c.def like '%array_position(scopes, ''record_sections''::text) IS NULL%'
                             and c.def like '%scopes = ARRAY[''record_sections''::text]%'
                             and c.def like '%status <> ''pending''::text%'
                             and c.def like '%cardinality(sections) > 0%'
                             and c.def like '%array_position(sections, NULL::text) IS NULL%'
                             and c.def like '%sections <@ ARRAY[''profile''::text, ''emergency_contact''::text, ''insurance''::text, ''vet_notes''::text, ''vaccines''::text, ''files''::text, ''photos''::text, ''lab_results''::text]%')
              then 'PASS' else 'FAIL' end

  union all
  select 3, 'provider staff can only insert a pending request without sections; owners only for their own pet',
         coalesce((select with_check from pol where tablename = 'care_access_grants' and policyname = 'care_access_grants_insert'), '(missing)'),
         case when (select count(*) from pol where tablename = 'care_access_grants' and cmd in ('INSERT', 'ALL')) = 1
                and exists (select 1 from pol
                            where tablename = 'care_access_grants' and policyname = 'care_access_grants_insert'
                              and with_check like '%app_is_active_staff_of(provider_id)%'
                              and with_check like '%requested_by = ''provider''::text%'
                              and with_check like '%status = ''pending''::text%'
                              and with_check like '%sections IS NULL%'
                              and with_check like '%requested_by = ''owner''::text%'
                              and with_check like '%owner_user_id = current_app_user_id()%'
                              and with_check like '%FROM pets%')
              then 'PASS' else 'FAIL' end

  union all
  select 4, 'only the grant owner updates; a pending or active grant must be on a pet they own',
         coalesce((select 'using ' || qual || ' check ' || with_check from pol where tablename = 'care_access_grants' and policyname = 'care_access_grants_update'), '(missing)'),
         case when (select count(*) from pol where tablename = 'care_access_grants' and cmd in ('UPDATE', 'ALL')) = 1
                and exists (select 1 from pol
                            where tablename = 'care_access_grants' and policyname = 'care_access_grants_update'
                              and qual like '%owner_user_id = current_app_user_id()%'
                              and qual not like '%app_is_active_staff_of%'
                              and with_check like '%owner_user_id = current_app_user_id()%'
                              and with_check like '%''revoked''::text%'
                              and with_check like '%''expired''::text%'
                              and with_check not like '%''active''::text%'
                              and with_check like '%FROM pets%')
              then 'PASS' else 'FAIL' end

  union all
  select 5, 'grants still cannot be deleted (no DELETE policy)',
         (select count(*)::text || ' delete policies' from pol where tablename = 'care_access_grants' and cmd in ('DELETE', 'ALL')),
         case when not exists (select 1 from pol where tablename = 'care_access_grants' and cmd in ('DELETE', 'ALL'))
              then 'PASS' else 'FAIL' end

  union all
  select 6, 'app_provider_has_grant ignores grants by section (safe settings, still status + expiry checked)',
         coalesce((select string_agg(detail, ' | ') from helper_state where proname = 'app_provider_has_grant'), '(missing)'),
         case when (select count(*) from helper_state where proname = 'app_provider_has_grant') = 1
                and exists (select 1 from helper_state where proname = 'app_provider_has_grant' and safe
                              and prosrc like '%g.sections is null%'
                              and prosrc like '%g.status = ''active''%'
                              and prosrc like '%g.expires_at is null or g.expires_at > now()%')
              then 'PASS' else 'FAIL' end

  union all
  select 7, 'app_pet_has_vet_relationship ignores grants by section',
         coalesce((select string_agg(detail, ' | ') from helper_state where proname = 'app_pet_has_vet_relationship'), '(missing)'),
         case when (select count(*) from helper_state where proname = 'app_pet_has_vet_relationship') = 1
                and exists (select 1 from helper_state where proname = 'app_pet_has_vet_relationship' and safe
                              and prosrc like '%g.sections is null%'
                              and prosrc like '%g.expires_at is null or g.expires_at > now()%')
              then 'PASS' else 'FAIL' end

  union all
  select 8, 'app_provider_has_section: active staff, active unexpired grant given by the current owner',
         coalesce((select string_agg(detail, ' | ') from helper_state where proname = 'app_provider_has_section'), '(missing)'),
         case when (select count(*) from helper_state where proname = 'app_provider_has_section') = 1
                and exists (select 1 from helper_state where proname = 'app_provider_has_section' and safe
                              and args = 'p_pet_id integer, p_section text'
                              and prosrc like '%ps.user_profile_id = current_app_user_id()%'
                              and prosrc like '%ps.status = ''active''%'
                              and prosrc like '%p.owner_user_id = g.owner_user_id%'
                              and prosrc like '%g.pet_id = p_pet_id%'
                              and prosrc like '%g.status = ''active''%'
                              and prosrc like '%g.expires_at is null or g.expires_at > now()%'
                              and prosrc like '%p_section = any (g.sections)%')
              then 'PASS' else 'FAIL' end

  union all
  select 9, 'app_shared_medical_profile: one provider, active staff, active unexpired grant given by the current owner',
         coalesce((select string_agg(detail, ' | ') from helper_state where proname = 'app_shared_medical_profile'), '(missing)'),
         case when (select count(*) from helper_state where proname = 'app_shared_medical_profile') = 1
                and exists (select 1 from helper_state where proname = 'app_shared_medical_profile' and safe
                              and args = 'p_pet_id integer, p_provider_id integer'
                              and prosrc like '%p.owner_user_id = g.owner_user_id%'
                              and prosrc like '%g.pet_id = p_pet_id%'
                              and prosrc like '%g.provider_id = p_provider_id%'
                              and prosrc like '%and app_is_active_staff_of(p_provider_id)%'
                              and prosrc like '%g.status = ''active''%'
                              and prosrc like '%g.expires_at is null or g.expires_at > now()%'
                              and prosrc like '%mp.deleted_at is null%')
              then 'PASS' else 'FAIL' end

  union all
  select 10, 'app_shared_medical_profile returns every profile column only behind its own section',
         coalesce((select 'guarded columns=' || (select count(*) from regexp_matches(prosrc, 'case when ''[a-z_]+'' = any \(g\.sections\) then mp\.[a-z_]+ end', 'g'))::text
                          || ' mp.* references=' || (select count(*) from regexp_matches(prosrc, 'mp\.[a-z_*]+', 'g'))::text
                   from helper_state where proname = 'app_shared_medical_profile' limit 1), '(missing)'),
         case when exists (
                select 1 from helper_state h
                where h.proname = 'app_shared_medical_profile'
                  and (select count(*) from regexp_matches(h.prosrc, 'mp\.[a-z_*]+', 'g')) = 16
                  and (select count(*) from (values
                        ('profile', 'microchip_id'), ('profile', 'spayed_neutered_status'), ('profile', 'spayed_neutered_date'),
                        ('profile', 'primary_vet_name'), ('profile', 'primary_clinic_name'), ('profile', 'vet_phone'),
                        ('profile', 'vet_email'), ('profile', 'medical_notes'),
                        ('emergency_contact', 'emergency_contact_name'), ('emergency_contact', 'emergency_contact_phone'),
                        ('insurance', 'insurance_provider'), ('insurance', 'insurance_policy_number')
                      ) as want(section_key, col)
                      where h.prosrc like '%case when ''' || want.section_key || ''' = any (g.sections) then mp.' || want.col || ' end%') = 12)
              then 'PASS' else 'FAIL' end

  union all
  select s.ord, s.tbl || ': read-only policy for the ' || s.section_key || ' section',
         coalesce((select p.cmd || ' ' || p.qual from pol p where p.tablename = s.tbl and p.policyname = s.tbl || '_provider_section_read'), '(missing)'),
         case when exists (select 1 from pol p
                           where p.tablename = s.tbl and p.policyname = s.tbl || '_provider_section_read'
                             and p.cmd = 'SELECT' and p.permissive = 'PERMISSIVE'
                             and p.qual like '%app_provider_has_section(pet_id, ''' || s.section_key || '''::text)%'
                             and p.qual not like '% OR %'
                             and (s.extra is null or p.qual like '%' || s.extra || '%'))
              then 'PASS' else 'FAIL' end
  from section_policies s

  union all
  select 16, 'no other policy opens anything by section',
         coalesce((select string_agg(tablename || '.' || policyname, ', ' order by tablename, policyname) from pol
                   where qual || ' ' || with_check ~ 'app_provider_has_section|app_shared_medical_profile|record_sections'), '(none)'),
         case when (select count(*) from pol where qual || ' ' || with_check ~ 'app_provider_has_section|app_shared_medical_profile|record_sections') = 5
                and not exists (select 1 from pol p
                                where p.qual || ' ' || p.with_check ~ 'app_provider_has_section|app_shared_medical_profile|record_sections'
                                  and not exists (select 1 from section_policies s
                                                  where s.tbl = p.tablename and p.policyname = s.tbl || '_provider_section_read'))
              then 'PASS' else 'FAIL' end

  union all
  select 17, 'every older policy that relies on a grant names its scope',
         coalesce((select string_agg(tablename || '.' || policyname, ', ') from pol
                   where regexp_replace(qual || ' ' || with_check, 'app_provider_has_grant\([a-z_.]+, ''[a-z_]+''::text\)', '', 'g') like '%app_provider_has_grant%'), '(all name a scope)'),
         case when exists (select 1 from pol where qual || ' ' || with_check like '%app_provider_has_grant%')
                and not exists (select 1 from pol
                                where regexp_replace(qual || ' ' || with_check, 'app_provider_has_grant\([a-z_.]+, ''[a-z_]+''::text\)', '', 'g') like '%app_provider_has_grant%')
              then 'PASS' else 'FAIL' end

  union all
  select 18, 'only the reviewed functions read care_access_grants, and no view does',
         coalesce((select string_agg(proname, ', ' order by proname) from fn where prosrc ~* 'care_access_grants'), '(none)')
           || ' | views=' || (select count(*)::text from pg_views where schemaname = 'public' and definition ~* 'care_access_grants'),
         case when not exists (select 1 from fn
                               where prosrc ~* 'care_access_grants'
                                 and proname not in ('app_provider_has_grant', 'app_pet_has_vet_relationship', 'app_provider_can_rx',
                                                     'app_provider_has_section', 'app_shared_medical_profile', 'app_expire_care_grants'))
                and not exists (select 1 from pg_views where schemaname = 'public' and definition ~* 'care_access_grants')
                and not exists (select 1 from pg_matviews where schemaname = 'public' and definition ~* 'care_access_grants')
              then 'PASS' else 'FAIL' end

  union all
  select 19, 'prescribing still needs the medical_write scope or a booking',
         coalesce((select 'requires medical_write=' || (prosrc like '%''medical_write'' = any (g.scopes)%')::text from fn where proname = 'app_provider_can_rx' limit 1), '(missing)'),
         case when (select count(*) from fn where proname = 'app_provider_can_rx') = 1
                and exists (select 1 from fn where proname = 'app_provider_can_rx' and prosrc like '%''medical_write'' = any (g.scopes)%')
              then 'PASS' else 'FAIL' end

  union all
  select 20, 'app_expire_care_grants: safe settings, closes only past-date open grants of the owner or the provider''s staff',
         coalesce((select string_agg(detail, ' | ') from helper_state where proname = 'app_expire_care_grants'), '(missing)'),
         case when (select count(*) from helper_state where proname = 'app_expire_care_grants') = 1
                and exists (select 1 from helper_state where proname = 'app_expire_care_grants' and safe
                              and args = 'p_pet_id integer, p_provider_id integer'
                              and prosrc like '%set status = ''expired'', updated_at = now()%'
                              and prosrc like '%g.status in (''pending'', ''active'')%'
                              and prosrc like '%and g.expires_at <= now()%'
                              and prosrc like '%(g.owner_user_id = current_app_user_id() or app_is_active_staff_of(g.provider_id))%')
              then 'PASS' else 'FAIL' end

  union all
  select 21, 'the owners of the grant helpers bypass row security (needed to read grants and close old ones)',
         coalesce((select string_agg(h.proname || ' owner=' || r.rolname || ' super=' || r.rolsuper::text || ' bypassrls=' || r.rolbypassrls::text, ' | ' order by h.proname)
                   from helpers h join pg_roles r on r.oid = h.proowner), '(missing)'),
         case when (select count(*) from helpers h join pg_roles r on r.oid = h.proowner where r.rolsuper or r.rolbypassrls) = 5
              then 'PASS' else 'FAIL' end

  union all
  select 22, 'the shared tables, grants, audit and notifications keep row security enabled and forced',
         coalesce((select string_agg(relname || '=' || (relrowsecurity and relforcerowsecurity)::text, ' ' order by relname) from pg_class
                   where relnamespace = 'public'::regnamespace
                     and relname in ('care_access_grants', 'care_access_audit', 'notifications', 'pet_medical_profiles', 'vet_notes',
                                     'pet_vaccinations', 'vet_documents', 'health_photo_checks', 'pet_lab_results')), '(missing)'),
         case when (select count(*) from pg_class
                    where relnamespace = 'public'::regnamespace
                      and relname in ('care_access_grants', 'care_access_audit', 'notifications', 'pet_medical_profiles', 'vet_notes',
                                      'pet_vaccinations', 'vet_documents', 'health_photo_checks', 'pet_lab_results')
                      and relrowsecurity and relforcerowsecurity) = 9
              then 'PASS' else 'FAIL' end

  union all
  select 23, 'one open (pending or active) grant per provider and pet is still enforced (0128)',
         coalesce((select indexdef from pg_indexes where schemaname = 'public' and indexname = 'uq_care_access_grants_active_provider_pet'), '(missing)'),
         case when exists (select 1 from pg_indexes
                           where schemaname = 'public' and indexname = 'uq_care_access_grants_active_provider_pet'
                             and indexdef like 'CREATE UNIQUE INDEX%(provider_id, pet_id)%'
                             and indexdef like '%''pending''%' and indexdef like '%''active''%')
              then 'PASS' else 'FAIL' end

  union all
  select 24, 'notification types: the 39 earlier ones plus care_access_granted and care_access_revoked',
         coalesce((select 'validated=' || convalidated::text || ' types=' || (select count(*) from regexp_matches(def, '''[a-z_]+''::text', 'g'))::text
                   from con where conname = 'notifications_type_check'), '(missing)'),
         case when exists (
                select 1 from con c
                where c.conname = 'notifications_type_check' and c.convalidated
                  and (select count(*) from regexp_matches(c.def, '''[a-z_]+''::text', 'g')) = 41
                  and (select count(*) from unnest(array[
                        'paw','bark','follow','lost_alert','emergency_contact','food_recall','report_received',
                        'booking_requested','booking_confirmed','booking_declined','booking_cancelled',
                        'adoption_under_review','adoption_approved','adoption_declined',
                        'walk_request_targeted','walk_request_broadcast','walk_request_accepted','walk_request_taken',
                        'welcome','pack_invite','pack_accepted','boop','weekly_digest','winback',
                        'biz_booking','biz_booking_change','biz_order','biz_message','biz_adoption_application',
                        'biz_review','biz_payout','biz_post_engagement','biz_follow',
                        'pet_share_invite','pet_share_accepted','pet_share_declined','pet_share_revoked','pet_share_left','pet_share_owner_deleted',
                        'care_access_granted','care_access_revoked']) as t(name)
                      where c.def like '%''' || t.name || '''::text%') = 41)
              then 'PASS' else 'FAIL' end
)
select ord, check_name, detail, status from checks order by ord;
