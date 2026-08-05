-- Services Hub P4b — buyer-chosen fulfillment on product orders
-- (docs/SERVICES_HUB_PLAN.md §5). Pickup + delivery-ADDRESS only: the buyer picks Pickup
-- or Delivery, and for Delivery we store an address the MERCHANT fulfills themselves. This
-- is deliberately NOT a courier system — no driver assignment, no shipping-fee engine, no
-- live tracking (future phases).
--
-- ADDITIVE + fully back-compatible:
--   • fulfillment_type — 'pickup' | 'delivery'. NOT NULL DEFAULT 'pickup', so every
--     EXISTING order, and any caller that omits it, is a valid pickup order.
--   • shipping_address — jsonb, NULL for pickup; { address, lat, lng } for delivery.
-- No RLS change: orders is already owner-scoped (0029) and FORCE-RLS'd; the new columns
-- ride the existing per-owner policy. No data migration is needed — the DEFAULT backfills
-- existing rows to 'pickup'.

alter table orders
  add column if not exists fulfillment_type text not null default 'pickup';

alter table orders
  add column if not exists shipping_address jsonb;

-- Constrain to the two supported modes. Dropped-first so re-runs stay idempotent.
alter table orders
  drop constraint if exists orders_fulfillment_type_check;
alter table orders
  add constraint orders_fulfillment_type_check
    check (fulfillment_type = any (array['pickup', 'delivery']::text[]));
