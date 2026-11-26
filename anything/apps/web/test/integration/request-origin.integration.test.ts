// Which sites may send a request that changes data to /api, proven through the REAL server entry (__create/index.ts):
// real middleware order, real routes, real Auth.js handler and session cookie, real Postgres as pawpi_app.
// Only the Node listener bootstrap is stubbed (it hands the app back instead of listening).

import { afterAll, beforeAll, beforeEach, describe, expect, inject, it, vi } from 'vitest';
import type { Sql } from 'postgres';
import { hash } from 'argon2';
import { encode } from '@auth/core/jwt';
import { makeTestSql, resetDb, seedOwnerWithPet } from './db';

vi.mock('react-router-hono-server/node', () => ({
  createHonoServer: async ({ app }: { app: unknown }) => app,
}));
// The same auth() the production build uses (vite aliases @auth/create to this shim): it reads the cookie or Bearer token.
vi.mock('@/auth', async () => {
  // @ts-expect-error plain JS module
  const { default: CreateAuth } = await import('../../src/__create/@auth/create.js');
  return CreateAuth();
});

const SECRET = 'request-origin-test-secret-0123456789';
const SITE = 'https://www.pawpi.info';
const LISTED = 'http://localhost:8081';
const COOKIE_NAME = '__Secure-authjs.session-token';
const EMAIL = 'web-signin@example.com';
const PASSWORD = 'integration-only-passphrase';

let raw: Sql;
let app: any;

// What reaches the app behind the TLS proxy: plain http, the public Host, x-forwarded-proto: https.
const call = (method: string, path: string, headers: Record<string, string> = {}, body?: string) =>
  app.request(
    `http://www.pawpi.info${path}`,
    { method, headers: { host: 'www.pawpi.info', 'x-forwarded-proto': 'https', ...headers }, body },
    {}, // c.env, which the Node server always provides
  );

const sessionCookie = async () =>
  `${COOKIE_NAME}=${await encode({ token: { sub: '1' }, secret: SECRET, salt: COOKIE_NAME })}`;

const fullName = async () => (await raw`select full_name from user_profiles where id = 1`)[0].full_name;

const rename = async (headers: Record<string, string>, name = 'Changed') =>
  call(
    'PATCH',
    '/api/user-profile',
    { cookie: await sessionCookie(), 'content-type': 'text/plain', ...headers },
    JSON.stringify({ full_name: name }),
  );

const refusedByOrigin = async (res: Response) =>
  res.status === 403 && (await res.clone().text()).includes('cross_site_request');

beforeAll(async () => {
  raw = makeTestSql();
  const url = new URL(inject('TEST_DATABASE_URL'));
  url.username = 'pawpi_app';
  url.password = 'pawpi_app';
  url.searchParams.set('sslmode', 'disable'); // the auth adapter's own pool
  vi.stubEnv('DATABASE_URL', url.toString());
  vi.stubEnv('DATABASE_SSL', 'disable');
  vi.stubEnv('AUTH_SECRET', SECRET);
  vi.stubEnv('CORS_ORIGINS', LISTED);
  app = (await import('../../__create/index')).default;
}, 60_000);

beforeEach(async () => {
  await resetDb(raw);
  await seedOwnerWithPet(raw, { authUserId: 1, profileId: 1, username: 'owner', fullName: 'Before', petId: 1, petName: 'Rex' });
});

afterAll(async () => {
  await resetDb(raw);
  await raw.end();
  const sql = (await import('@/app/api/utils/sql')) as any;
  await sql.default.end?.();
  vi.unstubAllEnvs();
});

describe('origin check: refused requests', () => {
  it.each([
    ['another website', { origin: 'https://other.example', 'sec-fetch-site': 'cross-site' }],
    ['another website, browser without Sec-Fetch-Site', { origin: 'https://other.example' }],
    ['an opaque origin', { origin: 'null', 'sec-fetch-site': 'cross-site' }],
    ['an opaque origin, browser without Sec-Fetch-Site', { origin: 'null' }],
    ['a sibling subdomain', { origin: 'https://other.pawpi.info', 'sec-fetch-site': 'same-site' }],
    ['the bare domain', { origin: 'https://pawpi.info', 'sec-fetch-site': 'same-site' }],
    ['another port on the same host', { origin: `${SITE}:8443`, 'sec-fetch-site': 'same-site' }],
    ['a look-alike host', { origin: 'https://www.pawpi.info.example' }],
    ['a cross-site label with no Origin', { 'sec-fetch-site': 'cross-site' }],
    ['a non-Bearer Authorization header', { origin: 'https://other.example', authorization: 'Basic eDp5' }],
  ])('%s', async (_label, headers) => {
    const res = await rename(headers as Record<string, string>);
    expect(await refusedByOrigin(res)).toBe(true);
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
    expect(await fullName()).toBe('Before');
  });

  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])('covers %s, including paths with no route', async (method) => {
    const headers = { cookie: await sessionCookie(), origin: 'https://other.example', 'sec-fetch-site': 'cross-site' };
    for (const path of ['/api', '/api/no-such-route', '/api/pets', '/api/care-access/grants']) {
      expect(await refusedByOrigin(await call(method, path, headers))).toBe(true);
    }
  });
});

