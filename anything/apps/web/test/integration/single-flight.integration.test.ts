// REQUEST_SINGLE_FLIGHT (perf: one database round trip per hot request) - proven on REAL Postgres as pawpi_app
// (FORCE RLS), through a latency proxy so network flights are real (test/integration/delayProxy.ts).
//
//   1. Round-trip budgets, measured on the wire: with the flag ON the hot GETs answer in ONE flight (BEGIN, the
//      identity stamp and the reads share it; COMMIT is off the critical path), and a request that never touches
//      the database (a 401) costs ZERO. With the flag OFF the same routes cost many - which is the production bug.
//   2. Anti-leak, flag ON and OFF: user A's request never sees B's rows, the stamp never reaches the next request on
//      a reused connection (including after a deferred COMMIT), concurrent callers each see only their own rows.
//   3. Transaction semantics are identical to sql.begin: a write is durable before the response, a throw rolls back,
//      an uncaught statement error is a 500 even when the handler caught it, and withSavepoint contains it.
//
// The pool is created with REQUEST_SINGLE_FLIGHT=on (prepared statements on) for the whole file; the request path is
// switched per describe block, because the flag is read per request.

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi, inject } from 'vitest';
import type { Sql } from 'postgres';
import { makeTestSql, resetDb, seedOwnerWithPet } from './db';
import { startDelayProxy, type DelayProxy } from './delayProxy';

const authState = vi.hoisted(() => ({ als: null as any, session: null as any }));
vi.mock('@/auth', async () => {
  const { AsyncLocalStorage } = await import('node:async_hooks');
  authState.als = new AsyncLocalStorage();
  return { auth: async () => authState.als.getStore() ?? authState.session };
});

const A = { authUserId: 201, profileId: 9001, username: 'sfa', petId: 9501, petName: 'Rex' };
const B = { authUserId: 202, profileId: 9002, username: 'sfb', petId: 9502, petName: 'Milo' };

const DELAY_MS = 60; // one flight = 2 x 60 ms; large enough that 1 vs 2 flights is far outside timer noise
const OVERHEAD_MS = 40; // allowance for the app's own CPU work in a request (routing, JSON, JIT) on a busy CI box

let raw: Sql;
let api: any;
let appSql: any;
let pool: any;
let proxy: DelayProxy;
let withRequestContext: (h: (r: Request) => Promise<Response>, o?: { deferCommit?: boolean }) => (r: Request) => Promise<Response>;
let withSavepoint: (fn: () => Promise<any>) => Promise<any>;
let clearCachedProfileIds: () => void;

const sessionFor = (authUserId: number) => ({ user: { id: String(authUserId), email: `${authUserId}@example.com` } });
const as = <T>(authUserId: number | null, fn: () => Promise<T>) =>
  authState.als.run(authUserId == null ? null : sessionFor(authUserId), fn);
const get = (authUserId: number | null, path: string) => as(authUserId, () => api.request(path));
const request = () => new Request('http://localhost/api/anything');
const setFlag = (on: boolean) => {
  process.env.REQUEST_SINGLE_FLIGHT = on ? 'on' : 'off';
};
const settle = () => new Promise((r) => setTimeout(r, DELAY_MS * 3)); // let a deferred COMMIT finish its flight

beforeAll(async () => {
  raw = makeTestSql();
  const direct = new URL(inject('TEST_DATABASE_URL'));
  proxy = await startDelayProxy(Number(direct.port), DELAY_MS);

  const url = new URL(inject('TEST_DATABASE_URL'));
  url.username = 'pawpi_app';
  url.password = 'pawpi_app';
  url.hostname = '127.0.0.1';
  url.port = String(proxy.port);
  process.env.DATABASE_URL = url.toString();
  process.env.DATABASE_SSL = 'disable';
  process.env.IDENTITY_CACHE_TTL_MS = '300000';
  process.env.REQUEST_SINGLE_FLIGHT = 'on'; // pool creation reads it (prepared statements)

  ({ api } = (await import('../../__create/route-builder')) as any);
  const sqlModule = await import('@/app/api/utils/sql');
  pool = (sqlModule as any).pool;
  appSql = (sqlModule as any).default;
  ({ withRequestContext, withSavepoint } = (await import('@/app/api/utils/requestContext')) as any);
  ({ clearCachedProfileIds } = (await import('@/app/api/utils/requestIdentity')) as any);
});

