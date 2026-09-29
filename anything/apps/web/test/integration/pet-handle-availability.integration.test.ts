// GET /api/pets/handle-availability — the live handle-uniqueness check onboarding
// step 2 calls, proven under pawpi_app + FORCE RLS (real Postgres).
//
// The point of this file: pets' SELECT policy is any-signed-in-user
// (pets_authed_read, 0021 — PawPi is social), NOT owner-scoped, so this route
// must see a handle taken by a DIFFERENT owner's pet, not just the caller's
// own. A query that were accidentally owner-scoped would silently report every
// other user's handle as "available" and defeat the whole feature — this is
// the regression that matters here, more than the route's plumbing.
//
// Runs the ACTUAL wrapped GET handler (withRequestContext) against the
// embedded DB, same harness pattern as pets-current-weight.integration.test.ts.

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
let GET: (request: Request) => Promise<Response>;

const A = { authUserId: 1, profileId: 1, username: 'ownera', petId: 1, petName: 'Rex' };
const B = { authUserId: 2, profileId: 2, username: 'ownerb', petId: 2, petName: 'Bella' };

function url(handle: string) {
  return `http://localhost/api/pets/handle-availability?handle=${encodeURIComponent(handle)}`;
}

beforeAll(async () => {
  raw = makeTestSql();

  const dbUrl = new URL(inject('TEST_DATABASE_URL'));
  app = postgres({
    host: dbUrl.hostname,
    port: Number(dbUrl.port),
    database: dbUrl.pathname.replace(/^\//, ''),
    username: 'pawpi_app',
    password: 'pawpi_app',
    max: 1,
    onnotice: () => {},
  });

  dbUrl.username = 'pawpi_app';
  dbUrl.password = 'pawpi_app';
  process.env.DATABASE_URL = dbUrl.toString();
  process.env.DATABASE_SSL = 'disable';

  appSql = (await import('@/app/api/utils/sql')).default;
  const route = await import('@/app/api/pets/handle-availability/route');
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

describe('GET /api/pets/handle-availability', () => {
  it('reports a genuinely free handle as available', async () => {
    await seedOwnerWithPet(raw, A);
    authState.session = { user: { id: A.authUserId, email: 'a@example.com', name: 'A' } };

    const res = await GET(new Request(url('totally_unused_handle')));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ available: true });
  });

  it("reports the caller's OWN handle as taken (self-collision)", async () => {
    await seedOwnerWithPet(raw, A); // A.petName 'Rex' -> handle 'rex' (seedOwnerWithPet convention)
    authState.session = { user: { id: A.authUserId, email: 'a@example.com', name: 'A' } };

    const [pet] = await raw`select handle from pets where id = ${A.petId}`;
    const res = await GET(new Request(url(pet.handle)));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ available: false });
  });

  it("reports a DIFFERENT owner's handle as taken too (pets_authed_read is any-signed-in-user, not owner-scoped)", async () => {
    await seedOwnerWithPet(raw, A);
    await seedOwnerWithPet(raw, B);
    // A is asking, but B's handle is what's being checked.
    authState.session = { user: { id: A.authUserId, email: 'a@example.com', name: 'A' } };

    const [petB] = await raw`select handle from pets where id = ${B.petId}`;
    const res = await GET(new Request(url(petB.handle)));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ available: false });
  });

  it('normalizes case/whitespace/@ before matching a stored lowercase handle', async () => {
    await seedOwnerWithPet(raw, A);
    authState.session = { user: { id: A.authUserId, email: 'a@example.com', name: 'A' } };

    const [pet] = await raw`select handle from pets where id = ${A.petId}`;
    const res = await GET(new Request(url(`  @${pet.handle.toUpperCase()}  `)));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ available: false });
  });

  it('anonymous -> 401, never touches the DB result', async () => {
    authState.session = null;

    const res = await GET(new Request(url('anything')));

    expect(res.status).toBe(401);
  });
});
