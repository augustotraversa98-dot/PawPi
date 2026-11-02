// @vitest-environment node
import { describe, it, expect, afterEach, vi } from 'vitest';
import { Hono } from 'hono';
import { encode, decode } from '@auth/core/jwt';
import {
  sessionGuard,
  resolveJwtLifetimes,
  DEFAULT_JWT_MAX_AGE_SECONDS,
  DEFAULT_JWT_REFRESH_AFTER_SECONDS,
  MAX_JWT_MAX_AGE_SECONDS,
  REFRESHED_TOKEN_HEADER,
} from './sessionGuard';
import { stampSessionExpired, SESSION_EXPIRED_CODE } from './sessionExpiredCode';

const SECRET = 'test-secret-test-secret-test-secret-0123';
const SALT = 'authjs.session-token'; // http test requests => non-secure cookie name
const DAY = 24 * 60 * 60;
const nowS = () => Math.floor(Date.now() / 1000);

afterEach(() => vi.useRealTimers());

// Mint a token as if it had been issued `ageSeconds` ago, with the given lifetime.
async function mintAged({ ageSeconds, maxAge = 30 * DAY, sub = '42', extra = {} }) {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(Date.now() - ageSeconds * 1000);
  try {
    return await encode({
      token: { sub, email: 'a@b.c', name: 'A', ...extra },
      secret: SECRET,
      salt: SALT,
      maxAge,
    });
  } finally {
    vi.useRealTimers();
  }
}

// The real middleware, the real Auth.js encode/decode; only the revocation lookup and env are fakes.
function makeApp({ revoked = () => false, env = {}, routes } = {}) {
  const calls = [];
  const loadRevocation = async () => ({
    isTokenRevoked: async (sub, iat) => {
      calls.push([sub, iat]);
      return revoked(sub, iat, calls.length);
    },
  });
  const app = new Hono();
  app.use('/api/*', stampSessionExpired());
  app.use('/api/*', sessionGuard({ loadRevocation, env: { AUTH_SECRET: SECRET, ...env } }));
  app.get('/api/pets', (c) => c.json({ pets: [] }));
  app.get('/api/boom', (c) => c.json({ error: 'nope' }, 400));
  app.get('/api/missing', (c) => c.json({ error: 'nf' }, 404));
  app.get('/api/auth/token', (c) => c.json({ jwt: 'x' }));
  routes?.(app);
  return { app, calls };
}

const bearer = (token) => ({ headers: { authorization: `Bearer ${token}` } });

describe('resolveJwtLifetimes', () => {
  it('defaults to 30 days and a 24 h refresh threshold', () => {
    expect(resolveJwtLifetimes({})).toEqual({
      maxAge: DEFAULT_JWT_MAX_AGE_SECONDS,
      refreshAfter: DEFAULT_JWT_REFRESH_AFTER_SECONDS,
    });
    expect(DEFAULT_JWT_MAX_AGE_SECONDS).toBe(30 * DAY);
    expect(DEFAULT_JWT_REFRESH_AFTER_SECONDS).toBe(DAY);
  });

  it('honours the env overrides (short device-test values)', () => {
    expect(
      resolveJwtLifetimes({ AUTH_JWT_MAX_AGE_SECONDS: '300', AUTH_JWT_REFRESH_AFTER_SECONDS: '60' }),
    ).toEqual({ maxAge: 300, refreshAfter: 60 });
  });

  it('ignores garbage and non-positive values', () => {
    for (const bad of ['', 'abc', '-5', '0', '1.5', '12abc', ' ']) {
      expect(
        resolveJwtLifetimes({ AUTH_JWT_MAX_AGE_SECONDS: bad, AUTH_JWT_REFRESH_AFTER_SECONDS: bad }),
      ).toEqual({ maxAge: DEFAULT_JWT_MAX_AGE_SECONDS, refreshAfter: DEFAULT_JWT_REFRESH_AFTER_SECONDS });
    }
  });

  it('caps the lifetime at one year', () => {
    expect(resolveJwtLifetimes({ AUTH_JWT_MAX_AGE_SECONDS: '99999999999' }).maxAge).toBe(
      MAX_JWT_MAX_AGE_SECONDS,
    );
  });

  it('keeps the threshold below the lifetime (a token must be refreshable before it expires)', () => {
    // short lifetime, default threshold (24 h) does not fit -> half the lifetime
    expect(resolveJwtLifetimes({ AUTH_JWT_MAX_AGE_SECONDS: '120' })).toEqual({ maxAge: 120, refreshAfter: 60 });
    // explicit threshold >= lifetime is rejected the same way
    expect(
      resolveJwtLifetimes({ AUTH_JWT_MAX_AGE_SECONDS: '120', AUTH_JWT_REFRESH_AFTER_SECONDS: '500' }),
    ).toEqual({ maxAge: 120, refreshAfter: 60 });
    expect(resolveJwtLifetimes({ AUTH_JWT_MAX_AGE_SECONDS: '1' }).refreshAfter).toBe(1);
  });
});

