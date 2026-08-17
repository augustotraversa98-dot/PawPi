-- Verification for migration 0116 (MOD2 PR1 — enriched moderation reader).
-- Run in the Supabase SQL editor AFTER applying 0116. EVERY row should read PASS.
-- Confirms the function exists, is SECURITY DEFINER + admin-gated, pawpi_app can execute it,
-- and it declares the full enriched column set.
with checks as (
  select 1 as ord,
         'app_admin_list_reports_v2(text) exists' as check_name,
         case when count(*)=1 then 'present' else 'absent' end as detail,
         case when count(*)=1 then 'PASS' else 'FAIL' end as status
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='app_admin_list_reports_v2'

  union all
  select 2, 'is SECURITY DEFINER',
         case when bool_or(p.prosecdef) then 'definer' else 'invoker' end,
         case when bool_or(p.prosecdef) then 'PASS' else 'FAIL' end
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='app_admin_list_reports_v2'

  union all
  select 3, 'body is app_is_admin()-gated',
         case when count(*)=1 then 'gated' else 'NOT gated' end,
         case when count(*)=1 then 'PASS' else 'FAIL' end
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='app_admin_list_reports_v2'
    and pg_get_functiondef(p.oid) like '%app_is_admin()%'

  union all
  select 4, 'pawpi_app can EXECUTE it',
         has_function_privilege('pawpi_app','public.app_admin_list_reports_v2(text)','EXECUTE')::text,
         case when has_function_privilege('pawpi_app','public.app_admin_list_reports_v2(text)','EXECUTE')
              then 'PASS' else 'FAIL' end

  union all
  -- authoritative column check straight off the function's declared TABLE (OUT) parameters
  select 5, 'declares exactly the 15 enriched TABLE columns',
         'count='||count(*)::text,
         case when count(*) = 15 then 'PASS' else 'FAIL' end
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  cross join lateral unnest(p.proargmodes, p.proargnames) as u(mode, argname)
  where n.nspname='public' and p.proname='app_admin_list_reports_v2'
    and u.mode = 't'  -- 't' = TABLE/OUT column

  union all
  select 6, 'declares the key enriched fields (handles, preview_*, reporters_count, target_created_at)',
         'ok',
         case when bool_and(present) then 'PASS' else 'FAIL' end
  from (
    select every(
      exists (
        select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
        cross join lateral unnest(p.proargmodes, p.proargnames) as u(mode, argname)
        where n.nspname='public' and p.proname='app_admin_list_reports_v2'
          and u.mode='t' and u.argname = needed
      )
    ) as present
    from unnest(array[
      'reporter_handle','reporters_count','author_id','author_handle',
      'preview_text','preview_image_url','target_created_at'
    ]) as needed
  ) t
)
select ord, check_name, detail, status from checks order by ord;
