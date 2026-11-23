// verify_0137.sql (app_pet_ring_segments authorises its caller; sharing audit gap A2) must read PASS on every row
// against the harness schema, and must be able to FAIL when the function is the old unguarded 0119 body.

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

const verifySql = readFileSync(join(MIGRATIONS_DIR, '..', 'verify_0137.sql'), 'utf8');
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

const SEED_PET = [
  "insert into auth_users (id, name, email) values (990137, 'v0137', 'v0137@example.com')",
  "insert into user_profiles (id, auth_user_id, username, onboarding_completed) values (990137, 990137, 'v0137', true)",
  "insert into pets (id, owner_user_id, name, handle) values (990137, 990137, 'VerifyDog', 'v0137-verifydog')",
  "insert into health_walk_logs (pet_id, owner_user_id, start_time) values (990137, 990137, now())",
];

// The pre-0137 body (0119), restored to prove the script can FAIL.
const OLD_BODY = `
create or replace function app_pet_ring_segments(p_pet integer, p_tz text, p_day date)
returns table (walk_done boolean, moment_done boolean, care_done boolean)
language sql security definer set search_path = public, pg_temp as $$
  select exists (select 1 from health_walk_logs w where w.pet_id = p_pet) as walk_done,
         false as moment_done, false as care_done;
$$`;

describe('verify_0137.sql', () => {
  it('every row reads PASS (with real pets present, so the no-identity row is meaningful)', async () => {
    const rows = await run(SEED_PET);
    expect(rows).toHaveLength(7);
    const failing = rows.filter((r) => r.status !== 'PASS').map((r) => `${r.ord} ${r.check_name} -> ${r.detail}`);
    expect(failing, `rows not PASS:\n${failing.join('\n')}`).toEqual([]);
    expect(rows.find((r) => r.ord === 4)?.detail).toMatch(/0 row\(s\) returned \(\d+ pet\(s\) exist\)/);
  });

  it('rows 3 and 4 FAIL against the old unguarded function body', async () => {
    const rows = await run([...SEED_PET, OLD_BODY]);
    expect(rows.find((r) => r.ord === 3)?.status).toBe('FAIL');
    expect(rows.find((r) => r.ord === 4)?.status).toBe('FAIL');
  });

  it('row 6 FAILs when PUBLIC can execute the function again', async () => {
    const rows = await run(['grant execute on function app_pet_ring_segments(integer, text, date) to public']);
    expect(rows.find((r) => r.ord === 6)?.status).toBe('FAIL');
  });

  it('row 5 FAILs when pawpi_app cannot execute it', async () => {
    const rows = await run(['revoke execute on function app_pet_ring_segments(integer, text, date) from pawpi_app']);
    expect(rows.find((r) => r.ord === 5)?.status).toBe('FAIL');
  });

  // verify_0119 (applied long ago) calls the ring function directly as the SQL-editor superuser, with seeded rows. Since 0137 it
  // needs the throwaway owner as the identity in scope; this proves the amended script still reads PASS on every row.
  it('verify_0119.sql still reads PASS after 0137 (its throwaway owner is set as the identity)', async () => {
    const v0119 = readFileSync(join(MIGRATIONS_DIR, '..', 'verify_0119.sql'), 'utf8');
    const stmts = v0119
      .split('\n').filter((l) => !l.trim().startsWith('--')).join('\n')
      .split(';').map((x) => x.trim()).filter((x) => x && !/^(begin|rollback)$/i.test(x));
    const ROLLBACK = new Error('rollback');
    const statuses: string[] = [];
    await raw
      .begin(async (tx) => {
        for (const st of stmts) {
          const res = await tx.unsafe<{ status?: string }[]>(st);
          for (const r of res) if (r.status) statuses.push(r.status);
        }
        throw ROLLBACK;
      })
      .catch((e) => { if (e !== ROLLBACK) throw e; });
    expect(statuses).toEqual(['PASS', 'PASS', 'PASS']);
  });
});