afterAll(async () => {
  delete process.env.IDENTITY_CACHE_TTL_MS;
  delete process.env.REQUEST_SINGLE_FLIGHT;
  await appSql.end?.();
  await proxy.close();
  await resetDb(raw);
  await raw.end();
});

beforeEach(async () => {
  setFlag(true);
  await resetDb(raw);
  clearCachedProfileIds();
  await seedOwnerWithPet(raw, A);
  await seedOwnerWithPet(raw, B);
  await raw`update user_profiles set timezone = 'UTC' where id in (${A.profileId}, ${B.profileId})`;
  await raw`
    insert into device_push_tokens (user_id, token, platform)
    values (${A.profileId}, 'tok-a', 'ios'), (${B.profileId}, 'tok-b', 'ios')
  `;
});

afterEach(() => {
  authState.session = null;
});

/** What a handler can observe about the identity of its own transaction. */
async function observe() {
  const [g] = await appSql`select nullif(current_setting('app.current_user_id', true), '') as who`;
  const rows = await appSql`select token from device_push_tokens order by token`;
  return { who: g.who as string | null, tokens: rows.map((r: { token: string }) => r.token) };
}

const HOT_ROUTES = ['/pets', '/posts/owner-posted-today', '/threads/unread-count', '/discover', '/posts'] as const;

async function timed<T>(fn: () => Promise<T>) {
  const t = performance.now();
  const value = await fn();
  return { value, ms: performance.now() - t };
}

describe('round trips on the wire (latency proxy)', () => {
  /** One lone `select 1` on the pool = one flight, in ms, for this machine right now. */
  async function flightMs() {
    await pool`select 1`;
    const runs: number[] = [];
    for (let i = 0; i < 5; i++) runs.push((await timed(() => pool`select 1`)).ms);
    return runs.sort((a, b) => a - b)[2];
  }

  /**
   * Warm ONE route sequentially, letting each deferred COMMIT finish, so every request reuses the same connection
   * and its statements are prepared there. (A deferred COMMIT keeps its connection busy for one flight, so a
   * back-to-back burst fans out over several connections and prepares each statement on only some of them. In
   * production that is a one-time cost per connection and statement; here it would make the budgets flaky.)
   */
  async function warm(authUserId: number, path: string) {
    for (let i = 0; i < 3; i++) {
      await get(authUserId, path);
      await settle();
    }
  }

  it.each(HOT_ROUTES)('flag ON: GET %s answers in ONE flight; the COMMIT is off the critical path', async (path) => {
    await warm(A.authUserId, path);
    const unit = await flightMs();
    await settle();
    proxy.reset();
    const { value: res, ms } = await timed(() => get(A.authUserId, path));
    expect(res.status).toBe(200);
    expect(ms).toBeLessThan(unit * 1.5 + OVERHEAD_MS); // BEGIN+stamp+reads in one flight; an awaited COMMIT would make it >= 2 flights
    await settle();
    expect(proxy.flights()).toBeLessThanOrEqual(2); // the one read flight + the deferred COMMIT, never more
  });

  it('flag ON: an unauthenticated 401 never touches the database (zero flights)', async () => {
    await settle();
    proxy.reset();
    const res = await get(null, '/pets');
    await settle();
    expect(res.status).toBe(401);
    expect(proxy.flights()).toBe(0);
    expect(proxy.clientChunks()).toBe(0);
  });

  it('flag ON: a cache MISS (first request of a caller) costs one extra flight, not more', async () => {
    await warm(B.authUserId, '/pets'); // prepares the statements on the connection
    clearCachedProfileIds();
    const unit = await flightMs();
    await settle();
    const { value: res, ms } = await timed(() => get(A.authUserId, '/pets'));
    expect(res.status).toBe(200);
    expect(ms).toBeLessThan(unit * 2.5 + OVERHEAD_MS); // BEGIN+lookup+stamp, then the reads
  });

  it('flag OFF: the same routes cost many flights - the production behaviour this flag removes', async () => {
    setFlag(false);
    await warm(A.authUserId, '/pets');
    const unit = await flightMs();
    const { ms } = await timed(() => get(A.authUserId, '/pets'));
    expect(ms).toBeGreaterThan(unit * 2.5);
    proxy.reset();
    await get(null, '/pets');
    expect(proxy.flights()).toBeGreaterThanOrEqual(2); // BEGIN and COMMIT for a request that does nothing
  });
});