describe('rolling refresh', () => {
  it('hands a Bearer client a fresh token once the token is older than the threshold', async () => {
    const { app } = makeApp();
    const old = await mintAged({ ageSeconds: 2 * DAY, extra: { picture: 'p' } });
    const res = await app.request('/api/pets', bearer(old));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ pets: [] }); // body untouched
    const fresh = res.headers.get(REFRESHED_TOKEN_HEADER);
    expect(fresh).toBeTruthy();
    expect(fresh).not.toBe(old);
    // never cacheable: it carries a credential
    expect(res.headers.get('cache-control')).toBe('private, no-store');

    const claims = await decode({ token: fresh, secret: SECRET, salt: SALT });
    const oldClaims = await decode({ token: old, secret: SECRET, salt: SALT });
    expect(claims.sub).toBe('42');
    expect(claims.email).toBe('a@b.c');
    expect(claims.picture).toBe('p');
    // fresh iat (so a revocation cutoff still orders it after the old one), a new 30-day exp, new jti
    expect(claims.iat).toBeGreaterThanOrEqual(nowS() - 2);
    expect(claims.iat).toBeGreaterThan(oldClaims.iat + DAY);
    expect(claims.exp - claims.iat).toBe(DEFAULT_JWT_MAX_AGE_SECONDS);
    expect(claims.jti).not.toBe(oldClaims.jti);
  });

  it('uses the env lifetime for the refreshed token', async () => {
    const { app } = makeApp({
      env: { AUTH_JWT_MAX_AGE_SECONDS: '300', AUTH_JWT_REFRESH_AFTER_SECONDS: '60' },
    });
    const old = await mintAged({ ageSeconds: 90, maxAge: 300 });
    const res = await app.request('/api/pets', bearer(old));
    const claims = await decode({
      token: res.headers.get(REFRESHED_TOKEN_HEADER),
      secret: SECRET,
      salt: SALT,
    });
    expect(claims.exp - claims.iat).toBe(300);
  });

  it('does not refresh a young token', async () => {
    const { app } = makeApp();
    const young = await mintAged({ ageSeconds: DAY - 120 });
    const res = await app.request('/api/pets', bearer(young));
    expect(res.status).toBe(200);
    expect(res.headers.get(REFRESHED_TOKEN_HEADER)).toBeNull();
    expect(res.headers.get('cache-control')).not.toBe('private, no-store');
  });

  it('a refreshed token is itself young: it is not refreshed again on the next request', async () => {
    const { app } = makeApp();
    const old = await mintAged({ ageSeconds: 2 * DAY });
    const first = await app.request('/api/pets', bearer(old));
    const second = await app.request('/api/pets', bearer(first.headers.get(REFRESHED_TOKEN_HEADER)));
    expect(second.status).toBe(200);
    expect(second.headers.get(REFRESHED_TOKEN_HEADER)).toBeNull();
  });

  it('does not refresh a revoked token (and 401s it)', async () => {
    const { app } = makeApp({ revoked: () => true });
    const old = await mintAged({ ageSeconds: 2 * DAY });
    const res = await app.request('/api/pets', bearer(old));
    expect(res.status).toBe(401);
    expect(res.headers.get(REFRESHED_TOKEN_HEADER)).toBeNull();
    expect((await res.json()).code).toBe(SESSION_EXPIRED_CODE);
  });

  it('does not refresh when the request itself revoked the token (reset-password / sign-out-everywhere)', async () => {
    // 1st lookup (guard) says "still valid"; the handler revokes; the 2nd lookup (pre-mint re-check) says revoked.
    const { app, calls } = makeApp({ revoked: (_s, _i, n) => n >= 2 });
    const old = await mintAged({ ageSeconds: 2 * DAY });
    const res = await app.request('/api/pets', bearer(old));
    expect(res.status).toBe(200);
    expect(calls.length).toBe(2);
    expect(res.headers.get(REFRESHED_TOKEN_HEADER)).toBeNull();
  });

  it('a refreshed token still obeys the revocation cutoff, and the cutoff still kills the older token', async () => {
    // cutoff semantics identical to tokenRevocation.isTokenRevoked: iat*1000 < cutoffMs
    let cutoffMs = null;
    const revoked = (_s, iat) => cutoffMs !== null && iat * 1000 < cutoffMs;
    const { app } = makeApp({ revoked });
    const old = await mintAged({ ageSeconds: 2 * DAY });
    const fresh = (await app.request('/api/pets', bearer(old))).headers.get(REFRESHED_TOKEN_HEADER);

    cutoffMs = Date.now() + 1000; // a password reset "now": everything issued up to now is dead
    const afterReset = await app.request('/api/pets', bearer(fresh));
    expect(afterReset.status).toBe(401); // the refreshed token was issued before the cutoff
    expect((await app.request('/api/pets', bearer(old))).status).toBe(401);

    cutoffMs = (nowS() - 3600) * 1000; // a cutoff an hour ago: the refreshed token (issued now) survives
    expect((await app.request('/api/pets', bearer(fresh))).status).toBe(200);
    expect((await app.request('/api/pets', bearer(old))).status).toBe(401);
  });

  it('never refreshes on a 401 (unauthenticated, expired, garbage)', async () => {
    const { app } = makeApp();
    const none = await app.request('/api/pets');
    expect(none.status).toBe(200); // the guard fails open; per-route auth() decides
    expect(none.headers.get(REFRESHED_TOKEN_HEADER)).toBeNull();

    const garbage = await app.request('/api/pets', bearer('not-a-jwt'));
    expect(garbage.headers.get(REFRESHED_TOKEN_HEADER)).toBeNull();

    // handler-level 401 with a perfectly good old token
    const { app: app401 } = makeApp({
      routes: (a) => a.get('/api/denied', (c) => c.json({ error: 'Unauthorized' }, 401)),
    });
    const old = await mintAged({ ageSeconds: 2 * DAY });
    const res = await app401.request('/api/denied', bearer(old));
    expect(res.status).toBe(401);
    expect(res.headers.get(REFRESHED_TOKEN_HEADER)).toBeNull();
  });

  it('never refreshes on any other 4xx/5xx response', async () => {
    const { app } = makeApp({
      routes: (a) => a.get('/api/err', (c) => c.json({ error: 'x' }, 500)),
    });
    const old = await mintAged({ ageSeconds: 2 * DAY });
    for (const path of ['/api/boom', '/api/missing', '/api/err']) {
      const res = await app.request(path, bearer(old));
      expect(res.headers.get(REFRESHED_TOKEN_HEADER)).toBeNull();
    }
  });

  it('never refreshes on /api/auth/*', async () => {
    const { app, calls } = makeApp();
    const old = await mintAged({ ageSeconds: 2 * DAY });
    const res = await app.request('/api/auth/token', bearer(old));
    expect(res.status).toBe(200);
    expect(res.headers.get(REFRESHED_TOKEN_HEADER)).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it('does not refresh a cookie-only (no Bearer) request', async () => {
    const { app } = makeApp();
    const old = await mintAged({ ageSeconds: 2 * DAY });
    const res = await app.request('/api/pets', { headers: { cookie: `${SALT}=${old}` } });
    expect(res.status).toBe(200);
    expect(res.headers.get(REFRESHED_TOKEN_HEADER)).toBeNull();
  });

  it('does not refresh without AUTH_SECRET configured', async () => {
    const { app } = makeApp({ env: { AUTH_SECRET: '' } });
    const old = await mintAged({ ageSeconds: 2 * DAY });
    const res = await app.request('/api/pets', bearer(old));
    expect(res.headers.get(REFRESHED_TOKEN_HEADER)).toBeNull();
  });

  it('fails open: a revocation lookup that throws never breaks the request and never refreshes', async () => {
    const app = new Hono();
    app.use(
      '/api/*',
      sessionGuard({
        loadRevocation: async () => ({
          isTokenRevoked: async () => {
            throw new Error('db down');
          },
        }),
        env: { AUTH_SECRET: SECRET },
      }),
    );
    app.get('/api/pets', (c) => c.json({ pets: [] }));
    const old = await mintAged({ ageSeconds: 2 * DAY });
    const res = await app.request('/api/pets', bearer(old));
    expect(res.status).toBe(200);
    expect(res.headers.get(REFRESHED_TOKEN_HEADER)).toBeNull();
  });

  it('mints with the __Secure- cookie salt behind https, so the refreshed token decodes on the next request', async () => {
    const { app } = makeApp();
    const secureSalt = '__Secure-authjs.session-token';
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() - 2 * DAY * 1000);
    const old = await encode({ token: { sub: '42' }, secret: SECRET, salt: secureSalt, maxAge: 30 * DAY });
    vi.useRealTimers();
    const https = { 'x-forwarded-proto': 'https' };
    const res = await app.request('/api/pets', { headers: { authorization: `Bearer ${old}`, ...https } });
    const fresh = res.headers.get(REFRESHED_TOKEN_HEADER);
    expect(fresh).toBeTruthy();
    expect(await decode({ token: fresh, secret: SECRET, salt: secureSalt })).toMatchObject({ sub: '42' });
    const next = await app.request('/api/pets', { headers: { authorization: `Bearer ${fresh}`, ...https } });
    expect(next.status).toBe(200);
  });
});

