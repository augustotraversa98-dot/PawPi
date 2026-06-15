// RLS — pets policies proven on the REAL pets table, acting AS pawpi_app.
//
// HISTORY: R2a (0019/0020) created the non-owner `pawpi_app` role + helpers and put
// ENABLE + FORCE ROW LEVEL SECURITY on `pets` with owner-all + a provider-read
// (grant/booking) policy. R2b (0021) CORRECTED the read rule: PawPi is social —
// any signed-in user reads any pet's profile and sees other pets in the feed, which
// is broader than owner+grant+booking. So 0021 DROPS pets_provider_read (subsumed)
// and adds pets_authed_read = USING (current_app_user_id() IS NOT NULL). Writes are
// UNCHANGED: pets_owner_all still pins INSERT/UPDATE/DELETE to the owner.
//
// EFFECTIVE pets access (what this file proves): read = ANY authed user;
// insert/update/delete = OWNER only; no identity → ZERO rows. The grant/booking
// helpers (app_provider_has_grant/booking) remain defined for the MEDICAL tables in
// R2c — no pets policy uses them anymore.
//
// We connect a SECOND porsager client AS pawpi_app (NOBYPASSRLS), set
// app.current_user_id per transaction, and assert allowed-vs-ZERO rows. The harness
// owner is a superuser, so FORCE RLS constrains only pawpi_app.

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
} from './db';

// Profile/pet ids are explicit so assertions read clearly.
const A = { authUserId: 1, profileId: 1, username: 'ownera', petId: 1, petName: 'Rex' };
const B = { authUserId: 2, profileId: 2, username: 'ownerb', petId: 2, petName: 'Bella' };
const STAFF = { authUserId: 3, profileId: 3, username: 'vetstaff' };
const PROVIDER_ID = 1;

// raw = privileged superuser client (seeding / reset). app = the pawpi_app role,
// the real RLS target. Both built once in beforeAll.
let raw: Sql;
let app: Sql;

/** Run `fn` as pawpi_app inside one transaction stamped with `userId` (or no id). */
function asApp<T>(
  userId: number | null,
  fn: (tx: Sql) => Promise<T>,
): Promise<T> {
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

describe('RLS — pets any-authed read (R2b correction, as pawpi_app)', () => {
  beforeEach(async () => {
    await seedOwnerWithPet(raw, A);
    await seedOwnerWithPet(raw, B);
  });

  it('owner A reads BOTH pets — their own AND non-owner B\'s (feed/profiles survive)', async () => {
    const rows = await asApp(A.profileId, (tx) => tx`select id from pets order by id`);
    expect(rows.map((r: any) => r.id)).toEqual([A.petId, B.petId]);
  });

  it('owner B likewise reads both pets', async () => {
    const rows = await asApp(B.profileId, (tx) => tx`select id from pets order by id`);
    expect(rows.map((r: any) => r.id)).toEqual([A.petId, B.petId]);
  });

  it('with NO identity set, FORCE RLS yields zero rows (deny-by-default)', async () => {
    const rows = await asApp(null, (tx) => tx`select id from pets`);
    expect(rows).toHaveLength(0);
  });
});

describe('RLS — pets owner-only writes (as pawpi_app)', () => {
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
    // STAFF has a care grant on B's pet — proving a grant grants no WRITE access
    // (it never did; under R2b it grants no special read either — staff read any
    // pet as an authed user, like everyone else).
    await seedGrant(raw, { petId: B.petId, ownerUserId: B.profileId, providerId: PROVIDER_ID });
  });

  it('owner can INSERT a pet they own and UPDATE it', async () => {
    // Explicit-id seeds don't advance the identity sequence; sync it so the
    // sequence-driven INSERT below (which also exercises pawpi_app's sequence
    // USAGE grant) doesn't collide on a low id.
    await raw`select setval(pg_get_serial_sequence('pets','id'), (select max(id) from pets))`;
    await asApp(A.profileId, async (tx) => {
      await tx`
        insert into pets (owner_user_id, name, handle)
        values (${A.profileId}, 'Spot', 'ownera-spot')
      `;
      await tx`update pets set name = 'Rexie' where id = ${A.petId}`;
    });
    const [renamed] = await raw`select name from pets where id = ${A.petId}`;
    expect(renamed.name).toBe('Rexie');
    const owned = await raw`select count(*)::int as n from pets where owner_user_id = ${A.profileId}`;
    expect(owned[0].n).toBe(2);
  });

  it('owner INSERT with someone else\'s owner_user_id is rejected by WITH CHECK', async () => {
    await expect(
      asApp(A.profileId, (tx) => tx`
        insert into pets (owner_user_id, name, handle)
        values (${B.profileId}, 'Sneaky', 'ownera-sneaky')
      `),
    ).rejects.toThrow(/row-level security/i);
  });

  it('a non-owner (even a care-granted provider) cannot UPDATE the pet (0 rows; row unchanged)', async () => {
    const updated = await asApp(STAFF.profileId, (tx) => tx`
      update pets set name = 'Hacked' where id = ${B.petId} returning id
    `);
    expect(updated).toHaveLength(0); // pets_authed_read is SELECT-only → not visible to UPDATE
    const [row] = await raw`select name from pets where id = ${B.petId}`;
    expect(row.name).toBe(B.petName);
  });

  it('a non-owner cannot DELETE the pet (0 rows; row survives)', async () => {
    const deleted = await asApp(STAFF.profileId, (tx) => tx`
      delete from pets where id = ${B.petId} returning id
    `);
    expect(deleted).toHaveLength(0);
    const [{ n }] = await raw`select count(*)::int as n from pets where id = ${B.petId}`;
    expect(n).toBe(1);
  });
});
