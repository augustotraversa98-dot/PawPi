// Migration 0127 (AUDIT_2026-09 A-18) — pawpi_app carries a statement timeout and an
// idle-in-transaction timeout, proven on real Postgres.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Sql } from 'postgres';
import { makeTestSql } from './db';

let raw: Sql;
beforeAll(() => { raw = makeTestSql(); });
afterAll(async () => { await raw.end(); });

describe('0127 — pawpi_app timeouts', () => {
  it('sets statement_timeout=15s and idle_in_transaction_session_timeout=30s on the role', async () => {
    const [{ cfg }] = await raw<{ cfg: string[] | null }[]>`
      select rolconfig as cfg from pg_roles where rolname = 'pawpi_app'`;
    expect(cfg).toContain('statement_timeout=15s');
    expect(cfg).toContain('idle_in_transaction_session_timeout=30s');
  });
});
