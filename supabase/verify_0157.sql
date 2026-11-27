-- Verification for migration 0157 (correcting notes added through a record link). Run in the Supabase SQL editor AFTER
-- applying 0157. EVERY row should read PASS (7 rows). Read-only (catalog queries only).
-- After 0157, verify_0153 row 16 reads FAIL by design: a fourth function (the note edit) now reads care_record_links.
with
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
  where proname in ('app_record_link_view', 'app_record_link_update_note')
),
checks as (
  select 1 as ord, 'vet_notes.vet_edited_at exists and is nullable' as check_name,
         coalesce((select udt_name || ':' || is_nullable from information_schema.columns
                   where table_schema = 'public' and table_name = 'vet_notes' and column_name = 'vet_edited_at'), '(missing)') as detail,
         case when exists (select 1 from information_schema.columns
                           where table_schema = 'public' and table_name = 'vet_notes' and column_name = 'vet_edited_at'
                             and udt_name = 'timestamptz' and is_nullable = 'YES')
              then 'PASS' else 'FAIL' end as status

  union all
  select 2, 'the application role cannot set or change the sharing columns of a vet note',
         coalesce((select 'tgtype=' || t.tgtype::text || ' enabled=' || t.tgenabled::text from pg_trigger t
                   where t.tgrelid = to_regclass('public.vet_notes') and t.tgname = 'vet_notes_record_link_guard'), '(missing)'),
         case when exists (select 1 from pg_trigger t join fn on fn.oid = t.tgfoid
                           where t.tgrelid = to_regclass('public.vet_notes') and t.tgname = 'vet_notes_record_link_guard'
                             and t.tgenabled = 'O' and t.tgtype = 23 and fn.proname = 'app_vet_note_link_fields_guard'
                             and not fn.prosecdef and fn.app_can and not fn.exposed and fn.config like 'search_path=%pg_temp%'
                             and fn.prosrc like '%new.via_record_link is distinct from old.via_record_link%'
                             and fn.prosrc like '%if new.vet_edited_at is not null then%'
                             and fn.prosrc like '%new.vet_edited_at is distinct from old.vet_edited_at%')
              then 'PASS' else 'FAIL' end

  union all
  select 3, 'a note written signed in is marked when its author is gone, with or without a name',
         coalesce((select fn.proname from pg_trigger t join fn on fn.oid = t.tgfoid
                   where t.tgrelid = to_regclass('public.vet_notes') and t.tgname = 'vet_notes_record_link_author_gone'), '(missing)'),
         case when exists (select 1 from pg_trigger t join fn on fn.oid = t.tgfoid
                           where t.tgrelid = to_regclass('public.vet_notes') and t.tgname = 'vet_notes_record_link_author_gone'
                             and t.tgenabled = 'O' and fn.app_can and not fn.exposed
                             and fn.prosrc like '%old.created_by_user_id is not null%'
                             and fn.prosrc not like '%old.external_author_name is not null%')
              then 'PASS' else 'FAIL' end

  union all
  select 4, 'app_record_link_view: still only a usable link and granted sections; link notes only when notes are allowed or shared',
         coalesce((select string_agg(detail, ' | ') from helpers where proname = 'app_record_link_view'), '(missing)'),
         case when (select count(*) from helpers where proname = 'app_record_link_view') = 1
                and exists (select 1 from helpers where proname = 'app_record_link_view' and safe
                              and prosrc like '%where l.token_hash = p_token_hash%'
                              and prosrc like '%and l.revoked_at is null%'
                              and prosrc like '%and l.expires_at > now()%'
                              and prosrc like '%case when l.allow_notes or ''vet_notes'' = any (l.sections) then%'
                              and prosrc like '%where n.record_link_id = l.id and n.pet_id = l.pet_id and n.owner_user_id = l.owner_user_id%'
                              and (select count(*) from regexp_matches(prosrc, 'case when ''(vet_notes|vaccines|files|photos|lab_results)'' = any \(l\.sections\) then', 'g')) = 5
                              and prosrc !~* '''(file_url|image_url|created_by_user_id)'''
                              and prosrc !~* '\m(insert|update|delete)\M')
              then 'PASS' else 'FAIL' end

  union all
  select 5, 'app_record_link_update_note: usable link that allows notes, locked, only this link''s note, only its author',
         coalesce((select string_agg(detail, ' | ') from helpers where proname = 'app_record_link_update_note'), '(missing)'),
         case when (select count(*) from helpers where proname = 'app_record_link_update_note') = 1
                and exists (select 1 from helpers where proname = 'app_record_link_update_note' and safe
                              and args = 'p_token_hash text, p_note_id integer, p_note text'
                              and prosrc like '%where l.token_hash = p_token_hash%'
                              and prosrc like '%and l.revoked_at is null%'
                              and prosrc like '%and l.expires_at > now()%'
                              and prosrc like '%p.owner_user_id = v_link.owner_user_id%'
                              and prosrc like '%if not v_link.allow_notes then%'
                              and prosrc like '%and n.record_link_id = v_link.id%'
                              and prosrc like '%v_old.created_by_user_id is distinct from v_user%'
                              and prosrc like '%length(v_note) > 2000%'
                              and prosrc !~* '\m(delete|care_access_grants)\M')
              then 'PASS' else 'FAIL' end

  union all
  select 6, 'the owners of the functions bypass row security (needed to read through a link)',
         coalesce((select string_agg(h.proname || ' owner=' || r.rolname, ' | ' order by h.proname)
                   from helpers h join pg_roles r on r.oid = h.proowner), '(missing)'),
         case when (select count(*) from helpers h join pg_roles r on r.oid = h.proowner where r.rolsuper or r.rolbypassrls) = 2
              then 'PASS' else 'FAIL' end

  union all
  select 7, 'only reviewed functions read care_record_links',
         coalesce((select string_agg(proname, ', ' order by proname) from fn where prosrc ~* 'care_record_links'), '(none)'),
         case when (select count(*) from fn where prosrc ~* 'care_record_links'
                      and proname not in ('app_record_link_add_note', 'app_record_link_file', 'app_record_link_view',
                                          'app_record_link_update_note', 'app_record_link_add_record', 'app_record_link_check_edit',
                                          'app_update_record_link')) = 0
              then 'PASS' else 'FAIL' end
)
select ord, check_name, detail, status from checks order by ord;
