-- 0037_shop_ecommerce.sql
-- Phase 2 ticket 2.11 (docs/phase2-tickets/2.11-shop-ecommerce.md,
-- docs/phase2-superapp-master-plan.md §1 shop row + §3 payments): the SHOP / e-commerce
-- module — a provider with the 'shop' capability sells PRODUCTS (food, toys, meds) with a
-- CATALOG + INVENTORY; owners browse, add to cart, CHECKOUT (pay via 2.3), optionally
-- SUBSCRIBE (auto-reorder, e.g. monthly food); orders carry a FULFILLMENT status.
--
-- ════════════════════════════════════════════════════════════════════════════════
-- WHAT THIS MIGRATION ADDS — exactly ONE new table + TWO additive columns. The rest is
-- REUSE of the 2.3 payments foundation (0029). DO NOT DUPLICATE the order/payment tables.
-- ════════════════════════════════════════════════════════════════════════════════
--   (1) shop_products — the catalog/inventory row (NEW). provider_id, name, description,
--       image_urls[], price_cents, currency, stock_qty, category, is_rx (vet-prescription-
--       required flag), active. Provider-admin writes; a PUBLISHED shop's ACTIVE products are
--       readable by any authed user (DISCOVERY). RLS = ENABLE + FORCE.
--   (2) order_items.product_id — an additive FK from the 2.3 order_items line to its catalog
--       row (the shop SKU). 0029 already carries order_items.product_ref (text); this adds a
--       typed integer FK so stock decrement/restock can resolve the product cheaply and
--       safely (the line → product join). Nullable + ON DELETE SET NULL: a non-shop line
--       (booking/donation) has no product; deleting a product keeps the historical line.
--   (3) subscriptions.product_id + subscriptions.quantity — additive columns on the 2.3
--       subscriptions table so a shop AUTO-REORDER plan = (a product + a cadence + a qty).
--       0029's subscriptions.plan (text) already encodes the cadence ('monthly'…); these add
--       the concrete product the recurring order re-buys. Nullable (a non-shop subscription
--       has no product) + ON DELETE SET NULL.
--
-- ════════════════════════════════════════════════════════════════════════════════
-- CART → ORDER → PAY → STOCK (the flow, all REUSE except shop_products):
-- ════════════════════════════════════════════════════════════════════════════════
--   * the CART is client-side (mobile); on CHECKOUT the owner POSTs a 'product' order via
--     the 2.3 /api/payments/checkout route (kind='product') — orders + order_items reused
--     verbatim. The shop checkout route additionally (a) gates the provider's 'shop'
--     capability, (b) REFUSES out-of-stock / Rx-without-relationship lines BEFORE creating
--     the order (DO-NOT: never sell out-of-stock; never bypass the Rx check).
--   * PAYMENT rides the 2.3 layer (createCheckout → split → provider payout) unchanged.
--   * STOCK is decremented on PAID and restocked on REFUND by the 2.3 payment layer's
--     status-reconciliation hook (applyPaymentStatus), which now adjusts shop_products
--     stock_qty for the product lines of a 'product' order. The decrement is GUARDED
--     (stock_qty >= qty) so a race cannot drive stock negative; refund adds the qty back.
--   * FULFILLMENT status (placed/paid/shipped/delivered/cancelled) lives on the order: the
--     2.3 orders.status already covers pending('placed')→paid→cancelled/refunded; this
--     module ADDS a separate orders.fulfillment_status for the post-payment shipping
--     lifecycle the shop manages (shipped/delivered) WITHOUT touching the 2.3 payment
--     status machine. Additive column, defaulted, CHECK-constrained.
--
-- ════════════════════════════════════════════════════════════════════════════════
-- Rx GATE (documented per the ticket — MIRRORS the consent model):
-- ════════════════════════════════════════════════════════════════════════════════
-- A product flagged is_rx (e.g. a prescription med) may only be purchased FOR a pet that
-- has a valid vet RELATIONSHIP/PRESCRIPTION. We mirror the existing consent chokepoint:
-- the shop checkout route requires, for each is_rx line, that the buyer's pet has EITHER
--   (a) an active care_access_grants row to a 'vet'-capable provider (the consent/Rx
--       relationship — the same care_access model every provider→pet path uses), OR
--   (b) a vet_notes row for that pet (a recorded vet note standing in for a prescription).
-- The DB helper app_pet_has_vet_relationship(pet_id) (SECURITY DEFINER, below) encodes
-- this so it can be reused by the route AND asserted in tests; the route refuses an Rx
-- line for a pet without it (clean 403). Capability ≠ data access: the 'shop' capability
-- only unlocks the module; the Rx check is a SEPARATE pet-relationship gate.
--
-- Identity convention (unchanged): app.current_user_id carries user_profiles.id, NEVER
-- auth_users.id. owner_user_id = user_profiles.id (the buyer). provider_id is the shop;
-- provider WRITE access is by active-staff/admin MEMBERSHIP, never by user_profiles.role.
--
-- ⚠️ HARNESS-ONLY THIS TICKET — proven as `pawpi_app` in the integration harness, NOT
-- applied to Supabase here. Hand-applied to Supabase AFTER merge (see the PR body's
-- "MIGRATION TO APPLY TO SUPABASE" line). DML + sequence grants for the new table are
-- ALREADY provided by 0019's blanket GRANT + ALTER DEFAULT PRIVILEGES (the table is
-- created by the owner role AFTER 0019) — exactly as care_access_grants (0015), the
-- payment tables (0029), and every service module (0032–0036) relied on. No per-table
-- re-grant; the as-pawpi_app test is the proof. The new function gets an explicit
-- GRANT EXECUTE to pawpi_app (mirroring 0027's provider_has_capability).
--
-- ⚠️ RECURSION: the policies below reuse 0019/0024's SECURITY DEFINER helpers
-- (current_app_user_id, app_is_provider_admin) which read provider_staff under DEFINER
-- rights, bypassing that table's FORCE RLS — no recursion. The discovery branch reads
-- providers via a plain EXISTS under providers' OWN SELECT RLS (a published provider is
-- visible to any authed user), the same shape as provider_capabilities (0027) /
-- training_sessions (0036).

