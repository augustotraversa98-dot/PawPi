-- 0138_request_idempotency_keys.sql
-- Family-sharing series PR 2/7 (docs/family-sharing-audit-2026-11.md, gap B8): the OPTIONAL Idempotency-Key header on
-- POST /api/pets — "same owner + same key = the same pet, no second row" for future clients.
--
-- ⚠️ NOT REQUIRED for the duplicate-pet protection that protects builds 30-32. That guard (same owner + same normalised name
-- within a few minutes -> return the existing pet) is pure route logic + a transaction advisory lock and needs no schema.
-- This table only adds the explicit-key path. Until it is applied the route ignores an Idempotency-Key (it degrades on
-- 42P01) and the retry-window guard still applies — nothing breaks, so this can be applied any time after merge.
--
-- WHAT. One small generic table:  (owner_user_id, scope, idem_key) -> resource_id.
--   • owner_user_id  user_profiles.id (never an auth id), ON DELETE CASCADE with the account.
--   • scope          what was created ('pet_create' today) so other endpoints can reuse the table without key collisions.
--   • idem_key       the client's key (route-validated: 8-128 chars of [A-Za-z0-9_.:-]).
--   • resource_id    the created row's id (plain integer, no FK: the table is generic; the route joins to pets and treats a
--                    key whose pet is gone as unused, then re-points it).
--   PRIMARY KEY (owner_user_id, scope, idem_key) is the uniqueness backstop; the route also serialises per owner with a
--   transaction advisory lock, so two simultaneous identical requests cannot both insert.
--
-- RLS (TEMPLATE.sql §1): ENABLE + FORCE, one own-row FOR ALL policy keyed on current_app_user_id() — NULL identity = deny.
-- The app connects as pawpi_app (0019 blanket DML grant + default privileges), so no GRANT is needed and none is made to
-- anon / authenticated / PUBLIC. No function is created (so no REVOKE/GRANT pair is needed).
--
-- Rows are tiny and only written by clients that send a key; no GC yet (created_at is indexed so a later sweep is cheap).
-- Idempotent. HAND-APPLIED after merge: supabase/verify_0138.sql (every row PASS). Proven as pawpi_app in
-- test/integration/pets-duplicate-guard.integration.test.ts.

create table if not exists request_idempotency_keys (
  owner_user_id  integer not null references user_profiles(id) on delete cascade,
  scope          text not null,
  idem_key       text not null,
  resource_id    integer,
  created_at     timestamptz not null default now(),
  constraint request_idempotency_keys_pkey primary key (owner_user_id, scope, idem_key),
  constraint request_idempotency_keys_key_len check (char_length(idem_key) between 8 and 128)
);

alter table request_idempotency_keys enable row level security;
alter table request_idempotency_keys force  row level security;

drop policy if exists request_idempotency_keys_owner_all on request_idempotency_keys;
create policy request_idempotency_keys_owner_all on request_idempotency_keys
  for all
  using      (owner_user_id = current_app_user_id())
  with check (owner_user_id = current_app_user_id());

create index if not exists idx_request_idempotency_keys_created_at on request_idempotency_keys (created_at);
