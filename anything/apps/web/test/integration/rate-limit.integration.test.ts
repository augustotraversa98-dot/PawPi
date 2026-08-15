// PP3 — the write rate limiter against REAL Postgres, run as pawpi_app (FORCE RLS,
// like production). Two halves:
//
//   1. The store (migration 0113). The counter has to be correct and it has to be
//      unresettable by the caller — a limiter a user can clear is not a limiter.
//   2. The real route. POST /api/posts/[id]/paw executed as the actual handler,
//      proving under-limit passes, over-limit 429s, and that one user's burst does
//      not spend another user's allowance.
//
// The route half deliberately drives the limit DOWN via the exported catalog rather
// than issuing 120 real requests: the number under test is "does it cut off AT the
// configured limit", not the number itself.

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { inject } from 'vitest';
import postgres from 'postgres';
import type { Sql } from 'postgres';
import { makeTestSql, resetDb, seedOwnerWithPet, seedPost } from './db';

const authState = vi.hoisted(() => ({ session: null as any }));
vi.mock('@/auth', () => ({ auth: async () => authState.session }));

const ALICE = { authUserId: 1, profileId: 1, username: 'alice', petId: 10, petName: 'A' };
const BOB = { authUserId: 2, profileId: 2, username: 'bob', petId: 20, petName: 'B' };
const POST_ID = 100;

let raw: Sql;
let app: Sql;
let appSql: any;
let POST: (r: Request, ctx: any) => Promise<Response>;
let RATE_LIMITS: any;
let savedPawLimit: { limit: number; windowSeconds: number };

/** Run `fn` on a pawpi_app connection carrying `userId` as the request identity. */
function asUser<T>(userId: number | null, fn: (tx: Sql) => Promise<T>): Promise<T> {
  return app.begin(async (tx) => {
    await tx`select set_config('app.current_user_id', ${userId === null ? '' : String(userId)}, true)`;
    return fn(tx as unknown as Sql);
  });
}

const pawReq = () =>
  new Request(`http://localhost/api/posts/${POST_ID}/paw`, { method: 'POST' });
const ctx = { params: { id: String(POST_ID) } };

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
  POST = (await import('@/app/api/posts/[id]/paw/route')).POST as any;
  RATE_LIMITS = (await import('@/app/api/utils/rateLimit')).RATE_LIMITS;
  savedPawLimit = { ...RATE_LIMITS.paw_toggle };
});

afterAll(async () => {
  RATE_LIMITS.paw_toggle = savedPawLimit;
  await appSql.end?.();
  await app.end();
  await raw.end();
});

afterEach(async () => {
  RATE_LIMITS.paw_toggle = { ...savedPawLimit };
  await resetDb(raw);
  authState.session = null;
});

beforeEach(async () => {
  await seedOwnerWithPet(raw, ALICE);
  await seedOwnerWithPet(raw, BOB);
  await seedPost(raw, { postId: POST_ID, userId: BOB.profileId, petId: BOB.petId, caption: 'hi' });
});

// ── 1. the store ─────────────────────────────────────────────────────────────

describe('app_rate_limit_hit (migration 0113)', () => {
  const hit = (tx: Sql, subject: string, limit = 3, window = 3600) =>
    tx`select allowed, hits, retry_after_seconds
       from app_rate_limit_hit('t_bucket', ${subject}, ${window}, ${limit})`;

  it('counts up and flips to denied exactly one call past the limit', async () => {
    await asUser(ALICE.profileId, async (tx) => {
      const seen: { allowed: boolean; hits: number }[] = [];
      for (let i = 0; i < 5; i++) {
        const [row] = await hit(tx, 'u:1');
        seen.push({ allowed: row.allowed, hits: row.hits });
      }
      expect(seen.map((s) => s.hits)).toEqual([1, 2, 3, 4, 5]);
      // A limit of 3 permits exactly 3.
      expect(seen.map((s) => s.allowed)).toEqual([true, true, true, false, false]);
    });
  });

  it('keeps subjects independent — one user cannot spend another allowance', async () => {
    await asUser(ALICE.profileId, async (tx) => {
      for (let i = 0; i < 4; i++) await hit(tx, 'u:1');
      const [alice] = await hit(tx, 'u:1');
      expect(alice.allowed).toBe(false);
      // Bob's first ever call in the same bucket is untouched by Alice's burst.
      const [bob] = await hit(tx, 'u:2');
      expect(bob.allowed).toBe(true);
      expect(bob.hits).toBe(1);
    });
  });

  it('keeps buckets independent — a hot bucket does not spend a quiet one', async () => {
    await asUser(ALICE.profileId, async (tx) => {
      for (let i = 0; i < 4; i++) await hit(tx, 'u:1');
      const [other] = await tx`
        select allowed, hits from app_rate_limit_hit('other_bucket', 'u:1', 3600, 3)
      `;
      expect(other.allowed).toBe(true);
      expect(other.hits).toBe(1);
    });
  });

  it('returns a retry_after inside the window, so clients can back off honestly', async () => {
    await asUser(ALICE.profileId, async (tx) => {
      const [row] = await hit(tx, 'u:1', 1, 600);
      expect(row.retry_after_seconds).toBeGreaterThan(0);
      expect(row.retry_after_seconds).toBeLessThanOrEqual(600);
    });
  });

  it('rolls into a fresh window and keeps ONE row per (bucket, subject)', async () => {
    // A 1-second window makes the roll observable without waiting.
    await asUser(ALICE.profileId, async (tx) => {
      await tx`select app_rate_limit_hit('t_bucket', 'u:1', 1, 3)`;
    });
    await new Promise((r) => setTimeout(r, 1100));
    await asUser(ALICE.profileId, async (tx) => {
      const [row] = await tx`
        select hits from app_rate_limit_hit('t_bucket', 'u:1', 1, 3)
      `;
      expect(row.hits).toBe(1); // new window, counter restarted
    });
    // The previous window's row was swept by the same call (self-cleaning).
    const rows = await raw`select count(*)::int as n from rate_limit_hits where subject = 'u:1'`;
    expect(rows[0].n).toBe(1);
  });

  it('rejects nonsense arguments instead of silently not limiting', async () => {
    await expect(
      asUser(ALICE.profileId, (tx) => tx`select app_rate_limit_hit('b', 'u:1', 0, 3)`),
    ).rejects.toThrow();
  });
});

