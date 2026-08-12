// Paws (likes) on business posts (ticket 2.94) — provider_post_paws (0085). Two layers, both against
// the embedded DB as pawpi_app (FORCE RLS like production):
//   1. URL-level via the REAL Hono router (api.request) — proves route matching (no static-vs-[param]
//      shadowing on the new posts/[postId]/paw segment) and the paw / unpaw / is-pawed / count flow,
//      plus the pawsCount stat on the public storefront read.
//   2. Direct pawpi_app SQL (asApp) — proves the provider_post_paws RLS: a user writes/deletes ONLY
//      their own paw rows; a cross-user write inserts zero.

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { inject } from 'vitest';
import postgres from 'postgres';
import type { Sql } from 'postgres';
import { makeTestSql, resetDb, seedProviderWithStaff, seedUser } from './db';

const authState = vi.hoisted(() => ({ session: null as any }));
vi.mock('@/auth', () => ({ auth: async () => authState.session }));

const OWNER = { authUserId: 1, profileId: 1, username: 'ownera' };
const USER = { authUserId: 2, profileId: 2, username: 'pawer' };
const OTHER = { authUserId: 3, profileId: 3, username: 'other' };
const PROV = 100;
const SLUG = 'paw-shop';
const POST = 500;

let raw: Sql;
let app: Sql;
let api: any;

const sessionFor = (authUserId: number) => ({ user: { id: authUserId } });
const pawUrl = `/providers/${PROV}/posts/${POST}/paw`;
const postUrl = `/providers/${PROV}/posts/${POST}`;

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
  await seedUser(raw, OWNER);
  await seedUser(raw, USER);
  await seedUser(raw, OTHER);
  await seedProviderWithStaff(raw, {
    providerId: PROV,
    ownerUserProfileId: OWNER.profileId,
    staffUserProfileId: OWNER.profileId,
    slug: SLUG,
    staffRole: 'owner',
    providerStatus: 'published', // a paw requires a visible (published) post
  });
  await raw`
    insert into provider_posts (id, provider_id, author_user_id, body)
    values (${POST}, ${PROV}, ${OWNER.profileId}, 'Hello from the shop')
  `;
});

describe('2.94 paws — URL-level flow (real router)', () => {
  it('paw → is-pawed true + count +1; unpaw → false + −1', async () => {
    authState.session = sessionFor(USER.authUserId);

    // Not pawed initially (via the single-post GET).
    let res = await apiReq(postUrl);
    expect(res.status).toBe(200);
    expect((await res.json()).post).toMatchObject({ paw_count: 0, is_pawed: false });

    // Paw.
    res = await apiReq(pawUrl, 'POST');
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ paw_count: 1, is_pawed: true });

    // The single-post GET now reflects it for this viewer.
    res = await apiReq(postUrl);
    expect((await res.json()).post).toMatchObject({ paw_count: 1, is_pawed: true });

    // Idempotent: pawing again stays at 1 (never a duplicate).
    res = await apiReq(pawUrl, 'POST');
    expect(await res.json()).toMatchObject({ paw_count: 1, is_pawed: true });

    // Unpaw.
    res = await apiReq(pawUrl, 'DELETE');
    expect(await res.json()).toMatchObject({ paw_count: 0, is_pawed: false });
    res = await apiReq(postUrl);
    expect((await res.json()).post).toMatchObject({ paw_count: 0, is_pawed: false });
  });

  it('count reflects multiple distinct pawers; is_pawed is per-viewer', async () => {
    authState.session = sessionFor(USER.authUserId);
    await apiReq(pawUrl, 'POST');
    authState.session = sessionFor(OTHER.authUserId);
    const res = await apiReq(pawUrl, 'POST');
    expect(await res.json()).toMatchObject({ paw_count: 2, is_pawed: true });

    // OWNER (who never pawed) sees the count but is_pawed false.
    authState.session = sessionFor(OWNER.authUserId);
    const gres = await apiReq(postUrl);
    expect((await gres.json()).post).toMatchObject({ paw_count: 2, is_pawed: false });
  });

  it('a guest (no session) cannot paw (401)', async () => {
    authState.session = null;
    const res = await apiReq(pawUrl, 'POST');
    expect(res.status).toBe(401);
  });

  it('a non-integer id 404s before hitting SQL', async () => {
    authState.session = sessionFor(USER.authUserId);
    const res = await apiReq(`/providers/${PROV}/posts/not-a-number/paw`, 'POST');
    expect(res.status).toBe(404);
  });

  it('pawing a gone/hidden post 404s', async () => {
    await raw`update provider_posts set hidden_at = now() where id = ${POST}`;
    authState.session = sessionFor(USER.authUserId);
    const res = await apiReq(pawUrl, 'POST');
    expect(res.status).toBe(404);
  });

  it('pawsCount on the public storefront read reflects real paws across the provider posts', async () => {
    authState.session = sessionFor(USER.authUserId);
    await apiReq(pawUrl, 'POST');
    authState.session = sessionFor(OTHER.authUserId);
    await apiReq(pawUrl, 'POST');

    const res = await apiReq(`/providers/public/${SLUG}`, 'GET');
    expect(res.status).toBe(200);
    const stats = (await res.json()).stats;
    expect(stats).toMatchObject({ postsCount: 1, pawsCount: 2 });
  });
});

describe('2.94 paws — provider_post_paws RLS (as pawpi_app)', () => {
  it('a user may INSERT only their OWN paw row; a cross-user insert is denied', async () => {
    // USER (identity=2) tries to insert a row owned by OTHER (user_id=3) → WITH CHECK denies it.
    await expect(
      asApp(USER.profileId, (tx) =>
        tx`insert into provider_post_paws (post_id, user_id) values (${POST}, ${OTHER.profileId})`,
      ),
    ).rejects.toThrow();

    // USER inserting its OWN row succeeds.
    await asApp(USER.profileId, (tx) =>
      tx`insert into provider_post_paws (post_id, user_id) values (${POST}, ${USER.profileId})`,
    );
    const [{ count }] = await raw<{ count: number }[]>`
      select count(*)::int as count from provider_post_paws where user_id = ${USER.profileId}
    `;
    expect(count).toBe(1);
  });

  it("a user cannot DELETE another user's paw row", async () => {
    await raw`insert into provider_post_paws (post_id, user_id) values (${POST}, ${OTHER.profileId})`;
    // USER tries to delete OTHER's row → USING scopes to zero rows (no error, no effect).
    await asApp(USER.profileId, (tx) =>
      tx`delete from provider_post_paws where post_id = ${POST} and user_id = ${OTHER.profileId}`,
    );
    const [{ count }] = await raw<{ count: number }[]>`
      select count(*)::int as count from provider_post_paws where user_id = ${OTHER.profileId}
    `;
    expect(count).toBe(1); // OTHER's row untouched
  });

  it('is ENABLE + FORCE RLS with policies (completeness)', async () => {
    const [{ enabled, forced, policies }] = await raw<
      { enabled: boolean; forced: boolean; policies: number }[]
    >`
      select c.relrowsecurity as enabled, c.relforcerowsecurity as forced,
             (select count(*)::int from pg_policies p
               where p.schemaname='public' and p.tablename='provider_post_paws') as policies
      from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relname='provider_post_paws'
    `;
    expect(enabled).toBe(true);
    expect(forced).toBe(true);
    expect(policies).toBeGreaterThan(0);
  });
});
