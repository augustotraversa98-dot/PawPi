-- Verification for migration 0153 (sharing the vet record by link). Run in the Supabase SQL editor AFTER applying 0153.
-- EVERY row should read PASS (19 rows). Read-only (catalog queries only).
with
tbl as (
  select c.oid, c.relrowsecurity, c.relforcerowsecurity
  from pg_class c
  where c.oid = to_regclass('public.care_record_links')
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
  where proname in ('app_record_link_view', 'app_record_link_file', 'app_record_link_add_note', 'app_pet_has_vet_relationship')
),
purge as (
  select prosrc,
         prosecdef and config like 'search_path=%pg_temp%' and app_can and not exposed as safe
  from fn
  where proname = 'app_purge_finder_details'
),
pol as (
  select tablename, policyname, cmd, permissive, coalesce(qual, '') as qual, coalesce(with_check, '') as with_check
  from pg_policies
  where schemaname = 'public'
),
con as (
  select conname, convalidated, pg_get_constraintdef(oid) as def
  from pg_constraint
  where conrelid in (to_regclass('public.care_record_links'), to_regclass('public.vet_notes'))
),
checks as (
  select 1 as ord, 'care_record_links has the expected columns and keeps no readable token' as check_name,
         coalesce((select string_agg(column_name || ':' || udt_name, ' ' order by ordinal_position) from information_schema.columns
                   where table_schema = 'public' and table_name = 'care_record_links'), '(missing)') as detail,
         case when (select string_agg(column_name || ':' || udt_name, ' ' order by ordinal_position) from information_schema.columns
                    where table_schema = 'public' and table_name = 'care_record_links')
                   = 'id:int4 pet_id:int4 owner_user_id:int4 token_hash:text sections:_text allow_notes:bool '
                     || 'expires_at:timestamptz revoked_at:timestamptz created_at:timestamptz'
              then 'PASS' else 'FAIL' end as status

  union all
  select 2, 'row security is enabled and forced',
         coalesce((select 'enabled=' || relrowsecurity::text || ' forced=' || relforcerowsecurity::text from tbl), '(missing)'),
         case when exists (select 1 from tbl where relrowsecurity and relforcerowsecurity) then 'PASS' else 'FAIL' end

  union all
  select 3, 'exactly the three owner policies, and no delete policy',
         coalesce((select string_agg(policyname || '=' || cmd, ' ' order by policyname) from pol where tablename = 'care_record_links'), '(none)'),
         case when (select string_agg(policyname || '=' || cmd || '=' || permissive, ' ' order by policyname) from pol where tablename = 'care_record_links')
                   = 'care_record_links_owner_insert=INSERT=PERMISSIVE care_record_links_owner_select=SELECT=PERMISSIVE care_record_links_owner_update=UPDATE=PERMISSIVE'
              then 'PASS' else 'FAIL' end

  union all
  select 4, 'only the owner reads their links',
         coalesce((select qual from pol where tablename = 'care_record_links' and policyname = 'care_record_links_owner_select'), '(missing)'),
         case when exists (select 1 from pol where tablename = 'care_record_links' and policyname = 'care_record_links_owner_select'
                             and qual = '(owner_user_id = current_app_user_id())')
              then 'PASS' else 'FAIL' end

  union all
  select 5, 'a link is created only by the pet''s owner',
         coalesce((select with_check from pol where tablename = 'care_record_links' and policyname = 'care_record_links_owner_insert'), '(missing)'),
         case when exists (select 1 from pol where tablename = 'care_record_links' and policyname = 'care_record_links_owner_insert'
                             and with_check like '%owner_user_id = current_app_user_id()%'
                             and with_check like '%app_owns_pet(pet_id)%'
                             and with_check like '%revoked_at IS NULL%'
                             and with_check not like '% OR %')
              then 'PASS' else 'FAIL' end

  union all
  select 6, 'the only change an owner can make leaves the link revoked',
         coalesce((select 'using ' || qual || ' check ' || with_check from pol where tablename = 'care_record_links' and policyname = 'care_record_links_owner_update'), '(missing)'),
         case when exists (select 1 from pol where tablename = 'care_record_links' and policyname = 'care_record_links_owner_update'
                             and qual = '(owner_user_id = current_app_user_id())'
                             and with_check like '%owner_user_id = current_app_user_id()%'
                             and with_check like '%revoked_at IS NOT NULL%'
                             and with_check not like '% OR %')
              then 'PASS' else 'FAIL' end

  union all
  select 7, 'one row per token hash',
         coalesce((select indexdef from pg_indexes where schemaname = 'public' and indexname = 'idx_care_record_links_hash'), '(missing)'),
         case when exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'idx_care_record_links_hash'
                             and indexdef like 'CREATE UNIQUE INDEX%(token_hash)%' and indexdef not like '% WHERE %')
              then 'PASS' else 'FAIL' end

  union all
  select 8, 'only a hash fits, only the eight sections, and a link always ends within a year',
         coalesce((select string_agg(conname || ' validated=' || convalidated::text || ' ' || def, ' | ' order by conname)
                   from con where conname like 'care_record_links_%_check'), '(missing)'),
         case when exists (select 1 from con where conname = 'care_record_links_hash_check' and convalidated
                             and def like '%token_hash ~ ''^[0-9a-f]{64}$''%')
                and exists (select 1 from con where conname = 'care_record_links_sections_check' and convalidated
                             and def like '%cardinality(sections) > 0%'
                             and def like '%sections <@ ARRAY[''profile''::text, ''emergency_contact''::text, ''insurance''::text, ''vet_notes''::text, ''vaccines''::text, ''files''::text, ''photos''::text, ''lab_results''::text]%')
                and exists (select 1 from con where conname = 'care_record_links_expiry_check' and convalidated
                             and def like '%expires_at > created_at%' and def like '%expires_at <= (created_at + ''366 days''::interval)%')
                and exists (select 1 from information_schema.columns
                            where table_schema = 'public' and table_name = 'care_record_links' and column_name = 'expires_at' and is_nullable = 'NO')
              then 'PASS' else 'FAIL' end

  union all
  select 9, 'no public, anon or authenticated privilege on the table or its sequence; the app role can read, create and update',
         coalesce((select string_agg(c.relname || ':' || coalesce(r.rolname, 'PUBLIC') || ':' || a.privilege_type, ' ')
                   from pg_class c
                   cross join lateral aclexplode(c.relacl) a
                   left join pg_roles r on r.oid = a.grantee
                   where c.oid in (to_regclass('public.care_record_links'), to_regclass('public.care_record_links_id_seq'))
                     and (a.grantee = 0 or r.rolname in ('anon', 'authenticated'))), '(none exposed)'),
         case when exists (select 1 from tbl
                           where has_table_privilege('pawpi_app', tbl.oid, 'SELECT')
                             and has_table_privilege('pawpi_app', tbl.oid, 'INSERT')
                             and has_table_privilege('pawpi_app', tbl.oid, 'UPDATE'))
                and not exists (select 1 from pg_class c
                                cross join lateral aclexplode(c.relacl) a
                                left join pg_roles r on r.oid = a.grantee
                                where c.oid in (to_regclass('public.care_record_links'), to_regclass('public.care_record_links_id_seq'))
                                  and (a.grantee = 0 or r.rolname in ('anon', 'authenticated')))
              then 'PASS' else 'FAIL' end

  union all
  select 10, 'vet_notes marks a note added through a link',
         coalesce((select string_agg(column_name || ':' || udt_name || ':' || is_nullable, ' ' order by column_name) from information_schema.columns
                   where table_schema = 'public' and table_name = 'vet_notes'
                     and column_name in ('via_record_link', 'record_link_id', 'external_author_name')), '(missing)'),
         case when (select string_agg(column_name || ':' || udt_name || ':' || is_nullable, ' ' order by column_name) from information_schema.columns
                    where table_schema = 'public' and table_name = 'vet_notes'
                      and column_name in ('via_record_link', 'record_link_id', 'external_author_name'))
                   = 'external_author_name:text:YES record_link_id:int4:YES via_record_link:bool:NO'
              then 'PASS' else 'FAIL' end

  union all
  select 11, 'a link name or id only on a marked note, and removing a link keeps the note',
         coalesce((select string_agg(conname || ' ' || def, ' | ' order by conname)
                   from con where conname in ('vet_notes_record_link_check', 'vet_notes_record_link_id_fkey')), '(missing)'),
         case when exists (select 1 from con where conname = 'vet_notes_record_link_check' and convalidated
                             and def like '%via_record_link OR%' and def like '%record_link_id IS NULL%' and def like '%external_author_name IS NULL%')
                and exists (select 1 from con where conname = 'vet_notes_record_link_id_fkey'
                             and def like '%REFERENCES care_record_links(id) ON DELETE SET NULL%')
              then 'PASS' else 'FAIL' end

  union all
  select 12, 'app_record_link_view: only a usable link, only granted sections, no file address',
         coalesce((select string_agg(detail || ' returns ' || result, ' | ') from helpers where proname = 'app_record_link_view'), '(missing)'),
         case when (select count(*) from helpers where proname = 'app_record_link_view') = 1
                and exists (select 1 from helpers where proname = 'app_record_link_view' and safe
                              and args = 'p_token_hash text' and result = 'jsonb'
                              and prosrc like '%p.owner_user_id = l.owner_user_id%'
                              and prosrc like '%where l.token_hash = p_token_hash%'
                              and prosrc like '%and l.revoked_at is null%'
                              and prosrc like '%and l.expires_at > now()%'
                              and (select count(*) from regexp_matches(prosrc, 'where ''(profile|emergency_contact|insurance)'' = any \(l\.sections\)', 'g')) = 3
                              and (select count(*) from regexp_matches(prosrc, 'case when ''(vet_notes|vaccines|files|photos|lab_results)'' = any \(l\.sections\) then', 'g')) = 5
                              and (select count(*) from regexp_matches(prosrc, '\.owner_user_id = l\.owner_user_id and mp\.deleted_at is null', 'g')) = 3
                              and prosrc !~* '''(file_url|image_url)'''
                              and prosrc !~* '\m(insert|update|delete)\M')
              then 'PASS' else 'FAIL' end

  union all
  select 13, 'app_record_link_file: only a usable link and an item of a granted section; only a private key of that pet',
         coalesce((select string_agg(detail || ' returns ' || result, ' | ') from helpers where proname = 'app_record_link_file'), '(missing)'),
         case when (select count(*) from helpers where proname = 'app_record_link_file') = 1
                and exists (select 1 from helpers where proname = 'app_record_link_file' and safe
                              and args = 'p_token_hash text, p_kind text, p_item_id integer'
                              and result = 'TABLE(pet_id integer, media_key text)'
                              and prosrc like '%p.owner_user_id = l.owner_user_id%'
                              and prosrc like '%p_kind = ''document'' and ''files'' = any (l.sections)%'
                              and prosrc like '%p_kind = ''photo'' and ''photos'' = any (l.sections)%'
                              and prosrc like '%d.pet_id = l.pet_id and d.owner_user_id = l.owner_user_id%'
                              and prosrc like '%h.pet_id = l.pet_id and h.owner_user_id = l.owner_user_id%'
                              and prosrc like '%then f.ref end%'
                              and prosrc like '%where l.token_hash = p_token_hash%'
                              and prosrc like '%and l.revoked_at is null%'
                              and prosrc like '%and l.expires_at > now()%'
                              and prosrc !~* '\m(insert|update|delete)\M')
              then 'PASS' else 'FAIL' end

  union all
  select 14, 'app_record_link_add_note: a usable link that allows notes, locked, capped, author from the request identity',
         coalesce((select string_agg(detail || ' returns ' || result, ' | ') from helpers where proname = 'app_record_link_add_note'), '(missing)'),
         case when (select count(*) from helpers where proname = 'app_record_link_add_note') = 1
                and exists (select 1 from helpers where proname = 'app_record_link_add_note' and safe
                              and args = 'p_token_hash text, p_note text'
                              and prosrc like '%current_app_user_id()%'
                              and prosrc like '%where l.token_hash = p_token_hash%'
                              and prosrc like '%and l.revoked_at is null%'
                              and prosrc like '%and l.expires_at > now()%'
                              and prosrc like '%for update;%'
                              and prosrc like '%p.owner_user_id = v_link.owner_user_id%'
                              and prosrc like '%if not v_link.allow_notes then%'
                              and prosrc like '%length(v_note) > 2000%'
                              and prosrc like '%now() - interval ''24 hours'') >= 10%'
                              and prosrc like '%true, v_link.id, v_name%'
                              and prosrc !~* '\m(delete|care_access_grants)\M')
              then 'PASS' else 'FAIL' end

  union all
  select 15, 'the owners of the link functions bypass row security (needed to read through a link)',
         coalesce((select string_agg(h.proname || ' owner=' || r.rolname || ' super=' || r.rolsuper::text || ' bypassrls=' || r.rolbypassrls::text, ' | ' order by h.proname)
                   from helpers h join pg_roles r on r.oid = h.proowner), '(missing)'),
         case when (select count(*) from helpers h join pg_roles r on r.oid = h.proowner where r.rolsuper or r.rolbypassrls) = 4
              then 'PASS' else 'FAIL' end

  union all
  select 16, 'only the three reviewed functions read care_record_links, and no view does',
         coalesce((select string_agg(proname, ', ' order by proname) from fn where prosrc ~* 'care_record_links'), '(none)')
           || ' | views=' || (select count(*)::text from pg_views where schemaname = 'public' and definition ~* 'care_record_links'),
         case when (select string_agg(proname, ', ' order by proname) from fn where prosrc ~* 'care_record_links')
                   = 'app_record_link_add_note, app_record_link_file, app_record_link_view'
                and not exists (select 1 from pg_views where schemaname = 'public' and definition ~* 'care_record_links')
                and not exists (select 1 from pg_matviews where schemaname = 'public' and definition ~* 'care_record_links')
              then 'PASS' else 'FAIL' end

  union all
  select 17, 'app_pet_has_vet_relationship counts no note added through a link and no grant by section',
         coalesce((select string_agg(detail, ' | ') from helpers where proname = 'app_pet_has_vet_relationship'), '(missing)'),
         case when (select count(*) from helpers where proname = 'app_pet_has_vet_relationship') = 1
                and exists (select 1 from helpers where proname = 'app_pet_has_vet_relationship' and safe
                              and prosrc like '%g.sections is null%'
                              and prosrc like '%vn.pet_id = p_pet_id and not vn.via_record_link%')
              then 'PASS' else 'FAIL' end

  union all
  select 18, 'the author-removal trigger is on vet_notes and its function is not exposed',
         coalesce((select string_agg(t.tgname || ' enabled=' || t.tgenabled::text, ' ') from pg_trigger t
                   where t.tgrelid = to_regclass('public.vet_notes') and not t.tgisinternal), '(none)'),
         case when exists (select 1 from pg_trigger t join fn on fn.oid = t.tgfoid
                           where t.tgrelid = to_regclass('public.vet_notes') and t.tgname = 'vet_notes_record_link_author_gone'
                             and t.tgenabled = 'O' and fn.proname = 'app_record_link_note_author_gone'
                             and fn.app_can and not fn.exposed and fn.config like 'search_path=%pg_temp%')
              then 'PASS' else 'FAIL' end

  union all
  select 19, 'the hourly purge also removes record link sender counters after 90 days',
         coalesce((select 'record_link=' || (position('record\_link\_%' in prosrc) > 0)::text from purge limit 1), '(missing)'),
         case when (select count(*) from purge) = 1
                and exists (select 1 from purge where safe
                              and position('bucket like ''record\_link\_%''' in prosrc) > 0
                              and position('emergency\_relay%' in prosrc) > 0
                              and position('bucket = ''emergency_public_read''' in prosrc) > 0
                              and position('interval ''90 days''' in prosrc) > 0
                              and position('type = ''emergency_contact''' in prosrc) > 0)
              then 'PASS' else 'FAIL' end
)
select ord, check_name, detail, status from checks order by ord;