// ── 2. the counter is out of the caller reach ────────────────────────────────

describe('rate_limit_hits RLS — the caller cannot clear their own counter', () => {
  beforeEach(async () => {
    await asUser(ALICE.profileId, (tx) => tx`select app_rate_limit_hit('t_bucket', 'u:1', 3600, 3)`);
  });

  const countRows = async () => {
    const rows = await raw`select count(*)::int as n from rate_limit_hits`;
    return rows[0].n as number;
  };

  it('DELETE is denied (no policy → zero rows affected under FORCE RLS)', async () => {
    await asUser(ALICE.profileId, async (tx) => {
      expect(await tx`delete from rate_limit_hits returning subject`).toHaveLength(0);
    });
    expect(await countRows()).toBe(1);
  });

  it('UPDATE is denied — the count cannot be rewound', async () => {
    await asUser(ALICE.profileId, async (tx) => {
      expect(await tx`update rate_limit_hits set hits = 0 returning subject`).toHaveLength(0);
    });
    const rows = await raw`select hits from rate_limit_hits`;
    expect(rows[0].hits).toBe(1);
  });

  it('INSERT is denied — no forging a fresh window', async () => {
    await expect(
      asUser(ALICE.profileId, (tx) => tx`
        insert into rate_limit_hits (bucket, subject, window_start, hits)
        values ('t_bucket', 'u:1', now() + interval '1 day', 0)
      `),
    ).rejects.toThrow();
  });

  it('SELECT is own-row: Alice sees her counter, not Bob', async () => {
    await asUser(BOB.profileId, (tx) => tx`select app_rate_limit_hit('t_bucket', 'u:2', 3600, 3)`);
    const alice = await asUser(ALICE.profileId, (tx) => tx`select subject from rate_limit_hits`);
    expect(alice.map((r: any) => r.subject)).toEqual(['u:1']);
    const anon = await asUser(null, (tx) => tx`select subject from rate_limit_hits`);
    expect(anon).toHaveLength(0);
  });
});

// ── 3. the real route ────────────────────────────────────────────────────────

describe('POST /api/posts/[id]/paw — the limiter on a live route', () => {
  beforeEach(() => {
    authState.session = { user: { id: ALICE.authUserId } };
  });

  it('lets an ordinary burst through untouched', async () => {
    // Paw is a toggle, so alternate POST/DELETE would be the realistic pattern;
    // repeated POSTs are idempotent server-side, which is what we want here — the
    // only thing varying between calls is the counter.
    for (let i = 0; i < 3; i++) {
      const res = await POST(pawReq(), ctx);
      expect(res.status).toBe(200);
    }
  });

  it('429s once past the limit, with Retry-After and EN+ES copy', async () => {
    RATE_LIMITS.paw_toggle = { limit: 2, windowSeconds: 3600 };

    expect((await POST(pawReq(), ctx)).status).toBe(200);
    expect((await POST(pawReq(), ctx)).status).toBe(200);

    const blocked = await POST(pawReq(), ctx);
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get('Retry-After'))).toBeGreaterThan(0);
    const body = await blocked.json();
    expect(body.code).toBe('rate_limited');
    expect(body.message_en).toBeTruthy();
    expect(body.message_es).toBeTruthy();
    expect(body.message_en).not.toBe(body.message_es);
    expect(body.retry_after_seconds).toBeGreaterThan(0);
  });

  it('limits PER USER — Bob is unaffected by Alice hitting the wall', async () => {
    RATE_LIMITS.paw_toggle = { limit: 1, windowSeconds: 3600 };

    expect((await POST(pawReq(), ctx)).status).toBe(200);
    expect((await POST(pawReq(), ctx)).status).toBe(429);

    authState.session = { user: { id: BOB.authUserId } };
    expect((await POST(pawReq(), ctx)).status).toBe(200);
  });

  it('the counter is keyed by the profile id the app uses as the owner key', async () => {
    RATE_LIMITS.paw_toggle = { limit: 5, windowSeconds: 3600 };
    await POST(pawReq(), ctx);
    const rows = await raw`select bucket, subject from rate_limit_hits`;
    expect(rows).toHaveLength(1);
    expect(rows[0].bucket).toBe('paw_toggle');
    expect(rows[0].subject).toBe(`u:${ALICE.profileId}`);
  });

  it('reads are NOT limited — a GET never touches the counter', async () => {
    RATE_LIMITS.paw_toggle = { limit: 1, windowSeconds: 3600 };
    const { GET } = await import('@/app/api/posts/[id]/barks/route');
    for (let i = 0; i < 5; i++) {
      const res = await (GET as any)(
        new Request(`http://localhost/api/posts/${POST_ID}/barks`),
        ctx,
      );
      expect(res.status).toBe(200);
    }
    const rows = await raw`select count(*)::int as n from rate_limit_hits`;
    expect(rows[0].n).toBe(0);
  });
});
