-- Verification for migration 0121 (VR-C — vet_documents.category). Run in the Supabase SQL
-- editor AFTER applying 0121. EVERY row should read PASS.
with checks as (
  select 1 as ord, 'vet_documents.category column present' as check_name,
         count(*)::text||' / 1' as detail,
         case when count(*)=1 then 'PASS' else 'FAIL' end as status
  from information_schema.columns
  where table_schema='public' and table_name='vet_documents' and column_name='category'

  union all
  select 2, 'vet_documents_category_check CHECK present',
         coalesce(string_agg(conname, ','),'(none)'),
         case when count(*)=1 then 'PASS' else 'FAIL' end
  from pg_constraint
  where conrelid='public.vet_documents'::regclass and contype='c'
    and conname='vet_documents_category_check'

  union all
  -- Guard: 0121 must not change vet_documents' RLS posture (owner-private + family, unchanged).
  select 3, 'vet_documents RLS still ENABLE+FORCE (unchanged)',
         'enabled='||coalesce(relrowsecurity::text,'?')||' forced='||coalesce(relforcerowsecurity::text,'?'),
         case when relrowsecurity and relforcerowsecurity then 'PASS' else 'FAIL' end
  from pg_class where oid='public.vet_documents'::regclass

  union all
  -- The five canonical categories are accepted (and a bogus one is rejected) — checked by
  -- confirming the CHECK clause text mentions each bucket.
  select 4, 'CHECK covers the five canonical buckets',
         pg_get_constraintdef(oid),
         case when pg_get_constraintdef(oid) like '%vaccine%'
               and pg_get_constraintdef(oid) like '%lab%'
               and pg_get_constraintdef(oid) like '%visit%'
               and pg_get_constraintdef(oid) like '%invoice%'
               and pg_get_constraintdef(oid) like '%other%'
              then 'PASS' else 'FAIL' end
  from pg_constraint
  where conrelid='public.vet_documents'::regclass and conname='vet_documents_category_check'
)
select ord, check_name, detail, status from checks order by ord;
