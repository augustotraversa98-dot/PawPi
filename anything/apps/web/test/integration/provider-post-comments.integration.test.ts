// Provider-post comments (Phase C) — driven through the REAL Hono router (api from
// __create/route-builder) BY URL, on real Postgres as pawpi_app under FORCE RLS. Never imports a
// handler directly (the reorder bug's lesson): only api.request(...) URLs, so a static-vs-[param]
// shadowing regression would surface here.
//
// Routes exercised:
//   GET    /providers/:id/posts/:postId/comments               (PUBLIC — guest can read)
//   POST   /providers/:id/posts/:postId/comments               (auth required)
//   DELETE /providers/:id/posts/:postId/comments/:commentId    (author soft-delete OR admin hide)
//   GET    /providers/public/:slug                             (comment_count on the post)

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { inject } from 'vitest';
import type { Sql } from 'postgres';
import { makeTestSql, resetDb, seedProviderWithStaff, seedUser } from './db';

const authState = vi.hoisted(() => ({ session: null as any }));
vi.mock('@/auth', () => ({ auth: async () => authState.session }));

let raw: Sql;
let api: { request: (path: string, init?: RequestInit) => Promise<Response> };

const OWNER = { authUserId: 1, profileId: 1 }; // provider owner (also a provider admin)
const USER = { authUserId: 2, profileId: 2 }; // a signed-in commenter (non-staff)
const OTHER = { authUserId: 3, profileId: 3 }; // another signed-in user (neither author nor admin)
const PROV = 100;
const SLUG = 'prov-a';
const POST = 500;

const sessionFor = (authUserId: number) => ({ user: { id: authUserId } });

