// Profile-less authenticated accounts on the owner routes the app calls BEFORE any pet exists.
//
// Bug (build 24): user_profiles rows are created lazily (pets POST / providers POST), so a fresh
// Google/Apple account has none while it sits in onboarding. The launch-time telehealth sync
// (GET /api/me/bookings), the push-token registration and the Services tab reads all used the
// read-only resolveUserId and answered 404 "User profile not found" for it.
//
// Fix: those routes use resolveOrCreateUserId(session) — get-or-create for an AUTHENTICATED
// session only. This suite runs the REAL route handlers (wrapped in withRequestContext) against
// the embedded DB AS pawpi_app (NOBYPASSRLS, FORCE RLS), exactly like provider-create-rls.
//
// Proves:
//   1. every touched route answers 2xx for an authenticated user with NO profile (and a profile
//      now exists, owned by that auth user — identity chain auth_users.id → user_profiles.id);
//   2. every touched route still answers 401 when unauthenticated, and NOTHING is created;
//   3. a ghost session (non-integer sub) or a vanished auth user never creates a profile;
//   4. the launch burst (several routes at once, same fresh account) creates exactly ONE profile
//      and none of them 500s on the unique violation;
//   5. an existing profile is reused, never duplicated; push-token write passes own-row RLS.

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { inject } from 'vitest';
import postgres from 'postgres';
import type { Sql } from 'postgres';
import { makeTestSql, resetDb } from './db';

const authState = vi.hoisted(() => ({ session: null as any }));
vi.mock('@/auth', () => ({ auth: async () => authState.session }));

let raw: Sql;
let appSql: any;

type Handler = (request: Request, ctx?: any) => Promise<Response>;
const routes: Record<string, Handler> = {};

