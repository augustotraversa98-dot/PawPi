// POST /api/pet-medical-profiles under pawpi_app + FORCE RLS — proves the
// Edit Medical Profile save is scoped correctly to ONE pet.
//
// Context: EditMedicalProfileModal.jsx PATCHes shared pet fields (breed,
// birthday, gender, weight) through this endpoint, in the SAME request as the
// pet_medical_profiles upsert. The pets UPDATE is scoped
// `WHERE id = ${petId} AND owner_user_id = ${ownerUserId}` — correct, and not
// to be changed. This suite proves that scoping holds for the real risk case:
// an owner with TWO OR MORE pets. Since both pets share the same
// owner_user_id, the `id = petId` half of the WHERE clause is the only thing
// standing between "update pet A" and "update every pet I own" — worth an
// explicit real-Postgres proof, not just an implied read of the SQL. Also
// covers the (already-correct) cross-owner case: an owner cannot touch
// another owner's pet at all (404, not just 0 rows updated).
//
// Runs the ACTUAL wrapped POST/GET route handlers (withRequestContext) against
// the embedded DB AS pawpi_app, same harness pattern as
// provider-create-rls.integration.test.ts.

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { inject } from 'vitest';
import postgres from 'postgres';
import type { Sql } from 'postgres';
import { makeTestSql, resetDb, seedOwnerWithPet } from './db';

const authState = vi.hoisted(() => ({ session: null as any }));
vi.mock('@/auth', () => ({ auth: async () => authState.session }));

let raw: Sql;
let app: Sql;
let appSql: any;
let POST: (request: Request) => Promise<Response>;
let GET: (request: Request) => Promise<Response>;

// A and B are the SAME owner's two pets — the real scoping risk (shared
// owner_user_id). C belongs to a DIFFERENT owner entirely.
const OWNER = { authUserId: 1, profileId: 1, username: 'owner', petId: 1, petName: 'Rex' };
const PET_B_ID = 2;
const OTHER = { authUserId: 2, profileId: 2, username: 'otherowner', petId: 3, petName: 'Fido' };

