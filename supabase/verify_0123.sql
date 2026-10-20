-- Verification for migration 0123 (care_access_grants INSERT policy gains an OWNER branch — issue #506).
-- Run in the Supabase SQL editor AFTER applying 0123. EVERY row should read PASS.
--
-- Without 0123 the owner-initiated "Share clinic history" (POST /api/care-access/grants) fails the
-- WITH CHECK under FORCE RLS and the route answers 500.
with checks as (
  select 1 as ord, 'care_access_grants RLS still ENABLE + FORCE' as check_name,
         'enabled=' || relrowsecurity::text || ' forced=' || relforcerowsecurity::text as detail,
         case when relrowsecurity and relforcerowsecurity then 'PASS' else 'FAIL' end as status
  from pg_class where oid = 'public.care_access_grants'::regclass

  union all
  select 2, 'exactly one INSERT policy: care_access_grants_insert',
         coalesce(string_agg(policyname, ','), '(none)'),
         case when count(*) = 1 and min(policyname) = 'care_access_grants_insert' then 'PASS' else 'FAIL' end
  from pg_policies
  where schemaname = 'public' and tablename = 'care_access_grants' and cmd = 'INSERT'

  union all
  select 3, 'INSERT check keeps the PROVIDER branch (active staff, requested_by = provider)',
         left(coalesce(with_check, '(null)'), 120),
         case when with_check like '%app_is_active_staff_of%' and with_check like '%provider%' then 'PASS' else 'FAIL' end
  from pg_policies
  where schemaname = 'public' and tablename = 'care_access_grants' and policyname = 'care_access_grants_insert'

  union all
  select 4, 'INSERT check has the OWNER branch (requested_by = owner)',
         left(coalesce(with_check, '(null)'), 120),
         case when with_check like '%owner%' and with_check like '%current_app_user_id%' then 'PASS' else 'FAIL' end
  from pg_policies
  where schemaname = 'public' and tablename = 'care_access_grants' and policyname = 'care_access_grants_insert'

  union all
  -- The security-critical part: the owner branch must gate on OWNING THE PET, not just on owner_user_id.
  select 5, 'owner branch gates on pet ownership (subquery on pets) — no privilege-escalation hole',
         'with_check references pets = ' || (with_check like '%pets%')::text,
         case when with_check like '%pets%' and with_check like '%pet_id%' then 'PASS' else 'FAIL' end
  from pg_policies
  where schemaname = 'public' and tablename = 'care_access_grants' and policyname = 'care_access_grants_insert'

  union all
  select 6, 'SELECT / UPDATE policies untouched (still present)',
         string_agg(cmd, ',' order by cmd),
         case when count(*) filter (where cmd = 'SELECT') >= 1 and count(*) filter (where cmd = 'UPDATE') >= 1
              then 'PASS' else 'FAIL' end
  from pg_policies
  where schemaname = 'public' and tablename = 'care_access_grants' and cmd in ('SELECT', 'UPDATE')
)
select ord, check_name, detail, status from checks order by ord;
