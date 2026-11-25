-- 0144_log_logged_by.sql
-- Family-sharing series PR 7/7 (night run #4): who logged each health entry.
--
-- WHAT. On the 11 health log tables:
--   • logged_by_user_id  the person who wrote the row (user_profiles.id; set null when that account is deleted);
--   • logged_by_known    true once the row was written with a known author. It tells "written before this migration"
--                        (false: show nothing) from "the author's account is gone" (true + null: "Former member").
--   Both are stamped by a BEFORE INSERT trigger from the request identity (current_app_user_id()), so no route has to
--   send them and a client cannot claim to be somebody else. They cannot be re-assigned by an UPDATE (clearing the id is
--   allowed: that is what the account deletion does). Rows written with no identity (seeds, admin SQL) keep what they
--   were given.
--   No backfill: older entries have no known author (they are stored under the pet owner's id for everyone).
--   No policy change: the columns ride the existing RLS of each table.
--
-- IDEMPOTENT. HAND-APPLIED: supabase/verify_0144.sql (every row PASS); rollback: supabase/rollback_0144.sql. The API
-- works before and after: without the columns nothing is shown.

create or replace function app_stamp_logged_by()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    if current_app_user_id() is not null then
      new.logged_by_user_id := current_app_user_id();
      new.logged_by_known := true;
    end if;
  else
    if new.logged_by_user_id is not null then
      new.logged_by_user_id := old.logged_by_user_id;
    end if;
    new.logged_by_known := old.logged_by_known;
  end if;
  return new;
end;
$$;

revoke execute on function app_stamp_logged_by() from public;
do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke execute on function app_stamp_logged_by() from %I', r);
    end if;
  end loop;
end
$$;
grant execute on function app_stamp_logged_by() to pawpi_app;

do $$
declare
  t text;
  log_tables text[] := array[
    'health_food_logs',
    'health_general_checks',
    'health_medical_care_logs',
    'health_mobility_logs',
    'health_pee_logs',
    'health_photo_checks',
    'health_poo_logs',
    'health_vomit_logs',
    'health_walk_logs',
    'health_weight_logs',
    'health_wellness_logs'
  ];
begin
  foreach t in array log_tables loop
    execute format('alter table %I add column if not exists logged_by_user_id integer references user_profiles(id) on delete set null', t);
    execute format('alter table %I add column if not exists logged_by_known boolean not null default false', t);
    execute format('create index if not exists %I on %I (logged_by_user_id)', 'idx_' || t || '_logged_by', t);
    execute format('drop trigger if exists trg_stamp_logged_by on %I', t);
    execute format('create trigger trg_stamp_logged_by before insert or update on %I for each row execute function app_stamp_logged_by()', t);
  end loop;
end
$$;
