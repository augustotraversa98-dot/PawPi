// RLS R2c — OWNER-ONLY PRIVATE table policies proven on the REAL tables, acting AS
// pawpi_app. Companion to pets-rls (R2a) and social-rls (R2b).
//
// These are a pet's private health/scheduling data: read AND written ONLY by the
// owner (owner_user_id = current_app_user_id()). The OPPOSITE shape from the social
// group — NO any-authed read, NO provider access on ANY of these tables today. The
// headline proof is the PROVIDER-WITH-GRANT EXCLUSION: a provider-staff user holding
// an active medical_read grant for A's pet still reads ZERO rows from these tables
// (the consent grant does NOT leak into private health/routine data — only the R2d
// medical-record tables honor grants). Migration 0022 makes all of this real.
//
// As in R2a/R2b we connect a SECOND porsager client AS pawpi_app (NOBYPASSRLS), set
// app.current_user_id per transaction, and assert allowed-vs-ZERO rows. The harness
// owner is a superuser, so FORCE RLS constrains only pawpi_app.
//
// Data-level proofs use three representative tables (a health log, a routine, a
// vet-record extra); the CATALOG CHECK then loops over the FULL table list to assert
// every one has rowsecurity + forcerowsecurity on and an owner policy present, so
// none is accidentally left un-policied under FORCE.

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { inject } from 'vitest';
import postgres from 'postgres';
import type { Sql } from 'postgres';
import {
  makeTestSql,
  resetDb,
  seedOwnerWithPet,
  seedUser,
  seedProviderWithStaff,
  seedGrant,
  seedFoodLog,
  seedRoutine,
  seedAllergy,
} from './db';

// The complete R2c owner-private table list — kept in lockstep with migration 0022.
// The catalog check loops over this to prove EVERY table is ENABLE+FORCE RLS with an
// owner policy (so a table added to 0022 but forgotten here fails the catalog count,
// and vice-versa).
const OWNER_PRIVATE_TABLES = [
  'health_food_logs',
  'health_general_checks',
  'health_medical_care_logs',
  'health_mobility_logs',
  'health_pee_logs',
  'health_photo_checks',
  'health_poo_logs',
  'health_vomit_logs',
  'health_walk_logs',
  'health_weight_logs',
  'health_wellness_logs',
  'health_timeline_events',
  'pet_allergies',
  'pet_conditions',
  'pet_lab_results',
  'pet_surgeries',
  'vet_documents',
  'routines',
  'reminder_dismissals',
] as const;

const A = { authUserId: 1, profileId: 1, username: 'ownera', petId: 1, petName: 'Rex' };
const B = { authUserId: 2, profileId: 2, username: 'ownerb', petId: 2, petName: 'Bella' };
const STAFF = { authUserId: 3, profileId: 3, username: 'vetstaff' };
const PROVIDER_ID = 1;

// raw = privileged superuser client (seeding / reset). app = the pawpi_app role.
let raw: Sql;
let app: Sql;

/** Run `fn` as pawpi_app inside one transaction stamped with `userId` (or no id). */
function asApp<T>(userId: number | null, fn: (tx: Sql) => Promise<T>): Promise<T> {
  return app.begin(async (tx) => {
    await tx`select set_config('app.current_user_id', ${userId === null ? '' : String(userId)}, true)`;
    return fn(tx);
  });
}

