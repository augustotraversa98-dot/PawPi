-- 0072_payment_account_read_fn.sql
-- Fix: paid checkout wrongly reports "provider hasn't connected MercadoPago" for a provider
-- that IS connected. PURELY ADDITIVE — one SECURITY DEFINER reader function + a grant. NO
-- table, NO policy change, NO rename/drop. Same definer pattern as app_is_provider_admin (0024).
--
-- ROOT CAUSE: the payment layer (payments/index.js loadProviderAccount, migration 0029) reads
-- the PROVIDER's connected payment account to build a split-payment checkout. But that read runs
-- under the identity of the PAYING CUSTOMER (owner), and provider_payment_accounts is protected by
-- the provider-ADMIN-only policy provider_payment_accounts_admin_all (0024,
-- USING app_is_provider_admin(provider_id)). The payer is not an admin of the provider, so the
-- direct `SELECT` returns ZERO rows → the layer treats the account as "not connected". The payment
-- layer (0029) predates the FORCE-RLS cutover (0024), so this seam was never reconciled.
--
-- WHY A DEFINER READER IS SAFE (and NOT a downgrade of the admin-only policy):
--   * The admin-only RLS invariant is PRESERVED — a customer's DIRECT `select ... from
--     provider_payment_accounts` still returns ZERO (the payments-rls suite asserts this). This
--     function is a SEPARATE, controlled server-side access path used ONLY by the trusted payment
--     layer to charge on the provider's behalf.
--   * Tokens are ENCRYPTED at rest (enc:v1:, ticket 2.16). This returns the same ciphertext; only
--     the app process holds PAYMENTS_TOKEN_KEY to decrypt it. There is no raw-SQL surface for end
--     users, so a granted EXECUTE does not expose a usable token.
--
-- Returns SETOF so `select * from app_get_provider_payment_account(...)` yields the full row (same
-- shape loadProviderAccount already consumes), or zero rows when the provider has no such account.

create or replace function app_get_provider_payment_account(
  p_provider_id integer,
  p_rail text
)
returns setof provider_payment_accounts
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select *
  from provider_payment_accounts
  where provider_id = p_provider_id
    and rail = p_rail
  limit 1
$$;

grant execute on function app_get_provider_payment_account(integer, text) to pawpi_app;
