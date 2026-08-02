-- 0071_daycare_nightly_rate.sql
-- Daycare per-night pricing — STEP 1 (schema only): a DEDICATED nightly-rate field on the daycare
-- service so a stay can be priced as rate × nights. PURELY ADDITIVE column on provider_services
-- (0014 table; already ENABLE+FORCE RLS from 0024) — NO policy change, NO new table, NO rename/drop.
-- Same additive pattern as 0055/0068/0070.
--
-- The daycare "menu" is provider_services tagged capability='daycare' (migration 0034), so that is
-- where the rate lives. `nightly_rate_cents` is a DEDICATED field (kept separate from the generic
-- price_cents on purpose — a stay's price is rate × nights, not a flat price). The provider's choice
-- of WHEN to charge reuses the existing payment_policy (0070): 'full' charges nightly_rate_cents ×
-- nights, 'deposit' charges the existing deposit_cents (flat), 'none' is free / pay in person. Amounts
-- stay in cents (integer), matching the orders/payments convention. The charge is still an
-- orders/payments row (0029); a stay links to it via the order source_ref = 'daycare:<stayId>'.
--
-- ⚠️ HARNESS-ONLY THIS TICKET — proven as pawpi_app in the integration harness; hand-applied to
-- Supabase AFTER merge (test-backlog ACTION 1). Idempotent (safe to run twice).

alter table provider_services
  add column if not exists nightly_rate_cents integer;

alter table provider_services
  drop constraint if exists provider_services_nightly_rate_check;
alter table provider_services
  add constraint provider_services_nightly_rate_check
  check (nightly_rate_cents is null or nightly_rate_cents >= 0);
