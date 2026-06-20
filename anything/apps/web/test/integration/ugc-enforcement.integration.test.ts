// UGC Moderation T3 — read-path ENFORCEMENT, proven by running the ACTUAL route handlers
// (wrapped in withRequestContext) against the embedded DB AS pawpi_app + FORCE RLS, exactly
// like production R3. Mirrors the provider-create-rls real-handler pattern: point the app
// singleton at the embedded DB as pawpi_app, mock @/auth to drive the session.
//
// Proves: hidden_at content disappears from lists/detail; a blocked user's content vanishes
// from the other's views (both directions); a blocked pair can't interact (bark / DM → 403).

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { inject } from 'vitest';
import postgres from 'postgres';
import type { Sql } from 'postgres';
import { makeTestSql, resetDb, seedOwnerWithPet, seedPost, seedBark, seedForumThread } from './db';

const authState = vi.hoisted(() => ({ session: null as any }));
vi.mock('@/auth', () => ({ auth: async () => authState.session }));

const A = { authUserId: 1, profileId: 1, username: 'ownera', petId: 1, petName: 'Rex' };
const B = { authUserId: 2, profileId: 2, username: 'ownerb', petId: 2, petName: 'Bella' };

let raw: Sql;
let app: Sql;
let appSql: any;
let feedGET: (req: Request) => Promise<Response>;
let barksGET: (req: Request, ctx: any) => Promise<Response>;
let barksPOST: (req: Request, ctx: any) => Promise<Response>;
let threadGET: (req: Request, ctx: any) => Promise<Response>;
let dmPOST: (req: Request, ctx: any) => Promise<Response>;

const sessionFor = (authUserId: number) => ({ user: { id: authUserId } });
const jsonReq = (url: string, method = 'GET', body?: unknown) =>
  new Request(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

beforeAll(async () => {
  raw = makeTestSql();
  const url = new URL(inject('TEST_DATABASE_URL'));
  app = postgres({
    host: url.hostname, port: Number(url.port), database: url.pathname.replace(/^\//, ''),
    username: 'pawpi_app', password: 'pawpi_app', max: 1, onnotice: () => {},
  });
  url.username = 'pawpi_app';
  url.password = 'pawpi_app';
  process.env.DATABASE_URL = url.toString();
  process.env.DATABASE_SSL = 'disable';

  appSql = (await import('@/app/api/utils/sql')).default;
  feedGET = (await import('@/app/api/posts/route')).GET as any;
  const barks = await import('@/app/api/posts/[id]/barks/route');
  barksGET = barks.GET as any;
  barksPOST = barks.POST as any;
  threadGET = (await import('@/app/api/forum/threads/[id]/route')).GET as any;
  dmPOST = (await import('@/app/api/dm-threads/[id]/messages/route')).POST as any;
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

beforeEach(async () => {
  await seedOwnerWithPet(raw, A);
  await seedOwnerWithPet(raw, B);
});

async function block(blocker: number, blocked: number) {
  await raw`insert into user_blocks (blocker_user_id, blocked_user_id) values (${blocker}, ${blocked})`;
}

describe('T3 feed — hidden + block filtering (real handler as pawpi_app)', () => {
  beforeEach(async () => {
    await seedPost(raw, { postId: 10, userId: A.profileId, petId: A.petId, caption: 'by-A' });
    await seedPost(raw, { postId: 20, userId: B.profileId, petId: B.petId, caption: 'by-B' });
  });

  it('a hidden post is dropped from the feed', async () => {
    await raw`update posts set hidden_at = now() where id = 20`;
    authState.session = sessionFor(A.authUserId);
    const { posts } = await (await feedGET(jsonReq('http://localhost/api/posts'))).json();
    expect(posts.map((p: any) => p.id).sort()).toEqual([10]);
  });

  it('after A blocks B, B vanishes from A\'s feed AND A vanishes from B\'s feed', async () => {
    await block(A.profileId, B.profileId);

    authState.session = sessionFor(A.authUserId);
    const a = await (await feedGET(jsonReq('http://localhost/api/posts'))).json();
    expect(a.posts.map((p: any) => p.id)).toEqual([10]); // no B

    authState.session = sessionFor(B.authUserId);
    const b = await (await feedGET(jsonReq('http://localhost/api/posts'))).json();
    expect(b.posts.map((p: any) => p.id)).toEqual([20]); // no A (block is symmetric)
  });
});

describe('T3 barks — hidden GET filter + blocked-pair 403 (real handler)', () => {
  beforeEach(async () => {
    await seedPost(raw, { postId: 10, userId: A.profileId, petId: A.petId });
  });

  it('a hidden bark is dropped from the list', async () => {
    await seedBark(raw, { barkId: 1, postId: 10, userId: B.profileId, petId: B.petId });
    await raw`update post_barks set hidden_at = now() where id = 1`;
    authState.session = sessionFor(A.authUserId);
    const { barks } = await (await barksGET(jsonReq('http://localhost/api/posts/10/barks'), { params: { id: '10' } })).json();
    expect(barks).toHaveLength(0);
  });

  it('B cannot bark on A\'s post once A has blocked B → 403', async () => {
    await block(A.profileId, B.profileId);
    authState.session = sessionFor(B.authUserId);
    const res = await barksPOST(
      jsonReq('http://localhost/api/posts/10/barks', 'POST', { text: 'hi', petId: B.petId }),
      { params: { id: '10' } },
    );
    expect(res.status).toBe(403);
  });
});

describe('T3 forum — hidden/blocked thread 404s on detail (real handler)', () => {
  it('a thread from a blocked author 404s', async () => {
    await seedForumThread(raw, { threadId: 5, authorUserId: B.profileId });
    await block(A.profileId, B.profileId);
    authState.session = sessionFor(A.authUserId);
    const res = await threadGET(jsonReq('http://localhost/api/forum/threads/5'), { params: { id: '5' } });
    expect(res.status).toBe(404);
  });

  it('a hidden thread 404s', async () => {
    await seedForumThread(raw, { threadId: 6, authorUserId: B.profileId });
    await raw`update forum_threads set hidden_at = now() where id = 6`;
    authState.session = sessionFor(A.authUserId);
    const res = await threadGET(jsonReq('http://localhost/api/forum/threads/6'), { params: { id: '6' } });
    expect(res.status).toBe(404);
  });
});

describe('T3 DM — blocked pair cannot message (real handler)', () => {
  beforeEach(async () => {
    // Normalized pair (a < b). A=1, B=2.
    await raw`insert into dm_threads (id, user_a_id, user_b_id) values (1, ${A.profileId}, ${B.profileId})`;
  });

  it('B cannot send into an existing thread once blocked → 403', async () => {
    await block(A.profileId, B.profileId);
    authState.session = sessionFor(B.authUserId);
    const res = await dmPOST(
      jsonReq('http://localhost/api/dm-threads/1/messages', 'POST', { body: 'hey' }),
      { params: { id: '1' } },
    );
    expect(res.status).toBe(403);
  });

  it('with no block, the message sends → 201', async () => {
    authState.session = sessionFor(B.authUserId);
    const res = await dmPOST(
      jsonReq('http://localhost/api/dm-threads/1/messages', 'POST', { body: 'hey' }),
      { params: { id: '1' } },
    );
    expect(res.status).toBe(201);
  });
});
