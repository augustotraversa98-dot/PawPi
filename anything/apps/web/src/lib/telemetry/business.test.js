import { describe, it, expect, vi, beforeEach } from 'vitest';

const otel = vi.hoisted(() => {
  const calls = [];
  return {
    calls,
    api: {
      metrics: {
        getMeter: () => ({
          createCounter: (name) => ({ add: (v, attrs) => calls.push({ name, v, attrs }) }),
        }),
      },
    },
  };
});
vi.mock('@opentelemetry/api', () => otel.api);

import {
  recordBusinessEvent,
  observeAuthorize,
  BUSINESS_EVENTS,
  BUSINESS_OUTCOMES,
  BUSINESS_METHODS,
} from './business.js';
import { instrumentAuthAdapter } from './authMetrics.js';

beforeEach(() => {
  otel.calls.length = 0;
});

describe('recordBusinessEvent', () => {
  it('lists match the contract', () => {
    expect([...BUSINESS_EVENTS]).toEqual([
      'signup', 'signin', 'pet_created', 'post_created', 'health_log_created', 'routine_created',
      'booking_created', 'order_created', 'push_token_registered', 'walk_logged',
    ]);
    expect([...BUSINESS_OUTCOMES]).toEqual(['ok', 'fail']);
    expect([...BUSINESS_METHODS]).toEqual(['credentials', 'google', 'apple', 'none']);
  });

  it('defaults to outcome ok / method none and counts 1', () => {
    expect(recordBusinessEvent('pet_created')).toBe(true);
    expect(otel.calls).toEqual([
      { name: 'pawpi_business_events_total', v: 1, attrs: { event: 'pet_created', outcome: 'ok', method: 'none' } },
    ]);
  });

  it('accepts every valid combination', () => {
    for (const e of BUSINESS_EVENTS)
      for (const o of BUSINESS_OUTCOMES)
        for (const m of BUSINESS_METHODS) expect(recordBusinessEvent(e, o, m)).toBe(true);
    expect(otel.calls).toHaveLength(BUSINESS_EVENTS.length * 2 * 4);
  });

  it.each([
    ['unknown_event', 'ok', 'none'],
    ['signup', 'maybe', 'none'],
    ['signup', 'ok', 'facebook'],
    ['user@example.com', 'ok', 'none'],
    ['pet_created', 'ok', 'a@b.com'],
    ['pet_created', 'ok', '12345'],
    [undefined, 'ok', 'none'],
    ['pet_created', null, 'none'],
    ['__proto__', 'ok', 'none'],
    [{}, 'ok', 'none'],
  ])('drops invalid %j/%j/%j without throwing', (e, o, m) => {
    expect(recordBusinessEvent(e, o, m)).toBe(false);
    expect(otel.calls).toHaveLength(0);
  });

  it('never throws if the counter does', () => {
    const orig = otel.calls.push;
    otel.calls.push = () => {
      throw new Error('boom');
    };
    try {
      expect(recordBusinessEvent('signup', 'ok', 'apple')).toBe(false);
    } finally {
      otel.calls.push = orig;
    }
  });
});

describe('observeAuthorize', () => {
  it('truthy user -> ok, returns the user untouched', async () => {
    const user = { id: 7 };
    const fn = observeAuthorize('signin', 'credentials', async (c) => (c.ok ? user : null));
    await expect(fn({ ok: true })).resolves.toBe(user);
    expect(otel.calls.at(-1).attrs).toEqual({ event: 'signin', outcome: 'ok', method: 'credentials' });
  });
  it('null -> fail, still returns null', async () => {
    const fn = observeAuthorize('signup', 'credentials', async () => null);
    await expect(fn({})).resolves.toBeNull();
    expect(otel.calls.at(-1).attrs).toEqual({ event: 'signup', outcome: 'fail', method: 'credentials' });
  });
  it('a throw -> fail and the SAME error propagates', async () => {
    const err = new Error('db down');
    const fn = observeAuthorize('signin', 'apple', async () => {
      throw err;
    });
    await expect(fn({})).rejects.toBe(err);
    expect(otel.calls.at(-1).attrs).toEqual({ event: 'signin', outcome: 'fail', method: 'apple' });
  });
  it('forwards all arguments', async () => {
    const inner = vi.fn(async () => ({ id: 1 }));
    await observeAuthorize('signin', 'credentials', inner)({ a: 1 }, { req: 1 });
    expect(inner).toHaveBeenCalledWith({ a: 1 }, { req: 1 });
  });
});