const url = (path: string) => `http://localhost${path}`;
const get = (path: string) => new Request(url(path));
const postJson = (path: string, body: unknown, method = 'POST') =>
  new Request(url(path), {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

async function seedAuthUser(email: string, name?: string): Promise<number> {
  const [row] = await raw<{ id: number }[]>`
    insert into auth_users (name, email) values (${name ?? email}, ${email}) returning id
  `;
  return row.id;
}

const profileCount = async () =>
  Number((await raw`select count(*)::int as n from user_profiles`)[0].n);

beforeAll(async () => {
  raw = makeTestSql();

  const dbUrl = new URL(inject('TEST_DATABASE_URL'));
  dbUrl.username = 'pawpi_app';
  dbUrl.password = 'pawpi_app';
  process.env.DATABASE_URL = dbUrl.toString();
  process.env.DATABASE_SSL = 'disable';

  appSql = (await import('@/app/api/utils/sql')).default;
  routes.bookingsGET = (await import('@/app/api/me/bookings/route')).GET as Handler;
  routes.bookingByIdGET = (await import('@/app/api/me/bookings/[id]/route')).GET as Handler;
  routes.unreadGET = (await import('@/app/api/threads/unread-count/route')).GET as Handler;
  routes.ordersGET = (await import('@/app/api/shop/orders/route')).GET as Handler;
  routes.subsGET = (await import('@/app/api/shop/subscriptions/route')).GET as Handler;
  routes.savedGET = (await import('@/app/api/saved-places/route')).GET as Handler;
  routes.pushPOST = (await import('@/app/api/push-tokens/route')).POST as Handler;
  routes.pushDELETE = (await import('@/app/api/push-tokens/route')).DELETE as Handler;
  routes.discoverGET = (await import('@/app/api/services/discover/route')).GET as Handler;
});

afterAll(async () => {
  await appSql.end?.();
  await raw.end();
});

// Migrations can leave rows behind before the first test; start every case clean.
beforeEach(async () => {
  await resetDb(raw);
});

afterEach(async () => {
  await resetDb(raw);
  authState.session = null;
});

// Each entry: how to call the route + what a profile-less caller must get.
const CALLS: { name: string; run: () => Promise<Response>; status: number }[] = [
  {
    name: 'GET /api/me/bookings',
    run: () => routes.bookingsGET(get('/api/me/bookings?today=2026-10-03')),
    status: 200,
  },
  {
    name: 'GET /api/threads/unread-count',
    run: () => routes.unreadGET(get('/api/threads/unread-count?side=owner')),
    status: 200,
  },
  { name: 'GET /api/shop/orders', run: () => routes.ordersGET(get('/api/shop/orders')), status: 200 },
  {
    name: 'GET /api/shop/subscriptions',
    run: () => routes.subsGET(get('/api/shop/subscriptions')),
    status: 200,
  },
  { name: 'GET /api/saved-places', run: () => routes.savedGET(get('/api/saved-places')), status: 200 },
  {
    name: 'POST /api/push-tokens',
    run: () =>
      routes.pushPOST(postJson('/api/push-tokens', { token: 'ExponentPushToken[abc]', platform: 'ios' })),
    status: 201,
  },
  {
    name: 'DELETE /api/push-tokens',
    run: () => routes.pushDELETE(postJson('/api/push-tokens', { token: 'nope' }, 'DELETE')),
    status: 200,
  },
  {
    name: 'GET /api/services/discover',
    run: () => routes.discoverGET(get('/api/services/discover')),
    status: 200,
  },
];

// Routes that go through the get-or-create helper (DELETE and discover never create).
const CREATES = new Set([
  'GET /api/me/bookings',
  'GET /api/threads/unread-count',
  'GET /api/shop/orders',
  'GET /api/shop/subscriptions',
  'GET /api/saved-places',
  'POST /api/push-tokens',
]);

describe('profile-less authenticated owner (fresh Google/Apple account in onboarding)', () => {
  for (const call of CALLS) {
    it(`${call.name} → ${call.status}, not 404 "User profile not found"`, async () => {
      const authId = await seedAuthUser('fresh@example.com', 'Fresh Owner');
      authState.session = { user: { id: authId, email: 'fresh@example.com', name: 'Fresh Owner' } };
      expect(await profileCount()).toBe(0);

      const res = await call.run();
      expect(res.status).toBe(call.status);

      if (CREATES.has(call.name)) {
        // Identity chain: the lazily-created profile belongs to THIS auth user.
        const rows = await raw`select id, auth_user_id, role from user_profiles`;
        expect(rows).toHaveLength(1);
        expect(rows[0].auth_user_id).toBe(authId);
      } else {
        expect(await profileCount()).toBe(0); // delete/discover must never create one
      }
    });
  }

  it('GET /api/me/bookings returns the empty { upcoming: [], past: [] } shape', async () => {
    const authId = await seedAuthUser('fresh@example.com', 'Fresh Owner');
    authState.session = { user: { id: authId, email: 'fresh@example.com', name: 'Fresh Owner' } };
    const res = await routes.bookingsGET(get('/api/me/bookings?today=2026-10-03'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ upcoming: [], past: [] });
  });

  it('GET /api/threads/unread-count → { unread_count: 0 }', async () => {
    const authId = await seedAuthUser('fresh@example.com');
    authState.session = { user: { id: authId, email: 'fresh@example.com' } };
    const res = await routes.unreadGET(get('/api/threads/unread-count?side=owner'));
    expect(await res.json()).toEqual({ unread_count: 0 });
  });

  it('GET /api/me/bookings/[id] → 404 "Booking not found" (not "User profile not found")', async () => {
    const authId = await seedAuthUser('fresh@example.com');
    authState.session = { user: { id: authId, email: 'fresh@example.com' } };
    const res = await routes.bookingByIdGET(get('/api/me/bookings/999'), { params: { id: '999' } });
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('Booking not found');
  });

  it('POST /api/push-tokens stores the token under own-row RLS for the new profile', async () => {
    const authId = await seedAuthUser('fresh@example.com');
    authState.session = { user: { id: authId, email: 'fresh@example.com' } };
    const res = await routes.pushPOST(
      postJson('/api/push-tokens', { token: 'ExponentPushToken[abc]', platform: 'ios' }),
    );
    expect(res.status).toBe(201);
    const [prof] = await raw`select id from user_profiles where auth_user_id = ${authId}`;
    const tokens = await raw`select user_id, token from device_push_tokens`;
    expect(tokens).toEqual([{ user_id: prof.id, token: 'ExponentPushToken[abc]' }]);
  });

  it('the launch burst (all routes at once, same fresh account) creates exactly ONE profile and never 500s', async () => {
    const authId = await seedAuthUser('burst@example.com', 'Burst Owner');
    authState.session = { user: { id: authId, email: 'burst@example.com', name: 'Burst Owner' } };

    const results = await Promise.all(
      CALLS.filter((c) => CREATES.has(c.name)).map(async (c) => ({
        name: c.name,
        want: c.status,
        got: (await c.run()).status,
      })),
    );
    for (const r of results) expect({ [r.name]: r.got }).toEqual({ [r.name]: r.want });
    expect(await profileCount()).toBe(1);
  });

  it('reuses an existing profile — never duplicates', async () => {
    const authId = await seedAuthUser('old@example.com', 'Old Owner');
    const [existing] = await raw`
      insert into user_profiles (auth_user_id, username, onboarding_completed)
      values (${authId}, 'oldtimer', true) returning id
    `;
    authState.session = { user: { id: authId, email: 'old@example.com', name: 'Old Owner' } };
    for (const c of CALLS.filter((c) => CREATES.has(c.name))) {
      expect((await c.run()).status).toBe(c.status);
    }
    const rows = await raw`select id from user_profiles`;
    expect(rows).toEqual([{ id: existing.id }]);
  });

  it('a taken username never blocks creation (suffix is picked)', async () => {
    const other = await seedAuthUser('squatter@example.com');
    await raw`insert into user_profiles (auth_user_id, username) values (${other}, 'dup')`;
    const authId = await seedAuthUser('dup@example.com', 'Dup');
    authState.session = { user: { id: authId, email: 'dup@example.com', name: 'Dup' } };
    const res = await routes.bookingsGET(get('/api/me/bookings'));
    expect(res.status).toBe(200);
    const rows = await raw`select username from user_profiles where auth_user_id = ${authId}`;
    expect(rows).toHaveLength(1);
    expect(rows[0].username).not.toBe('dup');
  });
});

describe('unauthenticated / invalid sessions never create a profile', () => {
  for (const call of CALLS.filter((c) => c.name !== 'GET /api/services/discover')) {
    it(`${call.name} → 401 with no session, nothing created`, async () => {
      authState.session = null;
      const res = await call.run();
      expect(res.status).toBe(401);
      expect(await profileCount()).toBe(0);
    });
  }

  it('GET /api/services/discover → 401 with no session', async () => {
    authState.session = null;
    expect((await routes.discoverGET(get('/api/services/discover'))).status).toBe(401);
  });

  it('a ghost session (non-integer sub) creates nothing and is not a 500', async () => {
    authState.session = {
      user: { id: '3f2b8c1e-aaaa-bbbb-cccc-1234567890ab', email: 'ghost@example.com', name: 'Ghost' },
    };
    const res = await routes.bookingsGET(get('/api/me/bookings'));
    expect(res.status).not.toBe(500);
    expect(await profileCount()).toBe(0);
  });

  it('a valid-looking id with no auth_users row (deleted account) creates nothing', async () => {
    authState.session = { user: { id: 987654, email: 'gone@example.com', name: 'Gone' } };
    const res = await routes.bookingsGET(get('/api/me/bookings'));
    expect(res.status).toBe(404);
    expect(await profileCount()).toBe(0);
  });
});