function medicalProfileRequest(body: unknown): Request {
  return new Request('http://localhost/api/pet-medical-profiles', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** A second pet for an EXISTING owner (seedOwnerWithPet always makes a fresh owner). */
async function seedSecondPet(
  sql: Sql,
  opts: { petId: number; ownerUserId: number; petName: string },
): Promise<void> {
  const { petId, ownerUserId, petName } = opts;
  await sql`
    insert into pets (id, owner_user_id, name, handle, breed, gender, birthday)
    values (${petId}, ${ownerUserId}, ${petName}, ${petName.toLowerCase() + '-handle'}, 'Original Breed', 'male', '2020-01-01')
  `;
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

  url.username = 'pawpi_app';
  url.password = 'pawpi_app';
  process.env.DATABASE_URL = url.toString();
  process.env.DATABASE_SSL = 'disable';

  appSql = (await import('@/app/api/utils/sql')).default;
  const route = await import('@/app/api/pet-medical-profiles/route');
  POST = route.POST as typeof POST;
  GET = route.GET as typeof GET;
});

afterAll(async () => {
  await appSql.end?.();
  await app.end();
  await raw.end();
});

afterEach(async () => {
  await resetDb(raw);
  authState.session = null;
});

describe('POST /api/pet-medical-profiles — owner with 2+ pets', () => {
  it("editing pet A's breed/gender/birthday/weight never changes pet B (same owner)", async () => {
    await seedOwnerWithPet(raw, OWNER);
    await seedSecondPet(raw, { petId: PET_B_ID, ownerUserId: OWNER.profileId, petName: 'Bella' });

    authState.session = { user: { id: OWNER.authUserId, email: 'owner@example.com', name: 'Owner' } };

    const res = await POST(
      medicalProfileRequest({
        petId: OWNER.petId,
        breed: 'Golden Retriever',
        birthday: '2019-05-01',
        gender: 'female',
        currentWeight: '42.5',
        weightUnit: 'lbs',
        microchipId: 'chip-a',
      }),
    );
    expect(res.status).toBe(200);

    // Pet A got every shared field it asked for.
    const [petA] = await raw`select breed, gender, birthday, weight from pets where id = ${OWNER.petId}`;
    expect(petA.breed).toBe('Golden Retriever');
    expect(petA.gender).toBe('female');
    expect(new Date(petA.birthday).toISOString().slice(0, 10)).toBe('2019-05-01');
    expect(Number(petA.weight)).toBe(42.5);

    // Pet B (SAME owner) is completely untouched — this is the load-bearing
    // assertion: it's not enough that the WHERE clause reads right, the real
    // DB has to prove it for an owner who owns more than one pet.
    const [petB] = await raw`select breed, gender, birthday, weight from pets where id = ${PET_B_ID}`;
    expect(petB.breed).toBe('Original Breed');
    expect(petB.gender).toBe('male');
    expect(new Date(petB.birthday).toISOString().slice(0, 10)).toBe('2020-01-01');
    expect(petB.weight).toBeNull();

    // The medical-profile upsert also only created a row for pet A.
    const profiles = await raw`select pet_id, microchip_id from pet_medical_profiles`;
    expect(profiles).toHaveLength(1);
    expect(profiles[0]).toMatchObject({ pet_id: OWNER.petId, microchip_id: 'chip-a' });
  });

  it("owner A cannot edit owner C's pet at all (404, zero rows changed)", async () => {
    await seedOwnerWithPet(raw, OWNER);
    await seedOwnerWithPet(raw, OTHER);

    authState.session = { user: { id: OWNER.authUserId, email: 'owner@example.com', name: 'Owner' } };

    const res = await POST(
      medicalProfileRequest({
        petId: OTHER.petId,
        breed: 'Hacked Breed',
        gender: 'female',
      }),
    );
    expect(res.status).toBe(404);

    const [otherPet] = await raw`select breed, gender from pets where id = ${OTHER.petId}`;
    expect(otherPet.breed).toBeNull();
    expect(otherPet.gender).toBeNull();

    const profiles = await raw`select id from pet_medical_profiles where pet_id = ${OTHER.petId}`;
    expect(profiles).toHaveLength(0);
  });

  it('GET only ever returns the requested pet, never a sibling pet (same owner)', async () => {
    await seedOwnerWithPet(raw, OWNER);
    await seedSecondPet(raw, { petId: PET_B_ID, ownerUserId: OWNER.profileId, petName: 'Bella' });

    authState.session = { user: { id: OWNER.authUserId, email: 'owner@example.com', name: 'Owner' } };

    const res = await GET(
      new Request(`http://localhost/api/pet-medical-profiles?petId=${OWNER.petId}`),
    );
    expect(res.status).toBe(200);
    const { pet } = await res.json();
    expect(pet.id).toBe(OWNER.petId);
    expect(pet.id).not.toBe(PET_B_ID);
  });

  // Regression for the getCurrentWeight() extraction (shared with GET
  // /api/pets and GET /api/pets/[id] — pets-current-weight.integration.test.ts):
  // this route's own currentWeight must keep preferring the latest weigh-in
  // over pets.weight after the shared-helper refactor.
  it("GET currentWeight prefers the latest health_weight_logs row over stale pets.weight", async () => {
    await seedOwnerWithPet(raw, OWNER);
    await raw`update pets set weight = 40, weight_unit = 'lbs' where id = ${OWNER.petId}`;
    await raw`
      insert into health_weight_logs (pet_id, owner_user_id, weight, weight_unit, logged_at)
      values
        (${OWNER.petId}, ${OWNER.profileId}, 42, 'lbs', '2026-06-01T00:00:00Z'),
        (${OWNER.petId}, ${OWNER.profileId}, 45.5, 'lbs', '2026-07-01T00:00:00Z')
    `;

    authState.session = { user: { id: OWNER.authUserId, email: 'owner@example.com', name: 'Owner' } };

    const res = await GET(
      new Request(`http://localhost/api/pet-medical-profiles?petId=${OWNER.petId}`),
    );
    expect(res.status).toBe(200);
    const { currentWeight } = await res.json();
    expect(Number(currentWeight.weight)).toBe(45.5);
  });

  it('GET currentWeight falls back to pets.weight when zero weigh-ins are logged', async () => {
    await seedOwnerWithPet(raw, OWNER);
    await raw`update pets set weight = 40, weight_unit = 'lbs' where id = ${OWNER.petId}`;

    authState.session = { user: { id: OWNER.authUserId, email: 'owner@example.com', name: 'Owner' } };

    const res = await GET(
      new Request(`http://localhost/api/pet-medical-profiles?petId=${OWNER.petId}`),
    );
    expect(res.status).toBe(200);
    const { currentWeight } = await res.json();
    expect(Number(currentWeight.weight)).toBe(40);
  });
});
