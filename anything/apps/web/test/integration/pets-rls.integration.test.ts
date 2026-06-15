// RLS R2a — pets policies proven on the REAL pets table, acting AS pawpi_app.
//
// R1 proved the MECHANISM (set_config identity + a current_setting-keyed policy on a
// THROWAWAY table). R2a applies it for real: migration 0019 creates the non-owner
// `pawpi_app` role + the identity / provider-access helpers, and 0020 puts ENABLE +
// FORCE ROW LEVEL SECURITY on `pets` with owner-all + provider-read policies.
//
// These migrations are HARNESS-ONLY this ticket (NOT applied to Supabase — R3 does
// that at the role cutover). The proof is here: we connect a SECOND porsager client
// AS pawpi_app (NOBYPASSRLS), set app.current_user_id in a transaction, and assert
// the policy returns exactly the rows the app's routes expose today — owner reads/
// writes their pets; a provider with an active grant OR a non-deleted booking READS
// the pet; everyone else (and the no-identity case) gets ZERO rows.
//
// Why act as pawpi_app and not the migration superuser: FORCE RLS applies to the
// owner too, but proving against the actual target role is the point — and the
// SECURITY DEFINER helpers must work when invoked by the non-owner.

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
  seedBooking,
} from './db';

// Profile/pet ids are explicit so assertions read clearly.
const A = { authUserId: 1, profileId: 1, username: 'ownera', petId: 1, petName: 'Rex' };
const B = { authUserId: 2, profileId: 2, username: 'ownerb', petId: 2, petName: 'Bella' };
const STAFF = { authUserId: 3, profileId: 3, username: 'vetstaff' };
const OTHERSTAFF = { authUserId: 4, profileId: 4, username: 'otherstaff' };
const PROVIDER_ID = 1;
const OTHER_PROVIDER_ID = 2;

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

describe('RLS R2a — pets owner isolation (as pawpi_app)', () => {
  beforeEachSeedTwoOwners();

  it('owner A sees ONLY their pet; owner B is filtered out', async () => {
    const rows = await asApp(A.profileId, (tx) => tx`select id, owner_user_id from pets`);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: A.petId, owner_user_id: A.profileId });
  });

  it('owner B sees ONLY their pet', async () => {
    const rows = await asApp(B.profileId, (tx) => tx`select id from pets`);
    expect(rows.map((r: any) => r.id)).toEqual([B.petId]);
  });

  it('with NO identity set, FORCE RLS yields zero rows (deny-by-default)', async () => {
    const rows = await asApp(null, (tx) => tx`select id from pets`);
    expect(rows).toHaveLength(0);
  });
});

describe('RLS R2a — provider read via grant (as pawpi_app)', () => {
  beforeEach(async () => {
    await seedOwnerWithPet(raw, A);
    await seedOwnerWithPet(raw, B);
    await seedUser(raw, STAFF);
    // STAFF is active staff of PROVIDER_ID (owned by B for convenience).
    await seedProviderWithStaff(raw, {
      providerId: PROVIDER_ID,
      ownerUserProfileId: B.profileId,
      staffUserProfileId: STAFF.profileId,
      slug: 'vet-clinic',
    });
  });

  it('active grant for B\'s pet → staff sees that pet (and not the unrelated owner A)', async () => {
    await seedGrant(raw, { petId: B.petId, ownerUserId: B.profileId, providerId: PROVIDER_ID });
    const rows = await asApp(STAFF.profileId, (tx) => tx`select id from pets`);
    expect(rows.map((r: any) => r.id)).toEqual([B.petId]);
  });

  it('revoked grant → zero rows', async () => {
    await seedGrant(raw, {
      petId: B.petId,
      ownerUserId: B.profileId,
      providerId: PROVIDER_ID,
      status: 'revoked',
    });
    const rows = await asApp(STAFF.profileId, (tx) => tx`select id from pets`);
    expect(rows).toHaveLength(0);
  });

  it('expired grant (active status, past expires_at) → zero rows', async () => {
    await seedGrant(raw, {
      petId: B.petId,
      ownerUserId: B.profileId,
      providerId: PROVIDER_ID,
      expiresAt: '2020-01-01T00:00:00Z',
    });
    const rows = await asApp(STAFF.profileId, (tx) => tx`select id from pets`);
    expect(rows).toHaveLength(0);
  });

  it('inactive (invited) staff with an active grant → zero rows', async () => {
    // Demote the staff link to 'invited'; the helper requires status='active'.
    await raw`update provider_staff set status = 'invited' where user_profile_id = ${STAFF.profileId}`;
    await seedGrant(raw, { petId: B.petId, ownerUserId: B.profileId, providerId: PROVIDER_ID });
    const rows = await asApp(STAFF.profileId, (tx) => tx`select id from pets`);
    expect(rows).toHaveLength(0);
  });
});

