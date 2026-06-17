// Ticket 2.18 — TELEHEALTH module, proven on the REAL tables AS pawpi_app. 0040 adds
// telehealth_sessions with owner-FOR-ALL + ASSIGNED-staff (participant-scoped) RLS — the
// guard that a consult's video link never leaks to a non-participant — and widens two
// capability CHECKs to accept 'telehealth'.
//
// What this proves (as pawpi_app, NOBYPASSRLS, identity stamped per transaction):
//   1. The two widened CHECKs accept 'telehealth' (provider_capabilities + vet_appointments).
//   2. The capability gate: provider_has_capability(provider,'telehealth') — true for a
//      telehealth provider, false for one without it.
//   3. telehealth_sessions is visible to the OWNER and the ASSIGNED active staff — and to NO
//      ONE ELSE: an outsider AND another staffer of the SAME provider read ZERO.
//   4. The assigned vet can INSERT a session for themselves; a staffer cannot insert one
//      assigned to someone else; a removed staffer loses access.
//   5. telehealth_sessions is ENABLE+FORCE RLS with policies (completeness guard).
//
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
  seedProvider,
  seedStaff,
  seedCapability,
} from './db';

const O = { authUserId: 1, profileId: 1, username: 'ownero', petId: 1, petName: 'Rex' };
const V = { authUserId: 2, profileId: 2, username: 'vetv' }; // ASSIGNED vet
const V2 = { authUserId: 3, profileId: 3, username: 'vetv2' }; // another vet, NOT assigned
const X = { authUserId: 4, profileId: 4, username: 'outsiderx' };
const TELE_ID = 10; // provider holding 'telehealth'
const VET_ONLY_ID = 11; // provider WITHOUT 'telehealth'
const SESSION_ID = 100;

let raw: Sql;
let app: Sql;

function asApp<T>(userId: number | null, fn: (tx: Sql) => Promise<T>): Promise<T> {
  return app.begin(async (tx) => {
    await tx`select set_config('app.current_user_id', ${userId === null ? '' : String(userId)}, true)`;
    return fn(tx);
  });
}

beforeAll(async () => {
  raw = makeTestSql();
  const url = new URL(inject('TEST_DATABASE_URL') as string);
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

beforeEach(async () => {
  await seedOwnerWithPet(raw, O);
  await seedUser(raw, V);
  await seedUser(raw, V2);
  await seedUser(raw, X);
  await seedProvider(raw, { providerId: TELE_ID, ownerUserProfileId: V.profileId, slug: 'tele' });
  await seedStaff(raw, { providerId: TELE_ID, userProfileId: V.profileId, role: 'owner', status: 'active' });
  await seedStaff(raw, { providerId: TELE_ID, userProfileId: V2.profileId, role: 'vet', status: 'active' });
  await seedCapability(raw, { providerId: TELE_ID, capability: 'telehealth' });
  await seedProvider(raw, { providerId: VET_ONLY_ID, ownerUserProfileId: V.profileId, slug: 'vetonly' });
  await seedCapability(raw, { providerId: VET_ONLY_ID, capability: 'vet' });

  // One scheduled consult ASSIGNED to V.
  await raw`
    insert into telehealth_sessions (id, pet_id, owner_user_id, provider_id, staff_user_id, status)
    values (${SESSION_ID}, ${O.petId}, ${O.profileId}, ${TELE_ID}, ${V.profileId}, 'scheduled')
  `;
});

describe('widened capability CHECKs accept telehealth', () => {
  it('provider_capabilities + vet_appointments both accept capability = telehealth', async () => {
    // Seeded above without error → provider_capabilities accepts it.
    const cap = await raw`select 1 from provider_capabilities where provider_id = ${TELE_ID} and capability = 'telehealth'`;
    expect(cap.length).toBe(1);
    // A telehealth booking row inserts without a CHECK violation.
    await raw`
      insert into vet_appointments
        (id, pet_id, owner_user_id, provider_id, capability, title, appointment_date, appointment_time)
      values (5001, ${O.petId}, ${O.profileId}, ${TELE_ID}, 'telehealth', 'Video consult', '2026-07-01', '09:00')
    `;
    const apt = await raw`select capability from vet_appointments where id = 5001`;
    expect(apt[0].capability).toBe('telehealth');
  });
});

describe('capability gate', () => {
  it('provider_has_capability resolves true for telehealth provider, false otherwise', async () => {
    const yes = await asApp(V.profileId, (tx) => tx`select provider_has_capability(${TELE_ID}, 'telehealth') as has`);
    const no = await asApp(V.profileId, (tx) => tx`select provider_has_capability(${VET_ONLY_ID}, 'telehealth') as has`);
    expect(yes[0].has).toBe(true);
    expect(no[0].has).toBe(false);
  });
});

describe('participant-scoped visibility (the join-link guard)', () => {
  it('the OWNER sees their consult', async () => {
    const rows = await asApp(O.profileId, (tx) => tx`select id from telehealth_sessions where id = ${SESSION_ID}`);
    expect(rows.length).toBe(1);
  });
  it('the ASSIGNED vet sees the consult', async () => {
    const rows = await asApp(V.profileId, (tx) => tx`select id from telehealth_sessions where id = ${SESSION_ID}`);
    expect(rows.length).toBe(1);
  });
  it('ANOTHER vet of the SAME provider (not assigned) sees ZERO', async () => {
    const rows = await asApp(V2.profileId, (tx) => tx`select id from telehealth_sessions where id = ${SESSION_ID}`);
    expect(rows.length).toBe(0);
  });
  it('an outsider sees ZERO', async () => {
    const rows = await asApp(X.profileId, (tx) => tx`select id from telehealth_sessions where id = ${SESSION_ID}`);
    expect(rows.length).toBe(0);
  });
});

describe('assigned-staff write scoping', () => {
  it('an active staffer can INSERT a session assigned to THEMSELVES', async () => {
    const inserted = await asApp(V2.profileId, (tx) => tx`
      insert into telehealth_sessions (pet_id, owner_user_id, provider_id, staff_user_id, status)
      values (${O.petId}, ${O.profileId}, ${TELE_ID}, ${V2.profileId}, 'scheduled')
      returning id, staff_user_id
    `);
    expect(inserted[0].staff_user_id).toBe(V2.profileId);
  });

  it('a staffer CANNOT insert a session assigned to someone else (WITH CHECK)', async () => {
    await expect(
      asApp(V2.profileId, (tx) => tx`
        insert into telehealth_sessions (pet_id, owner_user_id, provider_id, staff_user_id, status)
        values (${O.petId}, ${O.profileId}, ${TELE_ID}, ${V.profileId}, 'scheduled')
      `),
    ).rejects.toThrow();
  });

  it('a REMOVED staffer loses session access', async () => {
    await raw`update provider_staff set status = 'removed' where provider_id = ${TELE_ID} and user_profile_id = ${V.profileId}`;
    const rows = await asApp(V.profileId, (tx) => tx`select id from telehealth_sessions where id = ${SESSION_ID}`);
    expect(rows.length).toBe(0);
  });
});

describe('completeness — telehealth_sessions is policied', () => {
  it('is ENABLE + FORCE RLS with at least one policy', async () => {
    const [row] = await raw`
      select c.relrowsecurity as enabled, c.relforcerowsecurity as forced,
             (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = 'telehealth_sessions') as policies
      from pg_class c where c.relname = 'telehealth_sessions'
    `;
    expect(row.enabled).toBe(true);
    expect(row.forced).toBe(true);
    expect(Number(row.policies)).toBeGreaterThanOrEqual(1);
  });
});
