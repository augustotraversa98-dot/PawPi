// Telehealth "session at booking" (Phase 1, solo providers) — proven on the REAL tables AS
// pawpi_app. Two properties this feature depends on and that ONLY real Postgres + RLS can prove:
//
//   1. app_provider_solo_telehealth_staff (0078) — a SECURITY DEFINER reader that lets the
//      OWNER (a non-staff caller who cannot read provider_staff under RLS) resolve the LONE
//      eligible (owner|vet) active staffer, or NULL for zero/multiple. This is the solo-only
//      guard: NULL means the booking route creates nothing and keeps today's vet-first flow.
//
//   2. The OWNER may INSERT a telehealth_sessions row ASSIGNED TO THE VET. telehealth_sessions_
//      owner_all's WITH CHECK constrains only owner_user_id (0040), so an owner-context insert
//      may set staff_user_id to someone else. The session is then visible to the owner AND the
//      assigned vet — but NOT to another (unassigned) staffer of the same provider — and the
//      vet's idempotent "ensure" lookup (booking_id + staff_user_id = me) finds the pre-assigned
//      row, so the vet never creates a duplicate.
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
const V_SOLO = { authUserId: 2, profileId: 2, username: 'vsolo' }; // the lone vet
const V_B = { authUserId: 3, profileId: 3, username: 'vb' }; // a second vet
const X = { authUserId: 4, profileId: 4, username: 'outsiderx' };
const S_STAFF = { authUserId: 5, profileId: 5, username: 'sstaff' }; // role 'staff' (ineligible)

const SOLO_ID = 20; // exactly one eligible active staffer
const MULTI_ID = 21; // two eligible active staffers
const ZERO_ID = 22; // one active staffer but role 'staff' (ineligible)
const REMOVED_ID = 23; // one eligible staffer, but removed
const VIS_ID = 24; // two eligible vets — for the visibility + no-dup checks
const BOOK_ID = 5000; // a telehealth vet_appointments booking on VIS_ID

let raw: Sql;
let app: Sql;

function asApp<T>(userId: number | null, fn: (tx: Sql) => Promise<T>): Promise<T> {
  return app.begin(async (tx) => {
    await tx`select set_config('app.current_user_id', ${userId === null ? '' : String(userId)}, true)`;
    return fn(tx);
  });
}

// The MULTI-VET path: the OWNER pre-creates an UNASSIGNED session (staff_user_id NULL) for the
// VIS telehealth booking. Reproduces exactly what book/route.js inserts when the solo resolver
// returns NULL but app_provider_has_telehealth_staff is true.
function ownerCreatesUnassignedSession(): Promise<{ id: number }[]> {
  return asApp(O.profileId, (tx) => tx`
    insert into telehealth_sessions (booking_id, pet_id, owner_user_id, provider_id, staff_user_id, status)
    values (${BOOK_ID}, ${O.petId}, ${O.profileId}, ${VIS_ID}, ${null}, 'scheduled')
    returning id
  `) as Promise<{ id: number }[]>;
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
  await seedUser(raw, V_SOLO);
  await seedUser(raw, V_B);
  await seedUser(raw, X);
  await seedUser(raw, S_STAFF);

  // SOLO: one eligible active staffer (a vet). owner_user_profile_id is that same vet.
  await seedProvider(raw, { providerId: SOLO_ID, ownerUserProfileId: V_SOLO.profileId, slug: 'solo' });
  await seedStaff(raw, { providerId: SOLO_ID, userProfileId: V_SOLO.profileId, role: 'vet', status: 'active' });
  await seedCapability(raw, { providerId: SOLO_ID, capability: 'telehealth' });

  // MULTI: two eligible active staffers (owner + vet) → ambiguous.
  await seedProvider(raw, { providerId: MULTI_ID, ownerUserProfileId: V_SOLO.profileId, slug: 'multi' });
  await seedStaff(raw, { providerId: MULTI_ID, userProfileId: V_SOLO.profileId, role: 'owner', status: 'active' });
  await seedStaff(raw, { providerId: MULTI_ID, userProfileId: V_B.profileId, role: 'vet', status: 'active' });
  await seedCapability(raw, { providerId: MULTI_ID, capability: 'telehealth' });

  // ZERO: one active staffer, but role 'staff' — not an eligible practitioner.
  await seedProvider(raw, { providerId: ZERO_ID, ownerUserProfileId: V_SOLO.profileId, slug: 'zero' });
  await seedStaff(raw, { providerId: ZERO_ID, userProfileId: S_STAFF.profileId, role: 'staff', status: 'active' });
  await seedCapability(raw, { providerId: ZERO_ID, capability: 'telehealth' });

  // REMOVED: the only eligible staffer is removed → not active → no eligible staff.
  await seedProvider(raw, { providerId: REMOVED_ID, ownerUserProfileId: V_SOLO.profileId, slug: 'removed' });
  await seedStaff(raw, { providerId: REMOVED_ID, userProfileId: V_SOLO.profileId, role: 'vet', status: 'removed' });
  await seedCapability(raw, { providerId: REMOVED_ID, capability: 'telehealth' });

  // VIS: two active vets (V_SOLO assigned, V_B not) + a telehealth booking, for the
  // owner-insert / visibility / no-dup checks.
  await seedProvider(raw, { providerId: VIS_ID, ownerUserProfileId: V_SOLO.profileId, slug: 'vis' });
  await seedStaff(raw, { providerId: VIS_ID, userProfileId: V_SOLO.profileId, role: 'vet', status: 'active' });
  await seedStaff(raw, { providerId: VIS_ID, userProfileId: V_B.profileId, role: 'vet', status: 'active' });
  await seedCapability(raw, { providerId: VIS_ID, capability: 'telehealth' });
  await raw`
    insert into vet_appointments
      (id, pet_id, owner_user_id, provider_id, capability, title, appointment_date, appointment_time)
    values (${BOOK_ID}, ${O.petId}, ${O.profileId}, ${VIS_ID}, 'telehealth', 'Video consult', '2026-09-01', '10:00')
  `;
});

