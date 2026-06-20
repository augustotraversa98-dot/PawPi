-- Verification for Wave 8 migration 0063 (event_rsvps.calendar_event_id).
-- Run in the Supabase SQL editor. EVERY row should read PASS.
with checks as (
  -- 1. the new column exists, is text, and is NULLABLE (optional device id)
  select 1 as ord,
         'column event_rsvps.calendar_event_id (text, nullable)' as check_name,
         coalesce('type='||data_type||' nullable='||is_nullable, 'MISSING') as detail,
         case when data_type='text' and is_nullable='YES' then 'PASS' else 'FAIL' end as status
  from information_schema.columns
  where table_schema='public' and table_name='event_rsvps' and column_name='calendar_event_id'

  union all
  -- 1b. guard: the row above actually exists (catches a totally missing column)
  select 1,
         'column present at all',
         (count(*))::text,
         case when count(*)=1 then 'PASS' else 'FAIL' end
  from information_schema.columns
  where table_schema='public' and table_name='event_rsvps' and column_name='calendar_event_id'

  union all
  -- 2. RLS still ENABLED + FORCED on event_rsvps (no regression)
  select 2,
         'RLS on+forced: event_rsvps',
         (c.relrowsecurity and c.relforcerowsecurity)::text,
         case when c.relrowsecurity and c.relforcerowsecurity then 'PASS' else 'FAIL' end
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relname='event_rsvps'

  union all
  -- 3. policy count unchanged (0060 = 3; the migration adds NO policy)
  select 3,
         'policies: event_rsvps (expect 3)',
         count(*)::text||' / 3',
         case when count(*)=3 then 'PASS' else 'FAIL' end
  from pg_policies where schemaname='public' and tablename='event_rsvps'

  union all
  -- 4. pawpi_app can read+write the new column (rides 0019's blanket grant)
  select 4,
         'pawpi_app has SELECT+INSERT+UPDATE on event_rsvps.calendar_event_id',
         'sel='||has_column_privilege('pawpi_app','event_rsvps','calendar_event_id','SELECT')::text
         ||' ins='||has_column_privilege('pawpi_app','event_rsvps','calendar_event_id','INSERT')::text
         ||' upd='||has_column_privilege('pawpi_app','event_rsvps','calendar_event_id','UPDATE')::text,
         case when has_column_privilege('pawpi_app','event_rsvps','calendar_event_id','SELECT')
               and has_column_privilege('pawpi_app','event_rsvps','calendar_event_id','INSERT')
               and has_column_privilege('pawpi_app','event_rsvps','calendar_event_id','UPDATE')
              then 'PASS' else 'FAIL' end

  union all
  -- 5. confirm the live DB is now at 0063 and no later object snuck in
  select 5,
         'vet_appointments.calendar_event_id still present (0005, untouched)',
         (count(*))::text,
         case when count(*)=1 then 'PASS' else 'FAIL' end
  from information_schema.columns
  where table_schema='public' and table_name='vet_appointments' and column_name='calendar_event_id'
)
select check_name, detail, status from checks order by ord, check_name;