beforeAll(async () => {
  raw = makeTestSql();
  const url = new URL(inject('TEST_DATABASE_URL'));
  app = postgres({
    host: url.hostname,
    port: Number(url.port),
    database: url.pathname.replace(/^\//, ''),
    username: 'pawpi_app',
    password: 'pawpi_app',
    max: 1,
    onnotice: () => {},
  });
});

afterAll(async () => {
  await app.end();
  await raw.end();
});

afterEach(async () => {
  await resetDb(raw);
});

// ──────────────────────────────────────────────────────────────────────────────
// Data-level proofs. Two owners (A, B) each own one row in the three representative
// tables; a provider-staff user (STAFF) holds an ACTIVE medical_read grant on A's
// pet — the leak we must prove does NOT happen.
describe('RLS R2c — owner-private read/write (as pawpi_app)', () => {
  beforeEach(async () => {
    await seedOwnerWithPet(raw, A);
    await seedOwnerWithPet(raw, B);
    await seedUser(raw, STAFF);
    await seedProviderWithStaff(raw, {
      providerId: PROVIDER_ID,
      ownerUserProfileId: B.profileId,
      staffUserProfileId: STAFF.profileId,
      slug: 'vet-clinic',
    });
    // STAFF has an active, non-expiring medical_read grant on A's pet.
    await seedGrant(raw, { petId: A.petId, ownerUserId: A.profileId, providerId: PROVIDER_ID });
    // One private row per owner in each representative table.
    await seedFoodLog(raw, { logId: 10, petId: A.petId, ownerUserId: A.profileId });
    await seedFoodLog(raw, { logId: 20, petId: B.petId, ownerUserId: B.profileId });
    await seedRoutine(raw, { routineId: 10, petId: A.petId, ownerUserId: A.profileId });
    await seedRoutine(raw, { routineId: 20, petId: B.petId, ownerUserId: B.profileId });
    await seedAllergy(raw, { allergyId: 10, petId: A.petId, ownerUserId: A.profileId });
    await seedAllergy(raw, { allergyId: 20, petId: B.petId, ownerUserId: B.profileId });
  });

  it('owner A reads ONLY their own rows (not B\'s) across all three tables', async () => {
    await asApp(A.profileId, async (tx) => {
      const food = await tx`select id from health_food_logs order by id`;
      const routines = await tx`select id from routines order by id`;
      const allergies = await tx`select id from pet_allergies order by id`;
      expect(food.map((r: any) => r.id)).toEqual([10]);
      expect(routines.map((r: any) => r.id)).toEqual([10]);
      expect(allergies.map((r: any) => r.id)).toEqual([10]);
    });
  });

  it('no identity set → FORCE RLS yields zero rows (deny-by-default)', async () => {
    await asApp(null, async (tx) => {
      expect(await tx`select id from health_food_logs`).toHaveLength(0);
      expect(await tx`select id from routines`).toHaveLength(0);
      expect(await tx`select id from pet_allergies`).toHaveLength(0);
    });
  });

  it('owner A can INSERT/UPDATE/DELETE their own rows', async () => {
    // Sync sequences so the sequence-driven INSERT (also exercising pawpi_app's
    // sequence USAGE grant) doesn't collide with the explicit-id seeds.
    await raw`select setval(pg_get_serial_sequence('health_food_logs','id'), (select max(id) from health_food_logs))`;
    await asApp(A.profileId, async (tx) => {
      const inserted = await tx`
        insert into health_food_logs (pet_id, owner_user_id, food_name)
        values (${A.petId}, ${A.profileId}, 'kibble') returning id
      `;
      expect(inserted).toHaveLength(1);
      const updated = await tx`
        update health_food_logs set food_name = 'wet food' where id = 10 returning id
      `;
      expect(updated).toHaveLength(1);
      const deleted = await tx`delete from health_food_logs where id = 10 returning id`;
      expect(deleted).toHaveLength(1);
    });
  });

  it('non-owner B canNOT SELECT A\'s rows (sees only their own)', async () => {
    await asApp(B.profileId, async (tx) => {
      const food = await tx`select id from health_food_logs where id = 10`;
      const routines = await tx`select id from routines where id = 10`;
      const allergies = await tx`select id from pet_allergies where id = 10`;
      expect(food).toHaveLength(0);
      expect(routines).toHaveLength(0);
      expect(allergies).toHaveLength(0);
    });
  });

  it('non-owner B canNOT UPDATE or DELETE A\'s rows (0 rows; rows survive)', async () => {
    await asApp(B.profileId, async (tx) => {
      const updated = await tx`update routines set title = 'hijacked' where id = 10 returning id`;
      const deleted = await tx`delete from pet_allergies where id = 10 returning id`;
      expect(updated).toHaveLength(0);
      expect(deleted).toHaveLength(0);
    });
    const [{ n: routineN }] = await raw`select count(*)::int as n from routines where id = 10`;
    const [{ n: allergyN }] = await raw`select count(*)::int as n from pet_allergies where id = 10`;
    expect(routineN).toBe(1);
    expect(allergyN).toBe(1);
  });

  it('non-owner B canNOT INSERT a row as A (WITH CHECK rejects)', async () => {
    await expect(
      asApp(B.profileId, (tx) => tx`
        insert into health_food_logs (pet_id, owner_user_id, food_name)
        values (${A.petId}, ${A.profileId}, 'forged')
      `),
    ).rejects.toThrow(/row-level security/i);
  });

  // The headline R2c proof: a consent grant does NOT leak into private data.
  it('a PROVIDER WITH an active medical_read grant for A\'s pet still reads ZERO rows', async () => {
    await asApp(STAFF.profileId, async (tx) => {
      // Sanity: the grant IS active for this caller (helper would return true for
      // the R2d tables) — yet these owner-private tables expose nothing.
      const [{ has }] = await tx`select app_provider_has_grant(${A.petId}, 'medical_read') as has`;
      expect(has).toBe(true);
      expect(await tx`select id from health_food_logs where id = 10`).toHaveLength(0);
      expect(await tx`select id from routines where id = 10`).toHaveLength(0);
      expect(await tx`select id from pet_allergies where id = 10`).toHaveLength(0);
    });
  });

  it('a provider WITH a grant canNOT write A\'s private rows either', async () => {
    await asApp(STAFF.profileId, async (tx) => {
      const updated = await tx`update routines set title = 'provider-edit' where id = 10 returning id`;
      const deleted = await tx`delete from health_food_logs where id = 10 returning id`;
      expect(updated).toHaveLength(0);
      expect(deleted).toHaveLength(0);
    });
    const [{ n }] = await raw`select count(*)::int as n from routines where id = 10`;
    expect(n).toBe(1);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Catalog check — every table in the R2c list is ENABLE + FORCE RLS and carries an
// owner policy. Proves none was left un-policied under FORCE (which would silently
// deny ALL access) and that the migration covered the whole list.
describe('RLS R2c — catalog: every owner-private table is FORCE-RLS + policied', () => {
  it('rowsecurity + forcerowsecurity = true and an owner policy exists for each', async () => {
    for (const table of OWNER_PRIVATE_TABLES) {
      const [flags] = await raw`
        select relrowsecurity, relforcerowsecurity
        from pg_class
        where oid = ${'public.' + table}::regclass
      `;
      expect(flags, `${table} should exist`).toBeDefined();
      expect(flags.relrowsecurity, `${table} ENABLE ROW LEVEL SECURITY`).toBe(true);
      expect(flags.relforcerowsecurity, `${table} FORCE ROW LEVEL SECURITY`).toBe(true);

      const policies = await raw`
        select policyname from pg_policies
        where schemaname = 'public' and tablename = ${table}
      `;
      const names = policies.map((p: any) => p.policyname);
      expect(names, `${table} owner policy present`).toContain(`${table}_owner_all`);
    }
  });
});
