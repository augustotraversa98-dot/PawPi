// verify_0141.sql (family write policies + owner own-row hardening on 3 more tables) must read PASS on every row against the harness
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

const verifySql = readFileSync(join(MIGRATIONS_DIR, '..', 'verify_0141.sql'), 'utf8');
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

describe('verify_0141.sql', () => {
  it('every row reads PASS', async () => {
    const rows = await run([]);
    expect(rows).toHaveLength(9);
    const failing = rows.filter((r) => r.status !== 'PASS').map((r) => `${r.ord} ${r.check_name} -> ${r.detail}`);
    expect(failing, `rows not PASS:\n${failing.join('\n')}`).toEqual([]);
  });

  it('row 1 FAILs when a family policy is missing', async () => {
    expect(status(await run(['drop policy pet_vaccinations_family_all on pet_vaccinations']), 1)).toBe('FAIL');
  });

  it('row 1 FAILs when a family policy loses the owner anchor', async () => {
    const rows = await run([
      'drop policy vet_appointments_family_all on vet_appointments',
      'create policy vet_appointments_family_all on vet_appointments for all using (app_user_has_pet_family(pet_id)) with check (app_user_has_pet_family(pet_id))',
    ]);
    expect(status(rows, 1)).toBe('FAIL');
  });

  it('row 2 FAILs when the medical-profile family insert policy is missing', async () => {
    expect(status(await run(['drop policy pet_medical_profiles_family_insert on pet_medical_profiles']), 2)).toBe('FAIL');
  });

  it('row 3 FAILs if a caregiver (any-grantee helper) could write one of the tables', async () => {
    const rows = await run(['create policy leak_w on pet_medications for insert with check (app_user_has_pet_access(pet_id))']);
    expect(status(rows, 3)).toBe('FAIL');
  });

  it('row 4 FAILs if vaccines are opened to caregivers for reading', async () => {
    const rows = await run(['create policy leak_r on pet_vaccinations for select using (app_user_has_pet_access(pet_id))']);
    expect(status(rows, 4)).toBe('FAIL');
  });

  it('row 5 FAILs when FORCE RLS is removed', async () => {
    expect(status(await run(['alter table vet_appointments no force row level security']), 5)).toBe('FAIL');
  });

  it('row 6 FAILs when a 0049 family policy is dropped', async () => {
    expect(status(await run(['drop policy routines_family_write on routines']), 6)).toBe('FAIL');
  });

  it('row 7 FAILs when pawpi_app cannot execute the family helper', async () => {
    expect(status(await run(['revoke execute on function app_user_has_pet_family(integer) from pawpi_app']), 7)).toBe('FAIL');
  });

  it('row 8 FAILs against the pre-0141 owner policy (no pet check)', async () => {
    const rows = await run([
      'drop policy pet_vaccinations_owner_all on pet_vaccinations',
      'create policy pet_vaccinations_owner_all on pet_vaccinations for all using (owner_user_id = current_app_user_id()) with check (owner_user_id = current_app_user_id())',
    ]);
    expect(status(rows, 8)).toBe('FAIL');
  });

  it('row 9 FAILs when a row exists whose author does not own its pet', async () => {
    const rows = await run([
      "insert into auth_users (id, name, email) values (91, 'a', 'a@example.com'), (92, 'b', 'b@example.com')",
      "insert into user_profiles (id, auth_user_id, username) values (91, 91, 'va'), (92, 92, 'vb')",
      "insert into pets (id, owner_user_id, name, handle) values (91, 91, 'P', 'vp')",
      "insert into pet_vaccinations (pet_id, owner_user_id, name) values (91, 92, 'x')",
    ]);
    expect(status(rows, 9)).toBe('FAIL');
  });
});
