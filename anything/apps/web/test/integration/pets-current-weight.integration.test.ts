// GET /api/pets and GET /api/pets/[id] — "current weight" source, under
// pawpi_app + FORCE RLS.
//
// Context (Dog Profile weight-source ticket, follow-up to #274): weight is a
// HISTORY, not a single field. POST /api/pet-medical-profiles only writes to
// pets.weight when the pet has ZERO health_weight_logs rows — once any
// weigh-in has ever been logged, a weight edit writes a NEW health_weight_logs
// row instead, and pets.weight never updates again. Dog Profile and the Edit
// Pet Profile prefill both read weight through useCurrentPet/usePetProfile,
// which is backed by these two routes — so "current weight" everywhere must
// mean the latest health_weight_logs row for the pet, falling back to
// pets.weight/weight_unit only when the pet has never had a weigh-in logged.
// This is the shared getCurrentWeight() helper (api/utils/petWeight.js),
// reused from pet-medical-profiles' GET (proven un-regressed in
// pet-medical-profiles.integration.test.ts).
//
// Runs the ACTUAL wrapped GET route handlers (withRequestContext) against the
// embedded DB AS pawpi_app, same harness pattern as
// pet-medical-profiles.integration.test.ts.

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
let listGET: (request: Request) => Promise<Response>;
let byIdGET: (request: Request, ctx: { params: { id: string } }) => Promise<Response>;

// A and B are the SAME owner's two pets — the real scoping risk (shared
// owner_user_id). Each gets its own weight-log history so a bleed between the
// two would show up as the wrong number, not just a wrong pet.
const OWNER = { authUserId: 1, profileId: 1, username: 'owner', petId: 1, petName: 'Rex' };
const PET_B_ID = 2;

async function seedSecondPet(
  sql: Sql,
  opts: { petId: number; ownerUserId: number; petName: string; weight?: number },
): Promise<void> {
  const { petId, ownerUserId, petName, weight } = opts;
  await sql`
    insert into pets (id, owner_user_id, name, handle, weight, weight_unit)
    values (${petId}, ${ownerUserId}, ${petName}, ${petName.toLowerCase() + '-handle'}, ${weight ?? null}, 'lbs')
  `;
}

