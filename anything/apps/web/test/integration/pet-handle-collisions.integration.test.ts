// Pet @handle collisions end to end (night run #2, PR B), under pawpi_app + FORCE RLS on a real
// Postgres: availability (case-insensitive, own-pet exclusion, reserved), suggestions, and the
// POST/PATCH race-safety (a unique violation is a friendly 409 with fresh alternatives, never a
// 500 / aborted transaction).

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { inject } from 'vitest';
import postgres from 'postgres';
import type { Sql } from 'postgres';
import { makeTestSql, resetDb, seedOwnerWithPet } from './db';

const authState = vi.hoisted(() => ({ session: null as any }));
vi.mock('@/auth', () => ({ auth: async () => authState.session }));

// takenAmong is wrapped so one test can simulate the race (check says "free", INSERT then loses).
const raceState = vi.hoisted(() => ({ forceFree: false }));
vi.mock('@/app/api/utils/petHandle', async (importOriginal) => {
  const orig: any = await importOriginal();
  return {
    ...orig,
    takenAmong: async (sql: any, candidates: string[]) => {
      if (raceState.forceFree && candidates.length === 1) return [];
      return orig.takenAmong(sql, candidates);
    },
  };
});

let raw: Sql;
let app: Sql;
let appSql: any;
let AVAIL: (r: Request) => Promise<Response>;
let SUGGEST: (r: Request) => Promise<Response>;
let POST: (r: Request) => Promise<Response>;
let PATCH: (r: Request, ctx: { params: { id: string } }) => Promise<Response>;

const A = { authUserId: 1, profileId: 1, username: 'ownera', petId: 1, petName: 'Rex' };
const B = { authUserId: 2, profileId: 2, username: 'ownerb', petId: 2, petName: 'Bella' };
const asA = () => {
  authState.session = { user: { id: A.authUserId, email: 'a@example.com', name: 'A' } };
};

