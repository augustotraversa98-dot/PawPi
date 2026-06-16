// RLS R2d — PROVIDER-ACCESSIBLE MEDICAL records + the bookings table, proven on the
// REAL tables acting AS pawpi_app. Companion to pets-rls (R2a), social-rls (R2b),
// owner-private-rls (R2c).
//
// This is the group where provider access is REAL, so READ vs WRITE scopes DIFFER and
// the policies are split per command (a FOR ALL owner policy + narrow provider command
// policies). The proofs mirror the routes EXACTLY — no wider:
//   pet_medical_profiles — record route SELECTs it under medical_read; no provider write.
//   vet_notes            — record route SELECTs (medical_read); notes route INSERTs
//                          (medical_write); no provider UPDATE/DELETE.
//   pet_vaccinations     — record route SELECTs (medical_read); vaccinations route
//                          INSERTs (vaccinations_write); owner write-through INSERT still
//                          works; no provider UPDATE/DELETE.
//   vet_appointments     — HYBRID by STAFF MEMBERSHIP (not a grant): the inbox SELECT +
//                          the action UPDATE are open to active staff of the row's
//                          provider_id; INSERT/DELETE are owner only.
//
// As in the sibling suites we connect a SECOND porsager client AS pawpi_app
// (NOBYPASSRLS), set app.current_user_id per transaction, and assert allowed-vs-ZERO.
// The harness owner is a superuser, so FORCE RLS constrains only pawpi_app.

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
  seedMedicalProfile,
  seedVetNote,
  seedVaccination,
} from './db';

const A = { authUserId: 1, profileId: 1, username: 'ownera', petId: 1, petName: 'Rex' };
const B = { authUserId: 2, profileId: 2, username: 'ownerb', petId: 2, petName: 'Bella' };
const STAFF = { authUserId: 3, profileId: 3, username: 'vetstaff' };
const STAFF2 = { authUserId: 4, profileId: 4, username: 'vetstaff2' };
const PROVIDER_ID = 1; // STAFF is active staff
const PROVIDER2_ID = 2; // STAFF2 is active staff (a DIFFERENT provider)

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

// Two owners + their pets, two provider-staff users, two providers (STAFF↔1, STAFF2↔2).
// No grant is seeded here — each test seeds the grant variant it needs so "no grant →
// zero" is unambiguous.
beforeEach(async () => {
  await seedOwnerWithPet(raw, A);
  await seedOwnerWithPet(raw, B);
  await seedUser(raw, STAFF);
  await seedUser(raw, STAFF2);
  await seedProviderWithStaff(raw, {
    providerId: PROVIDER_ID,
    ownerUserProfileId: B.profileId,
    staffUserProfileId: STAFF.profileId,
    slug: 'vet-clinic-1',
  });
  await seedProviderWithStaff(raw, {
    providerId: PROVIDER2_ID,
    ownerUserProfileId: B.profileId,
    staffUserProfileId: STAFF2.profileId,
    slug: 'vet-clinic-2',
  });
});

/** Seed an active grant for STAFF's provider on A's pet with the given scopes. */
function grantStaff(scopes: string[]) {
  return seedGrant(raw, {
    petId: A.petId,
    ownerUserId: A.profileId,
    providerId: PROVIDER_ID,
    scopes,
  });
}

