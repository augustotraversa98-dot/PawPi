-- 0132_notification_settings.sql
-- Notifications v2, PR 3c (docs/notifications-v2-design.md): per-owner QUIET HOURS, stored server-side so the
-- sender can enforce them (the old client-only stub could not stop a server push).
--
-- notification_settings — ONE row per owner (owner_user_id = user_profiles.id, the PK):
--   quiet_hours_enabled  default TRUE   (quiet hours are ON until the owner turns them off)
--   quiet_start          default 22     (hour 0-23, owner-local)
--   quiet_end            default 8      (hour 0-23, owner-local; the window may wrap midnight)
-- "Owner-local" uses user_profiles.timezone (written since 3a; America/Buenos_Aires fallback).
-- No row = the defaults above (22:00-08:00), so owners who never open Settings are protected too.
--
-- RLS: ENABLE + FORCE, one own-row FOR ALL policy (owner_user_id = current_app_user_id(); NULL identity => deny).
-- The SENDER runs as the ACTOR (or with no identity at all, from cron), never as the recipient, so it reads the
-- recipient's settings through the DEFINER helper below — the same pattern as app_recipient_locale (0109).
--
-- NOTHING READS THIS UNTIL THE SERVER FLAG NOTIF_V2_ENABLED IS ON; the code that does wraps the read in a savepoint
-- + try/catch and, with the table missing (42P01/42883), uses the same defaults. Idempotent. Human-applied: verify
-- with supabase/verify_0132.sql (every row must read PASS).

create table if not exists notification_settings (
  owner_user_id        integer     primary key references user_profiles(id) on delete cascade,
  quiet_hours_enabled  boolean     not null default true,
  quiet_start          smallint    not null default 22,
  quiet_end            smallint    not null default 8,
  updated_at           timestamptz not null default now(),
  constraint notification_settings_quiet_start_check check (quiet_start between 0 and 23),
  constraint notification_settings_quiet_end_check   check (quiet_end   between 0 and 23)
);

alter table notification_settings enable row level security;
alter table notification_settings force  row level security;

drop policy if exists notification_settings_owner_all on notification_settings;
create policy notification_settings_owner_all on notification_settings
  for all
  using      (owner_user_id = current_app_user_id())
  with check (owner_user_id = current_app_user_id());

-- Recipient's effective quiet-hours settings + zone for the sender (one row; defaults when no settings row;
-- zero rows when the user does not exist).
create or replace function app_recipient_notification_settings(p_user_id integer)
returns table (
  quiet_hours_enabled boolean,
  quiet_start         integer,
  quiet_end           integer,
  timezone            text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(s.quiet_hours_enabled, true),
         coalesce(s.quiet_start, 22)::integer,
         coalesce(s.quiet_end, 8)::integer,
         u.timezone
  from user_profiles u
  left join notification_settings s on s.owner_user_id = u.id
  where u.id = p_user_id;
$$;

grant execute on function app_recipient_notification_settings(integer) to pawpi_app;
