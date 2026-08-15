-- Verification for migration 0115 (MOD1 PR2 — make provider_post_comment actionable).
-- Run in the Supabase SQL editor AFTER applying 0115. EVERY row should read PASS.
-- Pure CASE-mapping change; the shape check confirms all three helpers now carry the
-- provider_post_comment branch (and that provider_post_comments already has hidden_at).
with checks as (
  select 1 as ord, 'provider_post_comments.hidden_at exists (enforcement column, since 0082)' as check_name,
         case when count(*)=1 then 'present' else 'absent' end as detail,
         case when count(*)=1 then 'PASS' else 'FAIL' end as status
  from information_schema.columns
  where table_schema='public' and table_name='provider_post_comments' and column_name='hidden_at'

  union all
  select 2, 'app_moderate_hide maps provider_post_comment -> provider_post_comments',
         case when count(*)=1 then 'mapped' else 'NOT mapped' end,
         case when count(*)=1 then 'PASS' else 'FAIL' end
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='app_moderate_hide'
    and pg_get_functiondef(p.oid) like '%provider_post_comment%'
    and pg_get_functiondef(p.oid) like '%provider_post_comments%'

  union all
  select 3, 'app_moderate_unhide maps provider_post_comment -> provider_post_comments',
         case when count(*)=1 then 'mapped' else 'NOT mapped' end,
         case when count(*)=1 then 'PASS' else 'FAIL' end
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='app_moderate_unhide'
    and pg_get_functiondef(p.oid) like '%provider_post_comment%'

  union all
  select 4, 'app_admin_action_report handles provider_post_comment (hide list + ban resolution)',
         case when count(*)=1 then 'handled' else 'NOT handled' end,
         case when count(*)=1 then 'PASS' else 'FAIL' end
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='app_admin_action_report'
    and pg_get_functiondef(p.oid) like '%provider_post_comment%'

  union all
  select 5, 'pawpi_app can EXECUTE all three helpers',
         'hide='||has_function_privilege('pawpi_app','public.app_moderate_hide(text,integer)','EXECUTE')::text
         ||' action='||has_function_privilege('pawpi_app','public.app_admin_action_report(integer,text,boolean)','EXECUTE')::text,
         case when has_function_privilege('pawpi_app','public.app_moderate_hide(text,integer)','EXECUTE')
                and has_function_privilege('pawpi_app','public.app_moderate_unhide(text,integer)','EXECUTE')
                and has_function_privilege('pawpi_app','public.app_admin_action_report(integer,text,boolean)','EXECUTE')
              then 'PASS' else 'FAIL' end
)
select ord, check_name, detail, status from checks order by ord;
