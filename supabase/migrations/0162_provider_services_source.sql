-- 0162_provider_services_source.sql
-- Provenance for provider_services rows, so a service filled in by the directory enrichment
-- (supabase/seed/directory/load_enrichment.mjs) is distinguishable from one a business entered
-- itself: an honest audit trail, and a defence against ever writing the same one twice.
--
--   'owner'         — entered by the business (the default: every existing row, and every row the
--                     app creates, is one of these).
--   'auto_enriched' — read from the business's own public website while the listing was unclaimed.
--
-- ADDITIVE: one column with a default, so existing rows and every current insert/select keep
-- working. NO new table and NO policy change — provider_services already has its admin-write and
-- published-active public-read policies (0024) and this column rides them unchanged (the same
-- pattern as 0043's image_urls). No function, so no grant/revoke pair. Idempotent.
--
-- (0161 is taken by the family-follows migration.)
--
-- Hand-applied to Supabase after merge. Verify: supabase/verify_0162.sql (every row PASS).

alter table provider_services
  add column if not exists source text not null default 'owner';

alter table provider_services
  drop constraint if exists provider_services_source_check;
alter table provider_services
  add constraint provider_services_source_check
  check (source = any (array['owner', 'auto_enriched']::text[]));
