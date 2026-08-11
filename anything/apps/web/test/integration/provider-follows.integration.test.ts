// Follow a business (ticket 2.92) — provider_follows (0083). Two layers, both against the embedded
// DB as pawpi_app (FORCE RLS like production):
//   1. URL-level via the REAL Hono router (api.request) — proves route matching (no static-vs-[param]
//      shadowing on /providers/following) and the follow/unfollow/is-following/count/list flow.
//   2. Direct pawpi_app SQL (asApp) — proves the provider_follows RLS: a user writes/deletes ONLY
//      their own follow rows; a cross-user write inserts zero.

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { inject } from 'vitest';
import postgres from 'postgres';
import type { Sql } from 'postgres';
import { makeTestSql, resetDb, seedUser, seedProvider } from './db';

const authState = vi.hoisted(() => ({ session: null as any }));
vi.mock('@/auth', () => ({ auth: async () => authState.session }));

const A = { authUserId: 1, profileId: 1, username: 'ownera' };
const B = { authUserId: 2, profileId: 2, username: 'ownerb' };
const PROV = 100;
const PROV2 = 200;

let raw: Sql;
let app: Sql;
let api: any;

const sessionFor = (authUserId: number) => ({ user: { id: authUserId } });

function apiReq(path: string, method = 'GET', body?: unknown) {
  return api.request(path, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
}

/** Run `fn` as pawpi_app inside one transaction stamped with `userId` (or no id). */
function asApp<T>(userId: number | null, fn: (tx: Sql) => Promise<T>): Promise<T> {
  return app.begin(async (tx) => {
    await tx`select set_config('app.current_user_id', ${userId === null ? '' : String(userId)}, true)`;
    return fn(tx as unknown as Sql);
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
  url.username = 'pawpi_app';
  url.password = 'pawpi_app';
  process.env.DATABASE_URL = url.toString();
  process.env.DATABASE_SSL = 'disable';
  ({ api } = (await import('../../__create/route-builder')) as any);
});

afterAll(async () => {
  await app.end();
  await raw.end();
});

afterEach(async () => {
  await resetDb(raw);
  authState.session = null;
});

beforeEach(async () => {
  await seedUser(raw, A);
  await seedUser(raw, B);
  await seedProvider(raw, { providerId: PROV, ownerUserProfileId: A.profileId, slug: 'prov-a', status: 'published' });
  await seedProvider(raw, { providerId: PROV2, ownerUserProfileId: B.profileId, slug: 'prov-b', status: 'published' });
});

describe('2.92 follow-a-business — URL-level flow (real router)', () => {
  it('follow → is-following true + count increments; unfollow → false + decrements', async () => {
    authState.session = sessionFor(A.authUserId);

    // Initially not following, 0 followers.
    let res = await apiReq(`/providers/${PROV}/follow`);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ following: false, followersCount: 0 });

    // Follow.
    res = await apiReq(`/providers/${PROV}/follow`, 'POST');
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ following: true, followersCount: 1 });

    // is-following now true.
    res = await apiReq(`/providers/${PROV}/follow`);
    expect(await res.json()).toMatchObject({ following: true, followersCount: 1 });

    // Idempotent: following again stays at 1.
    res = await apiReq(`/providers/${PROV}/follow`, 'POST');
    expect(await res.json()).toMatchObject({ following: true, followersCount: 1 });

    // Unfollow.
    res = await apiReq(`/providers/${PROV}/follow`, 'DELETE');
    expect(await res.json()).toMatchObject({ following: false, followersCount: 0 });
  });

  it('a guest (no session) cannot follow (401)', async () => {
    authState.session = null;
    const res = await apiReq(`/providers/${PROV}/follow`, 'POST');
    expect(res.status).toBe(401);
  });

  it('a non-integer provider id 404s before hitting SQL', async () => {
    authState.session = sessionFor(A.authUserId);
    const res = await apiReq(`/providers/not-a-number/follow`, 'POST');
    expect(res.status).toBe(404);
  });

  it('follower count reflects multiple distinct followers', async () => {
    authState.session = sessionFor(A.authUserId);
    await apiReq(`/providers/${PROV}/follow`, 'POST');
    authState.session = sessionFor(B.authUserId);
    const res = await apiReq(`/providers/${PROV}/follow`, 'POST');
    expect(await res.json()).toMatchObject({ following: true, followersCount: 2 });
  });

  it('GET /providers/following returns the businesses I follow (static route, not shadowed by [id])', async () => {
    authState.session = sessionFor(A.authUserId);
    await apiReq(`/providers/${PROV}/follow`, 'POST');
    await apiReq(`/providers/${PROV2}/follow`, 'POST');

    const res = await apiReq(`/providers/following`);
    expect(res.status).toBe(200);
    const data = await res.json();
    // Hit the following handler (shape { providers: [...] }), NOT the [id] provider-detail handler.
    expect(Array.isArray(data.providers)).toBe(true);
    expect(data.providers.map((p: any) => p.id).sort()).toEqual([PROV, PROV2]);
    // Only public provider fields are projected — never provider-private data.
    const one = data.providers[0];
    expect(one).toHaveProperty('name');
    expect(one).toHaveProperty('slug');
    expect(one).not.toHaveProperty('owner_user_profile_id');
    expect(one).not.toHaveProperty('stripe_account_id');

    // B follows nobody → empty list (scoped to the caller's own edges).
    authState.session = sessionFor(B.authUserId);
    const resB = await apiReq(`/providers/following`);
    expect((await resB.json()).providers).toEqual([]);
  });
});

describe('2.92 follow-a-business — provider_follows RLS (as pawpi_app)', () => {
  it('a user may INSERT only their OWN follow row; a cross-user insert writes zero', async () => {
    // A (identity=1) tries to insert a row owned by B (follower_user_id=2) → WITH CHECK denies it.
    await expect(
      asApp(A.profileId, (tx) =>
        tx`insert into provider_follows (follower_user_id, provider_id) values (${B.profileId}, ${PROV})`,
      ),
    ).rejects.toThrow();

    // A inserting its OWN row succeeds.
    await asApp(A.profileId, (tx) =>
      tx`insert into provider_follows (follower_user_id, provider_id) values (${A.profileId}, ${PROV})`,
    );
    const [{ count }] = await raw<{ count: number }[]>`
      select count(*)::int as count from provider_follows where follower_user_id = ${A.profileId}
    `;
    expect(count).toBe(1);
  });

  it("a user cannot DELETE another user's follow row", async () => {
    await raw`insert into provider_follows (follower_user_id, provider_id) values (${B.profileId}, ${PROV})`;
    // A (identity=1) tries to delete B's row → USING scopes to zero rows (no error, no effect).
    await asApp(A.profileId, (tx) =>
      tx`delete from provider_follows where follower_user_id = ${B.profileId} and provider_id = ${PROV}`,
    );
    const [{ count }] = await raw<{ count: number }[]>`
      select count(*)::int as count from provider_follows where follower_user_id = ${B.profileId}
    `;
    expect(count).toBe(1); // B's row untouched
  });

  it('is ENABLE + FORCE RLS with policies (completeness)', async () => {
    const [{ enabled, forced, policies }] = await raw<
      { enabled: boolean; forced: boolean; policies: number }[]
    >`
      select c.relrowsecurity as enabled, c.relforcerowsecurity as forced,
             (select count(*)::int from pg_policies p
               where p.schemaname='public' and p.tablename='provider_follows') as policies
      from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relname='provider_follows'
    `;
    expect(enabled).toBe(true);
    expect(forced).toBe(true);
    expect(policies).toBeGreaterThan(0);
  });
});
