-- Verification for migration 0112 (report a provider_post_comment). Run AFTER applying 0112.
-- EVERY row should read PASS.
with checks as (
  select 1 as ord,
         'content_reports.target_type CHECK allows provider_post_comment' as check_name,
         case when pg_get_constraintdef(oid) like '%provider_post_comment%' then 'present' else 'absent' end as detail,
         case when pg_get_constraintdef(oid) like '%provider_post_comment%' then 'PASS' else 'FAIL' end as status
  from pg_constraint
  where conrelid = 'public.content_reports'::regclass
    and conname = 'content_reports_target_type_check'

  union all
  -- Existing types are still allowed (regression guard: the widen didn't drop 'post'/'bark').
  select 2, 'existing target types still allowed (post, bark, provider_post)',
         case when pg_get_constraintdef(oid) like '%''post''%'
               and pg_get_constraintdef(oid) like '%''bark''%'
               and pg_get_constraintdef(oid) like '%''provider_post''%' then 'present' else 'missing' end,
         case when pg_get_constraintdef(oid) like '%''post''%'
               and pg_get_constraintdef(oid) like '%''bark''%'
               and pg_get_constraintdef(oid) like '%''provider_post''%' then 'PASS' else 'FAIL' end
  from pg_constraint
  where conrelid = 'public.content_reports'::regclass
    and conname = 'content_reports_target_type_check'
)
select ord, check_name, detail, status from checks order by ord;
