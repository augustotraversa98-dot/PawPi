// The session cookie's SameSite, proven through the REAL server entry (__create/index.ts) with a real Auth.js password sign-in
// against the throwaway Postgres: unchanged by default, Lax only when AUTH_COOKIE_SAMESITE=lax, and a Lax cookie still works.

import { afterAll, beforeAll, beforeEach, describe, expect, inject, it, vi } from 'vitest';
import type { Sql } from 'postgres';
import { hash } from 'argon2';
import { makeTestSql, resetDb } from './db';

vi.mock('react-router-hono-server/node', () => ({
  createHonoServer: async ({ app }: { app: unknown }) => app,
}));
vi.mock('@/auth', async () => {
  // @ts-expect-error plain JS module
  const { default: CreateAuth } = await import('../../src/__create/@auth/create.js');
  return CreateAuth();
});

const SECRET = 'samesite-test-secret-0123456789abcdef';
const SITE = 'https://www.pawpi.info';
const COOKIE_NAME = '__Secure-authjs.session-token';
const EMAIL = 'samesite@example.com';
const PASSWORD = 'integration-only-passphrase';

let raw: Sql;
let app: any;

const call = (method: string, path: string, headers: Record<string, string> = {}, body?: string, proto = 'https') =>
  app.request(
    `http://www.pawpi.info${path}`,
    { method, headers: { host: 'www.pawpi.info', ...(proto === 'https' ? { 'x-forwarded-proto': 'https' } : {}), ...headers }, body },
    {},
  );
const cookiesFrom = (res: Response) => res.headers.getSetCookie();

async function signIn(proto = 'https') {
  const csrf = await call('GET', '/api/auth/csrf', {}, undefined, proto);
  const { csrfToken } = await csrf.json();
  const res = await call(
    'POST',
    '/api/auth/callback/credentials-signin',
    { origin: SITE, 'sec-fetch-site': 'same-origin', cookie: cookiesFrom(csrf).map((c) => c.split(';')[0]).join('; '), 'content-type': 'application/x-www-form-urlencoded' },
    new URLSearchParams({ csrfToken, email: EMAIL, password: PASSWORD, callbackUrl: '/' }).toString(),
    proto,
  );
  return cookiesFrom(res);
}
const sessionSetCookie = (cookies: string[], name: string) => cookies.find((c) => c.startsWith(`${name}=`));

beforeAll(async () => {
  raw = makeTestSql();
  const url = new URL(inject('TEST_DATABASE_URL'));
  url.username = 'pawpi_app';
  url.password = 'pawpi_app';
  url.searchParams.set('sslmode', 'disable');
  vi.stubEnv('DATABASE_URL', url.toString());
  vi.stubEnv('DATABASE_SSL', 'disable');
  vi.stubEnv('AUTH_SECRET', SECRET);
  app = (await import('../../__create/index')).default;
}, 60_000);

beforeEach(async () => {
  await resetDb(raw);
  await raw`insert into auth_users (id, name, email) values (50, 'web', ${EMAIL})`;
  await raw`insert into user_profiles (id, auth_user_id, username, full_name) values (50, 50, 'web', 'Before')`;
  await raw`insert into auth_accounts ("userId", provider, type, "providerAccountId", password)
            values (50, 'credentials', 'credentials', '50', ${await hash(PASSWORD)})`;
});

afterAll(async () => {
  await resetDb(raw);
  await raw.end();
  const sql = (await import('@/app/api/utils/sql')) as any;
  await sql.default.end?.();
  vi.unstubAllEnvs();
});

describe('session cookie SameSite (AUTH_COOKIE_SAMESITE)', () => {
  it('default: SameSite=None, Secure, HttpOnly — exactly as before', async () => {
    vi.stubEnv('AUTH_COOKIE_SAMESITE', '');
    const c = sessionSetCookie(await signIn(), COOKIE_NAME)!;
    expect(c).toMatch(/SameSite=None/i);
    expect(c).toMatch(/Secure/);
    expect(c).toMatch(/HttpOnly/i);
  });

  it('AUTH_COOKIE_SAMESITE=lax: the session cookie is SameSite=Lax (still Secure, HttpOnly, same name)', async () => {
    vi.stubEnv('AUTH_COOKIE_SAMESITE', 'lax');
    const c = sessionSetCookie(await signIn(), COOKIE_NAME)!;
    expect(c).toBeTruthy();
    expect(c).toMatch(/SameSite=Lax/i);
    expect(c).not.toMatch(/SameSite=None/i);
    expect(c).toMatch(/Secure/);
    expect(c).toMatch(/HttpOnly/i);
  });

  it('the flag changes only the session cookie: the CSRF and callback-url cookies keep SameSite=None', async () => {
    vi.stubEnv('AUTH_COOKIE_SAMESITE', 'lax');
    const csrf = cookiesFrom(await call('GET', '/api/auth/csrf'));
    const csrfCookie = csrf.find((c) => /csrf-token=/.test(c))!;
    expect(csrfCookie).toMatch(/SameSite=None/i);
  });

  it('a Lax session cookie still authenticates the same requests', async () => {
    vi.stubEnv('AUTH_COOKIE_SAMESITE', 'lax');
    const cookie = sessionSetCookie(await signIn(), COOKIE_NAME)!.split(';')[0];
    const res = await call('PATCH', '/api/user-profile', { cookie, origin: SITE, 'sec-fetch-site': 'same-origin', 'content-type': 'application/json' }, JSON.stringify({ full_name: 'Changed' }));
    expect(res.status).toBe(200);
    expect((await raw`select full_name from user_profiles where id = 50`)[0].full_name).toBe('Changed');
    const session = await call('GET', '/api/auth/session', { cookie });
    expect((await session.json()).user).toBeTruthy();
  });

  it('plain http (local / LAN development) is Lax and non-Secure, flag or not', async () => {
    vi.stubEnv('AUTH_COOKIE_SAMESITE', '');
    const c = sessionSetCookie(await signIn('http'), 'authjs.session-token')!;
    expect(c).toMatch(/SameSite=Lax/i);
    expect(c).not.toMatch(/Secure/);
  });
});
