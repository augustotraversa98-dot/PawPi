-- 0043_provider_service_images.sql
-- Phase 2 ticket 2.23: let providers attach IMAGES to their SERVICES (their "store").
-- shop_products already carries image_urls (0037); this adds the matching column to
-- provider_services so a service can render with photos on the storefront / service menu /
-- booking flow.
--
-- ADDITIVE: a single text[] column with a '{}' default, so existing rows get an empty array
-- and every current insert/select keeps working. NO new table, so the RLS completeness guard
-- is unaffected; NO policy change — provider_services already has its admin-write +
-- published-active public-read policies (0024) and this column rides them unchanged. Idempotent.
--
-- HARNESS-ONLY THIS TICKET — proven as pawpi_app in the integration harness; hand-applied to
-- Supabase AFTER merge (see the PR body / test-backlog ACTION 1).

alter table provider_services
  add column if not exists image_urls text[] not null default '{}';
