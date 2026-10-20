// verify_0134.sql and verify_0134_default_acl.sql (revoke-EXECUTE sweep, finishing 0126) must read PASS on
// every row against the real harness schema, and verify_0134 must be able to FAIL.

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

const verifySql = (name: string) => readFileSync(join(MIGRATIONS_DIR, '..', `verify_${name}.sql`), 'utf8');

describe.each(['0134', '0134_default_acl'])('verify_%s.sql', (name) => {
  it('every row reads PASS on the harness schema', async () => {
    const rows = await raw.unsafe<{ ord: number; check_name: string; detail: string; status: string }[]>(verifySql(name));
    expect(rows.length).toBeGreaterThanOrEqual(2);
    const failing = rows.filter((r) => r.status !== 'PASS').map((r) => `${r.ord} ${r.check_name} -> ${r.detail}`);
    expect(failing, `verify_${name}.sql rows not PASS:\n${failing.join('\n')}`).toEqual([]);
  });
});

describe('verify_0134 can actually fail', () => {
  it('flags a function a migration forgot to revoke from PUBLIC — rolled back afterwards', async () => {
    const ROLLBACK = new Error('rollback');
    let failing: string[] = [];
    await raw
      .begin(async (tx) => {
        await tx.unsafe('create function app_forgot_to_revoke() returns integer language sql as $f$ select 1 $f$');
        const rows = await tx.unsafe<{ check_name: string; status: string }[]>(verifySql('0134'));
        failing = rows.filter((r) => r.status !== 'PASS').map((r) => r.check_name);
        throw ROLLBACK;
      })
      .catch((e) => {
        if (e !== ROLLBACK) throw e;
      });
    expect(failing.join('|')).toMatch(/executable by PUBLIC/);
  });
});
