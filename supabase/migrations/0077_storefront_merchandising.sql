-- 0077_storefront_merchandising.sql
-- Storefront Phase 2a (merchandising foundation): make section-order override, item
-- sort_order, "featured", and product discount REAL in the schema — CONSUMED by mobile,
-- but with NO editor UI / preview / drag-and-drop (those are 2b/2c). Additive, idempotent,
-- re-runnable. Zero visible change until a row is hand-set (defaults 0 / false / NULL),
-- exactly like the slot foundation (0076) de-risked its schema before the picker.
--
-- Mirrors the 0055 adoption is_featured prior art (additive flags that RIDE the existing
-- per-row RLS — no policy change, no new table). Discount lives on PRODUCTS only; services
-- carry sort_order + is_featured but no discount.
--
-- ⚠️ HARNESS-ONLY THIS PR — the integration harness applies this to a throwaway Postgres.
-- It is NOT auto-applied to Supabase; hand-apply after merge (see the PR body's
-- "MIGRATION TO APPLY IN SUPABASE" block). Plain idempotent DDL (no functions /
-- dollar-quoting) so the harness runs the whole file in one simple-query call.

-- ════════════════════════════════════════════════════════════════════════════════
-- 1. shop_products — manual sort, featured flag, and a "was" price for discounts.
--    compare_at_cents is the pre-discount price; NULL = no discount. The CHECK keeps a
--    discount honest (the was-price must exceed the current price).
-- ════════════════════════════════════════════════════════════════════════════════
alter table shop_products
  add column if not exists sort_order       integer not null default 0,
  add column if not exists is_featured      boolean not null default false,
  add column if not exists compare_at_cents integer;

alter table shop_products
  drop constraint if exists shop_products_compare_at_check;
alter table shop_products
  add constraint shop_products_compare_at_check
  check (compare_at_cents is null or compare_at_cents > price_cents);

-- Featured-first, then manual order, then recency (mirrors 0055's featured index).
create index if not exists idx_shop_products_order
  on shop_products (provider_id, is_featured desc, sort_order asc, created_at desc);

-- ════════════════════════════════════════════════════════════════════════════════
-- 2. provider_services — manual sort + featured flag (NO discount on services).
-- ════════════════════════════════════════════════════════════════════════════════
alter table provider_services
  add column if not exists sort_order  integer not null default 0,
  add column if not exists is_featured boolean not null default false;

create index if not exists idx_provider_services_order
  on provider_services (provider_id, is_featured desc, sort_order asc, created_at asc);

-- ════════════════════════════════════════════════════════════════════════════════
-- 3. providers.storefront_section_order — an optional per-provider section override.
--    NULL = use the archetype default (getStorefrontTabs) unchanged. A text[] of section
--    keys (services/items/posts/reviews/locations/about); the mobile resolver validates it
--    against the archetype's allowed sections, so a stale/unknown key is dropped safely.
-- ════════════════════════════════════════════════════════════════════════════════
alter table providers
  add column if not exists storefront_section_order text[];
