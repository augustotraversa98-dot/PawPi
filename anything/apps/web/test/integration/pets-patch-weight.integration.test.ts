// PATCH /api/pets/[id] — weight-write path, under pawpi_app + FORCE RLS.
//
// Context (follow-up to #275/#276): #275 made every "current weight" READ
// prefer the latest health_weight_logs row, falling back to pets.weight only
// when a pet has zero weigh-ins logged. But PATCH /api/pets/[id] (Dog Profile
// edit) still wrote weight straight to pets.weight/weight_unit, so once a pet
// had any weigh-in history a Dog Profile weight edit wrote to a column the
// read side no longer looked at. This route now routes a weight edit through
// the same shared logCurrentWeight helper (api/utils/petWeight.js) that
// POST /api/pet-medical-profiles already used correctly — proven un-regressed
// there by pet-medical-profiles.integration.test.ts.
//
// Runs the ACTUAL wrapped PATCH/GET route handlers (withRequestContext)
// against the embedded DB AS pawpi_app, same harness pattern as
// pets-current-weight.integration.test.ts.

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
let PATCH: (request: Request, ctx: { params: { id: string } }) => Promise<Response>;

// A and B are the SAME owner's two pets — the real scoping risk (shared
// owner_user_id).
const OWNER = { authUserId: 1, profileId: 1, username: 'owner', petId: 1, petName: 'Rex' };
const PET_B_ID = 2;

function patchRequest(body: unknown): Request {
  return new Request('http://localhost/api/pets/patch-target', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

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
  const route = await import('@/app/api/pets/[id]/route');
  PATCH = route.PATCH as typeof PATCH;
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

describe('PATCH /api/pets/[id] — weight edit routes through logCurrentWeight', () => {
  it('a pet with zero prior weigh-ins gets its first weight seeded onto pets.weight/weight_unit', async () => {
    await seedOwnerWithPet(raw, OWNER);
    authState.session = { user: { id: OWNER.authUserId, email: 'owner@example.com', name: 'Owner' } };

    const res = await PATCH(
      patchRequest({ weight: 40, weight_unit: 'lbs' }),
      { params: { id: String(OWNER.petId) } },
    );
    expect(res.status).toBe(200);
    const { pet } = await res.json();
    expect(Number(pet.weight)).toBe(40);
    expect(pet.weight_unit).toBe('lbs');

    const [row] = await raw`select weight, weight_unit from pets where id = ${OWNER.petId}`;
    expect(Number(row.weight)).toBe(40);
    expect(row.weight_unit).toBe('lbs');

    const logs = await raw`select id from health_weight_logs where pet_id = ${OWNER.petId}`;
    expect(logs).toHaveLength(0);
  });

  it('once the pet has weigh-in history, a weight edit inserts a NEW health_weight_logs row instead of touching pets.weight', async () => {
    await seedOwnerWithPet(raw, OWNER);
    await raw`update pets set weight = 40, weight_unit = 'lbs' where id = ${OWNER.petId}`;
    await raw`
      insert into health_weight_logs (pet_id, owner_user_id, weight, weight_unit, logged_at)
      values (${OWNER.petId}, ${OWNER.profileId}, 42, 'lbs', '2026-06-01T00:00:00Z')
    `;

    authState.session = { user: { id: OWNER.authUserId, email: 'owner@example.com', name: 'Owner' } };

    const res = await PATCH(
      patchRequest({ weight: 45.5, weight_unit: 'lbs' }),
      { params: { id: String(OWNER.petId) } },
    );
    expect(res.status).toBe(200);
    const { pet } = await res.json();
    // Response reflects the new current weight (via getCurrentWeight)...
    expect(Number(pet.weight)).toBe(45.5);

    // ...but pets.weight itself stays stale — the edit landed as a new log row.
    const [row] = await raw`select weight from pets where id = ${OWNER.petId}`;
    expect(Number(row.weight)).toBe(40);

    const logs = await raw`
      select weight from health_weight_logs
      where pet_id = ${OWNER.petId}
      order by logged_at desc
    `;
    expect(logs).toHaveLength(2);
    expect(Number(logs[0].weight)).toBe(45.5);
  });

  it("editing pet A's weight never touches pet B (same owner)", async () => {
    await seedOwnerWithPet(raw, OWNER);
    await seedSecondPet(raw, { petId: PET_B_ID, ownerUserId: OWNER.profileId, petName: 'Bella', weight: 20 });

    authState.session = { user: { id: OWNER.authUserId, email: 'owner@example.com', name: 'Owner' } };

    const res = await PATCH(
      patchRequest({ weight: 55, weight_unit: 'lbs' }),
      { params: { id: String(OWNER.petId) } },
    );
    expect(res.status).toBe(200);

    const [petB] = await raw`select weight from pets where id = ${PET_B_ID}`;
    expect(Number(petB.weight)).toBe(20);

    const petBLogs = await raw`select id from health_weight_logs where pet_id = ${PET_B_ID}`;
    expect(petBLogs).toHaveLength(0);
  });

  it('a non-weight field edit does not disturb an existing weight-log history', async () => {
    await seedOwnerWithPet(raw, OWNER);
    await raw`update pets set weight = 40, weight_unit = 'lbs' where id = ${OWNER.petId}`;
    await raw`
      insert into health_weight_logs (pet_id, owner_user_id, weight, weight_unit, logged_at)
      values (${OWNER.petId}, ${OWNER.profileId}, 42, 'lbs', '2026-06-01T00:00:00Z')
    `;

    authState.session = { user: { id: OWNER.authUserId, email: 'owner@example.com', name: 'Owner' } };

    const res = await PATCH(
      patchRequest({ notes: 'Loves belly rubs' }),
      { params: { id: String(OWNER.petId) } },
    );
    expect(res.status).toBe(200);

    const logs = await raw`select id from health_weight_logs where pet_id = ${OWNER.petId}`;
    expect(logs).toHaveLength(1);

    const [row] = await raw`select weight, notes from pets where id = ${OWNER.petId}`;
    expect(Number(row.weight)).toBe(40);
    expect(row.notes).toBe('Loves belly rubs');
  });
});
