// verify_0136_pawpi_app_password.sql (the hand-applied pawpi_app password rotation, docs/ops/secret-rotation-runbook.md)
// must read PASS on every row when run AS pawpi_app against the harness schema, and must be able to FAIL.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Sql } from 'postgres';
import { makeTestSql } from './db';
import { MIGRATIONS_DIR } from './migrate';

let raw: Sql;
beforeAll(() => {
  raw = makeTestSql();
});
afterAll(async () => {
  await raw.end();
});

const verifySql = readFileSync(join(MIGRATIONS_DIR, '..', 'verify_0136_pawpi_app_password.sql'), 'utf8');
type Row = { ord: number; check_name: string; detail: string; status: string };

// Runs the script inside a transaction that is always rolled back, optionally as another session user.
async function run(setup: string[], asPawpiApp: boolean): Promise<Row[]> {
  const ROLLBACK = new Error('rollback');
  let rows: Row[] = [];
  await raw
    .begin(async (tx) => {
      for (const stmt of setup) await tx.unsafe(stmt);
      if (asPawpiApp) await tx.unsafe('set local session authorization pawpi_app');
      rows = await tx.unsafe<Row[]>(verifySql);
      throw ROLLBACK;
    })
    .catch((e) => {
      if (e !== ROLLBACK) throw e;
    });
  return rows;
}

describe('verify_0136_pawpi_app_password.sql', () => {
  it('every row reads PASS when connected as pawpi_app', async () => {
    const rows = await run(["alter role pawpi_app set statement_timeout = '15s'", "alter role pawpi_app set idle_in_transaction_session_timeout = '30s'"], true);
    expect(rows).toHaveLength(7);
    const failing = rows.filter((r) => r.status !== 'PASS').map((r) => `${r.ord} ${r.check_name} -> ${r.detail}`);
    expect(failing, `rows not PASS:\n${failing.join('\n')}`).toEqual([]);
  });

  it('row 1 fails when run as a different role (the new password was not what authenticated)', async () => {
    const rows = await run([], false);
    expect(rows.find((r) => r.ord === 1)?.status).toBe('FAIL');
  });

  it('flags a pawpi_app that was given extra privileges', async () => {
    const rows = await run(['alter role pawpi_app createdb'], true);
    expect(rows.find((r) => r.ord === 2)?.status).toBe('FAIL');
  });

  it('flags a pawpi_app whose password has expired', async () => {
    const rows = await run(["alter role pawpi_app valid until '2000-01-01'"], true);
    expect(rows.find((r) => r.ord === 3)?.status).toBe('FAIL');
  });
});
