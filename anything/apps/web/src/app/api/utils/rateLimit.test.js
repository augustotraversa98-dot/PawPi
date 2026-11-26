// PP3 — the limiter's decision logic, with `sql` mocked. The real counter (atomic
// increment, per-subject isolation, fixed window) is proven against real Postgres
// in test/integration/rate-limit.integration.test.ts; this file pins the parts that
// live in JS: subject derivation, the 429 shape, locale selection, and — the one
// that matters most in production — that ANY failure fails OPEN.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const sqlMock = vi.hoisted(() => ({ fn: vi.fn(), inTx: true }));
vi.mock('@/app/api/utils/sql', () => {
  // The tagged template: each call consumes the next queued result. A `savepoint`
  // property is how the limiter recognises an open request transaction (porsager
  // puts it on a transaction handle and never on the pool) — the production case.
  // The no-transaction path (route unit tests, unset DATABASE_URL) is covered below.
  const tagged = (...args) => sqlMock.fn(...args);
  return {
    default: new Proxy(tagged, {
      get: (target, prop) =>
        prop === 'savepoint'
          ? (sqlMock.inTx ? (fn) => fn() : undefined)
          : target[prop],
    }),
  };
});
// withSavepoint is transaction plumbing; with a mocked sql there is no transaction,
// so it runs the callback directly — same as the real one does outside a request.
vi.mock('@/app/api/utils/requestContext', () => ({
  withSavepoint: (fn) => fn(),
}));

import {
  RATE_LIMITS,
  enforceRateLimit,
  pickLocale,
  rateLimitResponse,
  rateLimitSubject,
  withRateLimit,
} from './rateLimit';
import { anonymousSender } from './senderAddress';

/** Queue the rows each successive `sql\`…\`` call should resolve to. */
function queue(...results) {
  sqlMock.fn.mockReset();
  for (const r of results) sqlMock.fn.mockResolvedValueOnce(r);
}

const req = (headers = {}) =>
  new Request('http://localhost/api/posts', { method: 'POST', headers });

