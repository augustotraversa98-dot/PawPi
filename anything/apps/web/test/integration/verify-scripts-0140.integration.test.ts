// verify_0140.sql (own-row policies also require the pet to be the caller's) must read PASS on every row against the harness
// schema, and each row must be able to FAIL.

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

const verifySql = readFileSync(join(MIGRATIONS_DIR, '..', 'verify_0140.sql'), 'utf8');
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

// the pre-0140 (0022) policy shape, for the "can FAIL" cases
const OLD_POLICY = [
  'drop policy health_pee_logs_owner_all on health_pee_logs',
  'create policy health_pee_logs_owner_all on health_pee_logs for all using (owner_user_id = current_app_user_id()) with check (owner_user_id = current_app_user_id())',
];

describe('verify_0140.sql', () => {
  it('every row reads PASS', async () => {
    const rows = await run([]);
    expect(rows).toHaveLength(6);
    const failing = rows.filter((r) => r.status !== 'PASS').map((r) => `${r.ord} ${r.check_name} -> ${r.detail}`);
    expect(failing, `rows not PASS:\n${failing.join('\n')}`).toEqual([]);
  });

  it('row 1 FAILs against the pre-0140 policy (no pet check)', async () => {
    expect(status(await run(OLD_POLICY), 1)).toBe('FAIL');
  });

  it('row 2 FAILs if USING is widened to include the pet check (reads would change)', async () => {
    const rows = await run([
      'drop policy health_pee_logs_owner_all on health_pee_logs',
      'create policy health_pee_logs_owner_all on health_pee_logs for all using (owner_user_id = current_app_user_id() and app_owns_pet(pet_id)) with check (owner_user_id = current_app_user_id() and app_owns_pet(pet_id))',
    ]);
    expect(status(rows, 2)).toBe('FAIL');
  });

  it('row 3 FAILs when a table has a second *_owner_all policy', async () => {
    const rows = await run(['create policy extra_owner_all on health_pee_logs for select using (true)']);
    expect(status(rows, 3)).toBe('FAIL');
  });

  it('row 4 FAILs when FORCE RLS is removed', async () => {
    expect(status(await run(['alter table routines no force row level security']), 4)).toBe('FAIL');
  });

  it('row 5 FAILs when pawpi_app cannot execute app_owns_pet', async () => {
    expect(status(await run(['revoke execute on function app_owns_pet(integer) from pawpi_app']), 5)).toBe('FAIL');
  });

  it('row 6 FAILs when a row exists whose author does not own its pet', async () => {
    const rows = await run([
      "insert into auth_users (id, name, email) values (91, 'a', 'a@example.com'), (92, 'b', 'b@example.com')",
      "insert into user_profiles (id, auth_user_id, username) values (91, 91, 'va'), (92, 92, 'vb')",
      "insert into pets (id, owner_user_id, name, handle) values (91, 91, 'P', 'vp')",
      'insert into health_food_logs (pet_id, owner_user_id) values (91, 92)',
    ]);
    expect(status(rows, 6)).toBe('FAIL');
  });
});
