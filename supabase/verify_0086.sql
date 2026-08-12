-- Verification for migration 0086 (adoption applications v2 — per-listing application_questions
-- + widened notifications type CHECK). Run in the Supabase SQL editor AFTER applying 0086.
-- EVERY row should read PASS.
with checks as (
  select 1 as ord,
         'adoptable_listings.application_questions column exists' as check_name,
         count(*)::text||' / 1' as detail,
         case when count(*)=1 then 'PASS' else 'FAIL' end as status
  from information_schema.columns
  where table_schema='public' and table_name='adoptable_listings'
    and column_name='application_questions'

  union all
  select 2,
         'application_questions is jsonb NOT NULL DEFAULT ''[]''',
         'type='||coalesce(max(data_type),'?')
           ||' nullable='||coalesce(max(is_nullable),'?')
           ||' default='||coalesce(max(column_default),'(none)'),
         case when max(data_type)='jsonb'
               and max(is_nullable)='NO'
               and max(column_default) like '%[]%'
              then 'PASS' else 'FAIL' end
  from information_schema.columns
  where table_schema='public' and table_name='adoptable_listings'
    and column_name='application_questions'

  union all
  -- The notifications type CHECK must accept the three adoption-application lifecycle types.
  select 3,
         'notifications_type_check allows the adoption_* types',
         case when pg_get_constraintdef(oid) like '%adoption_under_review%'
                   and pg_get_constraintdef(oid) like '%adoption_approved%'
                   and pg_get_constraintdef(oid) like '%adoption_declined%'
              then 'all three present' else pg_get_constraintdef(oid) end,
         case when pg_get_constraintdef(oid) like '%adoption_under_review%'
                   and pg_get_constraintdef(oid) like '%adoption_approved%'
                   and pg_get_constraintdef(oid) like '%adoption_declined%'
              then 'PASS' else 'FAIL' end
  from pg_constraint
  where conrelid='public.notifications'::regclass
    and conname='notifications_type_check'

  union all
  -- The earlier booking types must still be allowed (widen was additive, not a replace).
  select 4,
         'notifications_type_check still allows the earlier types (additive widen)',
         case when pg_get_constraintdef(oid) like '%booking_confirmed%'
                   and pg_get_constraintdef(oid) like '%paw%'
              then 'earlier types intact' else pg_get_constraintdef(oid) end,
         case when pg_get_constraintdef(oid) like '%booking_confirmed%'
                   and pg_get_constraintdef(oid) like '%paw%'
              then 'PASS' else 'FAIL' end
  from pg_constraint
  where conrelid='public.notifications'::regclass
    and conname='notifications_type_check'
)
select ord, check_name, detail, status from checks order by ord;
