-- Verification for migration 0110 (BN2 PR2 business notification types).
-- Run in the Supabase SQL editor AFTER applying 0110. EVERY row should read PASS.
with checks as (
  select 1 as ord,
         'notifications_type_check allows the new biz_* types' as check_name,
         case when pg_get_constraintdef(c.oid) like '%biz_booking%'
               and pg_get_constraintdef(c.oid) like '%biz_booking_change%'
               and pg_get_constraintdef(c.oid) like '%biz_order%'
               and pg_get_constraintdef(c.oid) like '%biz_message%'
               and pg_get_constraintdef(c.oid) like '%biz_adoption_application%'
               and pg_get_constraintdef(c.oid) like '%biz_review%'
               and pg_get_constraintdef(c.oid) like '%biz_payout%'
               and pg_get_constraintdef(c.oid) like '%biz_post_engagement%'
               and pg_get_constraintdef(c.oid) like '%biz_follow%'
              then 'all present' else 'missing one or more' end as detail,
         case when pg_get_constraintdef(c.oid) like '%biz_booking%'
               and pg_get_constraintdef(c.oid) like '%biz_booking_change%'
               and pg_get_constraintdef(c.oid) like '%biz_order%'
               and pg_get_constraintdef(c.oid) like '%biz_message%'
               and pg_get_constraintdef(c.oid) like '%biz_adoption_application%'
               and pg_get_constraintdef(c.oid) like '%biz_review%'
               and pg_get_constraintdef(c.oid) like '%biz_payout%'
               and pg_get_constraintdef(c.oid) like '%biz_post_engagement%'
               and pg_get_constraintdef(c.oid) like '%biz_follow%'
              then 'PASS' else 'FAIL' end as status
  from pg_constraint c
  where c.conrelid = 'public.notifications'::regclass
    and c.conname = 'notifications_type_check'

  union all
  -- The existing types must still be allowed (no regression).
  select 2, 'existing types still allowed (walk_request_targeted, booking_confirmed)',
         case when pg_get_constraintdef(c.oid) like '%walk_request_targeted%'
               and pg_get_constraintdef(c.oid) like '%booking_confirmed%'
              then 'present' else 'missing' end,
         case when pg_get_constraintdef(c.oid) like '%walk_request_targeted%'
               and pg_get_constraintdef(c.oid) like '%booking_confirmed%'
              then 'PASS' else 'FAIL' end
  from pg_constraint c
  where c.conrelid = 'public.notifications'::regclass
    and c.conname = 'notifications_type_check'
)
select ord, check_name, detail, status from checks order by ord;
