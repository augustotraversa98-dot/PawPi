// Security-hardening completeness guards, proven against the REAL migration set in
// the embedded-Postgres harness. Companion to rls-gap-closure.integration.test.ts
// (which guards the RLS-on-every-table invariant) — this file guards the
// SECURITY DEFINER search_path invariant and pawpi_app least-privilege posture.
//
// WHY. AUDIT_2026-09 A-32: current_app_user_id() shipped with a role-mutable
// search_path (the one live Supabase security-advisor warning), and the whole RLS
// model leans on SECURITY DEFINER helpers (0019/0023/0024 + the app_* functions)
// that MUST pin search_path — an unpinned DEFINER function is a classic
// search-path-hijack / privilege-escalation hole. This meta-test FAILS, naming the
// function, the moment a future migration adds a DEFINER function in schema public
// without `SET search_path`, so the class cannot silently regress.
//
// HARNESS NUANCE. The harness applies only OUR migrations (supabase/migrations/
// NNNN_*.sql). The anon/authenticated roles and PostgREST do not exist here, so the
// anon-grant half of A-01 cannot be reproduced in-harness — that is covered by the
// hand-applied 0126 + supabase/verify_0126.sql (run on Supabase by the human) and
// by the Part A evidence doc (docs/db-data-api-safety-evidence.md). What the harness
// CAN and does lock: the DEFINER search_path invariant, and that pawpi_app is
// NOBYPASSRLS (a BYPASSRLS app role would silently defeat every policy).

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeTestSql } from './db';
import type { Sql } from 'postgres';

let raw: Sql;

beforeAll(() => {
  raw = makeTestSql();
});

afterAll(async () => {
  await raw.end();
});

describe('security hardening — every SECURITY DEFINER function in public pins search_path', () => {
  it('no SECURITY DEFINER function in schema public is missing a pinned search_path', async () => {
    const offenders = await raw<{ signature: string; config: string | null }[]>`
      select
        p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as signature,
        array_to_string(p.proconfig, ',') as config
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.prosecdef = true
        and (
          p.proconfig is null
          or not exists (
            select 1 from unnest(p.proconfig) as c
            where c like 'search_path=%'
          )
        )
      order by 1
    `;

    // A helpful failure message that names each offending function.
    expect(
      offenders,
      offenders.length
        ? `SECURITY DEFINER function(s) without a pinned search_path (add ` +
            `\`set search_path = public, pg_temp\`): ` +
            offenders.map((o) => o.signature).join(', ')
        : undefined,
    ).toHaveLength(0);
  });

  it('there IS at least one SECURITY DEFINER function (guard is actually exercising rows)', async () => {
    // Sanity: the RLS helpers (0019/0023/0024) + app_* functions are DEFINER, so a
    // zero count would mean the query is wrong, not that the codebase is clean.
    const [{ n }] = await raw<{ n: number }[]>`
      select count(*)::int as n
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.prosecdef = true
    `;
    expect(n).toBeGreaterThan(0);
  });
});

describe('security hardening — the app role posture', () => {
  it('pawpi_app is NOBYPASSRLS (a BYPASSRLS app role would defeat every policy)', async () => {
    const rows = await raw<{ rolbypassrls: boolean; rolsuper: boolean }[]>`
      select rolbypassrls, rolsuper from pg_roles where rolname = 'pawpi_app'
    `;
    expect(rows, 'pawpi_app role must exist (created by 0019)').toHaveLength(1);
    expect(rows[0].rolbypassrls, 'pawpi_app must be NOBYPASSRLS').toBe(false);
    expect(rows[0].rolsuper, 'pawpi_app must NOT be a superuser').toBe(false);
  });
});
