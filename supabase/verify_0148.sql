-- Verification for migration 0148 (inviting a vet by link). Run in the Supabase SQL editor AFTER applying 0148.
-- EVERY row should read PASS (15 rows). Read-only (catalog queries only).
with
tbl as (
  select c.oid, c.relrowsecurity, c.relforcerowsecurity
  from pg_class c
  where c.oid = to_regclass('public.care_access_invites')
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
  where proname in ('app_can_accept_vet_invite', 'app_preview_vet_invite', 'app_claim_vet_invite')
),
pol as (
  select tablename, policyname, cmd, permissive, coalesce(qual, '') as qual, coalesce(with_check, '') as with_check
  from pg_policies
  where schemaname = 'public'
),
con as (
  select conname, convalidated, pg_get_constraintdef(oid) as def
  from pg_constraint
  where conrelid in (to_regclass('public.care_access_invites'), to_regclass('public.notifications'))
),
checks as (
  select 1 as ord, 'care_access_invites has the expected columns and keeps no readable token' as check_name,
         coalesce((select string_agg(column_name || ':' || udt_name, ' ' order by ordinal_position) from information_schema.columns
                   where table_schema = 'public' and table_name = 'care_access_invites'), '(missing)') as detail,
         case when (select string_agg(column_name || ':' || udt_name, ' ' order by ordinal_position) from information_schema.columns
                    where table_schema = 'public' and table_name = 'care_access_invites')
                   = 'id:int4 pet_id:int4 owner_user_id:int4 token_hash:text expires_at:timestamptz used_at:timestamptz '
                     || 'used_by_user_id:int4 used_by_provider_id:int4 revoked_at:timestamptz created_at:timestamptz'
              then 'PASS' else 'FAIL' end as status

  union all
  select 2, 'row security is enabled and forced',
         coalesce((select 'enabled=' || relrowsecurity::text || ' forced=' || relforcerowsecurity::text from tbl), '(missing)'),
         case when exists (select 1 from tbl where relrowsecurity and relforcerowsecurity) then 'PASS' else 'FAIL' end

  union all
  select 3, 'exactly the three owner policies, and no delete policy',
         coalesce((select string_agg(policyname || '=' || cmd, ' ' order by policyname) from pol where tablename = 'care_access_invites'), '(none)'),
         case when (select string_agg(policyname || '=' || cmd || '=' || permissive, ' ' order by policyname) from pol where tablename = 'care_access_invites')
                   = 'care_access_invites_owner_insert=INSERT=PERMISSIVE care_access_invites_owner_select=SELECT=PERMISSIVE care_access_invites_owner_update=UPDATE=PERMISSIVE'
              then 'PASS' else 'FAIL' end

  union all
  select 4, 'only the owner reads their invites',
         coalesce((select qual from pol where tablename = 'care_access_invites' and policyname = 'care_access_invites_owner_select'), '(missing)'),
         case when exists (select 1 from pol where tablename = 'care_access_invites' and policyname = 'care_access_invites_owner_select'
                             and qual = '(owner_user_id = current_app_user_id())')
              then 'PASS' else 'FAIL' end

  union all
  select 5, 'an invite is created only by the pet''s owner, unused',
         coalesce((select with_check from pol where tablename = 'care_access_invites' and policyname = 'care_access_invites_owner_insert'), '(missing)'),
         case when exists (select 1 from pol where tablename = 'care_access_invites' and policyname = 'care_access_invites_owner_insert'
                             and with_check like '%owner_user_id = current_app_user_id()%'
                             and with_check like '%app_owns_pet(pet_id)%'
                             and with_check like '%used_at IS NULL%'
                             and with_check like '%used_by_user_id IS NULL%'
                             and with_check like '%used_by_provider_id IS NULL%'
                             and with_check like '%revoked_at IS NULL%'
                             and with_check not like '% OR %')
              then 'PASS' else 'FAIL' end

  union all
  select 6, 'the only change an owner can make leaves the invite revoked',
         coalesce((select 'using ' || qual || ' check ' || with_check from pol where tablename = 'care_access_invites' and policyname = 'care_access_invites_owner_update'), '(missing)'),
         case when exists (select 1 from pol where tablename = 'care_access_invites' and policyname = 'care_access_invites_owner_update'
                             and qual = '(owner_user_id = current_app_user_id())'
                             and with_check like '%owner_user_id = current_app_user_id()%'
                             and with_check like '%revoked_at IS NOT NULL%'
                             and with_check not like '% OR %')
              then 'PASS' else 'FAIL' end

  union all
  select 7, 'one row per token hash',
         coalesce((select indexdef from pg_indexes where schemaname = 'public' and indexname = 'idx_care_access_invites_hash'), '(missing)'),
         case when exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'idx_care_access_invites_hash'
                             and indexdef like 'CREATE UNIQUE INDEX%(token_hash)%' and indexdef not like '% WHERE %')
              then 'PASS' else 'FAIL' end

  union all
  select 8, 'only a hash fits, and an invite lasts at most 7 days',
         coalesce((select string_agg(conname || ' validated=' || convalidated::text || ' ' || def, ' | ' order by conname)
                   from con where conname like 'care_access_invites_%_check'), '(missing)'),
         case when exists (select 1 from con where conname = 'care_access_invites_hash_check' and convalidated
                             and def like '%token_hash ~ ''^[0-9a-f]{64}$''%')
                and exists (select 1 from con where conname = 'care_access_invites_expiry_check' and convalidated
                             and def like '%expires_at > created_at%' and def like '%expires_at <= (created_at + ''7 days''::interval)%')
              then 'PASS' else 'FAIL' end

  union all
  select 9, 'no public, anon or authenticated privilege on the table or its sequence; the app role can read, create and update',
         coalesce((select string_agg(c.relname || ':' || coalesce(r.rolname, 'PUBLIC') || ':' || a.privilege_type, ' ')
                   from pg_class c
                   cross join lateral aclexplode(c.relacl) a
                   left join pg_roles r on r.oid = a.grantee
                   where c.oid in (to_regclass('public.care_access_invites'), to_regclass('public.care_access_invites_id_seq'))
                     and (a.grantee = 0 or r.rolname in ('anon', 'authenticated'))), '(none exposed)'),
         case when exists (select 1 from tbl
                           where has_table_privilege('pawpi_app', tbl.oid, 'SELECT')
                             and has_table_privilege('pawpi_app', tbl.oid, 'INSERT')
                             and has_table_privilege('pawpi_app', tbl.oid, 'UPDATE'))
                and not exists (select 1 from pg_class c
                                cross join lateral aclexplode(c.relacl) a
                                left join pg_roles r on r.oid = a.grantee
                                where c.oid in (to_regclass('public.care_access_invites'), to_regclass('public.care_access_invites_id_seq'))
                                  and (a.grantee = 0 or r.rolname in ('anon', 'authenticated')))
              then 'PASS' else 'FAIL' end

  union all
  select 10, 'app_can_accept_vet_invite: active staff of a published business with the vet capability',
         coalesce((select string_agg(detail, ' | ') from helpers where proname = 'app_can_accept_vet_invite'), '(missing)'),
         case when (select count(*) from helpers where proname = 'app_can_accept_vet_invite') = 1
                and exists (select 1 from helpers where proname = 'app_can_accept_vet_invite' and safe
                              and args = 'p_provider_id integer' and result = 'boolean'
                              and prosrc like '%select app_is_active_staff_of(p_provider_id)%'
                              and prosrc like '%and exists (select 1 from providers pr where pr.id = p_provider_id and pr.status = ''published'')%'
                              and prosrc like '%and exists (select 1 from provider_capabilities pc where pc.provider_id = p_provider_id and pc.capability = ''vet'')%'
                              and prosrc !~* '\mor\M')
              then 'PASS' else 'FAIL' end

  union all
  select 11, 'app_preview_vet_invite: three columns, only for an eligible vet and a usable invite',
         coalesce((select string_agg(detail || ' returns ' || result, ' | ') from helpers where proname = 'app_preview_vet_invite'), '(missing)'),
         case when (select count(*) from helpers where proname = 'app_preview_vet_invite') = 1
                and exists (select 1 from helpers where proname = 'app_preview_vet_invite' and safe
                              and args = 'p_token_hash text'
                              and result = 'TABLE(pet_name text, owner_name text, expires_at timestamp with time zone)'
                              and prosrc like '%p.owner_user_id = i.owner_user_id%'
                              and prosrc like '%where i.token_hash = p_token_hash%'
                              and prosrc like '%and i.used_at is null%'
                              and prosrc like '%and i.revoked_at is null%'
                              and prosrc like '%and i.expires_at > now()%'
                              and prosrc like '%ps.user_profile_id = current_app_user_id()%'
                              and prosrc like '%and app_can_accept_vet_invite(ps.provider_id)%'
                              and prosrc like '%and not app_user_is_blocked(current_app_user_id(), i.owner_user_id)%'
                              and prosrc !~* '\mor\M')
              then 'PASS' else 'FAIL' end

  union all
  select 12, 'app_claim_vet_invite: marks a usable invite as used, once, and does nothing else',
         coalesce((select string_agg(detail || ' returns ' || result, ' | ') from helpers where proname = 'app_claim_vet_invite'), '(missing)'),
         case when (select count(*) from helpers where proname = 'app_claim_vet_invite') = 1
                and exists (select 1 from helpers where proname = 'app_claim_vet_invite' and safe
                              and args = 'p_token_hash text, p_provider_id integer'
                              and result = 'TABLE(pet_id integer, owner_user_id integer, pet_name text)'
                              and prosrc like '%set used_at = now(),%'
                              and prosrc like '%where i.token_hash = p_token_hash%'
                              and prosrc like '%and p.owner_user_id = i.owner_user_id%'
                              and prosrc like '%and i.used_at is null%'
                              and prosrc like '%and i.revoked_at is null%'
                              and prosrc like '%and i.expires_at > now()%'
                              and prosrc like '%and app_can_accept_vet_invite(p_provider_id)%'
                              and prosrc like '%and not app_user_is_blocked(current_app_user_id(), i.owner_user_id)%'
                              and prosrc !~* '\m(or|insert|delete|care_access_grants)\M')
              then 'PASS' else 'FAIL' end

  union all
  select 13, 'the owners of the invite functions bypass row security (needed to read and use an invite)',
         coalesce((select string_agg(h.proname || ' owner=' || r.rolname || ' super=' || r.rolsuper::text || ' bypassrls=' || r.rolbypassrls::text, ' | ' order by h.proname)
                   from helpers h join pg_roles r on r.oid = h.proowner), '(missing)'),
         case when (select count(*) from helpers h join pg_roles r on r.oid = h.proowner where r.rolsuper or r.rolbypassrls) = 3
              then 'PASS' else 'FAIL' end

  union all
  select 14, 'only the reviewed functions read care_access_invites, and no view does',
         coalesce((select string_agg(proname, ', ' order by proname) from fn where prosrc ~* 'care_access_invites'), '(none)')
           || ' | views=' || (select count(*)::text from pg_views where schemaname = 'public' and definition ~* 'care_access_invites'),
         case when (select string_agg(proname, ', ' order by proname) from fn where prosrc ~* 'care_access_invites')
                   = 'app_claim_vet_invite, app_preview_vet_invite'
                and not exists (select 1 from pg_views where schemaname = 'public' and definition ~* 'care_access_invites')
                and not exists (select 1 from pg_matviews where schemaname = 'public' and definition ~* 'care_access_invites')
              then 'PASS' else 'FAIL' end

  union all
  select 15, 'notification types: the 41 earlier ones plus care_access_requested',
         coalesce((select 'validated=' || convalidated::text || ' types=' || (select count(*) from regexp_matches(def, '''[a-z_]+''::text', 'g'))::text
                   from con where conname = 'notifications_type_check'), '(missing)'),
         case when exists (
                select 1 from con c
                where c.conname = 'notifications_type_check' and c.convalidated
                  and (select count(*) from regexp_matches(c.def, '''[a-z_]+''::text', 'g')) = 42
                  and (select count(*) from unnest(array[
                        'paw','bark','follow','lost_alert','emergency_contact','food_recall','report_received',
                        'booking_requested','booking_confirmed','booking_declined','booking_cancelled',
                        'adoption_under_review','adoption_approved','adoption_declined',
                        'walk_request_targeted','walk_request_broadcast','walk_request_accepted','walk_request_taken',
                        'welcome','pack_invite','pack_accepted','boop','weekly_digest','winback',
                        'biz_booking','biz_booking_change','biz_order','biz_message','biz_adoption_application',
                        'biz_review','biz_payout','biz_post_engagement','biz_follow',
                        'pet_share_invite','pet_share_accepted','pet_share_declined','pet_share_revoked','pet_share_left','pet_share_owner_deleted',
                        'care_access_granted','care_access_revoked','care_access_requested']) as t(name)
                      where c.def like '%''' || t.name || '''::text%') = 42)
              then 'PASS' else 'FAIL' end
)
select ord, check_name, detail, status from checks order by ord;
