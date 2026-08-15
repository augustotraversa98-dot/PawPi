-- 0113_rate_limit_hits.sql
-- PP3 (pre-launch polish fix-pack) — a shared-store write rate limiter.
--
-- BACKGROUND: the pre-launch night run's security audit (A4) found PawPi strong on
-- authorization (48 RLS integration files proving cross-tenant denial) but with ONE
-- open gap: no application-level throttle on writes. Nothing stopped a single
-- account from posting, commenting, reporting, following or booking in a tight loop
-- — an abuse and a cost problem, not an authorization one.
--
-- WHY A TABLE AND NOT AN IN-PROCESS MAP: the web app runs as multiple Railway
-- instances behind a load balancer, so an in-memory counter is per-instance and a
-- caller simply spreads their burst across replicas. The counter has to live in the
-- one thing every instance shares — Postgres.
--
-- MECHANISM: fixed windows. Each (bucket, subject) has AT MOST ONE live row — the
-- current window — and the DEFINER function below both increments it and drops the
-- caller's own expired row in the same call, so the table stays proportional to the
-- number of ACTIVE subjects rather than growing with traffic.
--
--   bucket  — which action ('post_create', 'bark_create', …). Owned by the app-side
--             catalog in utils/rateLimit.js; deliberately NOT a CHECK constraint, so
--             adding a limited endpoint never needs a migration.
--   subject — WHO: 'u:<user_profiles.id>' normally, 'ip:<addr>' when unauthenticated.
--             Prefixed so the two id spaces can never collide.
--
-- ADDITIVE. No existing table, policy or function is touched. Idempotent
-- (create-if-not-exists + CREATE OR REPLACE). Verify: supabase/verify_0113.sql.
--
-- DEGRADES CLEANLY WHILE ABSENT: utils/rateLimit.js runs the call inside a SAVEPOINT
-- and FAILS OPEN — an undefined_function/undefined_table (or any other error) is
-- logged once and the write proceeds exactly as it does today. A limiter that 500s
-- the app it protects is worse than no limiter, and a pre-migration deploy must be a
-- no-op, not an outage.

-- ── 1. rate_limit_hits — one row per (bucket, subject, current window) ────────
create table if not exists rate_limit_hits (
  bucket       text        not null,
  subject      text        not null,
  window_start timestamptz not null,
  hits         integer     not null default 0,
  constraint rate_limit_hits_pkey primary key (bucket, subject, window_start)
);

comment on table rate_limit_hits is
  'PP3 shared-store write rate limiter (fixed window). One live row per '
  '(bucket, subject); written ONLY through app_rate_limit_hit(). Not user data — '
  'a counter — but subject-scoped, so the read policy is own-row like everything else.';

-- Sweeping expired rows by age is the ops path (app_rate_limit_gc); the PK serves
-- every hot lookup, so this index exists purely for that scan.
create index if not exists idx_rate_limit_hits_window
  on rate_limit_hits (window_start);

-- ── RLS: own-row read, and NO write policy at all ─────────────────────────────
-- FORCE RLS with a SELECT-only policy means pawpi_app cannot INSERT or UPDATE this
-- table directly under any code path — the ONLY way a counter moves is through the
-- SECURITY DEFINER function below. That is deliberate: a limiter a caller's own
-- request identity could reset is not a limiter. The read policy is own-row so a
-- user can, in principle, see their own counter and nobody else's ('u:' || NULL is
-- NULL for an unauthenticated caller, which matches no row).
alter table rate_limit_hits enable row level security;
alter table rate_limit_hits force row level security;

drop policy if exists rate_limit_hits_own_read on rate_limit_hits;
create policy rate_limit_hits_own_read on rate_limit_hits
  for select
  using (subject = 'u:' || current_app_user_id()::text);

-- ── 2. app_rate_limit_hit — count one attempt, say whether it is allowed ──────
-- SECURITY DEFINER because the table has no write policy (see above).
--
-- Returns the post-increment count, so the FIRST call in a window returns hits = 1
-- and `allowed` is (hits <= p_limit): a limit of 10 permits exactly 10 calls per
-- window and rejects the 11th.
--
-- Self-cleaning: the upsert reports whether it INSERTED (xmax = 0) — i.e. whether
-- this is the first hit of a new window — and only then deletes this same
-- (bucket, subject)'s older rows. That delete is PK-prefix-matched and runs once
-- per window per subject, so the steady state is one row per active subject and the
-- hot path stays a single upsert.
create or replace function app_rate_limit_hit(
  p_bucket         text,
  p_subject        text,
  p_window_seconds integer,
  p_limit          integer
)
returns table (allowed boolean, hits integer, retry_after_seconds integer)
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_window_start timestamptz;
  v_hits         integer;
  v_inserted     boolean;
begin
  if p_window_seconds is null or p_window_seconds <= 0
     or p_limit is null or p_limit < 0
     or p_bucket is null or p_subject is null then
    raise exception 'app_rate_limit_hit: invalid arguments';
  end if;

  -- Floor now() to the window grid so every instance agrees on the boundary
  -- without coordinating.
  v_window_start := to_timestamp(
    floor(extract(epoch from clock_timestamp()) / p_window_seconds) * p_window_seconds
  );

  insert into rate_limit_hits as r (bucket, subject, window_start, hits)
  values (p_bucket, p_subject, v_window_start, 1)
  on conflict on constraint rate_limit_hits_pkey
    do update set hits = r.hits + 1
  returning r.hits, (r.xmax = 0) into v_hits, v_inserted;

  if v_inserted then
    delete from rate_limit_hits
    where bucket = p_bucket
      and subject = p_subject
      and window_start < v_window_start;
  end if;

  return query
    select v_hits <= p_limit,
           v_hits,
           greatest(
             1,
             ceil(extract(epoch from
               (v_window_start + make_interval(secs => p_window_seconds)) - clock_timestamp()
             ))::integer
           );
end;
$$;

grant execute on function app_rate_limit_hit(text, text, integer, integer) to pawpi_app;

-- ── 3. app_rate_limit_gc — ops sweep for subjects that never came back ────────
-- The self-clean above only fires when a subject hits the same bucket again. A
-- one-off visitor leaves one row behind forever, so this exists to be run
-- occasionally (cron/manual). Returns the number of rows removed.
create or replace function app_rate_limit_gc(p_older_than_seconds integer default 86400)
returns integer
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_deleted integer;
begin
  delete from rate_limit_hits
  where window_start < clock_timestamp() - make_interval(secs => greatest(p_older_than_seconds, 60));
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

grant execute on function app_rate_limit_gc(integer) to pawpi_app;
