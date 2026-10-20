-- Verification for migration 0122 (emergency TAG medical least-privilege). Run in the Supabase SQL
-- editor AFTER applying 0122. EVERY row should read PASS.
--
-- Human-applied (replaces SECURITY DEFINER readers on the PUBLIC emergency card). Before 0122 the raw
-- API JSON of a scanned collar TAG (when the owner opted in to show medical) also carried the vet phone,
-- clinic and emergency-contact name + phone; after it the TAG returns only what the tag page renders
-- (blood type, spay/neuter, notes, allergies, conditions) and the vet LINK is unchanged.
with checks as (
  select 1 as ord, '3-arg assembler app_emergency_card_json(int,bool,text) exists' as check_name,
         coalesce(string_agg(pg_get_function_identity_arguments(p.oid), ' | '), '(absent)') as detail,
         case when count(*) = 1 then 'PASS' else 'FAIL' end as status
  from pg_proc p
  where p.pronamespace = 'public'::regnamespace and p.proname = 'app_emergency_card_json'
    and pg_get_function_identity_arguments(p.oid) = 'p_card_id integer, p_include_medical boolean, p_medical_scope text'

  union all
  select 2, 'old 2-arg assembler is gone (no overload left that skips the scope)',
         count(*)::text || ' overload(s) total',
         case when count(*) = 1 then 'PASS' else 'FAIL' end
  from pg_proc p
  where p.pronamespace = 'public'::regnamespace and p.proname = 'app_emergency_card_json'

  union all
  select 3, 'assembler is SECURITY DEFINER with a pinned search_path',
         'secdef=' || p.prosecdef::text || ' config=' || coalesce(array_to_string(p.proconfig, ','), '(none)'),
         case when p.prosecdef and exists (
                select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')
              then 'PASS' else 'FAIL' end
  from pg_proc p
  where p.pronamespace = 'public'::regnamespace and p.proname = 'app_emergency_card_json'
    and pg_get_function_identity_arguments(p.oid) like '%p_medical_scope text'

  union all
  select 4, 'tag reader app_emergency_card_by_tag is SECURITY DEFINER, pinned search_path, EXECUTE to pawpi_app',
         'secdef=' || p.prosecdef::text || ' config=' || coalesce(array_to_string(p.proconfig, ','), '(none)'),
         case when p.prosecdef
                and exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')
                and has_function_privilege('pawpi_app', p.oid, 'EXECUTE')
              then 'PASS' else 'FAIL' end
  from pg_proc p
  where p.pronamespace = 'public'::regnamespace and p.proname = 'app_emergency_card_by_tag'

  union all
  select 5, 'link reader app_emergency_card_by_link is SECURITY DEFINER, pinned search_path, EXECUTE to pawpi_app',
         'secdef=' || p.prosecdef::text || ' config=' || coalesce(array_to_string(p.proconfig, ','), '(none)'),
         case when p.prosecdef
                and exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')
                and has_function_privilege('pawpi_app', p.oid, 'EXECUTE')
              then 'PASS' else 'FAIL' end
  from pg_proc p
  where p.pronamespace = 'public'::regnamespace and p.proname = 'app_emergency_card_by_link'

  union all
  -- The tag reader must route through the 'tag' scope, the link reader through 'full'.
  select 6, 'tag reader passes scope ''tag''',
         'by_tag body mentions ''tag'' = ' || (p.prosrc like '%''tag''%')::text,
         case when p.prosrc like '%''tag''%' and p.prosrc not like '%''full''%' then 'PASS' else 'FAIL' end
  from pg_proc p
  where p.pronamespace = 'public'::regnamespace and p.proname = 'app_emergency_card_by_tag'

  union all
  select 7, 'link reader passes scope ''full''',
         'by_link body mentions ''full'' = ' || (p.prosrc like '%''full''%')::text,
         case when p.prosrc like '%''full''%' then 'PASS' else 'FAIL' end
  from pg_proc p
  where p.pronamespace = 'public'::regnamespace and p.proname = 'app_emergency_card_by_link'

  union all
  -- The whole point: the TAG branch of the assembler (the text between "p_medical_scope = 'tag' then" and the
  -- following "else jsonb_build_object") must not select the vet / emergency-contact fields.
  select 8, 'tag branch of the assembler excludes vet_phone / emergency contact / extra_notes',
         'tag branch length = ' || coalesce(length(t.tag_branch)::text, '(not found)'),
         case when t.tag_branch is not null
                and t.tag_branch not like '%vet_phone%'
                and t.tag_branch not like '%emergency_contact%'
                and t.tag_branch not like '%extra_notes%'
                and t.tag_branch not like '%primary_vet_name%'
                and t.tag_branch like '%blood_type%'
              then 'PASS' else 'FAIL' end
  from (
    select substring(p.prosrc from 'p_medical_scope = ''tag'' then (.*?)else jsonb_build_object') as tag_branch
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.proname = 'app_emergency_card_json'
      and pg_get_function_identity_arguments(p.oid) like '%p_medical_scope text'
  ) t
)
select ord, check_name, detail, status from checks order by ord;
