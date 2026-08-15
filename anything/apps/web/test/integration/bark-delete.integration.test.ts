// Delete-your-own-comment (night-run A3 — Apple-1.2 UGC control) — DELETE
// /api/posts/[id]/barks/[barkId] run as the REAL handler against the embedded DB AS pawpi_app
// (FORCE RLS like production). Proves: the author can delete their own bark; a NON-author gets
// 404 and the bark survives (no cross-user delete, IDOR-safe); a wrong post id 404s.

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { inject } from 'vitest';
import postgres from 'postgres';
import type { Sql } from 'postgres';
import { makeTestSql, resetDb, seedOwnerWithPet, seedPost, seedBark } from './db';

const authState = vi.hoisted(() => ({ session: null as any }));
vi.mock('@/auth', () => ({ auth: async () => authState.session }));

const AUTHOR = { authUserId: 1, profileId: 1, username: 'author', petId: 10, petName: 'A' };
const OTHER = { authUserId: 2, profileId: 2, username: 'other', petId: 20, petName: 'B' };
const POST_ID = 100;
const BARK_ID = 500;

let raw: Sql;
let app: Sql;
let appSql: any;
let DELETE: (r: Request, ctx: any) => Promise<Response>;

const delReq = (postId: number, barkId: number) =>
  new Request(`http://localhost/api/posts/${postId}/barks/${barkId}`, { method: 'DELETE' });
const ctx = (postId: number, barkId: number) => ({ params: { id: String(postId), barkId: String(barkId) } });

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
  DELETE = (await import('@/app/api/posts/[id]/barks/[barkId]/route')).DELETE as any;
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
  await seedOwnerWithPet(raw, AUTHOR);
  await seedOwnerWithPet(raw, OTHER);
  // AUTHOR owns the post and the bark.
  await seedPost(raw, { postId: POST_ID, userId: AUTHOR.profileId, petId: AUTHOR.petId, caption: 'hi' });
  await seedBark(raw, { barkId: BARK_ID, postId: POST_ID, userId: AUTHOR.profileId, petId: AUTHOR.petId, text: 'mine' });
});

async function barkExists(): Promise<boolean> {
  const rows = await raw`select 1 from post_barks where id = ${BARK_ID}`;
  return rows.length > 0;
}

describe('DELETE /api/posts/[id]/barks/[barkId] (A3 delete-own comment)', () => {
  it('lets the author delete their own comment', async () => {
    authState.session = { user: { id: String(AUTHOR.authUserId) } };
    const res = await DELETE(delReq(POST_ID, BARK_ID), ctx(POST_ID, BARK_ID));
    expect(res.status).toBe(200);
    expect(await barkExists()).toBe(false);
  });

  it('does NOT let a non-author delete it (404, bark survives — IDOR-safe)', async () => {
    authState.session = { user: { id: String(OTHER.authUserId) } };
    const res = await DELETE(delReq(POST_ID, BARK_ID), ctx(POST_ID, BARK_ID));
    expect(res.status).toBe(404);
    expect(await barkExists()).toBe(true);
  });

  it('404s when the bark id does not belong to the given post', async () => {
    authState.session = { user: { id: String(AUTHOR.authUserId) } };
    const res = await DELETE(delReq(POST_ID + 1, BARK_ID), ctx(POST_ID + 1, BARK_ID));
    expect(res.status).toBe(404);
    expect(await barkExists()).toBe(true);
  });

  it('401 without a session', async () => {
    authState.session = null;
    const res = await DELETE(delReq(POST_ID, BARK_ID), ctx(POST_ID, BARK_ID));
    expect(res.status).toBe(401);
    expect(await barkExists()).toBe(true);
  });
});
