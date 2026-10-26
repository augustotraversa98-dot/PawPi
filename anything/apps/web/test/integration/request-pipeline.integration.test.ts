// Request pipeline (perf audit 2026-10-23, section 5.2) - proven on REAL Postgres as pawpi_app (FORCE RLS):
//
//   1. The process-wide auth_user_id -> user_profiles.id cache: the identity stamp is sent PIPELINED with the
//      handler's first statement, still lands before it, RLS follows it, and one caller's cached id can never be
//      stamped for another caller (sequential or concurrent).
//   2. Round-trip budgets for the hot routes (flights = sequential waits on the request transaction; BEGIN and
//      COMMIT are not counted, see roundTrips.ts), so a regression that re-serialises independent statements
//      fails CI.
//   3. The rewritten reads return the same data: feed counts, the viewer's paw flag, business-post counts,
//      pets + current weight, discover's lock tags.
//
// The cache is OFF for the rest of the integration suite (vitest.integration.config.ts) because those tests
// reseed the same auth ids with different profile ids; this file turns it on for itself.

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { inject } from 'vitest';
import type { Sql } from 'postgres';
import {
  makeTestSql,
  resetDb,
  seedOwnerWithPet,
  seedPost,
  seedPaw,
  seedBark,
  seedProvider,
} from './db';
import { installFlightCounter, type FlightCounter } from './roundTrips';

// auth() carries a PER-REQUEST session through AsyncLocalStorage so concurrent requests keep their own caller.
const authState = vi.hoisted(() => ({ als: null as any, session: null as any }));
vi.mock('@/auth', async () => {
  const { AsyncLocalStorage } = await import('node:async_hooks');
  authState.als = new AsyncLocalStorage();
  return { auth: async () => authState.als.getStore() ?? authState.session };
});

// Auth ids and profile ids are deliberately different numbers so mixing them up cannot pass by accident.
const A = { authUserId: 101, profileId: 7001, username: 'ownera', petId: 8001, petName: 'Rex' };
const B = { authUserId: 102, profileId: 7002, username: 'ownerb', petId: 8002, petName: 'Milo' };

let raw: Sql;
let api: any;
let pool: any;
let appSql: any;
let counter: FlightCounter;
let withRequestContext: (h: (r: Request) => Promise<Response>) => (r: Request) => Promise<Response>;
let clearCachedProfileIds: () => void;
let forgetCachedProfileId: (id: string | number) => void;

const sessionFor = (authUserId: number) => ({ user: { id: String(authUserId), email: `${authUserId}@example.com` } });
const as = <T>(authUserId: number, fn: () => Promise<T>) => authState.als.run(sessionFor(authUserId), fn);
const get = (authUserId: number, path: string) => as(authUserId, () => api.request(path));

beforeAll(async () => {
  raw = makeTestSql();
  const url = new URL(inject('TEST_DATABASE_URL'));
  url.username = 'pawpi_app';
  url.password = 'pawpi_app';
  process.env.DATABASE_URL = url.toString();
  process.env.DATABASE_SSL = 'disable';
  process.env.IDENTITY_CACHE_TTL_MS = '300000';
  // This file counts statements through `pool.begin`, i.e. the sql.begin request path. The single-flight path
  // (REQUEST_SINGLE_FLIGHT) reserves a connection instead and is measured on the wire in single-flight.integration.test.ts.
  process.env.REQUEST_SINGLE_FLIGHT = 'off';

  ({ api } = (await import('../../__create/route-builder')) as any);
  const sqlModule = await import('@/app/api/utils/sql');
  pool = (sqlModule as any).pool;
  appSql = (sqlModule as any).default;
  ({ withRequestContext } = (await import('@/app/api/utils/requestContext')) as any);
  ({ clearCachedProfileIds, forgetCachedProfileId } = (await import('@/app/api/utils/requestIdentity')) as any);
  counter = installFlightCounter(pool);
});

afterAll(async () => {
  counter.uninstall();
  await resetDb(raw);
  delete process.env.IDENTITY_CACHE_TTL_MS;
  delete process.env.REQUEST_SINGLE_FLIGHT;
  await appSql.end?.();
  await raw.end();
});

beforeEach(async () => {
  await resetDb(raw);
  clearCachedProfileIds();
  await seedOwnerWithPet(raw, A);
  await seedOwnerWithPet(raw, B);
  await raw`update user_profiles set timezone = 'UTC' where id in (${A.profileId}, ${B.profileId})`;
});

afterEach(() => {
  authState.session = null;
});

