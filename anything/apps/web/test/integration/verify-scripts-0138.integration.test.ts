// verify_0138.sql (request_idempotency_keys) must read PASS on every row against the harness schema, and must be able to FAIL.

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

const verifySql = readFileSync(join(MIGRATIONS_DIR, '..', 'verify_0138.sql'), 'utf8');
type Row = { ord: number; check_name: string; detail: string; status: string };

// Runs the script inside a transaction that is always rolled back (as the superuser, like the SQL editor).
async function run(setup: string[]): Promise<Row[]> {
  const ROLLBACK = new Error('rollback');
  let rows: Row[] = [];
  await raw
    .begin(async (tx) => {
      for (const stmt of setup) await tx.unsafe(stmt);
      rows = await tx.unsafe<Row[]>(verifySql);
      throw ROLLBACK;
    })
    .catch((e) => {
      if (e !== ROLLBACK) throw e;
    });
  return rows;
}

describe('verify_0138.sql', () => {
  it('every row reads PASS', async () => {
    const rows = await run([]);
    expect(rows).toHaveLength(7);
    const failing = rows.filter((r) => r.status !== 'PASS').map((r) => `${r.ord} ${r.check_name} -> ${r.detail}`);
    expect(failing, `rows not PASS:\n${failing.join('\n')}`).toEqual([]);
  });

  it('row 2 FAILs when FORCE RLS is removed', async () => {
    const rows = await run(['alter table request_idempotency_keys no force row level security']);
    expect(rows.find((r) => r.ord === 2)?.status).toBe('FAIL');
  });

  it('row 3 FAILs when a second (permissive) policy is added', async () => {
    const rows = await run(['create policy leak on request_idempotency_keys for select using (true)']);
    expect(rows.find((r) => r.ord === 3)?.status).toBe('FAIL');
  });

  it('row 7 FAILs when PUBLIC is granted access', async () => {
    const rows = await run(['grant select on request_idempotency_keys to public']);
    expect(rows.find((r) => r.ord === 7)?.status).toBe('FAIL');
  });

  it('row 6 FAILs when pawpi_app loses DML', async () => {
    const rows = await run(['revoke delete on request_idempotency_keys from pawpi_app']);
    expect(rows.find((r) => r.ord === 6)?.status).toBe('FAIL');
  });

  it('every row FAILs (not errors) when the table is absent', async () => {
    const rows = await run(['drop table request_idempotency_keys']);
    expect(rows.find((r) => r.ord === 1)?.status).toBe('FAIL');
  });
});
