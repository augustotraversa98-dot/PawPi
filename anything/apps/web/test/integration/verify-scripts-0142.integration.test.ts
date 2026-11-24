// verify_0142.sql (sharing lifecycle: leave/resend columns, notification types, leave + anonymising account-deletion functions) must read
// PASS on every row against the harness schema, and each row must be able to FAIL.

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

const verifySql = readFileSync(join(MIGRATIONS_DIR, '..', 'verify_0142.sql'), 'utf8');
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

describe('verify_0142.sql', () => {
  it('every row reads PASS', async () => {
    const rows = await run([]);
    expect(rows).toHaveLength(7);
    const failing = rows.filter((r) => r.status !== 'PASS').map((r) => `${r.ord} ${r.check_name} -> ${r.detail}`);
    expect(failing, `rows not PASS:\n${failing.join('\n')}`).toEqual([]);
  });

  it("row 1 FAILs when the status CHECK does not allow 'left'", async () => {
    const rows = await run([
      'alter table pet_caregivers drop constraint pet_caregivers_status_check',
      "alter table pet_caregivers add constraint pet_caregivers_status_check check (status = any (array['pending','active','revoked','declined','expired']::text[]))",
    ]);
    expect(status(rows, 1)).toBe('FAIL');
  });

  it('row 2 FAILs when the audit CHECK lacks leave / resend', async () => {
    const rows = await run([
      'alter table pet_caregiver_audit drop constraint pet_caregiver_audit_action_check',
      "alter table pet_caregiver_audit add constraint pet_caregiver_audit_action_check check (action = any (array['grant','accept','decline','revoke','read','write']::text[]))",
    ]);
    expect(status(rows, 2)).toBe('FAIL');
  });

  it('row 3 FAILs when a pet_share_* type is missing from the notification CHECK', async () => {
    const rows = await run([
      'alter table notifications drop constraint notifications_type_check',
      "alter table notifications add constraint notifications_type_check check (type = any (array['paw','bark','biz_follow','pet_share_invite']::text[]))",
    ]);
    expect(status(rows, 3)).toBe('FAIL');
  });

  it('row 4 FAILs when a lifecycle column is missing', async () => {
    expect(status(await run(['alter table pet_caregivers drop column resend_count']), 4)).toBe('FAIL');
  });

  it('row 5 FAILs when a function is missing, loses SECURITY DEFINER, or loses its pinned search_path', async () => {
    expect(status(await run(['drop function leave_pet_caregiver(integer)']), 5)).toBe('FAIL');
    expect(status(await run(['alter function leave_pet_caregiver(integer) security invoker']), 5)).toBe('FAIL');
    expect(status(await run(['alter function app_delete_my_account(boolean) reset search_path']), 5)).toBe('FAIL');
  });

  it('row 6 FAILs when PUBLIC can execute, or pawpi_app cannot', async () => {
    expect(status(await run(['grant execute on function leave_pet_caregiver(integer) to public']), 6)).toBe('FAIL');
    expect(status(await run(['revoke execute on function app_delete_my_account(boolean) from pawpi_app']), 6)).toBe('FAIL');
  });

  it('row 7 FAILs against the pre-0142 delete_my_account body', async () => {
    const rows = await run([
      `create or replace function delete_my_account() returns boolean language plpgsql security definer set search_path = public, pg_temp
       as $$ begin return true; end; $$`,
    ]);
    expect(status(rows, 7)).toBe('FAIL');
  });
});