/** What a handler can observe about the identity of its own transaction. */
async function observe() {
  const [g] = await appSql`select nullif(current_setting('app.current_user_id', true), '') as who`;
  // device_push_tokens is strictly own-row (FOR ALL, owner = current_app_user_id()).
  const rows = await appSql`select token from device_push_tokens order by token`;
  return { who: g.who as string | null, tokens: rows.map((r: { token: string }) => r.token) };
}

const request = () => new Request('http://localhost/api/anything');

describe('process-wide identity cache (real Postgres, pawpi_app, FORCE RLS)', () => {
  beforeEach(async () => {
    await raw`
      insert into device_push_tokens (user_id, token, platform)
      values (${A.profileId}, 'tok-a', 'ios'), (${B.profileId}, 'tok-b', 'ios')
    `;
  });

  it('a cache HIT still stamps the caller BEFORE the handler\'s first statement, and RLS follows the stamp', async () => {
    const run = (authUserId: number) =>
      as(authUserId, async () => {
        let seen: Awaited<ReturnType<typeof observe>> | undefined;
        const res = await withRequestContext(async () => {
          seen = await observe(); // the handler's FIRST statement
          return Response.json({});
        })(request());
        expect(res.status).toBe(200);
        return seen!;
      });

    const miss = await run(A.authUserId); // looks the profile up
    const hit = await run(A.authUserId); // stamp is pipelined, nothing awaited ahead of the handler
    for (const seen of [miss, hit]) {
      expect(seen.who).toBe(String(A.profileId));
      expect(seen.who).not.toBe(String(A.authUserId));
      expect(seen.tokens).toEqual(['tok-a']); // B's token invisible: the policy reads the stamp
    }
  });

  it('a cache hit costs one round trip less than a miss', async () => {
    const flightsFor = async () => {
      counter.reset();
      await as(A.authUserId, () =>
        withRequestContext(async () => {
          await observe();
          return Response.json({});
        })(request()),
      );
      return counter.flights();
    };
    const miss = await flightsFor();
    const hit = await flightsFor();
    expect(hit).toBe(miss - 1);
  });

  it('one caller\'s cached id is never stamped for another caller (interleaved, concurrent)', async () => {
    await get(A.authUserId, '/pets'); // warm A
    await get(B.authUserId, '/pets'); // warm B
    const calls = Array.from({ length: 12 }, (_, i) => {
      const who = i % 2 === 0 ? A : B;
      return as(who.authUserId, async () => {
        const res = await withRequestContext(async () => Response.json(await observe()))(request());
        return { who, body: await res.json() };
      });
    });
    for (const { who, body } of await Promise.all(calls)) {
      expect(body.who).toBe(String(who.profileId));
      expect(body.tokens).toEqual([who === A ? 'tok-a' : 'tok-b']);
    }
  });

  it('forgetting a caller (account deletion) forces a real lookup again', async () => {
    await get(A.authUserId, '/pets');
    forgetCachedProfileId(A.authUserId);
    counter.reset();
    await as(A.authUserId, () =>
      withRequestContext(async () => {
        await observe();
        return Response.json({});
      })(request()),
    );
    const afterForget = counter.flights();
    counter.reset();
    await as(A.authUserId, () =>
      withRequestContext(async () => {
        await observe();
        return Response.json({});
      })(request()),
    );
    expect(counter.flights()).toBe(afterForget - 1); // cached again after the lookup
  });

  it('an account with no profile yet is never cached and gets NO stamp (deny by default)', async () => {
    await raw`insert into auth_users (id, name, email) values (103, 'fresh', 'fresh@example.com')`;
    for (let i = 0; i < 2; i++) {
      const seen = await as(103, async () => {
        let s: Awaited<ReturnType<typeof observe>> | undefined;
        await withRequestContext(async () => {
          s = await observe();
          return Response.json({});
        })(request());
        return s!;
      });
      expect(seen.who).toBeNull();
      expect(seen.tokens).toEqual([]);
    }
  });
});

