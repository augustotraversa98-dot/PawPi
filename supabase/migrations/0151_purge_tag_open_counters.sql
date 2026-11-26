-- 0151_purge_tag_open_counters.sql
-- Retention: the per-sender counters for opening a public tag / vet-card page now age out after 90 days, like the finder
-- messages and the finder-message counters already do.
--
-- app_purge_finder_details() (0146; run hourly by POST /api/notifications/push-receipts/run) removed old rate_limit_hits rows
-- only for the 'emergency_relay*' buckets. The bucket used when a public tag or card page is opened,
-- 'emergency_public_read' (utils/rateLimit.js, keyed on a hash of the sender's address), was never matched, so those rows
-- were only removed when the same sender came back or by the manual app_rate_limit_gc. This adds that bucket.
--
-- Nothing else changes: same name, same (empty) argument list, same notification clean-up and 90-day period, same
-- SECURITY DEFINER / pinned search_path / app-only execute. The period must stay equal to utils/finderRetention.js.
-- CREATE OR REPLACE keeps the existing grants; the REVOKE/GRANT pair is repeated per the migration rules.
--
-- Data: read-only counts on 2026-11-26 found 4 'emergency_public_read' rows, the oldest from that day, none past 90 days,
-- so nothing is removed by applying this; the next hourly run (or `select app_purge_finder_details();`) applies it from then on.
-- ADDITIVE and IDEMPOTENT. HAND-APPLIED after merge — supabase/verify_0151.sql (every row PASS). Proven as pawpi_app, through
-- the real cron route, in test/integration/tag-open-counter-retention.integration.test.ts.

create or replace function app_purge_finder_details()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_cleared integer;
begin
  update notifications
     set body = null,
         finder_contact = case
           when finder_contact ? 'pet_name' then jsonb_build_object('pet_name', finder_contact -> 'pet_name')
         end
   where type = 'emergency_contact'
     and created_at < now() - interval '90 days'
     and (body is not null or (finder_contact - 'pet_name') <> '{}'::jsonb);
  get diagnostics v_cleared = row_count;

  delete from rate_limit_hits
   where (bucket like 'emergency\_relay%' or bucket = 'emergency_public_read')
     and window_start < now() - interval '90 days';

  return v_cleared;
end;
$$;

revoke execute on function app_purge_finder_details() from public;
do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke execute on function app_purge_finder_details() from %I', r);
    end if;
  end loop;
end
$$;
grant execute on function app_purge_finder_details() to pawpi_app;
