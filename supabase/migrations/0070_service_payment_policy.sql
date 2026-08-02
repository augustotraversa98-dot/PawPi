-- 0070_service_payment_policy.sql
-- Booking payments — STEP 1 (schema only): let a provider choose, PER SERVICE, whether a booking
-- requires online payment up front. PURELY ADDITIVE column that RIDES the existing provider_services
-- RLS (0024 table; ENABLE+FORCE RLS) — NO policy change, NO new table, NO rename/drop. Same additive
-- pattern as 0055/0068.
--
-- payment_policy:
--   'none'    — pay in person / no online charge (the DEFAULT, so every existing service is unchanged)
--   'deposit' — customer pays deposit_cents (existing column, 0014) up front to request the booking
--   'full'    — customer pays price_cents (existing column) up front to request the booking
--
-- The money model is unchanged: an up-front charge is still an orders/payments row (0029) linked to
-- the booking via vet_appointments.order_id (0030). This column only records the provider's INTENT so
-- the booking flow knows how much (if anything) to charge. Amounts still live in price_cents /
-- deposit_cents; a policy whose amount is null/0 simply charges nothing (booking flow falls back to
-- 'none'). Refund-on-decline reuses the existing refund path.
--
-- ⚠️ HARNESS-ONLY THIS TICKET — proven as pawpi_app in the integration harness; hand-applied to
-- Supabase AFTER merge (test-backlog ACTION 1). Idempotent (safe to run twice).

-- ── provider_services — per-service booking payment policy ───────────────────────
alter table provider_services
  add column if not exists payment_policy text not null default 'none';

alter table provider_services
  drop constraint if exists provider_services_payment_policy_check;
alter table provider_services
  add constraint provider_services_payment_policy_check
  check (payment_policy = any (array['none','deposit','full']::text[]));
