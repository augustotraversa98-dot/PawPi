// verify_0139.sql (grantee read + caregiver append-only logging) must read PASS on every row against the harness schema,
// and each row must be able to FAIL.

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

const verifySql = readFileSync(join(MIGRATIONS_DIR, '..', 'verify_0139.sql'), 'utf8');
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

const status = (rows: Row[], ord: number) => rows.find((r) => r.ord === ord)?.status;

describe('verify_0139.sql', () => {
  it('every row reads PASS', async () => {
    const rows = await run([]);
    expect(rows).toHaveLength(8);
    const failing = rows.filter((r) => r.status !== 'PASS').map((r) => `${r.ord} ${r.check_name} -> ${r.detail}`);
    expect(failing, `rows not PASS:\n${failing.join('\n')}`).toEqual([]);
  });

  it('row 1 FAILs when a grantee read policy is missing', async () => {
    expect(status(await run(['drop policy health_pee_logs_grantee_read on health_pee_logs']), 1)).toBe('FAIL');
  });

  it('row 2 FAILs when the caregiver insert policy loses its owner anchor', async () => {
    const rows = await run([
      'drop policy health_pee_logs_caregiver_insert on health_pee_logs',
      'create policy health_pee_logs_caregiver_insert on health_pee_logs for insert with check (app_user_has_pet_access(pet_id))',
    ]);
    expect(status(rows, 2)).toBe('FAIL');
  });

  it('row 3 FAILs if a caregiver could UPDATE a log (a policy on the any-grantee gate for UPDATE)', async () => {
    const rows = await run(['create policy leak_upd on health_pee_logs for update using (app_user_has_pet_access(pet_id))']);
    expect(status(rows, 3)).toBe('FAIL');
  });

  it('row 4 FAILs when pet_medications loses its grantee read policy', async () => {
    expect(status(await run(['drop policy pet_medications_grantee_read on pet_medications']), 4)).toBe('FAIL');
  });

  it('row 5 FAILs if a caregiver could write the meds tables', async () => {
    const rows = await run(['create policy leak_ins on pet_medications for insert with check (app_user_has_pet_access(pet_id))']);
    expect(status(rows, 5)).toBe('FAIL');
  });

  it('row 6 FAILs when FORCE RLS is removed from one of the tables', async () => {
    expect(status(await run(['alter table pet_conditions no force row level security']), 6)).toBe('FAIL');
  });

  it('row 7 FAILs if a private vet record is opened to caregivers', async () => {
    const rows = await run(['create policy leak_docs on vet_documents for select using (app_user_has_pet_access(pet_id))']);
    expect(status(rows, 7)).toBe('FAIL');
  });

  it('row 8 FAILs when a 0049 family policy is dropped', async () => {
    expect(status(await run(['drop policy health_walk_logs_family_all on health_walk_logs']), 8)).toBe('FAIL');
  });
});