describe('round-trip budgets (warm identity cache; BEGIN/COMMIT not counted)', () => {
  beforeEach(async () => {
    // Warm both callers so the identity cache is hit in the measured request.
    await get(A.authUserId, '/pets');
    await get(B.authUserId, '/pets');
  });

  const flights = async (authUserId: number, path: string) => {
    counter.reset();
    const res = await get(authUserId, path);
    expect(res.status).toBe(200);
    const body = await res.json();
    return { flights: counter.flights(), statements: counter.statements(), body };
  };

  it('GET /pets: pets + latest weight in ONE flight, same data as before', async () => {
    await raw`insert into health_weight_logs (pet_id, owner_user_id, weight, weight_unit, logged_at)
              values (${A.petId}, ${A.profileId}, 31.5, 'kg', now())`;
    const r = await flights(A.authUserId, '/pets');
    expect(r.flights).toBe(1);
    expect(r.statements).toBe(3); // identity stamp + pets + weights
    expect(r.body.pets).toHaveLength(1);
    expect(r.body.pets[0]).toMatchObject({ id: A.petId, name: 'Rex', owner_user_id: A.profileId });
    expect(Number(r.body.pets[0].weight)).toBe(31.5); // the latest weigh-in wins over pets.weight
  });

  it('GET /pets never returns another owner\'s pet or weight', async () => {
    await raw`insert into health_weight_logs (pet_id, owner_user_id, weight, weight_unit, logged_at)
              values (${B.petId}, ${B.profileId}, 9.9, 'kg', now())`;
    const r = await flights(A.authUserId, '/pets');
    expect(r.body.pets.map((p: { id: number }) => p.id)).toEqual([A.petId]);
    expect(JSON.stringify(r.body)).not.toContain('9.9');
  });

  it('GET /discover: profiles + moments + viewer status in ONE flight', async () => {
    await seedPost(raw, { postId: 1, userId: B.profileId, petId: B.petId });
    const r = await flights(A.authUserId, '/discover');
    expect(r.flights).toBe(1);
    expect(r.body.profiles.length).toBeGreaterThan(0);
    expect(r.body.moments[0]).toMatchObject({ id: 1, locked: true }); // A has not posted today => tagged locked
  });

  it('GET /posts: following + suggested + viewer status in ONE flight; counts + paw flag are correct', async () => {
    await seedPost(raw, { postId: 11, userId: B.profileId, petId: B.petId, caption: 'b-post' });
    await seedPost(raw, { postId: 12, userId: A.profileId, petId: A.petId, caption: 'a-post' });
    await seedPaw(raw, { postId: 11, userId: A.profileId });
    await seedPaw(raw, { postId: 11, userId: B.profileId });
    await seedBark(raw, { barkId: 1, postId: 11, userId: A.profileId, petId: A.petId });
    await raw`update posts set is_daily_update = true, post_date = (now() at time zone 'UTC')::date where id = 12`;

    const r = await flights(A.authUserId, `/posts?viewerPetId=${A.petId}`);
    expect(r.flights).toBe(1);
    expect(r.statements).toBe(5); // stamp + following + suggested + followed-business posts + viewer status
    const byId = Object.fromEntries(r.body.posts.map((p: any) => [p.id, p]));
    expect(byId[11]).toMatchObject({ paw_count: 2, bark_count: 1, user_has_pawed: true });
    expect(byId[12]).toMatchObject({ paw_count: 0, bark_count: 0, user_has_pawed: false });
    // A posted today, so B's post is unlocked (the lock itself is covered by daily-moments-gate).
    expect(byId[11].caption).toBe('b-post');
    expect(byId[11].locked).toBeUndefined();
  });

  it('GET /posts: a viewer who has not posted today still gets other owners\' media redacted', async () => {
    await seedPost(raw, { postId: 21, userId: B.profileId, petId: B.petId, caption: 'secret' });
    await seedPaw(raw, { postId: 21, userId: A.profileId });
    const r = await flights(A.authUserId, `/posts?viewerPetId=${A.petId}`);
    const p = r.body.posts.find((x: any) => x.id === 21);
    expect(p).toMatchObject({ locked: true, caption: null, image_url: null, user_has_pawed: true });
  });

  it('GET /posts: following a business adds NO flight (provider counts are subselects in one statement)', async () => {
    await seedProvider(raw, { providerId: 300, ownerUserProfileId: B.profileId, slug: 'prov', status: 'published' });
    await raw`insert into provider_posts (id, provider_id, author_user_id, body) values (900, 300, ${B.profileId}, 'hello')`;
    await raw`insert into provider_follows (follower_user_id, provider_id) values (${A.profileId}, 300)`;
    await raw`insert into provider_post_paws (post_id, user_id) values (900, ${A.profileId}), (900, ${B.profileId})`;
    const r = await flights(A.authUserId, `/posts?viewerPetId=${A.petId}`);
    expect(r.flights).toBe(1);
    const biz = r.body.posts.find((p: any) => p.item_type === 'provider_post');
    expect(biz).toMatchObject({ id: 900, provider_id: 300, paw_count: 2, comment_count: 0, body: 'hello' });
    expect(biz.provider).toMatchObject({ id: 300, slug: 'prov' });
  });

  it('GET /posts/owner-posted-today: viewer profile + posted-today is ONE statement', async () => {
    const owned = await flights(A.authUserId, '/posts/owner-posted-today');
    expect(owned.flights).toBe(1);
    expect(owned.statements).toBe(2); // stamp + status
    expect(owned.body.hasPostedToday).toBe(false);
  });
});