describe('old app builds (21-30) ignore the header', () => {
  it('status, body and content-type are identical with or without a refresh', async () => {
    const { app } = makeApp();
    const young = await mintAged({ ageSeconds: 60 });
    const old = await mintAged({ ageSeconds: 2 * DAY });
    const a = await app.request('/api/pets', bearer(young));
    const b = await app.request('/api/pets', bearer(old));
    expect(b.headers.get(REFRESHED_TOKEN_HEADER)).toBeTruthy();
    expect(b.status).toBe(a.status);
    expect(await b.json()).toEqual(await a.json());
    expect(b.headers.get('content-type')).toBe(a.headers.get('content-type'));
    // The only additions are the new header and the no-store directive; the 401 contract is unchanged
    const bad = await app.request('/api/pets', bearer('garbage'));
    expect(bad.status).toBe(200);
  });

  it('an unchanged client keeps using its own token: both the old and the refreshed token stay valid', async () => {
    const { app } = makeApp();
    const old = await mintAged({ ageSeconds: 2 * DAY });
    const fresh = (await app.request('/api/pets', bearer(old))).headers.get(REFRESHED_TOKEN_HEADER);
    expect((await app.request('/api/pets', bearer(old))).status).toBe(200);
    expect((await app.request('/api/pets', bearer(fresh))).status).toBe(200);
  });
});

