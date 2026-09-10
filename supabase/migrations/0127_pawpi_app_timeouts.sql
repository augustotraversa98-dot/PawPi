-- 0127_pawpi_app_timeouts.sql
-- Hang budget for the app role — AUDIT_2026-09 finding A-18 (P1).
--
-- ⚠️ HAND-APPLY AFTER REVIEW (role setting; affects every new pawpi_app session).
--
-- WHY. pawpi_app had no statement_timeout (rolconfig NULL; Supabase's own `authenticated`
-- role carries 8 s). The app holds one pooled connection for the whole request
-- (withRequestContext) with a pool of 10, and twelve routes do third-party I/O inside that
-- transaction. One slow statement (or a stalled third-party call while the transaction is
-- open) therefore pins a connection; ten of them queue every other request behind
-- postgres.js's wait list and the app looks "stuck loading" for everyone.
--
-- WHAT. Two per-role limits, applied at session start for pawpi_app only:
--   statement_timeout                 15 s  — no single statement may run longer (the slowest
--                                             hot query today is ~100 ms; batch jobs issue
--                                             many short statements, not one long one).
--   idle_in_transaction_session_timeout 30 s — a request transaction left open (e.g. awaiting
--                                             a third-party call that hangs) is rolled back
--                                             and its connection returned to the pool.
-- Seeds / migrations run as postgres and are unaffected. Harness: pawpi_app exists there
-- (0019), so the same limits apply to integration tests — none holds a statement or an idle
-- transaction that long.
--
-- ROLLBACK: alter role pawpi_app reset statement_timeout;
--           alter role pawpi_app reset idle_in_transaction_session_timeout;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'pawpi_app') then
    execute $q$alter role pawpi_app set statement_timeout = '15s'$q$;
    execute $q$alter role pawpi_app set idle_in_transaction_session_timeout = '30s'$q$;
  end if;
end
$$;