-- ════════════════════════════════════════════════════════════════════════════════
-- 1. shop_products — the catalog / inventory row.
-- ════════════════════════════════════════════════════════════════════════════════
--   provider_id   — the shop. CASCADE: dropping the provider drops its catalog.
--   name/description — display fields. name required.
--   image_urls[]  — Supabase Storage URLs of product photos (the existing upload path).
--   price_cents   — unit price in cents (matches orders/payments money convention). >= 0.
--   currency      — ISO currency, defaults 'ARS' (the marketplace region, matches orders).
--   stock_qty     — on-hand inventory. >= 0 (a sold-out product is 0, never negative —
--                   the decrement is guarded). The checkout route refuses qty > stock_qty.
--   category      — free-text catalog category ('food','toys','meds',…). Nullable.
--   is_rx         — TRUE for a prescription-required product (the Rx gate applies).
--   active        — soft on/off switch (the project's soft-delete/active convention): an
--                   inactive product is hidden from discovery + cannot be purchased, but
--                   historical order_items lines keep their product_id link.
create table if not exists shop_products (
  id            integer generated by default as identity primary key,
  provider_id   integer not null references providers(id) on delete cascade,
  name          text not null,
  description   text,
  image_urls    text[] not null default '{}',
  price_cents   integer not null,
  currency      text not null default 'ARS',
  stock_qty     integer not null default 0,
  category      text,
  is_rx         boolean not null default false,
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint shop_products_price_check check (price_cents >= 0),
  constraint shop_products_stock_check check (stock_qty >= 0)
);

create index if not exists idx_shop_products_provider_id on shop_products (provider_id);
-- Discovery filters by active products of published shops; index the active flag.
create index if not exists idx_shop_products_active on shop_products (provider_id, active);

-- ════════════════════════════════════════════════════════════════════════════════
-- 2. order_items.product_id — additive FK to the catalog row (REUSE 0029's order_items).
--    Nullable + SET NULL (a non-shop line has none; a deleted product keeps the history).
-- ════════════════════════════════════════════════════════════════════════════════
alter table order_items
  add column if not exists product_id integer references shop_products(id) on delete set null;

create index if not exists idx_order_items_product_id on order_items (product_id);

-- ════════════════════════════════════════════════════════════════════════════════
-- 3. orders.fulfillment_status — additive SHIPPING lifecycle (REUSE 0029's orders). The
--    2.3 orders.status owns the PAYMENT machine (pending→paid→refunded…); this owns the
--    post-payment SHIPPING machine the shop manages. 'placed' is the pre-ship default.
-- ════════════════════════════════════════════════════════════════════════════════
alter table orders
  add column if not exists fulfillment_status text not null default 'placed';

-- Drop-if-exists then re-add so the migration is re-runnable (the CHECK can't use IF NOT
-- EXISTS). The set mirrors the ticket: placed/paid/shipped/delivered/cancelled.
alter table orders drop constraint if exists orders_fulfillment_status_check;
alter table orders add constraint orders_fulfillment_status_check check (
  fulfillment_status = any (array['placed','paid','shipped','delivered','cancelled']::text[])
);

-- ════════════════════════════════════════════════════════════════════════════════
-- 4. subscriptions.product_id + quantity — additive AUTO-REORDER target (REUSE 0029's
--    subscriptions). plan(text) already carries the cadence; these add the concrete
--    product the recurring order re-buys + how many. Nullable (non-shop subs have none).
-- ════════════════════════════════════════════════════════════════════════════════
alter table subscriptions
  add column if not exists product_id integer references shop_products(id) on delete set null;
alter table subscriptions
  add column if not exists quantity integer not null default 1;

alter table subscriptions drop constraint if exists subscriptions_quantity_check;
alter table subscriptions add constraint subscriptions_quantity_check check (quantity >= 1);

create index if not exists idx_subscriptions_product_id on subscriptions (product_id);

-- ════════════════════════════════════════════════════════════════════════════════
-- 5. app_pet_has_vet_relationship(pet_id) — the Rx-gate predicate (documented above).
--    TRUE when the pet has EITHER an active care_access grant to a vet-capable provider
--    OR a recorded vet note. SECURITY DEFINER + pinned search_path + STABLE (matching
--    0019/0027 helpers) so it reads care_access_grants / vet_notes / provider_capabilities
--    under DEFINER rights — bypassing those tables' FORCE RLS so the gate is correct
--    regardless of the caller's row visibility, and avoiding policy recursion. The route
--    calls this; tests assert it. EXECUTE granted to pawpi_app explicitly.
-- ════════════════════════════════════════════════════════════════════════════════
create or replace function app_pet_has_vet_relationship(p_pet_id integer)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    -- (a) an active, unexpired consent grant to a provider that holds the 'vet' capability
    exists (
      select 1
      from care_access_grants g
      join provider_capabilities pc
        on pc.provider_id = g.provider_id and pc.capability = 'vet'
      where g.pet_id = p_pet_id
        and g.status = 'active'
        and (g.expires_at is null or g.expires_at > now())
    )
    -- (b) OR a recorded vet note for the pet (a prescription stand-in)
    or exists (
      select 1 from vet_notes vn where vn.pet_id = p_pet_id
    )
$$;

grant execute on function app_pet_has_vet_relationship(integer) to pawpi_app;

-- ════════════════════════════════════════════════════════════════════════════════
-- 5b. app_adjust_order_stock(order_id, direction) — the STOCK reconciliation hook the 2.3
--     payment layer calls when a 'product' order becomes paid (direction=-1, DECREMENT) or
--     is refunded (direction=+1, RESTOCK).
--
--     WHY SECURITY DEFINER: shop_products writes are provider-ADMIN-only (RLS above), but
--     stock moves as a SIDE EFFECT of a PAYMENT whose actor is the OWNER (checkout) or a
--     webhook (provider staff) — neither is necessarily a shop admin. Running the inventory
--     move under DEFINER rights lets the payment reconciliation adjust stock without granting
--     owners/webhooks write access to the catalog. It is NARROW: it only ever moves stock for
--     the product lines of the GIVEN order, guarded so stock never goes negative
--     (greatest(0, …) on decrement; the route refuses oversell BEFORE the order exists, so a
--     decrement that would underflow indicates an already-handled race and is clamped).
--
--     Idempotency is the CALLER's concern: applyPaymentStatus only invokes this on a real
--     status TRANSITION into paid/refunded (it reads the prior status first), so a repeated
--     terminal webhook does not double-move stock.
-- ════════════════════════════════════════════════════════════════════════════════
create or replace function app_adjust_order_stock(p_order_id integer, p_direction integer)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_direction = -1 then
    -- DECREMENT on paid: never below zero (the route already refused oversell).
    update shop_products sp
    set stock_qty = greatest(0, sp.stock_qty - oi.qty), updated_at = now()
    from (
      select product_id, sum(quantity) as qty
      from order_items
      where order_id = p_order_id and product_id is not null
      group by product_id
    ) oi
    where sp.id = oi.product_id;
  elsif p_direction = 1 then
    -- RESTOCK on refund: add the ordered qty back.
    update shop_products sp
    set stock_qty = sp.stock_qty + oi.qty, updated_at = now()
    from (
      select product_id, sum(quantity) as qty
      from order_items
      where order_id = p_order_id and product_id is not null
      group by product_id
    ) oi
    where sp.id = oi.product_id;
  end if;
end;
$$;

grant execute on function app_adjust_order_stock(integer, integer) to pawpi_app;

-- ════════════════════════════════════════════════════════════════════════════════
-- 5c. app_set_order_fulfillment(order_id, status) — the SHOP advances the post-payment
--     SHIPPING lifecycle (shipped/delivered/cancelled) WITHOUT being able to touch the 2.3
--     payment-status machine (orders.status), which stays OWNER-write-only (0029).
--
--     WHY SECURITY DEFINER: orders writes are owner-only under 0029's RLS (a provider must
--     never fabricate/mutate an owner's order). But fulfillment IS the provider's job. Rather
--     than widen orders' write RLS, this DEFINER helper authorizes the caller as ACTIVE STAFF
--     of the order's provider (app_is_active_staff_of, itself a DEFINER helper over
--     provider_staff) and then updates ONLY orders.fulfillment_status — orders.status is left
--     untouched. A non-staff caller updates ZERO rows (the membership check fails). Returns
--     the new fulfillment_status, or NULL when not authorized / no such product order.
-- ════════════════════════════════════════════════════════════════════════════════
create or replace function app_set_order_fulfillment(p_order_id integer, p_status text)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_provider integer;
  v_result text;
begin
  -- Resolve the order's provider; only a 'product' order is fulfillable here.
  select provider_id into v_provider
  from orders
  where id = p_order_id and kind = 'product';
  if v_provider is null then
    return null;
  end if;

  -- Authorize: the caller must be active staff of the order's provider.
  if not app_is_active_staff_of(v_provider) then
    return null;
  end if;

  update orders
  set fulfillment_status = p_status, updated_at = now()
  where id = p_order_id
  returning fulfillment_status into v_result;

  return v_result;
end;
$$;

grant execute on function app_set_order_fulfillment(integer, text) to pawpi_app;

-- ════════════════════════════════════════════════════════════════════════════════
-- 6. RLS — shop_products. Provider-admin writes; a PUBLISHED shop's ACTIVE products are
--    readable by any authed (discovery). Mirrors provider_capabilities (0027) two-tier.
-- ════════════════════════════════════════════════════════════════════════════════
alter table shop_products enable row level security;
alter table shop_products force row level security;

-- SELECT: an ACTIVE product of a PUBLISHED provider (DISCOVERY — the providers EXISTS runs
-- under providers' own SELECT RLS, where a published provider is visible to any authed
-- user, so no DEFINER helper is needed) OR provider ADMIN (management read incl. inactive
-- products + a still-draft shop). app_is_provider_admin (0024) is a DEFINER helper over
-- provider_staff, so it bypasses that table's RLS and never recurses.
drop policy if exists shop_products_read on shop_products;
create policy shop_products_read on shop_products
  for select
  using (
    app_is_provider_admin(provider_id)
    or (
      active = true
      and exists (
        select 1 from providers p
        where p.id = provider_id and p.status = 'published'
      )
    )
  );

-- Writes (INSERT/UPDATE/DELETE): provider ADMIN only (catalog/inventory management). FOR
-- ALL with the admin predicate on USING + WITH CHECK — an owner/another provider's staff
-- cannot create or mutate a product.
drop policy if exists shop_products_admin_all on shop_products;
create policy shop_products_admin_all on shop_products
  for all
  using (app_is_provider_admin(provider_id))
  with check (app_is_provider_admin(provider_id));
