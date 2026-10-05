// Request identity plumbing after the round-trip reduction (latency fix for the "API-wide p95 stalls").
//
// withRequestContext now resolves the caller's user_profiles.id AND stamps app.current_user_id in ONE
// statement (was a SELECT then a separate set_config), and resolveUserId / resolveOrCreateUserId reuse that
// result instead of repeating the lookup + stamp. The unit suite pins the statement count with a mocked sql
// (requestContext.identity.test.js); this suite proves the same code is CORRECT against real Postgres, as
// pawpi_app (NOBYPASSRLS, FORCE RLS): the combined statement parses, the pawpi_app role may run it, the GUC
// it stamps is what the owner-scoped policies actually read, and nothing leaks between requests.
//
// Auth ids and profile ids are deliberately DIFFERENT numbers so mixing them up cannot pass by accident.

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { inject } from 'vitest';
import type { Sql } from 'postgres';
import { makeTestSql, resetDb, seedOwnerWithPet } from './db';

// auth() is a shared stub; `als` lets concurrent requests each carry their OWN session (like real requests).
const authState = vi.hoisted(() => ({ session: null as any, als: null as any }));
vi.mock('@/auth', async () => {
  const { AsyncLocalStorage } = await import('node:async_hooks');
  authState.als = new AsyncLocalStorage();
  return { auth: async () => authState.als.getStore() ?? authState.session };
});

let raw: Sql;
let appSql: any;
let withRequestContext: (h: (r: Request, c?: any) => Promise<Response>) => (r: Request) => Promise<Response>;
let resolveUserId: (authUserId: string | number) => Promise<number | null>;
let resolveOrCreateUserId: (session: any) => Promise<number | null>;

const A = { authUserId: 101, profileId: 7001, username: 'ownera', petId: 8001, petName: 'Rex' };
const B = { authUserId: 102, profileId: 7002, username: 'ownerb', petId: 8002, petName: 'Milo' };
const tokenOf = (o: { username: string }) => `ExponentPushToken[${o.username}]`;
const request = () => new Request('http://localhost/api/anything');
const sessionFor = (authUserId: number) => ({ user: { id: String(authUserId), email: `${authUserId}@example.com` } });

/** What a handler can observe about the identity of its own transaction. */
async function observe() {
  const [g] = await appSql`select nullif(current_setting('app.current_user_id', true), '') as who`;
  // device_push_tokens is strictly own-row (FOR ALL, owner = current_app_user_id()); pets has a wider social read.
  const tokens = await appSql`select token from device_push_tokens order by token`;
  return { who: g.who as string | null, tokens: tokens.map((t: { token: string }) => t.token) };
}

beforeAll(async () => {
  raw = makeTestSql();
  const dbUrl = new URL(inject('TEST_DATABASE_URL'));
  dbUrl.username = 'pawpi_app';
  dbUrl.password = 'pawpi_app';
  process.env.DATABASE_URL = dbUrl.toString();
  process.env.DATABASE_SSL = 'disable';

  appSql = (await import('@/app/api/utils/sql')).default;
  withRequestContext = (await import('@/app/api/utils/requestContext')).withRequestContext as any;
  ({ resolveUserId, resolveOrCreateUserId } = await import('@/app/api/utils/currentUser'));
});

afterAll(async () => {
  await appSql.end?.();
  await raw.end();
});

beforeEach(async () => {
  await resetDb(raw);
  await seedOwnerWithPet(raw, A);
  await seedOwnerWithPet(raw, B);
  await raw`
    insert into device_push_tokens (user_id, token, platform)
    values (${A.profileId}, ${tokenOf(A)}, 'ios'), (${B.profileId}, ${tokenOf(B)}, 'ios')
  `;
});

afterEach(async () => {
  await resetDb(raw);
  authState.session = null;
});