describe('app_provider_solo_telehealth_staff resolver (solo-only)', () => {
  it('returns the lone eligible active staffer, callable by the non-staff OWNER', async () => {
    const rows = await asApp(O.profileId, (tx) => tx`select app_provider_solo_telehealth_staff(${SOLO_ID}) as id`);
    expect(rows[0].id).toBe(V_SOLO.profileId);
  });

  it('returns NULL when multiple eligible active staffers exist', async () => {
    const rows = await asApp(O.profileId, (tx) => tx`select app_provider_solo_telehealth_staff(${MULTI_ID}) as id`);
    expect(rows[0].id).toBeNull();
  });

  it('returns NULL when the only active staffer is an ineligible role', async () => {
    const rows = await asApp(O.profileId, (tx) => tx`select app_provider_solo_telehealth_staff(${ZERO_ID}) as id`);
    expect(rows[0].id).toBeNull();
  });

  it('returns NULL when the only eligible staffer is removed (not active)', async () => {
    const rows = await asApp(O.profileId, (tx) => tx`select app_provider_solo_telehealth_staff(${REMOVED_ID}) as id`);
    expect(rows[0].id).toBeNull();
  });
});

describe('owner-context session insert + participant visibility + no-dup ensure', () => {
  // The booking route's insert, reproduced exactly: run AS the owner, assign the vet.
  async function ownerCreatesSession() {
    return asApp(O.profileId, (tx) => tx`
      insert into telehealth_sessions (booking_id, pet_id, owner_user_id, provider_id, staff_user_id, status)
      values (${BOOK_ID}, ${O.petId}, ${O.profileId}, ${VIS_ID}, ${V_SOLO.profileId}, 'scheduled')
      returning id, booking_id, staff_user_id, status
    `);
  }

  it('the OWNER may create a session ASSIGNED to the vet, linked by booking_id', async () => {
    const [row] = await ownerCreatesSession();
    expect(row.staff_user_id).toBe(V_SOLO.profileId);
    expect(row.booking_id).toBe(BOOK_ID);
    expect(row.status).toBe('scheduled');
  });

  it('the created session is visible to the OWNER and the ASSIGNED vet, but NOT to another staffer or an outsider', async () => {
    const [row] = await ownerCreatesSession();
    const sees = (uid: number) =>
      asApp(uid, (tx) => tx`select id from telehealth_sessions where id = ${row.id}`).then((r) => r.length);
    expect(await sees(O.profileId)).toBe(1); // owner
    expect(await sees(V_SOLO.profileId)).toBe(1); // assigned vet
    expect(await sees(V_B.profileId)).toBe(0); // active but UNASSIGNED staffer
    expect(await sees(X.profileId)).toBe(0); // outsider
  });

  it("the vet's ensure lookup (booking_id + staff_user_id = me) finds the pre-assigned session — no duplicate", async () => {
    await ownerCreatesSession();
    const found = await asApp(V_SOLO.profileId, (tx) => tx`
      select id from telehealth_sessions
      where booking_id = ${BOOK_ID} and staff_user_id = ${V_SOLO.profileId}
      limit 1
    `);
    expect(found.length).toBe(1); // ensure hits the existing row, so it returns it instead of inserting a second
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// MULTI-VET (0081): app_provider_has_telehealth_staff + app_claim_telehealth_session + the
// partial UNIQUE(booking_id). Only real Postgres + RLS proves the claim path — a vet CANNOT
// see or update an unassigned session under 0040, so the assignment must run through the
// SECURITY DEFINER claim function.
// ════════════════════════════════════════════════════════════════════════════════
describe('app_provider_has_telehealth_staff (0081)', () => {
  it('true when the provider has >=1 eligible active owner|vet staffer', async () => {
    const multi = await asApp(O.profileId, (tx) => tx`select app_provider_has_telehealth_staff(${VIS_ID}) as has`);
    expect(multi[0].has).toBe(true); // two active vets
    const solo = await asApp(O.profileId, (tx) => tx`select app_provider_has_telehealth_staff(${SOLO_ID}) as has`);
    expect(solo[0].has).toBe(true); // one active vet
  });

  it('false when zero eligible staff (ineligible role only, or all removed)', async () => {
    const zero = await asApp(O.profileId, (tx) => tx`select app_provider_has_telehealth_staff(${ZERO_ID}) as has`);
    expect(zero[0].has).toBe(false); // one active staffer, role 'staff'
    const removed = await asApp(O.profileId, (tx) => tx`select app_provider_has_telehealth_staff(${REMOVED_ID}) as has`);
    expect(removed[0].has).toBe(false); // one eligible staffer, but removed
  });
});

describe('app_claim_telehealth_session (0081, staff self-claim)', () => {
  it('an eligible vet claims the unassigned session — assigns self, and it persists', async () => {
    await ownerCreatesUnassignedSession();
    const claimed = await asApp(V_SOLO.profileId, (tx) => tx`select * from app_claim_telehealth_session(${BOOK_ID})`);
    expect(claimed[0].staff_user_id).toBe(V_SOLO.profileId);
    // The vet can now SEE its own row (staff_read lights up once staff_user_id = caller).
    const check = await asApp(V_SOLO.profileId, (tx) => tx`select staff_user_id from telehealth_sessions where booking_id = ${BOOK_ID}`);
    expect(check[0].staff_user_id).toBe(V_SOLO.profileId);
  });

  it('a second eligible vet racing to claim gets the already-assigned row — NO double-assign', async () => {
    await ownerCreatesUnassignedSession();
    await asApp(V_SOLO.profileId, (tx) => tx`select * from app_claim_telehealth_session(${BOOK_ID})`); // V_SOLO wins
    const second = await asApp(V_B.profileId, (tx) => tx`select * from app_claim_telehealth_session(${BOOK_ID})`);
    expect(second[0].staff_user_id).toBe(V_SOLO.profileId); // still the first claimer, not V_B
  });

  it('a non-staff caller cannot claim → NULL, session stays unassigned', async () => {
    await ownerCreatesUnassignedSession();
    const rows = await asApp(X.profileId, (tx) => tx`select (app_claim_telehealth_session(${BOOK_ID})).id as id`);
    expect(rows[0].id).toBeNull();
    const check = await asApp(O.profileId, (tx) => tx`select staff_user_id from telehealth_sessions where booking_id = ${BOOK_ID}`);
    expect(check[0].staff_user_id).toBeNull();
  });

  it('an ineligible role (active staff, not owner|vet) cannot claim → NULL', async () => {
    await seedStaff(raw, { providerId: VIS_ID, userProfileId: S_STAFF.profileId, role: 'staff', status: 'active' });
    await ownerCreatesUnassignedSession();
    const rows = await asApp(S_STAFF.profileId, (tx) => tx`select (app_claim_telehealth_session(${BOOK_ID})).id as id`);
    expect(rows[0].id).toBeNull();
  });

  it('NULL when the booking has no session yet (eligible caller, nothing to claim)', async () => {
    const rows = await asApp(V_SOLO.profileId, (tx) => tx`select (app_claim_telehealth_session(${BOOK_ID})).id as id`);
    expect(rows[0].id).toBeNull(); // no session was created for BOOK_ID in this test
  });
});

describe('multi-vet unassigned session — visibility + one-per-booking (0081)', () => {
  it('owner SEES the unassigned session; an unassigned active vet does NOT until they claim it', async () => {
    const [row] = await ownerCreatesUnassignedSession();
    const ownerSees = await asApp(O.profileId, (tx) => tx`select id from telehealth_sessions where id = ${row.id}`);
    expect(ownerSees.length).toBe(1); // owner_all branch
    const vetBefore = await asApp(V_B.profileId, (tx) => tx`select id from telehealth_sessions where id = ${row.id}`);
    expect(vetBefore.length).toBe(0); // unassigned → invisible to staff under 0040 (the crux)
    await asApp(V_B.profileId, (tx) => tx`select * from app_claim_telehealth_session(${BOOK_ID})`);
    const vetAfter = await asApp(V_B.profileId, (tx) => tx`select id from telehealth_sessions where id = ${row.id}`);
    expect(vetAfter.length).toBe(1); // after claiming (staff_user_id = me), staff_read grants access
  });

  it('the partial UNIQUE(booking_id) blocks a duplicate session for the same booking', async () => {
    await ownerCreatesUnassignedSession();
    await expect(
      asApp(O.profileId, (tx) => tx`
        insert into telehealth_sessions (booking_id, pet_id, owner_user_id, provider_id, staff_user_id, status)
        values (${BOOK_ID}, ${O.petId}, ${O.profileId}, ${VIS_ID}, ${null}, 'scheduled')
      `),
    ).rejects.toThrow(/duplicate key|unique/i);
  });
});