describe('RLS R2a — provider read via booking (as pawpi_app)', () => {
  beforeEach(async () => {
    await seedOwnerWithPet(raw, A);
    await seedOwnerWithPet(raw, B);
    await seedUser(raw, STAFF);
    await seedUser(raw, OTHERSTAFF);
    await seedProviderWithStaff(raw, {
      providerId: PROVIDER_ID,
      ownerUserProfileId: B.profileId,
      staffUserProfileId: STAFF.profileId,
      slug: 'vet-clinic',
    });
    // An UNRELATED provider whose staff has no relationship to B's pet.
    await seedProviderWithStaff(raw, {
      providerId: OTHER_PROVIDER_ID,
      ownerUserProfileId: OTHERSTAFF.profileId,
      staffUserProfileId: OTHERSTAFF.profileId,
      slug: 'other-clinic',
    });
  });

  it('booking for B\'s pet but NO grant → staff sees the pet (inbox path)', async () => {
    await seedBooking(raw, { petId: B.petId, ownerUserId: B.profileId, providerId: PROVIDER_ID });
    const rows = await asApp(STAFF.profileId, (tx) => tx`select id from pets`);
    expect(rows.map((r: any) => r.id)).toEqual([B.petId]);
  });

  it('soft-deleted booking → zero rows', async () => {
    await seedBooking(raw, {
      petId: B.petId,
      ownerUserId: B.profileId,
      providerId: PROVIDER_ID,
      deleted: true,
    });
    const rows = await asApp(STAFF.profileId, (tx) => tx`select id from pets`);
    expect(rows).toHaveLength(0);
  });

  it('unrelated provider (booking belongs to another provider) → zero rows', async () => {
    await seedBooking(raw, { petId: B.petId, ownerUserId: B.profileId, providerId: PROVIDER_ID });
    // OTHERSTAFF is active staff only of OTHER_PROVIDER_ID, which has no booking.
    const rows = await asApp(OTHERSTAFF.profileId, (tx) => tx`select id from pets`);
    expect(rows).toHaveLength(0);
  });
});

describe('RLS R2a — write checks (as pawpi_app)', () => {
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
    // STAFF has READ access to B's pet via an active grant — but must not WRITE it.
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

  it('a provider with READ access cannot UPDATE the pet (0 rows; row unchanged)', async () => {
    const updated = await asApp(STAFF.profileId, (tx) => tx`
      update pets set name = 'Hacked' where id = ${B.petId} returning id
    `);
    expect(updated).toHaveLength(0); // provider policy is SELECT-only → not visible to UPDATE
    const [row] = await raw`select name from pets where id = ${B.petId}`;
    expect(row.name).toBe(B.petName);
  });

  it('a provider cannot DELETE the pet (0 rows; row survives)', async () => {
    const deleted = await asApp(STAFF.profileId, (tx) => tx`
      delete from pets where id = ${B.petId} returning id
    `);
    expect(deleted).toHaveLength(0);
    const [{ n }] = await raw`select count(*)::int as n from pets where id = ${B.petId}`;
    expect(n).toBe(1);
  });
});

// Shared seed for the owner-isolation block: two owners, one pet each.
function beforeEachSeedTwoOwners() {
  beforeEach(async () => {
    await seedOwnerWithPet(raw, A);
    await seedOwnerWithPet(raw, B);
  });
}