describe('combined resolve+stamp statement (real Postgres, pawpi_app, FORCE RLS)', () => {
  it('stamps the caller\'s PROFILE id (not the auth id) and owner-scoped RLS follows it', async () => {
    authState.session = sessionFor(A.authUserId);
    let seen: Awaited<ReturnType<typeof observe>> | undefined;
    const res = await withRequestContext(async () => {
      seen = await observe();
      return Response.json({});
    })(request());
    expect(res.status).toBe(200);
    expect(seen!.who).toBe(String(A.profileId));
    expect(seen!.who).not.toBe(String(A.authUserId));
    expect(seen!.tokens).toEqual([tokenOf(A)]); // B's token is invisible: the policy reads the stamp
  });

  it('resolveUserId and resolveOrCreateUserId inside the request return the same profile id (via the memo)', async () => {
    authState.session = sessionFor(B.authUserId);
    let ids: [number | null, number | null] | undefined;
    await withRequestContext(async () => {
      ids = [await resolveUserId(B.authUserId), await resolveOrCreateUserId(authState.session)];
      return Response.json({});
    })(request());
    expect(ids).toEqual([B.profileId, B.profileId]);
  });

  it('asking about a DIFFERENT auth id inside the request is a real lookup, never the caller\'s memo', async () => {
    authState.session = sessionFor(A.authUserId);
    let other: number | null | undefined;
    await withRequestContext(async () => {
      other = await resolveUserId(B.authUserId);
      return Response.json({});
    })(request());
    expect(other).toBe(B.profileId);
  });

  it('an account with no profile yet gets NO stamp (deny by default), and resolveUserId still answers null', async () => {
    await raw`insert into auth_users (id, name, email) values (103, 'fresh', 'fresh@example.com')`;
    authState.session = sessionFor(103);
    let seen: Awaited<ReturnType<typeof observe>> | undefined;
    let resolved: number | null | undefined;
    await withRequestContext(async () => {
      seen = await observe();
      resolved = await resolveUserId(103);
      return Response.json({});
    })(request());
    expect(seen!.who).toBeNull();
    expect(seen!.tokens).toEqual([]);
    expect(resolved).toBeNull();
  });

  it('lazy create still works inside the request and the new profile is stamped for own-row policies', async () => {
    await raw`insert into auth_users (id, name, email) values (104, 'fresh2', 'fresh2@example.com')`;
    authState.session = sessionFor(104);
    let created: number | null | undefined;
    let who: string | null | undefined;
    await withRequestContext(async () => {
      created = await resolveOrCreateUserId(authState.session);
      who = (await observe()).who;
      return Response.json({});
    })(request());
    const [row] = await raw`select id from user_profiles where auth_user_id = 104`;
    expect(created).toBe(row.id);
    expect(who).toBe(String(row.id));
  });

  it('unauthenticated and ghost sessions stamp nothing', async () => {
    for (const session of [null, { user: { id: '3f2b8c1e-aaaa-bbbb-cccc-000000000000' } }]) {
      authState.session = session;
      let seen: Awaited<ReturnType<typeof observe>> | undefined;
      await withRequestContext(async () => {
        seen = await observe();
        return Response.json({});
      })(request());
      expect(seen!.who).toBeNull();
      expect(seen!.tokens).toEqual([]);
    }
  });

  it('never leaks an identity or a memo to the next request on a reused pooled connection', async () => {
    // Alternate owners and a profile-less caller many times: far more requests than pool connections.
    await raw`insert into auth_users (id, name, email) values (105, 'nobody', 'nobody@example.com')`;
    const plan = [A.authUserId, 105, B.authUserId, 105, A.authUserId, B.authUserId, 105, A.authUserId, 105, B.authUserId, 105, 105];
    for (const authId of plan) {
      authState.session = sessionFor(authId);
      let seen: Awaited<ReturnType<typeof observe>> | undefined;
      let resolved: number | null | undefined;
      await withRequestContext(async () => {
        seen = await observe();
        resolved = await resolveUserId(authId);
        return Response.json({});
      })(request());
      const expected = authId === A.authUserId ? A : authId === B.authUserId ? B : null;
      expect(seen!.who).toBe(expected ? String(expected.profileId) : null);
      expect(seen!.tokens).toEqual(expected ? [tokenOf(expected)] : []);
      expect(resolved).toBe(expected ? expected.profileId : null);
    }
  });

  it('concurrent requests for different owners each see only their own identity', async () => {
    const runAs = (owner: typeof A) =>
      authState.als.run(sessionFor(owner.authUserId), async () => {
        let seen: Awaited<ReturnType<typeof observe>> | undefined;
        await withRequestContext(async () => {
          await new Promise((r) => setTimeout(r, 20)); // keep both transactions in flight together
          seen = await observe();
          return Response.json({});
        })(request());
        return { owner, seen: seen! };
      });
    const results = await Promise.all([runAs(A), runAs(B), runAs(A), runAs(B), runAs(A), runAs(B)]);
    for (const { owner, seen } of results) {
      expect(seen.who).toBe(String(owner.profileId));
      expect(seen.tokens).toEqual([tokenOf(owner)]);
    }
  });

  it('the identity is gone after commit: a plain pool query outside any request sees no stamp', async () => {
    authState.session = sessionFor(A.authUserId);
    await withRequestContext(async () => Response.json({}))(request());
    const [g] = await appSql`select nullif(current_setting('app.current_user_id', true), '') as who`;
    expect(g.who).toBeNull();
  });
});
