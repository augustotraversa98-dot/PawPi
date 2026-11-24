// supabase/rollback_0142.sql: applying it restores the PREVIOUS account-deletion contract (proven by behaviour as pawpi_app) and removes
// the new functions; it is idempotent; the harmless supersets (widened CHECKs, extra columns) stay; re-applying 0142 restores the new
// contract. Every case runs in a transaction that is always rolled back, so the shared cluster is never changed.

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

const SQL_DIR = join(MIGRATIONS_DIR, '..');
const read = (rel: string) => readFileSync(join(SQL_DIR, rel), 'utf8');
const ROLLBACK = read('rollback_0142.sql');
const MIGRATION = read('migrations/0142_sharing_lifecycle.sql');
const VERIFY = read('verify_0142.sql');

// OWNER(1) owns Rex(1); MEMBER(2) is an active family member who posted on Rex; STRANGER(3) held no grant.
const SEED = [
  "insert into auth_users (id, name, email) values (1,'o','o@example.com'),(2,'m','m@example.com'),(3,'s','s@example.com')",
  "insert into user_profiles (id, auth_user_id, username) values (1,1,'o'),(2,2,'m'),(3,3,'s')",
  "insert into pets (id, owner_user_id, name, handle) values (1,1,'Rex','rex')",
  "insert into pet_caregivers (id, pet_id, owner_user_id, grantee_user_id, role, status) values (1,1,1,2,'family','active')",
  "insert into posts (id, user_id, pet_id, caption) values (1, 2, 1, 'member post')",
  // explicit-id seeds do not advance the identity sequences; the anonymising engine inserts a fresh profile through them
  "select setval(pg_get_serial_sequence('auth_users', 'id'), 1000)",
  "select setval(pg_get_serial_sequence('user_profiles', 'id'), 1000)",
];

type Tx = Sql;
async function inTx(fn: (tx: Tx) => Promise<void>) {
  const STOP = new Error('rollback');
  await raw
    .begin(async (tx) => {
      for (const s of SEED) await tx.unsafe(s);
      await fn(tx);
      throw STOP;
    })
    .catch((e) => {
      if (e !== STOP) throw e;
    });
}
async function asApp<T>(tx: Tx, userId: number, fn: () => Promise<T>): Promise<T> {
  await tx.unsafe('set local session authorization pawpi_app');
  await tx.unsafe(`select set_config('app.current_user_id', '${userId}', true)`);
  try {
    return await fn();
  } finally {
    await tx.unsafe('reset session authorization');
  }
}
const verifyStatuses = async (tx: Tx) => {
  const rows = await tx.unsafe<{ ord: number; status: string }[]>(VERIFY);
  return Object.fromEntries(rows.map((r) => [r.ord, r.status]));
};
const fnExists = async (tx: Tx, name: string) =>
  (await tx.unsafe(`select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname = '${name}'`)).length > 0;
const deleteMe = async (tx: Tx, userId: number) =>
  asApp(tx, userId, async () => (await tx.unsafe('select delete_my_account() as ok'))[0].ok);

describe('rollback_0142.sql', () => {
  it('with 0142 (the harness state) a member\'s post survives their account deletion', async () => {
    await inTx(async (tx) => {
      expect(await deleteMe(tx, 2)).toBe(true);
      expect(await tx.unsafe("select user_id from posts where caption = 'member post'")).toHaveLength(1);
    });
  });

  it('drops the two new functions, restores the old delete behaviour (member content cascades again), and is idempotent', async () => {
    await inTx(async (tx) => {
      await tx.unsafe(ROLLBACK);
      await tx.unsafe(ROLLBACK);
      expect(await fnExists(tx, 'leave_pet_caregiver')).toBe(false);
      expect(await fnExists(tx, 'app_delete_my_account')).toBe(false);
      expect(await fnExists(tx, 'delete_my_account')).toBe(true);
      const v = await verifyStatuses(tx);
      expect([v[5], v[6], v[7]]).toEqual(['FAIL', 'FAIL', 'FAIL']);
      expect([v[1], v[2], v[3], v[4]]).toEqual(['PASS', 'PASS', 'PASS', 'PASS']); // the harmless supersets stay

      expect(await deleteMe(tx, 2)).toBe(true);
      expect(await tx.unsafe("select id from posts where caption = 'member post'")).toHaveLength(0);
      expect(await tx.unsafe('select id from pets where id = 1')).toHaveLength(1);
      expect(await tx.unsafe("select id from user_profiles where username like 'former_member_%'")).toHaveLength(0);
    });
  });

  it('re-applying 0142 after the rollback restores the new contract and every verify row reads PASS', async () => {
    await inTx(async (tx) => {
      await tx.unsafe(ROLLBACK);
      await tx.unsafe(MIGRATION);
      const v = await verifyStatuses(tx);
      expect(Object.values(v).every((s) => s === 'PASS')).toBe(true);
      expect(await deleteMe(tx, 2)).toBe(true);
      expect(await tx.unsafe("select id from posts where caption = 'member post'")).toHaveLength(1);
    });
  });

  it('a user with no grant and an owner can still delete their account after the rollback', async () => {
    await inTx(async (tx) => {
      await tx.unsafe(ROLLBACK);
      expect(await deleteMe(tx, 3)).toBe(true);
      expect(await deleteMe(tx, 1)).toBe(true);
      expect(await tx.unsafe('select id from pets where id = 1')).toHaveLength(0);
    });
  });

  it('no identity -> false, before and after the rollback', async () => {
    await inTx(async (tx) => {
      const anon = async () => {
        await tx.unsafe('set local session authorization pawpi_app');
        await tx.unsafe("select set_config('app.current_user_id', '', true)");
        const ok = (await tx.unsafe('select delete_my_account() as ok'))[0].ok;
        await tx.unsafe('reset session authorization');
        return ok;
      };
      expect(await anon()).toBe(false);
      await tx.unsafe(ROLLBACK);
      expect(await anon()).toBe(false);
    });
  });
});