// ──────────────────────────────────────────────────────────────────────────────
// 1. pet_medical_profiles — owner read/write; provider READ ONLY via medical_read.
describe('RLS R2d — pet_medical_profiles (as pawpi_app)', () => {
  beforeEach(async () => {
    await seedMedicalProfile(raw, { profileRowId: 10, petId: A.petId, ownerUserId: A.profileId });
    await seedMedicalProfile(raw, { profileRowId: 20, petId: B.petId, ownerUserId: B.profileId });
  });

  it('owner A reads ONLY their own profile and can UPDATE/DELETE it', async () => {
    await asApp(A.profileId, async (tx) => {
      const rows = await tx`select id from pet_medical_profiles order by id`;
      expect(rows.map((r: any) => r.id)).toEqual([10]);
      const updated = await tx`update pet_medical_profiles set vet_phone = '555' where id = 10 returning id`;
      expect(updated).toHaveLength(1);
      const deleted = await tx`delete from pet_medical_profiles where id = 10 returning id`;
      expect(deleted).toHaveLength(1);
    });
  });

  it('no identity → zero rows (deny-by-default)', async () => {
    await asApp(null, async (tx) => {
      expect(await tx`select id from pet_medical_profiles`).toHaveLength(0);
    });
  });

  it('non-owner B canNOT read A\'s profile, and WITH CHECK rejects an insert as A', async () => {
    await asApp(B.profileId, async (tx) => {
      expect(await tx`select id from pet_medical_profiles where id = 10`).toHaveLength(0);
    });
    await expect(
      asApp(B.profileId, (tx) => tx`
        insert into pet_medical_profiles (pet_id, owner_user_id, microchip_id)
        values (${A.petId}, ${A.profileId}, 'forged')
      `),
    ).rejects.toThrow(/row-level security/i);
  });

  it('provider with active medical_read grant READS A\'s profile but canNOT write it', async () => {
    await grantStaff(['medical_read']);
    await asApp(STAFF.profileId, async (tx) => {
      const rows = await tx`select id from pet_medical_profiles order by id`;
      expect(rows.map((r: any) => r.id)).toEqual([10]); // only A's, never B's
      // No provider write policy on this table → update/delete affect zero rows.
      const updated = await tx`update pet_medical_profiles set vet_phone = 'x' where id = 10 returning id`;
      const deleted = await tx`delete from pet_medical_profiles where id = 10 returning id`;
      expect(updated).toHaveLength(0);
      expect(deleted).toHaveLength(0);
    });
    const [{ n }] = await raw`select count(*)::int as n from pet_medical_profiles where id = 10`;
    expect(n).toBe(1); // A's row survives
  });

  it('provider WITHOUT a grant → zero rows', async () => {
    await asApp(STAFF.profileId, async (tx) => {
      expect(await tx`select id from pet_medical_profiles where id = 10`).toHaveLength(0);
    });
  });

  it('grant lifecycle: revoked / expired / inactive-staff each flip provider access to ZERO', async () => {
    // revoked grant
    await seedGrant(raw, {
      petId: A.petId, ownerUserId: A.profileId, providerId: PROVIDER_ID,
      scopes: ['medical_read'], status: 'revoked',
    });
    await asApp(STAFF.profileId, async (tx) => {
      expect(await tx`select id from pet_medical_profiles where id = 10`).toHaveLength(0);
    });
    await raw`truncate table care_access_grants restart identity cascade`;

    // active grant but expired in the past
    await seedGrant(raw, {
      petId: A.petId, ownerUserId: A.profileId, providerId: PROVIDER_ID,
      scopes: ['medical_read'], status: 'active', expiresAt: '2020-01-01T00:00:00Z',
    });
    await asApp(STAFF.profileId, async (tx) => {
      expect(await tx`select id from pet_medical_profiles where id = 10`).toHaveLength(0);
    });
    await raw`truncate table care_access_grants restart identity cascade`;

    // active+unexpired grant, but the staff membership is no longer active
    await grantStaff(['medical_read']);
    await raw`update provider_staff set status = 'removed' where provider_id = ${PROVIDER_ID} and user_profile_id = ${STAFF.profileId}`;
    await asApp(STAFF.profileId, async (tx) => {
      expect(await tx`select id from pet_medical_profiles where id = 10`).toHaveLength(0);
    });
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 2. vet_notes — owner all; provider READ (medical_read) + INSERT (medical_write).
describe('RLS R2d — vet_notes (as pawpi_app)', () => {
  beforeEach(async () => {
    await seedVetNote(raw, { noteId: 101, petId: A.petId, ownerUserId: A.profileId });
    await seedVetNote(raw, { noteId: 201, petId: B.petId, ownerUserId: B.profileId });
    // Sync the sequence so provider/owner sequence-driven INSERTs don't collide with
    // the explicit-id seeds above.
    await raw`select setval(pg_get_serial_sequence('vet_notes','id'), (select max(id) from vet_notes))`;
  });

  it('owner A reads only their own note and can write/edit/delete it', async () => {
    await asApp(A.profileId, async (tx) => {
      expect((await tx`select id from vet_notes order by id`).map((r: any) => r.id)).toEqual([101]);
      const ins = await tx`
        insert into vet_notes (pet_id, owner_user_id, note_date, note)
        values (${A.petId}, ${A.profileId}, '2026-06-02', 'owner note') returning id
      `;
      expect(ins).toHaveLength(1);
      expect(await tx`update vet_notes set note = 'edited' where id = 101 returning id`).toHaveLength(1);
      expect(await tx`delete from vet_notes where id = 101 returning id`).toHaveLength(1);
    });
  });

  it('provider with medical_read READS A\'s note but canNOT INSERT (read-only grant)', async () => {
    await grantStaff(['medical_read']);
    await asApp(STAFF.profileId, async (tx) => {
      expect((await tx`select id from vet_notes order by id`).map((r: any) => r.id)).toEqual([101]);
    });
    // A read-only grant fails the INSERT WITH CHECK (needs medical_write).
    await expect(
      asApp(STAFF.profileId, (tx) => tx`
        insert into vet_notes (pet_id, owner_user_id, note_date, note)
        values (${A.petId}, ${A.profileId}, '2026-06-03', 'provider note')
      `),
    ).rejects.toThrow(/row-level security/i);
  });

  it('provider with medical_write INSERTs a note onto A\'s record, but canNOT UPDATE/DELETE', async () => {
    await grantStaff(['medical_read', 'medical_write']);
    await asApp(STAFF.profileId, async (tx) => {
      const created = await tx`
        insert into vet_notes (pet_id, owner_user_id, note_date, note)
        values (${A.petId}, ${A.profileId}, '2026-06-03', 'provider note') returning id, owner_user_id
      `;
      expect(created).toHaveLength(1);
      expect(created[0].owner_user_id).toBe(A.profileId); // lands on the owner's record
      // No provider UPDATE/DELETE policy → zero rows affected on the existing note.
      expect(await tx`update vet_notes set note = 'x' where id = 101 returning id`).toHaveLength(0);
      expect(await tx`delete from vet_notes where id = 101 returning id`).toHaveLength(0);
    });
    const [{ n }] = await raw`select count(*)::int as n from vet_notes where id = 101`;
    expect(n).toBe(1);
  });

  it('provider WITHOUT a grant reads zero and cannot insert', async () => {
    await asApp(STAFF.profileId, async (tx) => {
      expect(await tx`select id from vet_notes where id = 101`).toHaveLength(0);
    });
    await expect(
      asApp(STAFF.profileId, (tx) => tx`
        insert into vet_notes (pet_id, owner_user_id, note_date, note)
        values (${A.petId}, ${A.profileId}, '2026-06-03', 'nope')
      `),
    ).rejects.toThrow(/row-level security/i);
  });

  it('no identity → zero rows', async () => {
    await asApp(null, async (tx) => {
      expect(await tx`select id from vet_notes`).toHaveLength(0);
    });
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 3. pet_vaccinations — owner all (incl. write-through); provider READ (medical_read)
//    + INSERT (vaccinations_write).
describe('RLS R2d — pet_vaccinations (as pawpi_app)', () => {
  beforeEach(async () => {
    await seedVaccination(raw, { vaxId: 301, petId: A.petId, ownerUserId: A.profileId });
    await seedVaccination(raw, { vaxId: 401, petId: B.petId, ownerUserId: B.profileId });
    await raw`select setval(pg_get_serial_sequence('pet_vaccinations','id'), (select max(id) from pet_vaccinations))`;
  });

  it('owner write-through INSERT still works (owner branch) + read is own-only', async () => {
    await asApp(A.profileId, async (tx) => {
      expect((await tx`select id from pet_vaccinations order by id`).map((r: any) => r.id)).toEqual([301]);
      // The medical-care-logs reconciliation inserts pet_vaccinations in OWNER context.
      const ins = await tx`
        insert into pet_vaccinations (pet_id, owner_user_id, name)
        values (${A.petId}, ${A.profileId}, 'Rabies') returning id
      `;
      expect(ins).toHaveLength(1);
    });
  });

  it('provider with medical_read READS but canNOT INSERT (needs vaccinations_write)', async () => {
    await grantStaff(['medical_read']);
    await asApp(STAFF.profileId, async (tx) => {
      expect((await tx`select id from pet_vaccinations order by id`).map((r: any) => r.id)).toEqual([301]);
    });
    await expect(
      asApp(STAFF.profileId, (tx) => tx`
        insert into pet_vaccinations (pet_id, owner_user_id, name)
        values (${A.petId}, ${A.profileId}, 'Rabies')
      `),
    ).rejects.toThrow(/row-level security/i);
  });

  it('provider with vaccinations_write INSERTs onto A\'s record, but canNOT UPDATE/DELETE', async () => {
    await grantStaff(['medical_read', 'vaccinations_write']);
    await asApp(STAFF.profileId, async (tx) => {
      const created = await tx`
        insert into pet_vaccinations (pet_id, owner_user_id, name, administered_by_provider_id)
        values (${A.petId}, ${A.profileId}, 'Rabies', ${PROVIDER_ID}) returning id, owner_user_id
      `;
      expect(created).toHaveLength(1);
      expect(created[0].owner_user_id).toBe(A.profileId);
      expect(await tx`update pet_vaccinations set name = 'x' where id = 301 returning id`).toHaveLength(0);
      expect(await tx`delete from pet_vaccinations where id = 301 returning id`).toHaveLength(0);
    });
    const [{ n }] = await raw`select count(*)::int as n from pet_vaccinations where id = 301`;
    expect(n).toBe(1);
  });

  it('no identity → zero rows', async () => {
    await asApp(null, async (tx) => {
      expect(await tx`select id from pet_vaccinations`).toHaveLength(0);
    });
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 4. vet_appointments — HYBRID. Owner all; active staff of provider_id gets SELECT
//    (inbox) + UPDATE (booking actions). NO provider INSERT/DELETE. Access is by STAFF
//    MEMBERSHIP, never a care grant.
describe('RLS R2d — vet_appointments hybrid (as pawpi_app)', () => {
  let apptA: number; // A booked provider 1
  let apptB: number; // B booked provider 2

  beforeEach(async () => {
    ({ apptId: apptA } = await seedBooking(raw, {
      apptId: 501, petId: A.petId, ownerUserId: A.profileId, providerId: PROVIDER_ID,
    }));
    ({ apptId: apptB } = await seedBooking(raw, {
      apptId: 601, petId: B.petId, ownerUserId: B.profileId, providerId: PROVIDER2_ID,
    }));
    await raw`select setval(pg_get_serial_sequence('vet_appointments','id'), (select max(id) from vet_appointments))`;
  });

  it('owner A reads/updates/deletes their own booking and can INSERT one', async () => {
    await asApp(A.profileId, async (tx) => {
      expect((await tx`select id from vet_appointments order by id`).map((r: any) => r.id)).toEqual([apptA]);
      expect(await tx`update vet_appointments set notes = 'hi' where id = ${apptA} returning id`).toHaveLength(1);
      const booked = await tx`
        insert into vet_appointments
          (pet_id, owner_user_id, title, appointment_date, appointment_time, provider_id, booking_status, source)
        values (${A.petId}, ${A.profileId}, 'Visit', '2026-08-01', '10:00', ${PROVIDER_ID}, 'requested', 'owner')
        returning id
      `;
      expect(booked).toHaveLength(1);
      expect(await tx`delete from vet_appointments where id = ${apptA} returning id`).toHaveLength(1);
    });
  });

  it('active staff of provider 1 SELECTs (inbox) + UPDATEs (booking_status) the booking', async () => {
    await asApp(STAFF.profileId, async (tx) => {
      // Inbox: sees provider 1's booking, never provider 2's.
      expect((await tx`select id from vet_appointments order by id`).map((r: any) => r.id)).toEqual([apptA]);
      const updated = await tx`
        update vet_appointments set booking_status = 'confirmed', updated_at = now()
        where id = ${apptA} and provider_id = ${PROVIDER_ID} returning id, booking_status
      `;
      expect(updated).toHaveLength(1);
      expect(updated[0].booking_status).toBe('confirmed');
    });
  });

  it('staff of a DIFFERENT provider sees/affects ZERO of provider 1\'s booking', async () => {
    await asApp(STAFF2.profileId, async (tx) => {
      // STAFF2 is staff of provider 2 → sees only apptB, not apptA.
      expect((await tx`select id from vet_appointments order by id`).map((r: any) => r.id)).toEqual([apptB]);
      expect(await tx`update vet_appointments set booking_status = 'confirmed' where id = ${apptA} returning id`).toHaveLength(0);
    });
  });

  it('a provider with only a care GRANT (no staff membership) sees ZERO appointments', async () => {
    // STAFF2 holds an active medical_read grant on A's pet, but is NOT staff of
    // provider 1 (the booking's provider). Appointments are membership-gated, not
    // grant-gated → still zero.
    await seedGrant(raw, {
      petId: A.petId, ownerUserId: A.profileId, providerId: PROVIDER2_ID, scopes: ['medical_read'],
    });
    await asApp(STAFF2.profileId, async (tx) => {
      expect(await tx`select id from vet_appointments where id = ${apptA}`).toHaveLength(0);
    });
  });

  it('a different OWNER (B) sees ZERO of A\'s booking', async () => {
    await asApp(B.profileId, async (tx) => {
      expect(await tx`select id from vet_appointments where id = ${apptA}`).toHaveLength(0);
    });
  });

  it('provider (active staff) canNOT INSERT an appointment (WITH CHECK rejects) nor DELETE one', async () => {
    // Booking is owner-initiated: a provider inserting a row for the pet's real owner
    // fails the owner WITH CHECK (owner_user_id != the acting staff), and there is no
    // provider INSERT policy.
    await expect(
      asApp(STAFF.profileId, (tx) => tx`
        insert into vet_appointments
          (pet_id, owner_user_id, title, appointment_date, appointment_time, provider_id, booking_status, source)
        values (${A.petId}, ${A.profileId}, 'Visit', '2026-08-01', '10:00', ${PROVIDER_ID}, 'requested', 'owner')
      `),
    ).rejects.toThrow(/row-level security/i);
    // Providers cancel via a booking_status UPDATE, never DELETE → zero rows deleted.
    await asApp(STAFF.profileId, async (tx) => {
      expect(await tx`delete from vet_appointments where id = ${apptA} returning id`).toHaveLength(0);
    });
    const [{ n }] = await raw`select count(*)::int as n from vet_appointments where id = ${apptA}`;
    expect(n).toBe(1);
  });

  it('no identity → zero rows', async () => {
    await asApp(null, async (tx) => {
      expect(await tx`select id from vet_appointments`).toHaveLength(0);
    });
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Catalog check — every R2d table is ENABLE + FORCE RLS and carries its expected
// policies (owner + the provider command policies), so none is left un-policied under
// FORCE and the migration applied the intended per-command split.
describe('RLS R2d — catalog: provider-record tables are FORCE-RLS + policied', () => {
  const EXPECTED: Record<string, string[]> = {
    pet_medical_profiles: ['pet_medical_profiles_owner_all', 'pet_medical_profiles_provider_read'],
    vet_notes: ['vet_notes_owner_all', 'vet_notes_provider_read', 'vet_notes_provider_insert'],
    pet_vaccinations: ['pet_vaccinations_owner_all', 'pet_vaccinations_provider_read', 'pet_vaccinations_provider_insert'],
    vet_appointments: ['vet_appointments_owner_all', 'vet_appointments_provider_read', 'vet_appointments_provider_update'],
  };

  it('rowsecurity + forcerowsecurity = true and the expected policies exist', async () => {
    for (const [table, expected] of Object.entries(EXPECTED)) {
      const [flags] = await raw`
        select relrowsecurity, relforcerowsecurity
        from pg_class where oid = ${'public.' + table}::regclass
      `;
      expect(flags, `${table} should exist`).toBeDefined();
      expect(flags.relrowsecurity, `${table} ENABLE ROW LEVEL SECURITY`).toBe(true);
      expect(flags.relforcerowsecurity, `${table} FORCE ROW LEVEL SECURITY`).toBe(true);

      const policies = await raw`
        select policyname from pg_policies
        where schemaname = 'public' and tablename = ${table}
      `;
      const names = policies.map((p: any) => p.policyname);
      for (const p of expected) {
        expect(names, `${table} policy ${p} present`).toContain(p);
      }
    }
  });
});