describe('instrumentAuthAdapter (Google OAuth)', () => {
  const base = () => ({
    createUser: vi.fn(async (u) => ({ id: '10', ...u })),
    getUserByAccount: vi.fn(async ({ providerAccountId }) => (providerAccountId === 'known' ? { id: '9' } : null)),
    linkAccount: vi.fn(async () => undefined),
    getUser: vi.fn(async () => ({ id: '1' })),
  });
  const events = () => otel.calls.map((c) => `${c.attrs.event}:${c.attrs.outcome}:${c.attrs.method}`);

  it('passes every method through with identical results and extra methods intact', async () => {
    const b = base();
    const a = instrumentAuthAdapter(b);
    await expect(a.getUser('1')).resolves.toEqual({ id: '1' });
    await expect(a.createUser({ email: 'x' })).resolves.toEqual({ id: '10', email: 'x' });
    expect(b.createUser).toHaveBeenCalledWith({ email: 'x' });
  });

  it('returning Google user -> signin ok google', async () => {
    const a = instrumentAuthAdapter(base());
    await a.getUserByAccount({ provider: 'google', providerAccountId: 'known' });
    expect(events()).toEqual(['signin:ok:google']);
  });

  it('unknown account lookup counts nothing; other providers are ignored', async () => {
    const a = instrumentAuthAdapter(base());
    await a.getUserByAccount({ provider: 'google', providerAccountId: 'new' });
    await a.getUserByAccount({ provider: 'apple', providerAccountId: 'known' });
    expect(events()).toEqual([]);
  });

  it('new Google user (createUser then linkAccount) -> signup + signin', async () => {
    const a = instrumentAuthAdapter(base());
    const u = await a.createUser({ email: 'n@x.com' });
    await a.linkAccount({ type: 'oidc', provider: 'google', userId: u.id, providerAccountId: 'g1' });
    expect(events()).toEqual(['signup:ok:google', 'signin:ok:google']);
  });

  it('existing email, first Google link (no createUser) -> signin only', async () => {
    const a = instrumentAuthAdapter(base());
    await a.linkAccount({ type: 'oauth', provider: 'google', userId: '55', providerAccountId: 'g2' });
    expect(events()).toEqual(['signin:ok:google']);
  });

  it('credentials / apple account links are not Google events', async () => {
    const a = instrumentAuthAdapter(base());
    const u = await a.createUser({ email: 'c@x.com' });
    await a.linkAccount({ type: 'credentials', provider: 'credentials', userId: u.id, providerAccountId: u.id });
    await a.linkAccount({ type: 'oidc', provider: 'apple', userId: '3', providerAccountId: 'ap' });
    expect(events()).toEqual([]);
  });

  it('adapter errors propagate unchanged and count nothing', async () => {
    const b = base();
    const err = new Error('insert failed');
    b.linkAccount = vi.fn(async () => {
      throw err;
    });
    const a = instrumentAuthAdapter(b);
    await expect(a.linkAccount({ type: 'oauth', provider: 'google', userId: '1' })).rejects.toBe(err);
    expect(events()).toEqual([]);
  });

  it('bounds the remembered new-user ids', async () => {
    const a = instrumentAuthAdapter(base());
    for (let i = 0; i < 500; i++) await a.createUser({ email: `u${i}@x.com` });
    // no assertion on internals; just must not blow up and still behaves
    await a.linkAccount({ type: 'oauth', provider: 'google', userId: '10', providerAccountId: 'g' });
    expect(events().length).toBeGreaterThan(0);
  });
});
