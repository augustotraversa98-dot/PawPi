-- Verification for migration 0158 (view or "can add" on a share). Run in the Supabase SQL editor AFTER applying 0158.
-- EVERY row should read PASS (7 rows). Read-only (catalog and data checks only).
-- After 0158, rows of older scripts that list a sharing table's exact columns read FAIL by design (verify_0153 row 1,
-- verify_0154 row 1).
with
fn as (
  select p.oid, p.proname, p.prosecdef, p.prosrc,
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
cols as (
  select table_name, udt_name, is_nullable, column_default
  from information_schema.columns
  where table_schema = 'public' and column_name = 'edit_sections'
    and table_name in ('care_access_grants', 'care_record_links', 'care_share_offers')
),
con as (
  select conname, convalidated, pg_get_constraintdef(oid) as def
  from pg_constraint
  where conname in ('care_access_grants_edit_sections_check', 'care_record_links_edit_sections_check',
                    'care_share_offers_edit_sections_check')
),
checks as (
  select 1 as ord, 'the three sharing tables have edit_sections, required and empty by default' as check_name,
         coalesce((select string_agg(table_name || ':' || udt_name || ':' || is_nullable || ':' || coalesce(column_default, '-'),
                                     ' ' order by table_name) from cols), '(missing)') as detail,
         case when (select count(*) from cols where udt_name = '_text' and is_nullable = 'NO'
                      and column_default = '''{}''::text[]') = 3
              then 'PASS' else 'FAIL' end as status

  union all
  select 2, 'only notes, vaccines, files and lab results can be added to, and only what is shared (a link: notes also unseen)',
         coalesce((select string_agg(conname || ' validated=' || convalidated::text, ' ' order by conname) from con), '(missing)'),
         case when (select count(*) from con where convalidated
                      and def like '%edit_sections <@ ARRAY[''vet_notes''::text, ''vaccines''::text, ''files''::text, ''lab_results''::text]%') = 3
                and exists (select 1 from con where conname = 'care_access_grants_edit_sections_check'
                              and def like '%edit_sections <@ sections%' and def like '%sections IS NULL%')
                and exists (select 1 from con where conname = 'care_share_offers_edit_sections_check'
                              and def like '%edit_sections <@ sections%')
                and exists (select 1 from con where conname = 'care_record_links_edit_sections_check'
                              and def like '%array_remove(edit_sections, ''vet_notes''::text) <@ sections%'
                              and def like '%allow_notes = (''vet_notes''::text = ANY (edit_sections))%')
              then 'PASS' else 'FAIL' end

  union all
  select 3, 'no share allows adding to a part it does not name, and links agree with allow_notes',
         'links_disagreeing=' || (select count(*)::text from care_record_links
                                  where allow_notes is distinct from ('vet_notes' = any (edit_sections)))
           || ' scope_grants_with_edit=' || (select count(*)::text from care_access_grants
                                             where sections is null and edit_sections <> '{}'),
         case when not exists (select 1 from care_record_links
                               where allow_notes is distinct from ('vet_notes' = any (edit_sections)))
                and not exists (select 1 from care_access_grants where sections is null and edit_sections <> '{}')
              then 'PASS' else 'FAIL' end

  union all
  select 4, 'the database keeps allow_notes and edit_sections equal',
         coalesce((select t.tgname || ' tgtype=' || t.tgtype::text || ' enabled=' || t.tgenabled::text from pg_trigger t
                   where t.tgrelid = to_regclass('public.care_record_links') and t.tgname = 'care_record_links_sync_notes'), '(missing)'),
         case when exists (select 1 from pg_trigger t join fn on fn.oid = t.tgfoid
                           where t.tgrelid = to_regclass('public.care_record_links') and t.tgname = 'care_record_links_sync_notes'
                             and t.tgenabled = 'O' and t.tgtype = 23 and fn.app_can and not fn.exposed
                             and fn.config like 'search_path=%pg_temp%')
              then 'PASS' else 'FAIL' end

  union all
  select 5, 'app_provider_share_offer_edits answers only for the invitations the business may see',
         coalesce((select 'returns ' || result from fn where proname = 'app_provider_share_offer_edits'), '(missing)'),
         case when (select count(*) from fn where proname = 'app_provider_share_offer_edits') = 1
                and exists (select 1 from fn where proname = 'app_provider_share_offer_edits' and prosecdef
                              and config like 'search_path=%pg_temp%' and app_can and not exposed
                              and result = 'TABLE(id integer, edit_sections text[])'
                              and prosrc like '%from app_provider_share_offers(p_provider_id) f%')
              then 'PASS' else 'FAIL' end

  union all
  select 6, 'accepting an invitation gives exactly the offered permission',
         coalesce((select 'secdef=' || prosecdef::text || ' pawpi_app=' || app_can::text || ' exposed=' || exposed::text
                   from fn where proname = 'app_respond_share_offer'), '(missing)'),
         case when (select count(*) from fn where proname = 'app_respond_share_offer') = 1
                and exists (select 1 from fn where proname = 'app_respond_share_offer' and prosecdef
                              and config like 'search_path=%pg_temp%' and app_can and not exposed
                              and prosrc like '%edit_sections = v_offer.edit_sections%'
                              and prosrc like '%v_offer.edit_sections, ''active'', ''owner''%'
                              and prosrc like '%app_is_active_staff_of(p_provider_id)%')
              then 'PASS' else 'FAIL' end

  union all
  select 7, 'no sharing table is granted to public, anon or authenticated',
         coalesce((select string_agg(c.relname || ':' || coalesce(r.rolname, 'PUBLIC') || ':' || a.privilege_type, ' ')
                   from pg_class c
                   cross join lateral aclexplode(c.relacl) a
                   left join pg_roles r on r.oid = a.grantee
                   where c.oid in (to_regclass('public.care_access_grants'), to_regclass('public.care_record_links'),
                                   to_regclass('public.care_share_offers'))
                     and (a.grantee = 0 or r.rolname in ('anon', 'authenticated'))), '(none exposed)'),
         case when not exists (select 1 from pg_class c
                               cross join lateral aclexplode(c.relacl) a
                               left join pg_roles r on r.oid = a.grantee
                               where c.oid in (to_regclass('public.care_access_grants'), to_regclass('public.care_record_links'),
                                               to_regclass('public.care_share_offers'))
                                 and (a.grantee = 0 or r.rolname in ('anon', 'authenticated')))
              then 'PASS' else 'FAIL' end
)
select ord, check_name, detail, status from checks order by ord;