beforeEach(() => {
  sqlMock.fn.mockReset();
  sqlMock.inTx = true;
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('rateLimitSubject', () => {
  // Invented addresses from the documentation ranges; 172.64.0.0/13 is one of Cloudflare's published ranges.
  const CLOUDFLARE = '172.64.10.20';
  const anonymous = (headers) => rateLimitSubject({ userId: null, request: req(headers) });
  const direct = (address) => anonymous({ 'x-real-ip': address });

  it('prefers the user id, prefixed so it cannot collide with an IP', () => {
    expect(rateLimitSubject({ userId: 7, request: req() })).toBe('u:7');
  });

  it('keeps the user id subject whatever address headers come with the request', () => {
    const request = req({
      'x-real-ip': CLOUDFLARE,
      'cf-connecting-ip': '198.51.100.7',
      'x-forwarded-for': '203.0.113.9, 192.0.2.1',
    });
    expect(rateLimitSubject({ userId: 7, request })).toBe('u:7');
  });

  it('is the same hashed subject the finder limits use, never the readable address', () => {
    const request = req({ 'x-real-ip': '198.51.100.4' });
    expect(rateLimitSubject({ userId: null, request })).toBe(anonymousSender(request));
    expect(direct('198.51.100.4')).toMatch(/^ip:[0-9a-f]{32}$/);
  });

  it('through Cloudflare: each visitor has a separate subject, even behind one Cloudflare address', () => {
    const via = (visitor) => anonymous({ 'x-real-ip': CLOUDFLARE, 'cf-connecting-ip': visitor });
    expect(via('198.51.100.7')).toBe(direct('198.51.100.7'));
    expect(via('198.51.100.8')).toBe(direct('198.51.100.8'));
    expect(via('198.51.100.7')).not.toBe(via('198.51.100.8'));
  });

  it('through Cloudflare, when the hosting edge already reports the visitor', () => {
    const headers = { 'x-real-ip': '198.51.100.7', 'cf-connecting-ip': '198.51.100.7' };
    expect(anonymous(headers)).toBe(direct('198.51.100.7'));
  });

  it('direct to the host: follows the connecting address, not the other forwarding headers', () => {
    const headers = {
      'x-real-ip': '198.51.100.4',
      'x-forwarded-for': '203.0.113.9, 192.0.2.1',
      'cf-connecting-ip': '203.0.113.10',
    };
    expect(anonymous(headers)).toBe(direct('198.51.100.4'));
  });

  it('without X-Real-IP uses the entry added by the nearest proxy', () => {
    expect(anonymous({ 'x-forwarded-for': '203.0.113.9, 198.51.100.4' })).toBe(direct('198.51.100.4'));
    expect(anonymous({ 'x-forwarded-for': '198.51.100.4' })).toBe(direct('198.51.100.4'));
  });

  it('counts one IPv6 /64 as one sender', () => {
    expect(direct('2001:db8:1:2::1')).toBe(direct('2001:db8:1:2::ffff'));
    expect(direct('2001:db8:1:2::1')).not.toBe(direct('2001:db8:1:3::1'));
  });

  it.each([
    ['no headers (local development)', {}],
    ['a value that is not an address', { 'x-forwarded-for': 'unknown', 'x-real-ip': 'nonsense' }],
    ['only CF-Connecting-IP', { 'cf-connecting-ip': '198.51.100.7' }],
  ])('returns null with %s — anonymous callers are NOT pooled', (_label, headers) => {
    expect(anonymous(headers)).toBeNull();
  });
});

describe('the 429 response', () => {
  it('carries both languages, a stable code and Retry-After', async () => {
    const res = rateLimitResponse({ retryAfterSeconds: 42, locale: 'es' });
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('42');
    const body = await res.json();
    expect(body.code).toBe('rate_limited');
    expect(body.retry_after_seconds).toBe(42);
    expect(body.message_en).toMatch(/too fast/i);
    expect(body.message_es).toMatch(/demasiado rápido/i);
    // `error` is the field the mobile client shows, so it must be the caller's language.
    expect(body.error).toBe(body.message_es);
  });

  it('defaults `error` to English', async () => {
    const body = await rateLimitResponse({ retryAfterSeconds: 1, locale: undefined }).json();
    expect(body.error).toBe(body.message_en);
  });
});

describe('pickLocale', () => {
  it('honours an explicit stored preference over the header', () => {
    expect(pickLocale(req({ 'accept-language': 'en-US' }), 'es')).toBe('es');
  });
  it('reads Accept-Language when there is no stored preference', () => {
    expect(pickLocale(req({ 'accept-language': 'es-AR,es;q=0.9' }), null)).toBe('es');
  });
  it('does not match a language that merely CONTAINS "es"', () => {
    expect(pickLocale(req({ 'accept-language': 'test-lang' }), null)).toBe('en');
  });
  it('falls back to English', () => {
    expect(pickLocale(req(), null)).toBe('en');
  });
});

describe('enforceRateLimit', () => {
  it('returns null (allow) when the counter says allowed', async () => {
    queue([{ allowed: true, hits: 3, retry_after_seconds: 100 }]);
    expect(await enforceRateLimit('post_create', req(), { userId: 5 })).toBeNull();
  });

  it('returns a 429 when the counter says over the limit', async () => {
    queue([{ allowed: false, hits: 13, retry_after_seconds: 87 }]);
    const res = await enforceRateLimit('post_create', req(), { userId: 5 });
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('87');
  });

  it('passes the bucket, subject, window and limit through to the DB function', async () => {
    queue([{ allowed: true, hits: 1, retry_after_seconds: 300 }]);
    await enforceRateLimit('bark_create', req(), { userId: 9 });
    const params = sqlMock.fn.mock.calls[0].slice(1);
    expect(params).toEqual([
      'bark_create',
      'u:9',
      RATE_LIMITS.bark_create.windowSeconds,
      RATE_LIMITS.bark_create.limit,
    ]);
  });

  it('resolves the caller from the transaction identity when none is passed', async () => {
    queue(
      [{ id: 21 }], // select current_app_user_id()
      [{ allowed: true, hits: 1, retry_after_seconds: 60 }],
    );
    await enforceRateLimit('paw_toggle', req());
    expect(sqlMock.fn.mock.calls[1].slice(1)[1]).toBe('u:21');
  });

  it('does not limit at all when there is no subject to key on', async () => {
    queue([{ id: null }]);
    expect(await enforceRateLimit('post_create', req())).toBeNull();
    expect(sqlMock.fn).toHaveBeenCalledTimes(1); // identity probe only, no counter call
  });

  // The production-critical behaviour: this is what happens on a deploy that lands
  // before migration 0113 is applied.
  it('FAILS OPEN when the DB function does not exist yet', async () => {
    sqlMock.fn.mockRejectedValueOnce(
      Object.assign(new Error('function app_rate_limit_hit(...) does not exist'), { code: '42883' }),
    );
    expect(await enforceRateLimit('post_create', req(), { userId: 5 })).toBeNull();
  });

  it('FAILS OPEN when the table does not exist yet', async () => {
    sqlMock.fn.mockRejectedValueOnce(
      Object.assign(new Error('relation "rate_limit_hits" does not exist'), { code: '42P01' }),
    );
    expect(await enforceRateLimit('report_create', req(), { userId: 5 })).toBeNull();
  });

  // Without a request transaction there is no shared store and no identity GUC. The
  // limiter must not even issue a query — a route unit test's mocked `sql` would
  // hand it a queued result meant for the handler and shift every later assertion.
  it('is a no-op with NO query when no request transaction is active', async () => {
    sqlMock.inTx = false;
    expect(await enforceRateLimit('post_create', req(), { userId: 5 })).toBeNull();
    expect(sqlMock.fn).not.toHaveBeenCalled();
  });

  it('FAILS OPEN on an unknown bucket rather than blocking the write', async () => {
    expect(await enforceRateLimit('not_a_bucket', req(), { userId: 5 })).toBeNull();
    expect(sqlMock.fn).not.toHaveBeenCalled();
  });

  it('localizes the 429 from the caller stored locale', async () => {
    queue(
      [{ allowed: false, hits: 21, retry_after_seconds: 10 }],
      [{ preferred_locale: 'es' }],
    );
    const body = await (await enforceRateLimit('report_create', req(), { userId: 5 })).json();
    expect(body.error).toBe(body.message_es);
  });

  it('still answers in a sensible language when the locale lookup fails', async () => {
    sqlMock.fn
      .mockResolvedValueOnce([{ allowed: false, hits: 21, retry_after_seconds: 10 }])
      .mockRejectedValueOnce(new Error('column preferred_locale does not exist'));
    const res = await enforceRateLimit('report_create', req({ 'accept-language': 'es-AR' }), {
      userId: 5,
    });
    const body = await res.json();
    expect(res.status).toBe(429);
    expect(body.error).toBe(body.message_es);
  });
});

describe('withRateLimit', () => {
  it('runs the handler when under the limit', async () => {
    // The wrapper resolves identity from the transaction first, then counts.
    queue([{ id: 5 }], [{ allowed: true, hits: 1, retry_after_seconds: 300 }]);
    const handler = vi.fn(async () => Response.json({ ok: true }));
    const res = await withRateLimit('post_create', handler)(req(), { params: {} });
    expect(handler).toHaveBeenCalledOnce();
    expect(res.status).toBe(200);
  });

  it('short-circuits the handler when over the limit', async () => {
    queue([{ id: 5 }], [{ allowed: false, hits: 99, retry_after_seconds: 5 }], []);
    const handler = vi.fn(async () => Response.json({ ok: true }));
    const res = await withRateLimit('post_create', handler)(req(), { params: {} });
    expect(handler).not.toHaveBeenCalled();
    expect(res.status).toBe(429);
  });

  it('passes the request and ctx through untouched', async () => {
    queue([{ id: 5 }], [{ allowed: true, hits: 1, retry_after_seconds: 300 }]);
    const handler = vi.fn(async () => Response.json({ ok: true }));
    const request = req();
    const ctx = { params: { id: '4' } };
    await withRateLimit('paw_toggle', handler)(request, ctx);
    expect(handler).toHaveBeenCalledWith(request, ctx);
  });
});

describe('the limit catalog', () => {
  it('covers every bucket the routes reference, with sane values', () => {
    for (const [bucket, cfg] of Object.entries(RATE_LIMITS)) {
      expect(cfg.limit, bucket).toBeGreaterThan(0);
      expect(cfg.windowSeconds, bucket).toBeGreaterThan(0);
    }
    expect(Object.keys(RATE_LIMITS).sort()).toEqual([
      'bark_create',
      'booking_create',
      'care_share',
      'checkout_create',
      'dm_message_create',
      'emergency_public_read',
      'emergency_relay',
      'emergency_relay_daily',
      'emergency_relay_urgent',
      'follow_toggle',
      'handle_check',
      'invite_create',
      'invite_redeem',
      'pack_request',
      'paw_toggle',
      'post_create',
      'report_create',
      'search_query',
      'upload_create',
    ]);
  });

  // #6: the sensitive-route buckets exist and produce a real 429 when the counter says over-limit
  // (so removing a bucket, or a route's wrapper, regresses visibly). Per-bucket end-to-end limiting
  // is proven in test/integration/rate-limit.integration.test.ts.
  it.each([
    'emergency_public_read',
    'emergency_relay',
    'upload_create',
    'checkout_create',
    'dm_message_create',
  ])('bucket %s 429s when over the limit', async (bucket) => {
    queue([{ allowed: false, hits: 999, retry_after_seconds: 30 }]);
    const res = await enforceRateLimit(bucket, req(), { userId: 5 });
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('30');
  });

  // 0146: the finder form passes its own sender subject, so a signed-in session cannot buy a separate limit.
  it('a fixed subject is used as it is, without reading the session identity', async () => {
    queue([{ allowed: true, hits: 1, retry_after_seconds: 600 }]);
    await enforceRateLimit('emergency_relay', req({ 'x-forwarded-for': '203.0.113.9' }), { subject: 'ip:abc' });
    expect(sqlMock.fn).toHaveBeenCalledTimes(1);
    expect(sqlMock.fn.mock.calls[0].slice(1)).toEqual(['emergency_relay', 'ip:abc', 600, 3]);
  });

  it('the finder buckets have a short window and a daily cap', () => {
    expect(RATE_LIMITS.emergency_relay).toEqual({ limit: 3, windowSeconds: 600 });
    expect(RATE_LIMITS.emergency_relay_daily).toEqual({ limit: 10, windowSeconds: 86400 });
    expect(RATE_LIMITS.emergency_relay_urgent).toEqual({ limit: 1, windowSeconds: 86400 });
  });

  it('emergency buckets key by sender for an anonymous caller (no user id)', async () => {
    queue(
      [{ id: null }], // current_app_user_id() → no user
      [{ allowed: true, hits: 1, retry_after_seconds: 300 }],
    );
    const request = req({ 'x-real-ip': '203.0.113.9' });
    await enforceRateLimit('emergency_public_read', request);
    // subject param (2nd bind) is the sender.
    expect(sqlMock.fn.mock.calls[1].slice(1)[1]).toBe(anonymousSender(request));
  });

  it('does not count an anonymous caller whose address is unknown', async () => {
    queue([{ id: null }]);
    expect(await enforceRateLimit('emergency_public_read', req())).toBeNull();
    expect(sqlMock.fn).toHaveBeenCalledTimes(1); // the identity read only, no counter call
  });
});
