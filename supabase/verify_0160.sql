-- Verification for migration 0160 (a vet adding to the owner's vet record). Run in the Supabase SQL editor AFTER
-- applying 0160. EVERY row should read PASS (8 rows). Read-only (catalog and data checks only).
-- After 0160, verify_0147 row 18 reads FAIL by design: app_provider_may_add is one more function that reads the
-- grants (verify_0147 row 24 already reads FAIL since 0148).
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
writers as (
  select * from fn where proname in ('app_provider_may_add', 'app_provider_add_record', 'app_provider_update_vet_note',
                                     'app_record_link_check_edit', 'app_record_link_add_record')
),
cols as (
  select table_name, string_agg(column_name, ',' order by column_name) as names
  from information_schema.columns
  where table_schema = 'public'
    and table_name in ('vet_notes', 'pet_vaccinations', 'pet_lab_results', 'vet_documents')
    and column_name in ('added_by_provider_id', 'via_record_link', 'record_link_id', 'external_author_name', 'via_vet_share')
  group by table_name
),
trg as (
  select c.relname, t.tgname, t.tgenabled, p.proname
  from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_proc p on p.oid = t.tgfoid
  where not t.tgisinternal and c.relnamespace = 'public'::regnamespace
),
checks as (
  select 1 as ord, 'the four record tables say who added a row' as check_name,
         coalesce((select string_agg(table_name || ':' || names, ' ' order by table_name) from cols), '(missing)') as detail,
         case when (select string_agg(table_name || ':' || names, ' ' order by table_name) from cols) =
              'pet_lab_results:added_by_provider_id,external_author_name,record_link_id,via_record_link '
              || 'pet_vaccinations:added_by_provider_id,external_author_name,record_link_id,via_record_link '
              || 'vet_documents:added_by_provider_id,external_author_name,record_link_id,via_record_link '
              || 'vet_notes:added_by_provider_id,external_author_name,record_link_id,via_record_link,via_vet_share'
              then 'PASS' else 'FAIL' end as status

  union all
  select 2, 'the application role cannot write those columns',
         coalesce((select string_agg(relname || '.' || tgname, ' ' order by relname, tgname) from trg
                   where tgname like '%_provenance_guard' or tgname like '%_link_guard' or tgname = 'vet_notes_share_guard'), '(none)'),
         case when (select count(*) from trg where tgname like '%_provenance_guard' and proname = 'app_record_provenance_guard' and tgenabled = 'O') = 4
                and (select count(*) from trg where tgname in ('pet_vaccinations_link_guard', 'pet_lab_results_link_guard', 'vet_documents_link_guard')
                       and proname = 'app_record_link_row_guard' and tgenabled = 'O') = 3
                and exists (select 1 from trg where tgname = 'vet_notes_share_guard' and tgenabled = 'O')
                and exists (select 1 from trg where tgname = 'vet_notes_record_link_guard' and tgenabled = 'O')
              then 'PASS' else 'FAIL' end

  union all
  select 3, 'the writing functions are pinned, owned by a role that bypasses row security and not exposed',
         coalesce((select string_agg(proname || ' secdef=' || prosecdef::text || ' exposed=' || exposed::text, ' | ' order by proname) from writers), '(missing)'),
         case when (select count(*) from writers w join pg_roles r on r.oid = w.proowner
                    where w.prosecdef and w.config like 'search_path=%pg_temp%' and w.app_can and not w.exposed
                      and (r.rolsuper or r.rolbypassrls)) = 5
              then 'PASS' else 'FAIL' end

  union all
  select 4, 'a business adds only under a live grant of the current owner that names the part (or the older scope)',
         coalesce((select left(prosrc, 120) from fn where proname = 'app_provider_may_add'), '(missing)'),
         case when exists (select 1 from fn where proname = 'app_provider_may_add'
                             and prosrc like '%p.owner_user_id = g.owner_user_id%'
                             and prosrc like '%app_is_active_staff_of(p_provider_id)%'
                             and prosrc like '%g.status = ''active''%'
                             and prosrc like '%g.expires_at is null or g.expires_at > now()%'
                             and prosrc like '%p_section = any (g.edit_sections)%'
                             and prosrc like '%g.sections is null%')
                and exists (select 1 from fn where proname = 'app_provider_add_record' and prosrc like '%app_provider_may_add(p_pet_id, p_provider_id, p_section)%')
                and exists (select 1 from fn where proname = 'app_provider_update_vet_note'
                              and prosrc like '%app_provider_may_add(p_pet_id, p_provider_id, ''vet_notes'')%'
                              and prosrc like '%n.added_by_provider_id = p_provider_id%')
              then 'PASS' else 'FAIL' end

  union all
  select 5, 'a link adds only the parts it names, while it is usable, with a daily limit',
         coalesce((select left(prosrc, 120) from fn where proname = 'app_record_link_check_edit'), '(missing)'),
         case when exists (select 1 from fn where proname = 'app_record_link_check_edit'
                             and prosrc like '%l.revoked_at is null and l.expires_at > now()%'
                             and prosrc like '%p.owner_user_id = l.owner_user_id%'
                             and prosrc like '%p_section not in (''vaccines'', ''lab_results'', ''files'')%'
                             and prosrc like '%p_section = any (link.edit_sections)%'
                             and prosrc like '%used.n >= 20%')
                and exists (select 1 from fn where proname = 'app_record_link_add_record'
                              and prosrc like '%for update;%'
                              and prosrc like '%app_record_link_check_edit(p_token_hash, p_section)%'
                              and prosrc like '%current_app_user_id()%')
              then 'PASS' else 'FAIL' end

  union all
  select 6, 'the shared insert helper runs with its caller''s rights, and no writing function deletes',
         coalesce((select 'secdef=' || prosecdef::text from fn where proname = 'app_insert_shared_record'), '(missing)'),
         case when exists (select 1 from fn where proname = 'app_insert_shared_record' and not prosecdef and not exposed
                             and config like 'search_path=%pg_temp%')
                and not exists (select 1 from fn where proname in ('app_insert_shared_record', 'app_provider_add_record',
                                  'app_provider_update_vet_note', 'app_record_link_add_record') and prosrc ~* '\mdelete\M')
              then 'PASS' else 'FAIL' end

  union all
  select 7, 'a grant by section still has no insert or update policy of its own on the record tables',
         coalesce((select string_agg(tablename || '.' || policyname, ' ' order by tablename, policyname) from pg_policies
                   where schemaname = 'public' and tablename in ('vet_notes', 'pet_vaccinations', 'pet_lab_results', 'vet_documents')
                     and coalesce(with_check, '') || coalesce(qual, '') like '%app_provider_has_section%' and cmd <> 'SELECT'), '(none)'),
         case when not exists (select 1 from pg_policies
                               where schemaname = 'public' and tablename in ('vet_notes', 'pet_vaccinations', 'pet_lab_results', 'vet_documents')
                                 and coalesce(with_check, '') || coalesce(qual, '') like '%app_provider_has_section%' and cmd <> 'SELECT')
              then 'PASS' else 'FAIL' end

  union all
  select 8, 'a link shows what it may add, and a note added under a grant by section unlocks nothing',
         'view=' || coalesce((select (prosrc like '%''edit_sections'', to_jsonb(l.edit_sections)%')::text from fn where proname = 'app_record_link_view'), '-')
           || ' relationship=' || coalesce((select (prosrc like '%not vn.via_vet_share%')::text from fn where proname = 'app_pet_has_vet_relationship'), '-'),
         case when exists (select 1 from fn where proname = 'app_record_link_view' and prosecdef and not exposed
                             and prosrc like '%''edit_sections'', to_jsonb(l.edit_sections)%'
                             and prosrc !~* '''(file_url|image_url|created_by_user_id)''')
                and exists (select 1 from fn where proname = 'app_pet_has_vet_relationship' and prosecdef and not exposed
                              and prosrc like '%vn.pet_id = p_pet_id and not vn.via_record_link and not vn.via_vet_share%')
              then 'PASS' else 'FAIL' end
)
select ord, check_name, detail, status from checks order by ord;