function apiReq(path: string, method: string, body?: unknown) {
  return api.request(path, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
}

const commentsUrl = `/providers/${PROV}/posts/${POST}/comments`;

beforeAll(async () => {
  raw = makeTestSql();
  const url = new URL(inject('TEST_DATABASE_URL'));
  url.username = 'pawpi_app';
  url.password = 'pawpi_app';
  process.env.DATABASE_URL = url.toString();
  process.env.DATABASE_SSL = 'disable';
  ({ api } = (await import('../../__create/route-builder')) as any);
});

afterAll(async () => {
  await raw.end();
});

afterEach(async () => {
  await resetDb(raw);
  authState.session = null;
});

beforeEach(async () => {
  await seedUser(raw, { authUserId: OWNER.authUserId, profileId: OWNER.profileId, username: 'ownera' });
  await seedUser(raw, { authUserId: USER.authUserId, profileId: USER.profileId, username: 'commenter' });
  await seedUser(raw, { authUserId: OTHER.authUserId, profileId: OTHER.profileId, username: 'other' });
  await seedProviderWithStaff(raw, {
    providerId: PROV,
    ownerUserProfileId: OWNER.profileId,
    staffUserProfileId: OWNER.profileId,
    slug: SLUG,
    staffRole: 'owner',
    providerStatus: 'published', // comments require a visible (published) post
  });
  await raw`
    insert into provider_posts (id, provider_id, author_user_id, body)
    values (${POST}, ${PROV}, ${OWNER.profileId}, 'Hello from the shop')
  `;
});

// Create a comment as USER and return its id.
async function seedComment(text = 'nice post') {
  authState.session = sessionFor(USER.authUserId);
  const res = await apiReq(commentsUrl, 'POST', { body: text });
  expect(res.status).toBe(201);
  const { comment } = await res.json();
  authState.session = null;
  return comment.id as number;
}

describe('GET comments (public)', () => {
  it('a GUEST (no auth) can read comments — the open fix', async () => {
    authState.session = null;
    const res = await apiReq(commentsUrl, 'GET');
    expect(res.status).toBe(200);
    expect((await res.json()).comments).toEqual([]);
  });

  it('returns comments oldest→newest with author name + avatar', async () => {
    await seedComment('first');
    await seedComment('second');
    authState.session = null;
    const res = await apiReq(commentsUrl, 'GET');
    expect(res.status).toBe(200);
    const { comments } = await res.json();
    expect(comments.map((c: any) => c.body)).toEqual(['first', 'second']);
    expect(comments[0]).toMatchObject({
      author_user_id: USER.profileId,
      author_username: 'commenter',
    });
    expect(comments[0]).toHaveProperty('author_name');
    expect(comments[0]).toHaveProperty('author_avatar_url');
  });
});

describe('POST comment', () => {
  it('requires auth → 401 for a guest', async () => {
    authState.session = null;
    const res = await apiReq(commentsUrl, 'POST', { body: 'hi' });
    expect(res.status).toBe(401);
  });

  it('a signed-in user can comment; a guest then sees it', async () => {
    authState.session = sessionFor(USER.authUserId);
    const res = await apiReq(commentsUrl, 'POST', { body: 'great' });
    expect(res.status).toBe(201);
    expect((await res.json()).comment).toMatchObject({ body: 'great', author_user_id: USER.profileId });

    authState.session = null;
    const list = await apiReq(commentsUrl, 'GET');
    expect((await list.json()).comments.map((c: any) => c.body)).toEqual(['great']);
  });

  it('rejects an empty body → 400', async () => {
    authState.session = sessionFor(USER.authUserId);
    const res = await apiReq(commentsUrl, 'POST', { body: '   ' });
    expect(res.status).toBe(400);
  });

  it('404 for a comment on a non-existent post', async () => {
    authState.session = sessionFor(USER.authUserId);
    const res = await apiReq(`/providers/${PROV}/posts/99999/comments`, 'POST', { body: 'x' });
    expect(res.status).toBe(404);
  });
});

describe('DELETE comment (soft take-down)', () => {
  it('the author can delete their own comment → it disappears from the public GET', async () => {
    const id = await seedComment('mine');
    authState.session = sessionFor(USER.authUserId);
    const del = await apiReq(`${commentsUrl}/${id}`, 'DELETE');
    expect(del.status).toBe(200);

    authState.session = null;
    const list = await apiReq(commentsUrl, 'GET');
    expect((await list.json()).comments).toEqual([]);
  });

  it('a provider admin can hide another user\'s comment → it disappears from the public GET', async () => {
    const id = await seedComment('from a customer');
    authState.session = sessionFor(OWNER.authUserId); // owner = provider admin
    const del = await apiReq(`${commentsUrl}/${id}`, 'DELETE');
    expect(del.status).toBe(200);

    authState.session = null;
    const list = await apiReq(commentsUrl, 'GET');
    expect((await list.json()).comments).toEqual([]);
  });

  it('a non-author, non-admin user cannot delete → 403, comment stays', async () => {
    const id = await seedComment('protected');
    authState.session = sessionFor(OTHER.authUserId);
    const del = await apiReq(`${commentsUrl}/${id}`, 'DELETE');
    expect(del.status).toBe(403);

    authState.session = null;
    const list = await apiReq(commentsUrl, 'GET');
    expect((await list.json()).comments.map((c: any) => c.body)).toEqual(['protected']);
  });

  it('a non-integer commentId → 404 (defense-in-depth, no SQL)', async () => {
    authState.session = sessionFor(USER.authUserId);
    const del = await apiReq(`${commentsUrl}/not-a-number`, 'DELETE');
    expect(del.status).toBe(404);
  });
});

describe('comment_count on the public storefront read', () => {
  it('counts visible comments and drops hidden/deleted ones', async () => {
    const id = await seedComment('counted');

    // The public storefront read itself requires a session (any signed-in viewer).
    authState.session = sessionFor(OTHER.authUserId);
    let res = await apiReq(`/providers/public/${SLUG}`, 'GET');
    expect(res.status).toBe(200);
    let post = (await res.json()).posts.find((p: any) => p.id === POST);
    expect(post.comment_count).toBe(1);

    // Author deletes → count returns to 0.
    authState.session = sessionFor(USER.authUserId);
    await apiReq(`${commentsUrl}/${id}`, 'DELETE');
    authState.session = sessionFor(OTHER.authUserId);
    res = await apiReq(`/providers/public/${SLUG}`, 'GET');
    post = (await res.json()).posts.find((p: any) => p.id === POST);
    expect(post.comment_count).toBe(0);
  });
});

describe('social stats on the public storefront read (ticket 2.93)', () => {
  it('returns { postsCount, pawsCount, barksCount } — Barks tracks visible comments; Paws is 0 pre-2.94', async () => {
    const id = await seedComment('barked');

    authState.session = sessionFor(OTHER.authUserId);
    let res = await apiReq(`/providers/public/${SLUG}`, 'GET');
    expect(res.status).toBe(200);
    let stats = (await res.json()).stats;
    // One provider_post seeded; one visible comment; no provider_post_paws table yet → Paws 0
    // (the read degrades cleanly on the missing table rather than 500ing).
    expect(stats).toEqual({ postsCount: 1, pawsCount: 0, barksCount: 1 });

    // Deleting the comment drops Barks back to 0; Posts is unchanged.
    authState.session = sessionFor(USER.authUserId);
    await apiReq(`${commentsUrl}/${id}`, 'DELETE');
    authState.session = sessionFor(OTHER.authUserId);
    res = await apiReq(`/providers/public/${SLUG}`, 'GET');
    stats = (await res.json()).stats;
    expect(stats).toEqual({ postsCount: 1, pawsCount: 0, barksCount: 0 });
  });
});

describe('pet attribution on comments (migration 0084)', () => {
  const PET = 700;

  beforeEach(async () => {
    // USER (the signed-in commenter) owns a pet; the comment is posted AS that pet.
    await raw`
      insert into pets (id, owner_user_id, name, handle)
      values (${PET}, ${USER.profileId}, 'Mango', 'mango')
    `;
  });

  it('a comment posted with the caller\'s petId carries the pet name/@handle/avatar (POST + authed GET)', async () => {
    authState.session = sessionFor(USER.authUserId);
    const res = await apiReq(commentsUrl, 'POST', { body: 'from mango', petId: PET });
    expect(res.status).toBe(201);
    const { comment } = await res.json();
    expect(comment).toMatchObject({ pet_id: PET, pet_name: 'Mango', pet_handle: 'mango' });

    // An AUTHED viewer (the normal reader — the storefront is browsed signed in) sees the pet
    // identity: pets are readable by any signed-in user (pets_authed_read, 0021).
    authState.session = sessionFor(OTHER.authUserId);
    const list = await apiReq(commentsUrl, 'GET');
    const c = (await list.json()).comments.find((x: any) => x.body === 'from mango');
    expect(c).toMatchObject({ pet_name: 'Mango', pet_handle: 'mango' });
  });

  it('a GUEST reading the same comment degrades to the account handle (pets are authed-only under RLS)', async () => {
    authState.session = sessionFor(USER.authUserId);
    await apiReq(commentsUrl, 'POST', { body: 'from mango', petId: PET });

    // No identity → the pets LEFT JOIN yields no row, so pet_* come back NULL and the client falls
    // back to the account handle. The comment still reads fine (never a crash).
    authState.session = null;
    const list = await apiReq(commentsUrl, 'GET');
    const c = (await list.json()).comments.find((x: any) => x.body === 'from mango');
    expect(c.pet_name).toBeNull();
    expect(c.author_username).toBe('commenter');
  });

  it('owner-only: a caller cannot comment AS a pet they do not own → 400', async () => {
    // OTHER is signed in but does NOT own pet 700 (USER does).
    authState.session = sessionFor(OTHER.authUserId);
    const res = await apiReq(commentsUrl, 'POST', { body: 'spoof', petId: PET });
    expect(res.status).toBe(400);
    // Nothing was stored.
    authState.session = null;
    const list = await apiReq(commentsUrl, 'GET');
    expect((await list.json()).comments).toEqual([]);
  });

  it('no petId → stored without a pet; GET falls back to the account handle', async () => {
    authState.session = sessionFor(USER.authUserId);
    const res = await apiReq(commentsUrl, 'POST', { body: 'no pet' });
    expect(res.status).toBe(201);
    expect((await res.json()).comment.pet_id).toBeNull();

    authState.session = null;
    const list = await apiReq(commentsUrl, 'GET');
    const c = (await list.json()).comments.find((x: any) => x.body === 'no pet');
    expect(c.pet_name).toBeNull();
    expect(c.author_username).toBe('commenter'); // USER's account
  });
});
