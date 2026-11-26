// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const jwt = vi.hoisted(() => ({ session: null }));
vi.mock('@auth/core/jwt', () => ({
  getToken: async ({ raw }) => (jwt.session ? (raw ? 'raw.jwt.value' : jwt.session) : null),
}));

import { GET as returnGet } from './route';
import { GET as startGet } from '../mobile-start/route';
import { NONCE_COOKIE, nonceMatches, readCookie } from '@/app/api/utils/mobileNonce';

const BASE = 'https://www.example.test';
const NONCE = 'a'.repeat(32);

const call = (path, cookie) =>
  returnGet(new Request(`${BASE}${path}`, { headers: cookie ? { cookie } : {} }));
const loc = (res) => res.headers.get('location');
const cleared = (res) => (res.headers.get('set-cookie') ?? '').startsWith(`${NONCE_COOKIE}=;`) && /Max-Age=0/.test(res.headers.get('set-cookie'));

beforeEach(() => {
  jwt.session = { sub: '7', email: 'a@b.test', name: 'A' };
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('GET /api/auth/mobile-return — default (nonce NOT enforced): behaviour is unchanged', () => {
  it('still hands the token back with a session and no nonce (and logs that it was unbound)', async () => {
    const res = await call('/api/auth/mobile-return');
    expect(res.status).toBe(302);
    expect(loc(res)).toMatch(/^pawpi:\/\/auth-callback\?token=raw\.jwt\.value&uid=7/);
    expect(console.warn).toHaveBeenCalledTimes(1);
  });

  it('hands the token back, without a warning, when the nonce cookie matches the URL value', async () => {
    const res = await call(`/api/auth/mobile-return?n=${NONCE}`, `${NONCE_COOKIE}=${NONCE}`);
    expect(loc(res)).toContain('token=raw.jwt.value');
    expect(console.warn).not.toHaveBeenCalled();
  });

  it('still answers error=unauthorized without a session', async () => {
    jwt.session = null;
    expect(loc(await call('/api/auth/mobile-return'))).toBe('pawpi://auth-callback?error=unauthorized');
  });
});

describe('GET /api/auth/mobile-return — enforced (MOBILE_RETURN_REQUIRE_NONCE=1)', () => {
  beforeEach(() => vi.stubEnv('MOBILE_RETURN_REQUIRE_NONCE', '1'));

  it('hands the token back only when the cookie and the URL nonce match', async () => {
    const res = await call(`/api/auth/mobile-return?n=${NONCE}`, `${NONCE_COOKIE}=${NONCE}`);
    expect(loc(res)).toContain('token=raw.jwt.value');
    expect(loc(res)).toContain('uid=7');
  });

  it.each([
    ['a bare visit (no cookie, no value)', '/api/auth/mobile-return', undefined],
    ['a value but no cookie', `/api/auth/mobile-return?n=${NONCE}`, undefined],
    ['a cookie but no value', '/api/auth/mobile-return', `${NONCE_COOKIE}=${NONCE}`],
    ['a mismatched value', `/api/auth/mobile-return?n=${'b'.repeat(32)}`, `${NONCE_COOKIE}=${NONCE}`],
    ['an empty cookie and empty value', '/api/auth/mobile-return?n=', `${NONCE_COOKIE}=`],
  ])('gives no token for %s, even with a valid session', async (_label, path, cookie) => {
    const res = await call(path, cookie);
    expect(loc(res)).toBe('pawpi://auth-callback?error=unauthorized');
    expect(loc(res)).not.toContain('token=');
  });

  it('keeps the requested pawpi:// return target on refusal, and never leaves the app scheme', async () => {
    expect(loc(await call('/api/auth/mobile-return?return=pawpi://elsewhere'))).toBe('pawpi://elsewhere?error=unauthorized');
    expect(loc(await call('/api/auth/mobile-return?return=https://evil.test/x'))).toMatch(/^pawpi:\/\/auth-callback/);
  });
});

describe('the nonce is one-time: the cookie is cleared on every answer', () => {
  it.each([
    ['success', `/api/auth/mobile-return?n=${NONCE}`, `${NONCE_COOKIE}=${NONCE}`, false],
    ['refusal', '/api/auth/mobile-return', undefined, true],
  ])('%s', async (_l, path, cookie, enforce) => {
    if (enforce) vi.stubEnv('MOBILE_RETURN_REQUIRE_NONCE', '1');
    expect(cleared(await call(path, cookie))).toBe(true);
  });
  it('also when there is no session', async () => {
    jwt.session = null;
    expect(cleared(await call('/api/auth/mobile-return'))).toBe(true);
  });
});

describe('mobile-start → mobile-return round trip (what the browser does)', () => {
  it('the nonce mobile-start sets is accepted by mobile-return when enforced', async () => {
    vi.stubEnv('MOBILE_RETURN_REQUIRE_NONCE', '1');
    const start = await startGet(new Request(`${BASE}/api/auth/mobile-start?provider=google`, { headers: { 'x-forwarded-proto': 'https' } }));
    const setCookie = start.headers.get('set-cookie');
    const cookieValue = setCookie.split(';')[0]; // what the browser sends back: name=value
    const html = await start.text();
    const callbackUrl = JSON.parse(html.match(/var callbackUrl = (".*");/)[1]);
    const res = await call(callbackUrl, cookieValue);
    expect(loc(res)).toContain('token=raw.jwt.value');
    // a second visit with the same (now cleared) state and no cookie is refused
    expect(loc(await call(callbackUrl))).toContain('error=unauthorized');
  });
});

describe('nonce helpers', () => {
  it('nonceMatches is exact and false for empty / non-string input', () => {
    expect(nonceMatches('abc', 'abc')).toBe(true);
    expect(nonceMatches('abc', 'abd')).toBe(false);
    expect(nonceMatches('abc', 'abcd')).toBe(false);
    expect(nonceMatches('', '')).toBe(false);
    expect(nonceMatches(null, 'abc')).toBe(false);
  });
  it('readCookie picks the named cookie among several', () => {
    const req = new Request(BASE, { headers: { cookie: `a=1; ${NONCE_COOKIE}=xyz; b=2` } });
    expect(readCookie(req, NONCE_COOKIE)).toBe('xyz');
    expect(readCookie(req, 'missing')).toBeNull();
  });
});