const get = (path: string) => new Request(`http://localhost${path}`);
const json = (method: string, body: unknown) =>
  new Request('http://localhost/api/pets', {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

// seedOwnerWithPet inserts explicit ids, so move the identity past them before a real INSERT.
async function bumpPetSequence() {
  await raw`select setval(pg_get_serial_sequence('pets', 'id'), 1000)`;
}

async function setHandle(petId: number, handle: string) {
  await raw`update pets set handle = ${handle} where id = ${petId}`;
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
  AVAIL = (await import('@/app/api/pets/handle-availability/route')).GET as any;
  SUGGEST = (await import('@/app/api/pets/handle-suggestions/route')).GET as any;
  const pets = await import('@/app/api/pets/route');
  POST = pets.POST as any;
  PATCH = (await import('@/app/api/pets/[id]/route')).PATCH as any;
});

afterAll(async () => {
  await appSql.end?.();
  await app.end();
  await raw.end();
});

afterEach(async () => {
  await resetDb(raw);
  authState.session = null;
  raceState.forceFree = false;
});

describe('availability', () => {
  it('is case-insensitive against a legacy MIXED-CASE stored handle', async () => {
    await seedOwnerWithPet(raw, A);
    await seedOwnerWithPet(raw, B);
    await setHandle(B.petId, 'Bella.Paws'); // legacy row written before normalization existed
    asA();
    const body = await (await AVAIL(get('/api/pets/handle-availability?handle=%40bella.PAWS'))).json();
    expect(body.available).toBe(false);
    expect(body.alternatives.length).toBeGreaterThan(0);
    expect(body.alternatives).not.toContain('bella.paws');
  });

  it('alternatives for a taken handle are all actually free', async () => {
    await seedOwnerWithPet(raw, A);
    await seedOwnerWithPet(raw, B);
    await setHandle(A.petId, 'milo');
    await setHandle(B.petId, 'milo2');
    asA();
    const body = await (await AVAIL(get('/api/pets/handle-availability?handle=milo'))).json();
    expect(body.alternatives).toHaveLength(3);
    for (const alt of body.alternatives) {
      const rows = await raw`select 1 from pets where lower(handle) = ${alt}`;
      expect(rows).toHaveLength(0);
    }
    expect(body.alternatives).not.toContain('milo2');
  });

  it("own pet's handle counts as available when pet_id is sent (edit), but not someone else's", async () => {
    await seedOwnerWithPet(raw, A);
    await seedOwnerWithPet(raw, B);
    await setHandle(A.petId, 'rexy');
    await setHandle(B.petId, 'belly');
    asA();
    const own = await (await AVAIL(get(`/api/pets/handle-availability?handle=rexy&pet_id=${A.petId}`))).json();
    expect(own).toEqual({ available: true });
    // Passing the OTHER owner's pet id must not unlock their handle.
    const other = await (await AVAIL(get(`/api/pets/handle-availability?handle=belly&pet_id=${B.petId}`))).json();
    expect(other.available).toBe(false);
  });

  it('reserved and malformed handles are reported without a DB hit', async () => {
    await seedOwnerWithPet(raw, A);
    asA();
    expect(await (await AVAIL(get('/api/pets/handle-availability?handle=admin'))).json()).toEqual({
      available: false,
      valid: false,
      reason: 'reserved',
    });
    expect((await (await AVAIL(get('/api/pets/handle-availability?handle=no%20way'))).json()).reason).toBe(
      'invalid_chars',
    );
  });
});

describe('suggestions', () => {
  it('first suggestion is the plain name; when taken it walks owner initial -> breed -> numbers', async () => {
    await seedOwnerWithPet(raw, A);
    await raw`update user_profiles set full_name = 'Maria Lopez' where id = ${A.profileId}`;
    await seedOwnerWithPet(raw, B);
    await setHandle(B.petId, 'luna');
    asA();
    const body = await (await SUGGEST(get('/api/pets/handle-suggestions?name=Luna&breed=Beagle'))).json();
    expect(body.default).toBe('lunam'); // owner initial from the PROFILE name
    expect(body.suggestions).toEqual(['lunam', 'luna_beagle', 'luna.paws', 'luna2', 'luna3']);
  });

  it('never derives the initial from an e-mail', async () => {
    await seedOwnerWithPet(raw, A); // no full_name; auth email is a@example.com
    asA();
    const body = await (await SUGGEST(get('/api/pets/handle-suggestions?name=Luna'))).json();
    expect(body.suggestions[0]).toBe('luna');
    expect(body.suggestions).not.toContain('luna_a');
    expect(body.suggestions[1]).toBe('luna.paws');
  });

  it('requires a name and a signed-in user', async () => {
    await seedOwnerWithPet(raw, A);
    asA();
    expect((await SUGGEST(get('/api/pets/handle-suggestions'))).status).toBe(400);
    authState.session = null;
    expect((await SUGGEST(get('/api/pets/handle-suggestions?name=x'))).status).toBe(401);
  });
});

describe('POST /api/pets', () => {
  beforeEach(bumpPetSequence);
  it('stores the NORMALIZED handle (lowercase, no @)', async () => {
    await seedOwnerWithPet(raw, A);
    asA();
    const res = await POST(json('POST', { name: 'Coco', handle: '  @CoCo.Dog ' }));
    expect(res.status).toBe(201);
    expect((await res.json()).pet.handle).toBe('coco.dog');
  });

  it('invalid / reserved handle -> 400 handle_invalid with a reason', async () => {
    await seedOwnerWithPet(raw, A);
    asA();
    const bad = await POST(json('POST', { name: 'Coco', handle: 'no spaces' }));
    expect(bad.status).toBe(400);
    expect(await bad.json()).toMatchObject({ code: 'handle_invalid', reason: 'invalid_chars' });
    const reserved = await POST(json('POST', { name: 'Coco', handle: 'Admin' }));
    expect((await reserved.json()).reason).toBe('reserved');
  });

  it('taken (even by different case) -> friendly 409 with free alternatives', async () => {
    await seedOwnerWithPet(raw, A);
    await seedOwnerWithPet(raw, B);
    await setHandle(B.petId, 'Coco');
    asA();
    const res = await POST(json('POST', { name: 'Coco', handle: 'coco' }));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe('handle_taken');
    expect(body.alternatives.length).toBeGreaterThan(0);
    expect(body.error).not.toMatch(/duplicate|constraint|23505/i);
  });

  it('RACE: the check said free but the INSERT hits the unique constraint -> 409, not 500', async () => {
    await seedOwnerWithPet(raw, A);
    await seedOwnerWithPet(raw, B);
    await setHandle(B.petId, 'coco');
    asA();
    raceState.forceFree = true; // pretend we checked a moment before B saved
    const res = await POST(json('POST', { name: 'Coco', handle: 'coco' }));
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('handle_taken');
    // The request transaction survived (no pet created, nothing aborted).
    const mine = await raw`select count(*)::int as n from pets where owner_user_id = ${A.profileId}`;
    expect(mine[0].n).toBe(1);
  });

  it('no handle supplied -> first FREE candidate from the name', async () => {
    await seedOwnerWithPet(raw, A);
    await seedOwnerWithPet(raw, B);
    await setHandle(B.petId, 'coco');
    asA();
    const res = await POST(json('POST', { name: 'Coco' }));
    expect(res.status).toBe(201);
    expect((await res.json()).pet.handle).toBe('coco.paws');
  });
});

describe('PATCH /api/pets/[id]', () => {
  it('keeping the same handle (any case) is fine; a taken one is a 409 with alternatives', async () => {
    await seedOwnerWithPet(raw, A);
    await seedOwnerWithPet(raw, B);
    await setHandle(A.petId, 'rexy');
    await setHandle(B.petId, 'belly');
    asA();
    const same = await PATCH(json('PATCH', { handle: '@REXY', name: 'Rex' }), { params: { id: String(A.petId) } });
    expect(same.status).toBe(200);
    const clash = await PATCH(json('PATCH', { handle: 'Belly' }), { params: { id: String(A.petId) } });
    expect(clash.status).toBe(409);
    expect((await clash.json()).alternatives.length).toBeGreaterThan(0);
    const [row] = await raw`select handle from pets where id = ${A.petId}`;
    expect(row.handle).toBe('rexy');
  });

  it('blank handle means no change', async () => {
    await seedOwnerWithPet(raw, A);
    await setHandle(A.petId, 'rexy');
    asA();
    const res = await PATCH(json('PATCH', { handle: '', name: 'Rexxy' }), { params: { id: String(A.petId) } });
    expect(res.status).toBe(200);
    const [row] = await raw`select handle, name from pets where id = ${A.petId}`;
    expect(row).toMatchObject({ handle: 'rexy', name: 'Rexxy' });
  });
});
