-- 0088_provider_live_availability.sql
-- Ticket B1 (docs/phase2-tickets/B1-walker-available-now.md) — a walker business can flip a
-- LIVE "Accepting walks now" presence flag. This is DECISION LOCK 1/2 of Wave B: a lightweight
-- provider-level live status that is SEPARATE from the recurring provider_availability windows
-- (0016/2.4) — the windows keep doing scheduled booking; this only says "we are online right now".
--
-- One row per provider (provider_id is the PK — the write path upserts). The flag carries the
-- walker's CURRENT GPS point at toggle-on (nullable if location was denied) and an auto-expiry so a
-- forgotten toggle does not show "available" forever. A row is AVAILABLE iff
--   accepting = true AND expires_at > now()
-- and that expiry is ALWAYS evaluated at READ time (no cron flips it) — see the API GET.
--
-- ⚠️ HARNESS-ONLY THIS TICKET — proven as `pawpi_app` in the integration harness, NOT applied to
-- Supabase here. Hand-applied to Supabase by Tats AFTER the Wave-B run (flagged in the PR body +
-- docs/test-backlog.md ACTION 1). The consumer code merges/deploys FIRST, so all B1 code DEGRADES
-- CLEANLY while this table is absent (the GET catches undefined_table / 42P01 and returns
-- { accepting:false }; the mobile switch reads OFF). Idempotent. pawpi_app gets table privileges
-- automatically via 0019's blanket + default-privilege grants (like 0083/0082/0077).

create table if not exists provider_live_availability (
  provider_id integer primary key references providers(id) on delete cascade,
  accepting   boolean not null default false,
  lat         numeric(9,6),
  lng         numeric(9,6),
  expires_at  timestamptz,
  updated_at  timestamptz not null default now()
);

-- ── RLS ──────────────────────────────────────────────────────────────────────
-- Read: any authed user MAY read a provider's live presence — but only for a PUBLISHED provider
--   (a draft provider's status is not public), mirroring the discover "published" gate + the
--   provider_capabilities two-tier read (0027). Active staff may also read their OWN provider's
--   row even while still draft (management view).
-- Write (INSERT/UPDATE/DELETE): ACTIVE STAFF of the provider only (app_is_active_staff_of) — the
--   walker who is on shift toggles presence; DECISION LOCK 2. Not admin-only: any active walker
--   staff can flip the shop online.
alter table provider_live_availability enable row level security;
alter table provider_live_availability force row level security;

drop policy if exists provider_live_availability_read on provider_live_availability;
create policy provider_live_availability_read on provider_live_availability
  for select
  using (
    app_is_active_staff_of(provider_id)
    or exists (
      select 1 from providers p
      where p.id = provider_id and p.status = 'published'
    )
  );

drop policy if exists provider_live_availability_staff_write on provider_live_availability;
create policy provider_live_availability_staff_write on provider_live_availability
  for all
  using (app_is_active_staff_of(provider_id))
  with check (app_is_active_staff_of(provider_id));