describe('existing guard behaviour is unchanged', () => {
  it('401s a ghost (UUID sub) session with the session_expired code', async () => {
    const { app } = makeApp();
    const ghost = await mintAged({ ageSeconds: 10, sub: 'eb5e3d2e-339e-4ebd-83c6-54fbcf3700ba' });
    const res = await app.request('/api/pets', bearer(ghost));
    expect(res.status).toBe(401);
    expect(res.headers.get('x-pawpi-error-code')).toBe(SESSION_EXPIRED_CODE);
    expect((await res.json()).code).toBe(SESSION_EXPIRED_CODE);
  });
});

describe('Auth.js 15 s clock tolerance', () => {
  it('still accepts (and refreshes) a token that expired a few seconds ago, rejects one expired long ago', async () => {
    const { app } = makeApp();
    // issued 2 days ago with a lifetime that ended 10 s ago
    const justExpired = await mintAged({ ageSeconds: 2 * DAY, maxAge: 2 * DAY - 10 });
    const within = await app.request('/api/pets', bearer(justExpired));
    expect(within.status).toBe(200);
    expect(within.headers.get(REFRESHED_TOKEN_HEADER)).toBeTruthy();
    // the refreshed token is a full-lifetime token: the session is saved, not left on its last seconds
    const claims = await decode({
      token: within.headers.get(REFRESHED_TOKEN_HEADER),
      secret: SECRET,
      salt: SALT,
    });
    expect(claims.exp - nowS()).toBeGreaterThan(29 * DAY);

    // expired 60 s ago -> decode throws -> unauthenticated: no refresh, ever
    const longExpired = await mintAged({ ageSeconds: 2 * DAY, maxAge: 2 * DAY - 60 });
    const beyond = await app.request('/api/pets', bearer(longExpired));
    expect(beyond.headers.get(REFRESHED_TOKEN_HEADER)).toBeNull();
    // and the underlying decode really does reject it (the guard treats it as signed out)
    await expect(decode({ token: longExpired, secret: SECRET, salt: SALT })).rejects.toThrow();
  });
});
