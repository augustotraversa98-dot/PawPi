// RLS for ticket 2.47 — family/caregiver sharing — proven on the REAL tables AS pawpi_app.
// This is access-control, so it is proven HARD: family co-manages within scope; caregiver is
// read-only scoped + expiry-enforced; revoke is instant; a non-grantee sees nothing; owner
// stays the only one who can delete the pet.

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { inject } from 'vitest';
import postgres from 'postgres';
import type { Sql } from 'postgres';
import {
  makeTestSql,
  resetDb,
  seedOwnerWithPet,
  seedPetCaregiver,
  seedRoutineRow,
  seedFoodLogRow,
  seedMedicalProfile,
} from './db';

const OWNER = { authUserId: 1, profileId: 1, username: 'owner', petId: 1, petName: 'Rex' };
const FAM = { authUserId: 2, profileId: 2, username: 'fam', petId: 2, petName: 'Bella' };   // family grantee
const CARE = { authUserId: 3, profileId: 3, username: 'care', petId: 3, petName: 'Coco' };  // caregiver grantee
const OUT = { authUserId: 4, profileId: 4, username: 'out', petId: 4, petName: 'Duke' };    // non-grantee
const PET = OWNER.petId;
const ROUTINE = 1;
const FOODLOG = 1;

let raw: Sql;
let app: Sql;

function asApp<T>(userId: number | null, fn: (tx: Sql) => Promise<T>): Promise<T> {
  return app.begin(async (tx) => {
    await tx`select set_config('app.current_user_id', ${userId === null ? '' : String(userId)}, true)`;
    return fn(tx);
  });
}
const ids = (rows: any[]) => rows.map((r: any) => r.id).sort((a, b) => a - b);

