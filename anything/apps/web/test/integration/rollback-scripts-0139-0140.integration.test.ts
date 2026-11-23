// supabase/rollback_0139.sql and rollback_0140.sql (documented in docs/db-migration-runbook-0139-0140.md): applying a rollback restores
// the PREVIOUS contract (proven by behaviour as pawpi_app, not just by catalog text), is idempotent, and re-applying the migration
// restores the new contract. Every case runs inside a transaction that is always rolled back, so the shared cluster is never changed.

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
const ROLLBACK_0139 = read('rollback_0139.sql');
const ROLLBACK_0140 = read('rollback_0140.sql');
const MIGRATION_0139 = read('migrations/0139_grantee_read_and_caregiver_log_rls.sql');
const MIGRATION_0140 = read('migrations/0140_owner_private_pet_ownership_check.sql');
const VERIFY_0139 = read('verify_0139.sql');
const VERIFY_0140 = read('verify_0140.sql');
const ROLLBACK_0141 = read('rollback_0141.sql');
const MIGRATION_0141 = read('migrations/0141_family_write_policies.sql');
const VERIFY_0141 = read('verify_0141.sql');

// OWNER(1) owns Rex(1); STRANGER(2) owns Duke(2); CARE(3) is an active caregiver on Rex.
const SEED = [
  "insert into auth_users (id, name, email) values (1,'o','o@example.com'),(2,'s','s@example.com'),(3,'c','c@example.com')",
  "insert into user_profiles (id, auth_user_id, username) values (1,1,'o'),(2,2,'s'),(3,3,'c')",
  "insert into pets (id, owner_user_id, name, handle) values (1,1,'Rex','rex'),(2,2,'Duke','duke')",
  "insert into pet_caregivers (pet_id, owner_user_id, grantee_user_id, role, status) values (1,1,3,'caregiver','active')",
  'insert into health_food_logs (id, pet_id, owner_user_id) values (1, 1, 1)',
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
// run `fn` as pawpi_app with the given identity, then step back out
async function asApp<T>(tx: Tx, userId: number, fn: () => Promise<T>): Promise<T> {
  await tx.unsafe('set local session authorization pawpi_app');
  await tx.unsafe(`select set_config('app.current_user_id', '${userId}', true)`);
  try {
    return await fn();
  } finally {
    await tx.unsafe('reset session authorization');
  }
}
const refused = async (tx: Tx, fn: () => Promise<unknown>) => {
  let err: any = null;
  await tx.savepoint(async (sp) => {
    void sp;
    try {
      await fn();
    } catch (e) {
      err = e;
      throw e;
    }
  }).catch(() => {});
  return err;
};
const verifyStatuses = async (tx: Tx, script: string) => {
  const rows = await tx.unsafe<{ ord: number; status: string }[]>(script);
  return Object.fromEntries(rows.map((r) => [r.ord, r.status]));
};
const strangerInsertsOnRex = (tx: Tx) => tx.unsafe('insert into health_food_logs (pet_id, owner_user_id) values (1, 2) returning id');

describe('rollback_0140.sql', () => {
  it('restores the pre-0140 contract (cross-pet insert allowed again), is idempotent, and re-applying 0140 closes it again', async () => {
    await inTx(async (tx) => {
      // with 0140 (the harness state): a stranger's insert against Rex is refused
      let err = await asApp(tx, 2, () => refused(tx, () => strangerInsertsOnRex(tx)));
      expect(String(err?.message)).toMatch(/row-level security/i);

      await tx.unsafe(ROLLBACK_0140);
      await tx.unsafe(ROLLBACK_0140); // idempotent
      expect((await verifyStatuses(tx, VERIFY_0140))[1]).toBe('FAIL'); // the pet check is gone
      expect((await verifyStatuses(tx, VERIFY_0140))[2]).toBe('PASS'); // USING untouched
      expect((await verifyStatuses(tx, VERIFY_0140))[4]).toBe('PASS'); // FORCE RLS intact
      err = await asApp(tx, 2, () => refused(tx, () => strangerInsertsOnRex(tx)));
      expect(err).toBeNull(); // the old behaviour is back (this is the gap, restored on purpose)
      // the owner's own path is unaffected either way
      await asApp(tx, 1, async () => {
        expect(await tx.unsafe('insert into health_food_logs (pet_id, owner_user_id) values (1, 1) returning id')).toHaveLength(1);
      });

      await tx.unsafe(MIGRATION_0140); // re-apply
      expect(Object.values(await verifyStatuses(tx, VERIFY_0140)).every((s) => s === 'PASS' || s === 'FAIL')).toBe(true);
      err = await asApp(tx, 2, () => refused(tx, () => tx.unsafe('insert into health_food_logs (pet_id, owner_user_id) values (1, 2)')));
      expect(String(err?.message)).toMatch(/row-level security/i);
    });
  });

  it('leaves owners, family and caregivers able to do what they could before 0140', async () => {
    await inTx(async (tx) => {
      await tx.unsafe(ROLLBACK_0140);
      await asApp(tx, 3, async () => {
        // caregiver append (0139) still works after rolling 0140 back
        expect(await tx.unsafe('insert into health_food_logs (pet_id, owner_user_id) values (1, 1) returning id')).toHaveLength(1);
      });
    });
  });
});

describe('rollback_0139.sql', () => {
  it('a caregiver loses reads and logging, owners are unaffected, it is idempotent, and re-applying 0139 restores both', async () => {
    await inTx(async (tx) => {
      // with 0139: the caregiver reads the owner's log and can append one
      await asApp(tx, 3, async () => {
        expect(await tx.unsafe('select id from health_food_logs where pet_id = 1')).toHaveLength(1);
        expect(await tx.unsafe('insert into health_food_logs (pet_id, owner_user_id) values (1, 1) returning id')).toHaveLength(1);
      });

      await tx.unsafe(ROLLBACK_0139);
      await tx.unsafe(ROLLBACK_0139); // idempotent
      const v = await verifyStatuses(tx, VERIFY_0139);
      expect([v[1], v[2], v[4]]).toEqual(['FAIL', 'FAIL', 'FAIL']); // the policies are gone
      expect([v[3], v[5], v[6], v[7], v[8]]).toEqual(['PASS', 'PASS', 'PASS', 'PASS', 'PASS']); // nothing else disturbed

      await asApp(tx, 3, async () => {
        expect(await tx.unsafe('select id from health_food_logs where pet_id = 1')).toHaveLength(0); // reads gone
      });
      const err = await asApp(tx, 3, () => refused(tx, () => tx.unsafe('insert into health_food_logs (pet_id, owner_user_id) values (1, 1)')));
      expect(String(err?.message)).toMatch(/row-level security/i); // logging gone
      await asApp(tx, 1, async () => {
        expect(await tx.unsafe('select id from health_food_logs where pet_id = 1')).toHaveLength(2); // the owner still reads (seed + the caregiver's earlier append)
        expect(await tx.unsafe('insert into health_food_logs (pet_id, owner_user_id) values (1, 1) returning id')).toHaveLength(1);
      });

      await tx.unsafe(MIGRATION_0139); // re-apply
      expect(Object.values(await verifyStatuses(tx, VERIFY_0139)).every((s) => s === 'PASS')).toBe(true);
      await asApp(tx, 3, async () => {
        expect(await tx.unsafe('select id from health_food_logs where pet_id = 1')).toHaveLength(3); // seed + caregiver + owner
      });
    });
  });
});

// ── PR 3b: rollback_0141.sql ─────────────────────────────────────────────────────────────────────────────────────────────────────────
// A FAMILY member (user 4) holds an active family grant on Rex; STRANGER(2) owns Duke.
const FAMILY_SEED = [
  "insert into auth_users (id, name, email) values (4,'f','f@example.com')",
  "insert into user_profiles (id, auth_user_id, username) values (4,4,'f')",
  "insert into pet_caregivers (pet_id, owner_user_id, grantee_user_id, role, status) values (1,1,4,'family','active')",
];
const FAMILY_MED = "insert into pet_medications (pet_id, owner_user_id, name) values (1, 1, 'm') returning id";
const STRANGER_VACC_ON_REX = "insert into pet_vaccinations (pet_id, owner_user_id, name) values (1, 2, 'v') returning id";

describe('rollback_0141.sql', () => {
  it('a family member loses meds/vaccine/appointment writes, the owner own-row hardening on the 3 tables is undone, it is idempotent, and re-applying restores both', async () => {
    await inTx(async (tx) => {
      for (const s of FAMILY_SEED) await tx.unsafe(s);

      // with 0141: family writes (owner-anchored) and a stranger's cross-pet insert is refused
      await asApp(tx, 4, async () => {
        expect(await tx.unsafe(FAMILY_MED)).toHaveLength(1);
      });
      let err = await asApp(tx, 2, () => refused(tx, () => tx.unsafe(STRANGER_VACC_ON_REX)));
      expect(String(err?.message)).toMatch(/row-level security/i);

      await tx.unsafe(ROLLBACK_0141);
      await tx.unsafe(ROLLBACK_0141); // idempotent
      const v = await verifyStatuses(tx, VERIFY_0141);
      expect([v[1], v[2], v[8]]).toEqual(['FAIL', 'FAIL', 'FAIL']); // the family policies and the owner hardening are gone
      expect([v[3], v[4], v[5], v[6], v[7], v[9]]).toEqual(['PASS', 'PASS', 'PASS', 'PASS', 'PASS', 'PASS']); // nothing else disturbed

      err = await asApp(tx, 4, () => refused(tx, () => tx.unsafe(FAMILY_MED)));
      expect(String(err?.message)).toMatch(/row-level security/i); // family writes gone
      err = await asApp(tx, 2, () => refused(tx, () => tx.unsafe(STRANGER_VACC_ON_REX)));
      expect(err).toBeNull(); // the old own-row behaviour is back on pet_vaccinations (the gap, restored on purpose)
      await asApp(tx, 1, async () => {
        // the owner is unaffected either way
        expect(await tx.unsafe("insert into pet_medications (pet_id, owner_user_id, name) values (1, 1, 'own') returning id")).toHaveLength(1);
      });

      // the reopened gap let the stranger's row in; verify row 9 (the data check) would rightly flag it, so clear it before re-applying
      await tx.unsafe('delete from pet_vaccinations where owner_user_id = 2');
      await tx.unsafe(MIGRATION_0141); // re-apply
      expect(Object.values(await verifyStatuses(tx, VERIFY_0141)).every((s) => s === 'PASS')).toBe(true);
      await asApp(tx, 4, async () => {
        expect(await tx.unsafe(FAMILY_MED)).toHaveLength(1);
      });
    });
  });
});
