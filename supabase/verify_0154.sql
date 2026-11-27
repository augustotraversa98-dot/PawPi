-- Verification for migration 0154 (inviting a vet on PawPi). Run in the Supabase SQL editor AFTER applying 0154.
-- EVERY row should read PASS (17 rows). Read-only (catalog queries only).
with
tbl as (
  select c.oid, c.relrowsecurity, c.relforcerowsecurity
  from pg_class c
  where c.oid = to_regclass('public.care_share_offers')
),
fn as (
  select p.oid, p.proname, p.prosecdef, p.prosrc, p.proowner,
         pg_get_function_identity_arguments(p.oid) as args,
         pg_get_function_result(p.oid) as result,
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
  select proname, prosrc, args, result, proowner,
         'args=[' || args || '] secdef=' || prosecdef::text || ' config=' || config
           || ' pawpi_app=' || app_can::text || ' exposed=' || exposed::text as detail,
         prosecdef and config like 'search_path=%pg_temp%' and app_can and not exposed as safe
  from fn
  where proname in ('app_vet_can_receive_share', 'app_search_share_vets', 'app_provider_share_offers',
                    'app_respond_share_offer', 'app_lapse_share_offers', 'app_close_superseded_share_offers')
),
pol as (
  select tablename, policyname, cmd, permissive, coalesce(qual, '') as qual, coalesce(with_check, '') as with_check
  from pg_policies
  where schemaname = 'public'
),
con as (
  select conname, convalidated, pg_get_constraintdef(oid) as def
  from pg_constraint
  where conrelid in (to_regclass('public.care_share_offers'), to_regclass('public.notifications'))
),
checks as (
  select 1 as ord, 'care_share_offers has the expected columns' as check_name,
         coalesce((select string_agg(column_name || ':' || udt_name, ' ' order by ordinal_position) from information_schema.columns
                   where table_schema = 'public' and table_name = 'care_share_offers'), '(missing)') as detail,
         case when (select string_agg(column_name || ':' || udt_name, ' ' order by ordinal_position) from information_schema.columns
                    where table_schema = 'public' and table_name = 'care_share_offers')
                   = 'id:int4 pet_id:int4 owner_user_id:int4 provider_id:int4 sections:_text duration:text status:text '
                     || 'created_at:timestamptz lapses_at:timestamptz responded_at:timestamptz responded_by_user_id:int4 grant_id:int4'
              then 'PASS' else 'FAIL' end as status

  union all
  select 2, 'row security is enabled and forced',
         coalesce((select 'enabled=' || relrowsecurity::text || ' forced=' || relforcerowsecurity::text from tbl), '(missing)'),
         case when exists (select 1 from tbl where relrowsecurity and relforcerowsecurity) then 'PASS' else 'FAIL' end

  union all
  select 3, 'exactly the three owner policies: no delete policy and no staff policy',
         coalesce((select string_agg(policyname || '=' || cmd, ' ' order by policyname) from pol where tablename = 'care_share_offers'), '(none)'),
         case when (select string_agg(policyname || '=' || cmd || '=' || permissive, ' ' order by policyname) from pol where tablename = 'care_share_offers')
                   = 'care_share_offers_owner_insert=INSERT=PERMISSIVE care_share_offers_owner_select=SELECT=PERMISSIVE care_share_offers_owner_update=UPDATE=PERMISSIVE'
              then 'PASS' else 'FAIL' end

  union all
  select 4, 'only the owner reads their invitations',
         coalesce((select qual from pol where tablename = 'care_share_offers' and policyname = 'care_share_offers_owner_select'), '(missing)'),
         case when exists (select 1 from pol where tablename = 'care_share_offers' and policyname = 'care_share_offers_owner_select'
                             and qual = '(owner_user_id = current_app_user_id())')
              then 'PASS' else 'FAIL' end

  union all
  select 5, 'an invitation is created only by the pet''s owner, to a business that can receive it, unanswered',
         coalesce((select with_check from pol where tablename = 'care_share_offers' and policyname = 'care_share_offers_owner_insert'), '(missing)'),
         case when exists (select 1 from pol where tablename = 'care_share_offers' and policyname = 'care_share_offers_owner_insert'
                             and with_check like '%owner_user_id = current_app_user_id()%'
                             and with_check like '%app_owns_pet(pet_id)%'
                             and with_check like '%app_vet_can_receive_share(provider_id)%'
                             and with_check like '%status = ''open''::text%'
                             and with_check like '%responded_at IS NULL%'
                             and with_check like '%responded_by_user_id IS NULL%'
                             and with_check like '%grant_id IS NULL%'
                             and with_check not like '% OR %')
              then 'PASS' else 'FAIL' end

  union all
  select 6, 'an owner can only withdraw (or lapse) an unanswered invitation',
         coalesce((select 'using ' || qual || ' check ' || with_check from pol where tablename = 'care_share_offers' and policyname = 'care_share_offers_owner_update'), '(missing)'),
         case when exists (select 1 from pol where tablename = 'care_share_offers' and policyname = 'care_share_offers_owner_update'
                             and qual like '%owner_user_id = current_app_user_id()%' and qual like '%status = ''open''::text%'
                             and with_check like '%owner_user_id = current_app_user_id()%'
                             and with_check like '%''withdrawn''::text%' and with_check like '%''lapsed''::text%'
                             and with_check not like '%accepted%' and with_check like '%grant_id IS NULL%'
                             and qual not like '% OR %' and with_check not like '% OR %')
              then 'PASS' else 'FAIL' end

  union all
  select 7, 'one unanswered invitation per business and pet',
         coalesce((select indexdef from pg_indexes where schemaname = 'public' and indexname = 'idx_care_share_offers_open'), '(missing)'),
         case when exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'idx_care_share_offers_open'
                             and indexdef like 'CREATE UNIQUE INDEX%(provider_id, pet_id) WHERE (status = ''open''::text)')
              then 'PASS' else 'FAIL' end

  union all
  select 8, 'only the eight sections and known lengths, and an invitation lapses within 7 days',
         coalesce((select string_agg(conname || ' validated=' || convalidated::text || ' ' || def, ' | ' order by conname)
                   from con where conname like 'care_share_offers_%_check'), '(missing)'),
         case when exists (select 1 from con where conname = 'care_share_offers_sections_check' and convalidated
                             and def like '%cardinality(sections) > 0%'
                             and def like '%sections <@ ARRAY[''profile''::text, ''emergency_contact''::text, ''insurance''::text, ''vet_notes''::text, ''vaccines''::text, ''files''::text, ''photos''::text, ''lab_results''::text]%')
                and exists (select 1 from con where conname = 'care_share_offers_duration_check' and convalidated
                             and def like '%''7d''::text, ''30d''::text, ''1y''::text, ''until_revoked''::text%')
                and exists (select 1 from con where conname = 'care_share_offers_status_check' and convalidated)
                and exists (select 1 from con where conname = 'care_share_offers_lapse_check' and convalidated
                             and def like '%lapses_at <= (created_at + ''7 days''::interval)%')
              then 'PASS' else 'FAIL' end

  union all
  select 9, 'no public, anon or authenticated privilege on the table or its sequence; the app role can read, create and update',
         coalesce((select string_agg(c.relname || ':' || coalesce(r.rolname, 'PUBLIC') || ':' || a.privilege_type, ' ')
                   from pg_class c
                   cross join lateral aclexplode(c.relacl) a
                   left join pg_roles r on r.oid = a.grantee
                   where c.oid in (to_regclass('public.care_share_offers'), to_regclass('public.care_share_offers_id_seq'))
                     and (a.grantee = 0 or r.rolname in ('anon', 'authenticated'))), '(none exposed)'),
         case when exists (select 1 from tbl
                           where has_table_privilege('pawpi_app', tbl.oid, 'SELECT')
                             and has_table_privilege('pawpi_app', tbl.oid, 'INSERT')
                             and has_table_privilege('pawpi_app', tbl.oid, 'UPDATE'))
                and not exists (select 1 from pg_class c
                                cross join lateral aclexplode(c.relacl) a
                                left join pg_roles r on r.oid = a.grantee
                                where c.oid in (to_regclass('public.care_share_offers'), to_regclass('public.care_share_offers_id_seq'))
                                  and (a.grantee = 0 or r.rolname in ('anon', 'authenticated')))
              then 'PASS' else 'FAIL' end

  union all
  select 10, 'app_vet_can_receive_share: published, not demo, not an unclaimed listing, vet capability, an active account, not blocked',
         coalesce((select string_agg(detail, ' | ') from helpers where proname = 'app_vet_can_receive_share'), '(missing)'),
         case when (select count(*) from helpers where proname = 'app_vet_can_receive_share') = 1
                and exists (select 1 from helpers where proname = 'app_vet_can_receive_share' and safe
                              and args = 'p_provider_id integer' and result = 'boolean'
                              and prosrc like '%pr.status = ''published''%'
                              and prosrc like '%pr.is_demo is not true%'
                              and prosrc like '%is distinct from ''unclaimed''%'
                              and prosrc like '%pc.capability = ''vet''%'
                              and prosrc like '%ps.status = ''active'' and u.banned_at is null%'
                              and prosrc like '%not app_user_is_blocked(current_app_user_id(), pr.owner_user_profile_id)%')
              then 'PASS' else 'FAIL' end

  union all
  select 11, 'app_search_share_vets: public business fields of businesses that can receive an invitation, at most 20',
         coalesce((select string_agg(detail || ' returns ' || result, ' | ') from helpers where proname = 'app_search_share_vets'), '(missing)'),
         case when (select count(*) from helpers where proname = 'app_search_share_vets') = 1
                and exists (select 1 from helpers where proname = 'app_search_share_vets' and safe
                              and args = 'p_query text'
                              and result = 'TABLE(id integer, name text, handle text, logo_url text, location_name text, address text)'
                              and prosrc like '%and app_vet_can_receive_share(pr.id)%'
                              and prosrc like '%where current_app_user_id() is not null%'
                              and prosrc like '%limit 20%')
              then 'PASS' else 'FAIL' end

  union all
  select 12, 'app_provider_share_offers: unanswered invitations for active staff, with nothing from the record',
         coalesce((select string_agg(detail || ' returns ' || result, ' | ') from helpers where proname = 'app_provider_share_offers'), '(missing)'),
         case when (select count(*) from helpers where proname = 'app_provider_share_offers') = 1
                and exists (select 1 from helpers where proname = 'app_provider_share_offers' and safe
                              and args = 'p_provider_id integer'
                              and prosrc like '%and app_can_accept_vet_invite(p_provider_id)%'
                              and prosrc like '%o.status = ''open''%'
                              and prosrc like '%o.lapses_at > now()%'
                              and prosrc like '%p.owner_user_id = o.owner_user_id%'
                              and prosrc like '%not app_user_is_blocked(current_app_user_id(), o.owner_user_id)%'
                              and prosrc like '%o.owner_user_id, (select pr.owner_user_profile_id from providers pr where pr.id = o.provider_id))%'
                              and prosrc !~* '\m(pet_medical_profiles|vet_notes|vet_documents|pet_vaccinations|health_photo_checks|pet_lab_results|insert|update|delete)\M')
              then 'PASS' else 'FAIL' end

  union all
  select 13, 'app_respond_share_offer: active staff, locked, open and unexpired, same pet owner, not blocked, exactly the offered access',
         coalesce((select string_agg(detail, ' | ') from helpers where proname = 'app_respond_share_offer'), '(missing)'),
         case when (select count(*) from helpers where proname = 'app_respond_share_offer') = 1
                and exists (select 1 from helpers where proname = 'app_respond_share_offer' and safe
                              and args = 'p_offer_id integer, p_provider_id integer, p_accept boolean'
                              and prosrc like '%not app_is_active_staff_of(p_provider_id)%'
                              and prosrc like '%pg_advisory_xact_lock(hashtext(''care_access_grant:'' || v_pet_id || '':'' || p_provider_id))%'
                              and prosrc like '%for update;%'
                              and prosrc like '%v_offer.lapses_at <= now() or v_pet_owner is distinct from v_offer.owner_user_id%'
                              and prosrc like '%if v_offer.status <> ''open''%'
                              and prosrc like '%or app_user_is_blocked(current_app_user_id(), v_offer.owner_user_id)%'
                              and prosrc like '%v_offer.owner_user_id, (select pr.owner_user_profile_id from providers pr where pr.id = p_provider_id)) then%'
                              and position('set status = ''accepted''' in prosrc) < position('insert into care_access_grants' in prosrc)
                              and prosrc like '%if not app_can_accept_vet_invite(p_provider_id) then%'
                              and prosrc like '%array[''record_sections'']::text[], v_offer.sections%'
                              and prosrc like '%v_expires := now() + v_length;%')
              then 'PASS' else 'FAIL' end

  union all
  select 14, 'app_lapse_share_offers only closes invitations that can no longer be answered, for the pet owner or the business',
         coalesce((select string_agg(detail, ' | ') from helpers where proname = 'app_lapse_share_offers'), '(missing)'),
         case when (select count(*) from helpers where proname = 'app_lapse_share_offers') = 1
                and exists (select 1 from helpers where proname = 'app_lapse_share_offers' and safe
                              and prosrc like '%set status = ''lapsed''%'
                              and prosrc like '%o.status = ''open''%'
                              and prosrc like '%and (o.lapses_at <= now() or p.owner_user_id <> o.owner_user_id)%'
                              and prosrc like '%and (p.owner_user_id = current_app_user_id() or app_is_active_staff_of(o.provider_id))%')
              then 'PASS' else 'FAIL' end

  union all
  select 15, 'the owners of the invitation functions bypass row security',
         coalesce((select string_agg(h.proname || ' owner=' || r.rolname || ' super=' || r.rolsuper::text || ' bypassrls=' || r.rolbypassrls::text, ' | ' order by h.proname)
                   from helpers h join pg_roles r on r.oid = h.proowner), '(missing)'),
         case when (select count(*) from helpers h join pg_roles r on r.oid = h.proowner where r.rolsuper or r.rolbypassrls) = 6
              then 'PASS' else 'FAIL' end

  union all
  select 16, 'notification types: the 42 earlier ones plus the three invitation types',
         coalesce((select 'validated=' || convalidated::text || ' types=' || (select count(*) from regexp_matches(def, '''[a-z_]+''::text', 'g'))::text
                   from con where conname = 'notifications_type_check'), '(missing)'),
         case when exists (
                select 1 from con c
                where c.conname = 'notifications_type_check' and c.convalidated
                  and (select count(*) from regexp_matches(c.def, '''[a-z_]+''::text', 'g')) = 45
                  and (select count(*) from unnest(array[
                        'paw','bark','follow','lost_alert','emergency_contact','food_recall','report_received',
                        'booking_requested','booking_confirmed','booking_declined','booking_cancelled',
                        'adoption_under_review','adoption_approved','adoption_declined',
                        'walk_request_targeted','walk_request_broadcast','walk_request_accepted','walk_request_taken',
                        'welcome','pack_invite','pack_accepted','boop','weekly_digest','winback',
                        'biz_booking','biz_booking_change','biz_order','biz_message','biz_adoption_application',
                        'biz_review','biz_payout','biz_post_engagement','biz_follow',
                        'pet_share_invite','pet_share_accepted','pet_share_declined','pet_share_revoked','pet_share_left','pet_share_owner_deleted',
                        'care_access_granted','care_access_revoked','care_access_requested',
                        'care_share_offered','care_share_accepted','care_share_declined']) as t(name)
                      where c.def like '%''' || t.name || '''::text%') = 45)
              then 'PASS' else 'FAIL' end

  union all
  -- tgtype 21: for each row (1) + insert (4) + update (16), after.
  select 17, 'a later decision of the owner about the access withdraws the unanswered invitation',
         coalesce((select 'tgtype=' || t.tgtype::text || ' enabled=' || t.tgenabled::text from pg_trigger t
                   where t.tgrelid = to_regclass('public.care_access_grants') and t.tgname = 'care_access_grants_close_share_offers'), '(missing)'),
         case when exists (select 1 from pg_trigger t join pg_proc p on p.oid = t.tgfoid
                           where t.tgrelid = to_regclass('public.care_access_grants')
                             and t.tgname = 'care_access_grants_close_share_offers' and t.tgenabled = 'O' and t.tgtype = 21
                             and p.proname = 'app_close_superseded_share_offers')
                and exists (select 1 from helpers where proname = 'app_close_superseded_share_offers' and safe
                              and prosrc like '%(tg_op = ''INSERT'' and new.status = ''active'')%'
                              and prosrc like '%new.granted_at is distinct from old.granted_at%'
                              and prosrc like '%new.revoked_at is distinct from old.revoked_at%'
                              and prosrc like '%set status = ''withdrawn''%'
                              and prosrc like '%o.status = ''open''%')
              then 'PASS' else 'FAIL' end
)
select ord, check_name, detail, status from checks order by ord;