beforeAll(async () => {
  raw = makeTestSql();
  const url = new URL(inject('TEST_DATABASE_URL'));
  app = postgres({
    host: url.hostname, port: Number(url.port),
    database: url.pathname.replace(/^\//, ''),
    username: 'pawpi_app', password: 'pawpi_app', max: 1, onnotice: () => {},
  });
});
afterAll(async () => { await app.end(); await raw.end(); });
afterEach(async () => { await resetDb(raw); });

// OWNER owns the pet + a routine + a food log + a medical profile. FAM has an active family
// grant; CARE has an active caregiver grant; OUT has none.
beforeEach(async () => {
  await seedOwnerWithPet(raw, OWNER);
  await seedOwnerWithPet(raw, FAM);
  await seedOwnerWithPet(raw, CARE);
  await seedOwnerWithPet(raw, OUT);
  await seedRoutineRow(raw, { id: ROUTINE, petId: PET, ownerUserId: OWNER.profileId });
  await seedFoodLogRow(raw, { id: FOODLOG, petId: PET, ownerUserId: OWNER.profileId });
  await seedMedicalProfile(raw, { profileRowId: 1, petId: PET, ownerUserId: OWNER.profileId });
});

describe('RLS 2.47 — pet_caregivers grant table', () => {
  beforeEach(async () => {
    await seedPetCaregiver(raw, { id: 1, petId: PET, ownerUserId: OWNER.profileId, granteeUserId: FAM.profileId, role: 'family' });
  });

  it('owner and grantee can read the grant; an outsider cannot', async () => {
    await asApp(OWNER.profileId, async (tx) => expect(ids(await tx`select id from pet_caregivers`)).toEqual([1]));
    await asApp(FAM.profileId, async (tx) => expect(ids(await tx`select id from pet_caregivers`)).toEqual([1]));
    await asApp(OUT.profileId, async (tx) => expect(await tx`select id from pet_caregivers`).toHaveLength(0));
  });

  it('only the owner of the PET can issue a grant (app_owns_pet WITH CHECK)', async () => {
    await asApp(OWNER.profileId, async (tx) => {
      const r = await tx`
        insert into pet_caregivers (id, pet_id, owner_user_id, grantee_user_id, role)
        values (50, ${PET}, ${OWNER.profileId}, ${CARE.profileId}, 'caregiver') returning id`;
      expect(r).toHaveLength(1);
    });
    // OUT cannot grant access to a pet they don't own, even claiming to be owner.
    await expect(
      asApp(OUT.profileId, (tx) => tx`
        insert into pet_caregivers (pet_id, owner_user_id, grantee_user_id, role)
        values (${PET}, ${OUT.profileId}, ${CARE.profileId}, 'family')`),
    ).rejects.toThrow(/row-level security/i);
  });

  it('a grantee cannot self-escalate via UPDATE (owner-only update policy)', async () => {
    await asApp(FAM.profileId, async (tx) => {
      expect(await tx`update pet_caregivers set role = 'family', status = 'active' returning id`).toHaveLength(0);
    });
  });

  it('respond_pet_caregiver lets the grantee accept a pending grant (and not others)', async () => {
    await seedPetCaregiver(raw, { id: 2, petId: PET, ownerUserId: OWNER.profileId, granteeUserId: CARE.profileId, role: 'caregiver', status: 'pending' });
    await asApp(CARE.profileId, async (tx) => {
      const [{ respond_pet_caregiver: st }] = await tx`select respond_pet_caregiver(2, true)`;
      expect(st).toBe('active');
    });
    // an outsider cannot respond to a grant that doesn't name them (grant 2 is CARE's, now
    // active — no pending grant exists for OUT).
    await expect(
      asApp(OUT.profileId, (tx) => tx`select respond_pet_caregiver(2, true)`),
    ).rejects.toThrow(/no pending grant/i);
  });
});

describe('RLS 2.47 — FAMILY co-management (read + write in scope)', () => {
  beforeEach(async () => {
    await seedPetCaregiver(raw, { id: 1, petId: PET, ownerUserId: OWNER.profileId, granteeUserId: FAM.profileId, role: 'family' });
  });

  it('family reads the pet, routines, medical profile, and health logs', async () => {
    await asApp(FAM.profileId, async (tx) => {
      expect(ids(await tx`select id from pets where id = ${PET}`)).toEqual([PET]);
      expect(ids(await tx`select id from routines`)).toEqual([ROUTINE]);
      expect(await tx`select pet_id from pet_medical_profiles`).toHaveLength(1);
      expect(ids(await tx`select id from health_food_logs`)).toEqual([FOODLOG]);
    });
  });

  it('family WRITES a health log + a routine for the pet', async () => {
    await asApp(FAM.profileId, async (tx) => {
      const log = await tx`
        insert into health_food_logs (id, pet_id, owner_user_id, logged_at)
        values (60, ${PET}, ${OWNER.profileId}, now()) returning id`;
      expect(log).toHaveLength(1);
      const upd = await tx`update routines set title = 'fam-edit' where id = ${ROUTINE} returning id`;
      expect(upd).toHaveLength(1);
    });
  });

  it('family cannot steal the pet by re-pointing owner_user_id to themselves (trigger guard)', async () => {
    await expect(
      asApp(FAM.profileId, (tx) =>
        tx`update pets set owner_user_id = ${FAM.profileId} where id = ${PET} returning id`,
      ),
    ).rejects.toThrow(/transfer ownership/i);
  });

  it('family cannot DELETE the pet (owner-only delete preserved)', async () => {
    await asApp(FAM.profileId, async (tx) => {
      expect(await tx`delete from pets where id = ${PET} returning id`).toHaveLength(0);
    });
  });
});

describe('RLS 2.47 — CAREGIVER scoped read-only', () => {
  beforeEach(async () => {
    await seedPetCaregiver(raw, { id: 1, petId: PET, ownerUserId: OWNER.profileId, granteeUserId: CARE.profileId, role: 'caregiver' });
  });

  it('caregiver reads pet profile, routines (feeding/med) and medical (emergency)', async () => {
    await asApp(CARE.profileId, async (tx) => {
      expect(ids(await tx`select id from pets where id = ${PET}`)).toEqual([PET]);
      expect(ids(await tx`select id from routines`)).toEqual([ROUTINE]);
      expect(await tx`select pet_id from pet_medical_profiles`).toHaveLength(1);
    });
  });

  it('caregiver gets ZERO health logs (family-only) and CANNOT write routines/profile', async () => {
    await asApp(CARE.profileId, async (tx) => {
      expect(await tx`select id from health_food_logs`).toHaveLength(0);
      expect(await tx`update routines set title = 'care-edit' returning id`).toHaveLength(0);
      expect(await tx`update pets set name = 'X' where id = ${PET} returning id`).toHaveLength(0);
    });
  });
});

describe('RLS 2.47 — expiry, revoke, and non-grantee isolation', () => {
  it('an EXPIRED grant grants nothing (expires_at in the past)', async () => {
    await seedPetCaregiver(raw, {
      id: 1, petId: PET, ownerUserId: OWNER.profileId, granteeUserId: FAM.profileId,
      role: 'family', status: 'active', expiresAt: '2000-01-01T00:00:00Z',
    });
    await asApp(FAM.profileId, async (tx) => {
      expect(await tx`select id from routines`).toHaveLength(0);
      expect(await tx`select id from health_food_logs`).toHaveLength(0);
    });
  });

  it('a REVOKED grant is instantly zero (scoped pet data)', async () => {
    await seedPetCaregiver(raw, {
      id: 1, petId: PET, ownerUserId: OWNER.profileId, granteeUserId: FAM.profileId,
      role: 'family', status: 'revoked',
    });
    await asApp(FAM.profileId, async (tx) => {
      expect(await tx`select id from routines`).toHaveLength(0);
      expect(await tx`select id from health_food_logs`).toHaveLength(0);
      expect(await tx`select pet_id from pet_medical_profiles`).toHaveLength(0);
    });
  });

  // NOTE: pets rows themselves are any-authed-readable by design (social pet-profile read,
  // 0021 pets_authed_read) — the route exposes only a limited public column subset. The
  // PRIVATE pet data (routines / health logs / medical) is what this grant gates, so isolation
  // is asserted on those, not on the public pets row.
  it('a non-grantee outsider sees NONE of the private pet data', async () => {
    await asApp(OUT.profileId, async (tx) => {
      expect(await tx`select id from routines`).toHaveLength(0);
      expect(await tx`select id from health_food_logs`).toHaveLength(0);
      expect(await tx`select pet_id from pet_medical_profiles`).toHaveLength(0);
    });
  });
});