async function seedWeightLog(
  sql: Sql,
  opts: { petId: number; ownerUserId: number; weight: number; loggedAt: string },
): Promise<void> {
  const { petId, ownerUserId, weight, loggedAt } = opts;
  await sql`
    insert into health_weight_logs (pet_id, owner_user_id, weight, weight_unit, logged_at)
    values (${petId}, ${ownerUserId}, ${weight}, 'lbs', ${loggedAt}::timestamptz)
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
  const listRoute = await import('@/app/api/pets/route');
  listGET = listRoute.GET as typeof listGET;
  const byIdRoute = await import('@/app/api/pets/[id]/route');
  byIdGET = byIdRoute.GET as typeof byIdGET;
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

describe('GET /api/pets — current weight prefers the latest health_weight_logs row', () => {
  it('falls back to pets.weight when the pet has zero weigh-ins logged', async () => {
    await seedOwnerWithPet(raw, OWNER);
    await raw`update pets set weight = 40, weight_unit = 'lbs' where id = ${OWNER.petId}`;

    authState.session = { user: { id: OWNER.authUserId, email: 'owner@example.com', name: 'Owner' } };

    const res = await listGET(new Request('http://localhost/api/pets'));
    expect(res.status).toBe(200);
    const { pets } = await res.json();
    const pet = pets.find((p: any) => p.id === OWNER.petId);
    expect(Number(pet.weight)).toBe(40);
    expect(pet.weight_unit).toBe('lbs');
  });

  it('prefers the LATEST weight log over pets.weight once any weigh-in exists', async () => {
    await seedOwnerWithPet(raw, OWNER);
    await raw`update pets set weight = 40, weight_unit = 'lbs' where id = ${OWNER.petId}`;
    // pets.weight is stale at 40; two logs exist, the later one (45.5) must win.
    await seedWeightLog(raw, {
      petId: OWNER.petId,
      ownerUserId: OWNER.profileId,
      weight: 42,
      loggedAt: '2026-06-01T00:00:00Z',
    });
    await seedWeightLog(raw, {
      petId: OWNER.petId,
      ownerUserId: OWNER.profileId,
      weight: 45.5,
      loggedAt: '2026-07-01T00:00:00Z',
    });

    authState.session = { user: { id: OWNER.authUserId, email: 'owner@example.com', name: 'Owner' } };

    const res = await listGET(new Request('http://localhost/api/pets'));
    expect(res.status).toBe(200);
    const { pets } = await res.json();
    const pet = pets.find((p: any) => p.id === OWNER.petId);
    expect(Number(pet.weight)).toBe(45.5);

    // pets.weight itself is untouched (still the stale value) — only the read
    // prefers the log; the DB column is not rewritten by a GET.
    const [row] = await raw`select weight from pets where id = ${OWNER.petId}`;
    expect(Number(row.weight)).toBe(40);
  });

  it("owner with 2 pets: pet B's weight logs never bleed into pet A's shown weight", async () => {
    await seedOwnerWithPet(raw, OWNER);
    await seedSecondPet(raw, { petId: PET_B_ID, ownerUserId: OWNER.profileId, petName: 'Bella', weight: 20 });

    await seedWeightLog(raw, {
      petId: OWNER.petId,
      ownerUserId: OWNER.profileId,
      weight: 45.5,
      loggedAt: '2026-07-01T00:00:00Z',
    });
    await seedWeightLog(raw, {
      petId: PET_B_ID,
      ownerUserId: OWNER.profileId,
      weight: 12.25,
      loggedAt: '2026-07-01T00:00:00Z',
    });

    authState.session = { user: { id: OWNER.authUserId, email: 'owner@example.com', name: 'Owner' } };

    const res = await listGET(new Request('http://localhost/api/pets'));
    expect(res.status).toBe(200);
    const { pets } = await res.json();
    const petA = pets.find((p: any) => p.id === OWNER.petId);
    const petB = pets.find((p: any) => p.id === PET_B_ID);
    expect(Number(petA.weight)).toBe(45.5);
    expect(Number(petB.weight)).toBe(12.25);
  });
});

describe('GET /api/pets/[id] — same current-weight convention as the list route', () => {
  it('prefers the latest weight log over pets.weight', async () => {
    await seedOwnerWithPet(raw, OWNER);
    await raw`update pets set weight = 40, weight_unit = 'lbs' where id = ${OWNER.petId}`;
    await seedWeightLog(raw, {
      petId: OWNER.petId,
      ownerUserId: OWNER.profileId,
      weight: 45.5,
      loggedAt: '2026-07-01T00:00:00Z',
    });

    authState.session = { user: { id: OWNER.authUserId, email: 'owner@example.com', name: 'Owner' } };

    const res = await byIdGET(
      new Request(`http://localhost/api/pets/${OWNER.petId}`),
      { params: { id: String(OWNER.petId) } },
    );
    expect(res.status).toBe(200);
    const { pet } = await res.json();
    expect(Number(pet.weight)).toBe(45.5);
  });

  it('falls back to pets.weight when zero weigh-ins are logged', async () => {
    await seedOwnerWithPet(raw, OWNER);
    await raw`update pets set weight = 40, weight_unit = 'lbs' where id = ${OWNER.petId}`;

    authState.session = { user: { id: OWNER.authUserId, email: 'owner@example.com', name: 'Owner' } };

    const res = await byIdGET(
      new Request(`http://localhost/api/pets/${OWNER.petId}`),
      { params: { id: String(OWNER.petId) } },
    );
    expect(res.status).toBe(200);
    const { pet } = await res.json();
    expect(Number(pet.weight)).toBe(40);
  });
});
