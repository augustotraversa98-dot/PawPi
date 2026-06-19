-- Verification for Wave 7 + account-deletion migrations 0056–0062.
-- Run in the Supabase SQL editor. EVERY row should read PASS.
with checks as (
  -- 1. RLS enabled + FORCED on each new table
  select 1 as ord,
         'RLS on+forced: '||c.relname as check_name,
         (c.relrowsecurity and c.relforcerowsecurity)::text as detail,
         case when c.relrowsecurity and c.relforcerowsecurity then 'PASS' else 'FAIL' end as status
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname='public' and c.relkind='r'
    and c.relname in ('transport_trip_locations','rx_fulfillment_orders','insurance_policies',
                      'saved_places','events','event_rsvps','nutrition_plans','food_recalls',
                      'pet_food_recall_matches')

  union all
  -- 2. exact policy count per table
  select 2,
         'policies: '||e.tbl,
         count(p.policyname)::text||' / '||e.exp::text,
         case when count(p.policyname)=e.exp then 'PASS' else 'FAIL' end
  from (values ('transport_trip_locations',2),('rx_fulfillment_orders',5),('insurance_policies',5),
               ('saved_places',1),('events',4),('event_rsvps',3),('nutrition_plans',1),
               ('food_recalls',1),('pet_food_recall_matches',1)) as e(tbl,exp)
  left join pg_policies p on p.tablename=e.tbl and p.schemaname='public'
  group by e.tbl, e.exp

  union all
  -- 3. SECURITY DEFINER fns: definer flag + pinned search_path + EXECUTE granted to pawpi_app
  select 3,
         'fn secdef+grant: '||p.proname,
         'secdef='||p.prosecdef::text||' exec='||has_function_privilege('pawpi_app', p.oid, 'EXECUTE')::text,
         case when p.prosecdef
               and has_function_privilege('pawpi_app', p.oid, 'EXECUTE')
               and coalesce(array_to_string(p.proconfig, ','), '') like '%search_path%'
              then 'PASS' else 'FAIL' end
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname='public' and p.proname in
   ('app_can_post_trip_location','app_can_read_trip_location','app_owns_fulfillable_rx',
    'fulfill_rx_order','activate_insurance_policy','ingest_food_recall','match_food_recall','delete_my_account')

  union all
  -- 4. notifications type CHECK widened additively for 'food_recall'
  select 4,
         'notifications CHECK has food_recall',
         pg_get_constraintdef(oid),
         case when pg_get_constraintdef(oid) like '%food_recall%' then 'PASS' else 'FAIL' end
  from pg_constraint where conname='notifications_type_check'

  union all
  -- 5. food_recalls is read-only at the policy layer (writes are DEFINER-only)
  select 5,
         'food_recalls read-only (DEFINER writes)',
         'select='||(count(*) filter (where cmd='SELECT'))::text||' write='||(count(*) filter (where cmd<>'SELECT'))::text,
         case when (count(*) filter (where cmd<>'SELECT'))=0
               and (count(*) filter (where cmd='SELECT'))>=1 then 'PASS' else 'FAIL' end
  from pg_policies where schemaname='public' and tablename='food_recalls'

  union all
  -- 6. unique constraints the app's ON CONFLICT upserts rely on
  select 6,
         'unique constraint: '||r.req,
         (count(c.conname)>0)::text,
         case when count(c.conname)>0 then 'PASS' else 'FAIL' end
  from (values ('saved_places_unique'),('event_rsvps_unique'),
               ('food_recalls_unique'),('pet_food_recall_matches_unique')) as r(req)
  left join pg_constraint c on c.conname=r.req
  group by r.req

  union all
  -- 7. all 9 new tables present (catches a silently-missing table)
  select 7, '9 new tables present', count(*)::text||' / 9',
         case when count(*)=9 then 'PASS' else 'FAIL' end
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind='r'
    and c.relname in ('transport_trip_locations','rx_fulfillment_orders','insurance_policies',
                      'saved_places','events','event_rsvps','nutrition_plans','food_recalls',
                      'pet_food_recall_matches')

  union all
  -- 8. all 8 new DEFINER functions present
  select 8, '8 new functions present', count(*)::text||' / 8',
         case when count(*)=8 then 'PASS' else 'FAIL' end
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname in
   ('app_can_post_trip_location','app_can_read_trip_location','app_owns_fulfillable_rx',
    'fulfill_rx_order','activate_insurance_policy','ingest_food_recall','match_food_recall','delete_my_account')
)
select check_name, detail, status from checks order by ord, check_name;