describe('origin check: served requests', () => {
  it.each([
    ['the web app', { origin: SITE, 'sec-fetch-site': 'same-origin' }],
    ['the web app, browser without Sec-Fetch-Site', { origin: SITE }],
    ['the web app with an explicit default port', { origin: SITE, host: 'www.pawpi.info:443' }],
    ['a same-origin request behind a proxy that rewrites Host', { origin: SITE, host: 'internal:4000', 'sec-fetch-site': 'same-origin' }],
    ['a forwarded public host', { origin: SITE, host: 'internal:4000', 'x-forwarded-host': 'www.pawpi.info' }],
    ['the platform domain', { origin: 'https://pawpi-production.up.railway.app', host: 'pawpi-production.up.railway.app' }],
    ['a user-initiated request', { 'sec-fetch-site': 'none' }],
    ['an origin listed in CORS_ORIGINS', { origin: LISTED, 'sec-fetch-site': 'cross-site' }],
    ['a client that sends neither header', {}],
  ])('%s', async (_label, headers) => {
    const res = await rename(headers as Record<string, string>);
    expect(res.status).toBe(200);
    expect(await fullName()).toBe('Changed');
  });

  it('a Bearer client, whatever its other headers say', async () => {
    const token = await encode({ token: { sub: '1' }, secret: SECRET, salt: COOKIE_NAME });
    const res = await call(
      'PATCH',
      '/api/user-profile',
      { authorization: `Bearer ${token}`, origin: 'http://192.168.0.10:8081', 'sec-fetch-site': 'cross-site', 'content-type': 'application/json' },
      JSON.stringify({ full_name: 'Changed' }),
    );
    expect(res.status).toBe(200);
    expect(await fullName()).toBe('Changed');
  });

  it('reads are not affected', async () => {
    const res = await call('GET', '/api/user-profile', {
      cookie: await sessionCookie(),
      origin: 'https://other.example',
      'sec-fetch-site': 'cross-site',
    });
    expect(res.status).toBe(200);
  });

  it('a preflight from a listed origin is answered', async () => {
    const res = await call('OPTIONS', '/api/user-profile', {
      origin: LISTED,
      'sec-fetch-site': 'cross-site',
      'access-control-request-method': 'PATCH',
    });
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe(LISTED);
  });

  // Server-to-server senders and signed-out app calls: no Origin, no Sec-Fetch-Site. Each route then applies its own rules.
  it.each([
    '/api/payments/webhooks/mercadopago',
    '/api/payments/webhooks/binance',
    '/api/internal/grafana-alert',
    '/api/payments/subscriptions/run',
    '/api/engagement/reengagement/run',
    '/api/engagement/weekly-digest/run',
    '/api/notifications/push-receipts/run',
    '/api/providers/calendar/sync',
    '/api/recalls/ingest',
    '/api/telemetry/events',
    '/api/client-diagnostics',
    '/api/account/forgot-password',
  ])('server and signed-out app calls reach %s', async (path) => {
    const res = await call('POST', path, { 'content-type': 'application/json' }, '{}');
    expect(await refusedByOrigin(res)).toBe(false);
    expect(res.status).not.toBe(404);
  });

  it.each([
    '/api/public/emergency/tag/abc/contact',
    '/api/care-access/invites/preview',
    '/api/account/reset-password',
    '/api/account/forgot-password',
    '/api/telemetry/events',
  ])('signed-out web pages reach %s', async (path) => {
    const res = await call('POST', path, { origin: SITE, 'sec-fetch-site': 'same-origin', 'content-type': 'application/json' }, '{}');
    expect(await refusedByOrigin(res)).toBe(false);
  });

  it.each([
    ['the app (no browser headers)', {}],
    ['the web app', { origin: SITE, 'sec-fetch-site': 'same-origin' }],
  ])('multipart uploads from %s reach the route', async (_label, headers) => {
    const res = await call(
      'POST',
      '/api/upload',
      { ...(headers as Record<string, string>), cookie: await sessionCookie(), 'content-type': 'multipart/form-data; boundary=x' },
      '--x--\r\n',
    );
    expect(await refusedByOrigin(res)).toBe(false);
    expect(res.status).not.toBe(404);
  });

  // The signed token in the link is the only credential; no session is read.
  it('one-click email unsubscribe accepts a POST from a mail client', async () => {
    const res = await call(
      'POST',
      '/api/notification-prefs/email-unsubscribe?t=not-a-token',
      { origin: 'null', 'sec-fetch-site': 'cross-site', 'content-type': 'application/x-www-form-urlencoded' },
      'List-Unsubscribe=One-Click',
    );
    expect(res.status).toBe(400); // the route's own answer for a bad link
  });
});

