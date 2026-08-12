// Business-home glance: GET /api/providers/[id]/posts (the management list any active staff reads)
// now carries per-post paw_count + comment_count so the mobile Business home can show engagement at
// a glance. Exercised at the URL level via the REAL Hono router (api.request), as pawpi_app with
// FORCE RLS like production. Counts are visible-only (a deleted/hidden comment doesn't count) and
// staff-gated (a non-staff user gets 403, a guest 401).

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { inject } from 'vitest';
import postgres from 'postgres';
import type { Sql } from 'postgres';
import { makeTestSql, resetDb, seedProviderWithStaff, seedUser } from './db';

const authState = vi.hoisted(() => ({ session: null as any }));
vi.mock('@/auth', () => ({ auth: async () => authState.session }));

const OWNER = { authUserId: 1, profileId: 1, username: 'ownerbz' };
const USER = { authUserId: 2, profileId: 2, username: 'pawerbz' };
const OUTSIDER = { authUserId: 3, profileId: 3, username: 'outbz' };
const PROV = 200;
const SLUG = 'moment-shop';
const POST_A = 700; // gets 2 paws + 1 visible comment (+1 deleted comment that must NOT count)
const POST_B = 701; // gets 0 paws + 0 comments

let raw: Sql;
let app: Sql;
let api: any;

const sessionFor = (authUserId: number) => ({ user: { id: authUserId } });
const listUrl = `/providers/${PROV}/posts`;

function apiReq(path: string, method = 'GET', body?: unknown) {
  return api.request(path, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
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
  await seedUser(raw, OUTSIDER);
  await seedProviderWithStaff(raw, {
    providerId: PROV,
    ownerUserProfileId: OWNER.profileId,
    staffUserProfileId: OWNER.profileId,
    slug: SLUG,
    staffRole: 'owner',
    providerStatus: 'published',
  });
  await raw`
    insert into provider_posts (id, provider_id, author_user_id, body)
    values (${POST_A}, ${PROV}, ${OWNER.profileId}, 'Moment A'),
           (${POST_B}, ${PROV}, ${OWNER.profileId}, 'Moment B')
  `;
});

describe('provider posts list — paw + comment counts (real router)', () => {
  it('returns per-post paw_count + comment_count, counting visible comments only', async () => {
    // POST_A: two distinct pawers + one visible comment + one deleted comment (must not count).
    await raw`
      insert into provider_post_paws (post_id, user_id)
      values (${POST_A}, ${USER.profileId}), (${POST_A}, ${OUTSIDER.profileId})
    `;
    await raw`
      insert into provider_post_comments (post_id, provider_id, author_user_id, body, deleted_at)
      values (${POST_A}, ${PROV}, ${USER.profileId}, 'nice!', null),
             (${POST_A}, ${PROV}, ${USER.profileId}, 'gone', now())
    `;

    authState.session = sessionFor(OWNER.authUserId);
    const res = await apiReq(listUrl);
    expect(res.status).toBe(200);
    const { posts } = await res.json();
    const byId = Object.fromEntries(posts.map((p: any) => [p.id, p]));

    expect(byId[POST_A]).toMatchObject({ paw_count: 2, comment_count: 1 });
    expect(byId[POST_B]).toMatchObject({ paw_count: 0, comment_count: 0 });
    // The media columns still ride along (0087) for the composer/detail.
    expect(byId[POST_A]).toHaveProperty('media_type');
  });

  it('a non-staff user cannot read the management list (403)', async () => {
    authState.session = sessionFor(OUTSIDER.authUserId);
    const res = await apiReq(listUrl);
    expect(res.status).toBe(403);
  });

  it('a guest (no session) is unauthorized (401)', async () => {
    authState.session = null;
    const res = await apiReq(listUrl);
    expect(res.status).toBe(401);
  });
});