describe.each([
  ['ON', true],
  ['OFF', false],
])('anti-leak and transaction semantics, flag %s (real Postgres, pawpi_app, FORCE RLS)', (_label, flagOn) => {
  beforeEach(() => setFlag(flagOn));

  it('a handler sees only its own caller\'s rows and the stamp is the PROFILE id, for a cache miss and a hit', async () => {
    for (let i = 0; i < 2; i++) {
      for (const who of [A, B]) {
        const seen = await as(who.authUserId, async () => {
          const res = await withRequestContext(async () => Response.json(await observe()))(request());
          return res.json();
        });
        expect(seen.who).toBe(String(who.profileId));
        expect(seen.who).not.toBe(String(who.authUserId));
        expect(seen.tokens).toEqual([who === A ? 'tok-a' : 'tok-b']);
      }
    }
  });

  it('interleaved concurrent callers (deferred and awaited COMMIT) each see only their own rows', async () => {
    await get(A.authUserId, '/pets');
    await get(B.authUserId, '/pets');
    const calls = Array.from({ length: 24 }, (_, i) => {
      const who = i % 2 === 0 ? A : B;
      const handler = withRequestContext(async () => Response.json(await observe()), { deferCommit: i % 4 < 2 });
      return as(who.authUserId, async () => ({ who, body: await (await handler(request())).json() }));
    });
    for (const { who, body } of await Promise.all(calls)) {
      expect(body.who).toBe(String(who.profileId));
      expect(body.tokens).toEqual([who === A ? 'tok-a' : 'tok-b']);
    }
  });

  it('the stamp never survives onto the next request that reuses the connection', async () => {
    const handler = withRequestContext(async () => Response.json(await observe()), { deferCommit: true });
    for (let i = 0; i < 8; i++) {
      const asA = await as(A.authUserId, async () => (await handler(request())).json());
      expect(asA.who).toBe(String(A.profileId));
      // Anonymous caller straight after, on the same (sequentially reused) connection, deferred COMMIT included.
      const anon = await as(null, async () => (await handler(request())).json());
      expect(anon.who).toBeNull();
      expect(anon.tokens).toEqual([]);
      const asB = await as(B.authUserId, async () => (await handler(request())).json());
      expect(asB.tokens).toEqual(['tok-b']);
    }
    // And a plain pool query outside any request sees no stamp at all.
    const [g] = await pool`select nullif(current_setting('app.current_user_id', true), '') as who`;
    expect(g.who).toBeNull();
  });

  it('a write is durable BEFORE the response, even on a route that opted into a deferred COMMIT', async () => {
    const handler = withRequestContext(
      async () => {
        await appSql`insert into device_push_tokens (user_id, token, platform) values (current_app_user_id(), 'tok-new', 'ios')`;
        return Response.json({ ok: true });
      },
      { deferCommit: true },
    );
    const res = await as(A.authUserId, () => handler(request()));
    expect(res.status).toBe(200);
    const rows = await raw`select token from device_push_tokens where user_id = ${A.profileId} order by token`;
    expect(rows.map((r) => r.token)).toEqual(['tok-a', 'tok-new']); // visible to a different connection immediately
  });

  it('RLS still binds writes: A cannot insert a row owned by B', async () => {
    const handler = withRequestContext(async () => {
      await appSql`insert into device_push_tokens (user_id, token, platform) values (${B.profileId}, 'tok-evil', 'ios')`;
      return Response.json({ ok: true });
    });
    const res = await as(A.authUserId, () => handler(request()));
    expect(res.status).toBe(500);
    expect(await raw`select 1 from device_push_tokens where token = 'tok-evil'`).toHaveLength(0);
  });

  it('a handler that throws rolls everything back and the connection stays usable', async () => {
    const boom = withRequestContext(async () => {
      await appSql`insert into device_push_tokens (user_id, token, platform) values (current_app_user_id(), 'tok-rolled', 'ios')`;
      throw new Error('boom');
    });
    expect((await as(A.authUserId, () => boom(request()))).status).toBe(500);
    expect(await raw`select 1 from device_push_tokens where token = 'tok-rolled'`).toHaveLength(0);
    const after = await as(A.authUserId, async () => (await withRequestContext(async () => Response.json(await observe()))(request())).json());
    expect(after.who).toBe(String(A.profileId));
  });

  it('a statement error the handler CAUGHT still fails the request (500) and rolls back, like sql.begin', async () => {
    const handler = withRequestContext(async () => {
      await appSql`insert into device_push_tokens (user_id, token, platform) values (current_app_user_id(), 'tok-half', 'ios')`;
      try {
        await appSql`select 1/0`;
      } catch {
        /* handled, but the transaction is aborted */
      }
      return Response.json({ ok: true });
    });
    expect((await as(A.authUserId, () => handler(request()))).status).toBe(500);
    expect(await raw`select 1 from device_push_tokens where token = 'tok-half'`).toHaveLength(0);
  });

  it('withSavepoint contains a failing statement: the handler\'s own response and its other writes survive', async () => {
    const handler = withRequestContext(async () => {
      await appSql`insert into device_push_tokens (user_id, token, platform) values (current_app_user_id(), 'tok-kept', 'ios')`;
      let contained = false;
      try {
        await withSavepoint(async () => {
          await appSql`insert into device_push_tokens (user_id, token, platform) values (current_app_user_id(), 'tok-lost', 'ios')`;
          await appSql`select 1/0`;
        });
      } catch {
        contained = true;
      }
      const after = await observe(); // the transaction is alive and still stamped
      return Response.json({ contained, who: after.who });
    });
    const res = await as(A.authUserId, () => handler(request()));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ contained: true, who: String(A.profileId) });
    const rows = await raw`select token from device_push_tokens where user_id = ${A.profileId} order by token`;
    expect(rows.map((r) => r.token)).toEqual(['tok-a', 'tok-kept']);
  });

  it('no profile yet: no stamp (deny by default), nothing visible', async () => {
    await raw`insert into auth_users (id, name, email) values (203, 'fresh', 'fresh203@example.com')`;
    const seen = await as(203, async () => (await withRequestContext(async () => Response.json(await observe()), { deferCommit: true })(request())).json());
    expect(seen.who).toBeNull();
    expect(seen.tokens).toEqual([]);
  });
});

describe('flag ON: nothing runs on a connection after the request released it', () => {
  it.each([
    ['awaited COMMIT', false],
    ['deferred COMMIT', true],
  ])('a statement fired after the handler returned is rejected, not run on a pooled connection (%s)', async (_label, deferCommit) => {
    let stray: unknown = null;
    let strayDone: () => void = () => {};
    const done = new Promise<void>((resolve) => (strayDone = resolve));
    const handler = withRequestContext(
      async () => {
        const seen = await observe();
        // Background work the handler does not wait for: it fires long after the response and the release.
        setTimeout(async () => {
          try {
            await appSql`select 1`;
          } catch (e) {
            stray = e;
          } finally {
            strayDone();
          }
        }, DELAY_MS * 6);
        return Response.json(seen);
      },
      { deferCommit },
    );
    const res = await as(A.authUserId, () => handler(request()));
    expect((await res.json()).who).toBe(String(A.profileId));
    await done;
    expect(String((stray as Error)?.message)).toContain('after the request finished');
  });
});