describe('/api/auth/* keeps using the Auth.js checks', () => {
  const cookiesFrom = (res: Response) => res.headers.getSetCookie().map((c) => c.split(';')[0]);

  it.each([
    ['same-origin', { origin: SITE, 'sec-fetch-site': 'same-origin' }],
    ['a form post from a no-referrer page', { origin: 'null' }],
  ])('password sign-in (%s), then a change with that session', async (_label, headers) => {
    await raw`
      insert into auth_users (id, name, email) values (50, 'web', ${EMAIL})`;
    await raw`insert into user_profiles (id, auth_user_id, username, full_name) values (50, 50, 'web', 'Before')`;
    await raw`
      insert into auth_accounts ("userId", provider, type, "providerAccountId", password)
      values (50, 'credentials', 'credentials', '50', ${await hash(PASSWORD)})`;

    const csrf = await call('GET', '/api/auth/csrf');
    const { csrfToken } = await csrf.json();
    const signIn = await call(
      'POST',
      '/api/auth/callback/credentials-signin',
      { ...(headers as Record<string, string>), cookie: cookiesFrom(csrf).join('; '), 'content-type': 'application/x-www-form-urlencoded' },
      new URLSearchParams({ csrfToken, email: EMAIL, password: PASSWORD, callbackUrl: '/' }).toString(),
    );
    const session = cookiesFrom(signIn).find((c) => c.startsWith(`${COOKIE_NAME}=`));
    expect(session).toBeTruthy();

    const change = await call(
      'PATCH',
      '/api/user-profile',
      { cookie: session!, origin: SITE, 'sec-fetch-site': 'same-origin', 'content-type': 'application/json' },
      JSON.stringify({ full_name: 'Changed' }),
    );
    expect(change.status).toBe(200);
    expect((await raw`select full_name from user_profiles where id = 50`)[0].full_name).toBe('Changed');
  });

  it.each(['/api/auth/signout', '/api/auth/session', '/api/auth/signin/google', '/api/auth/callback/credentials-signin'])(
    '%s without a CSRF token changes nothing',
    async (path) => {
      const res = await call(
        'POST',
        path,
        { cookie: await sessionCookie(), origin: 'https://other.example', 'sec-fetch-site': 'cross-site', 'content-type': 'application/x-www-form-urlencoded' },
        'email=a%40example.com&password=x',
      );
      expect(await refusedByOrigin(res)).toBe(false);
      // Auth.js answers a failed session update with 400, every other action with a redirect that names the error.
      if (path === '/api/auth/session') expect(res.status).toBe(400);
      else expect(res.headers.get('location') ?? '').toContain('MissingCSRF');
      expect(res.headers.getSetCookie().some((c) => c.startsWith(`${COOKIE_NAME}=`))).toBe(false);
    },
  );

  // Posts that arrive from a sign-in provider's page, and the app's browser start page (a form post that carries
  // "Origin: null" in browsers without Sec-Fetch-Site, because our pages send Referrer-Policy: no-referrer).
  it.each([
    ['/api/auth/callback/apple', { origin: 'https://appleid.apple.com', 'sec-fetch-site': 'cross-site' }],
    ['/api/auth/callback/google', { origin: 'https://accounts.google.com', 'sec-fetch-site': 'cross-site' }],
    ['/api/auth/signin/google', { origin: 'null' }],
    ['/api/auth/callback/apple-native', {}],
  ])('sign-in post to %s reaches Auth.js', async (path, headers) => {
    const res = await call(
      'POST',
      path,
      { ...(headers as Record<string, string>), 'content-type': 'application/x-www-form-urlencoded' },
      'code=x',
    );
    expect(await refusedByOrigin(res)).toBe(false);
  });

  it('the other routes under the prefix accept no changes', async () => {
    for (const path of ['token', 'mobile-start', 'mobile-return', 'expo-web-success', 'social-enabled']) {
      const res = await call('POST', `/api/auth/${path}`, { cookie: await sessionCookie() });
      expect(res.status).toBe(404);
    }
  });
});
