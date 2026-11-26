// The callers of /api that are not PawPi's own web pages, each driven the way it really calls the server, over real
// HTTP, through the real server entry (__create/index.ts) and real Postgres: the mobile app, the payment providers'
// notifications, the five scheduled jobs (through scripts/cron/cron-trigger.mjs itself) and Apple / Google sign-in.
// Outside services (Apple keys, Google, file storage) are stubbed at fetch; every credential here is a test value.

import { afterAll, beforeAll, beforeEach, describe, expect, inject, it, vi } from 'vitest';
import type { Sql } from 'postgres';
import type { AddressInfo } from 'node:net';
import { createHash, createHmac, generateKeyPairSync, sign } from 'node:crypto';
import { serve } from '@hono/node-server';
import { encode } from '@auth/core/jwt';
// @ts-expect-error plain JS module
import { runJob } from '../../../../../scripts/cron/cron-trigger.mjs';
import { makeTestSql, resetDb, seedOwnerWithPet } from './db';

vi.mock('react-router-hono-server/node', () => ({
  createHonoServer: async ({ app }: { app: unknown }) => app,
}));
vi.mock('@/auth', async () => {
  // @ts-expect-error plain JS module
  const { default: CreateAuth } = await import('../../src/__create/@auth/create.js');
  return CreateAuth();
});

const SECRET = 'request-origin-callers-secret-0123456789';
const CRON = 'integration-cron-value';
const MP_HOOK = 'integration-mp-hook-value';
const BINANCE_SIGNING = 'integration-binance-signing-value';
const APPLE_AUDIENCE = 'com.pawpi.app';
const COOKIE_NAME = '__Secure-authjs.session-token';

const apple = generateKeyPairSync('rsa', { modulusLength: 2048 });
const b64 = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
const jwt = (header: object, claims: object) => {
  const input = `${b64(header)}.${b64(claims)}`;
  return `${input}.${sign('RSA-SHA256', Buffer.from(input), apple.privateKey).toString('base64url')}`;
};
const now = () => Math.floor(Date.now() / 1000);

let raw: Sql;
let server: any;
let base: string;
const realFetch = globalThis.fetch;
const outbound: string[] = [];

// Only calls to the outside services are answered here; calls to the local server go through.
async function stubbedFetch(input: any, init?: any) {
  const url = new URL(typeof input === 'string' ? input : (input.url ?? input.href));
  if (url.hostname === '127.0.0.1') return realFetch(input, init);
  outbound.push(`${url.hostname}${url.pathname}`);
  if (url.href === 'https://appleid.apple.com/auth/keys') {
    return Response.json({ keys: [{ ...apple.publicKey.export({ format: 'jwk' }), kid: 'k1', alg: 'RS256', use: 'sig' }] });
  }
  if (url.pathname === '/.well-known/openid-configuration') {
    return Response.json({
      issuer: 'https://accounts.google.com',
      authorization_endpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
      token_endpoint: 'https://oauth2.googleapis.com/token',
      userinfo_endpoint: 'https://openidconnect.googleapis.com/v1/userinfo',
      jwks_uri: 'https://www.googleapis.com/oauth2/v3/certs',
      code_challenge_methods_supported: ['S256'],
      id_token_signing_alg_values_supported: ['RS256'],
    });
  }
  if (url.hostname === 'oauth2.googleapis.com') {
    const claims = { iss: 'https://accounts.google.com', aud: 'google-client', sub: 'g-1', email: 'g@example.com', name: 'G', iat: now(), exp: now() + 600 };
    return Response.json({ access_token: 'test', token_type: 'Bearer', expires_in: 600, id_token: jwt({ alg: 'RS256', kid: 'k1' }, claims) });
  }
  if (url.hostname === 'storage.example.test') return Response.json({ Key: 'ok' });
  throw new Error(`unexpected outbound request to ${url.hostname}`);
}

// A tiny cookie jar, as a browser or the app's native networking keeps one.
function client() {
  const jar = new Map<string, string>();
  return {
    jar,
    async request(path: string, init: RequestInit & { headers?: Record<string, string> } = {}) {
      const res = await realFetch(`${base}${path}`, {
        redirect: 'manual',
        ...init,
        headers: {
          'x-forwarded-proto': 'https',
          ...(jar.size ? { cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; ') } : {}),
          ...init.headers,
        },
      });
      for (const line of res.headers.getSetCookie()) {
        const [pair] = line.split(';');
        const at = pair.indexOf('=');
        const value = pair.slice(at + 1);
        if (value) jar.set(pair.slice(0, at), value);
        else jar.delete(pair.slice(0, at));
      }
      return res;
    },
  };
}

const form = (fields: Record<string, string>) => ({
  method: 'POST',
  body: new URLSearchParams(fields).toString(),
});
const FORM_TYPE = { 'content-type': 'application/x-www-form-urlencoded' };
const bearer = async (sub = '1') => ({
  authorization: `Bearer ${await encode({ token: { sub }, secret: SECRET, salt: COOKIE_NAME })}`,
});

beforeAll(async () => {
  raw = makeTestSql();
  const url = new URL(inject('TEST_DATABASE_URL'));
  url.username = 'pawpi_app';
  url.password = 'pawpi_app';
  url.searchParams.set('sslmode', 'disable');
  for (const [key, value] of Object.entries({
    DATABASE_URL: url.toString(),
    DATABASE_SSL: 'disable',
    AUTH_SECRET: SECRET,
    CRON_SECRET: CRON,
    MP_CLIENT_ID: 'mp-client',
    MP_CLIENT_SECRET: 'mp-client-value',
    MP_WEBHOOK_SECRET: MP_HOOK,
    BINANCE_PAY_API_KEY: 'binance-key-value',
    BINANCE_PAY_API_SECRET: BINANCE_SIGNING,
    AUTH_APPLE_ID: APPLE_AUDIENCE,
    AUTH_GOOGLE_ID: 'google-client',
    AUTH_GOOGLE_SECRET: 'google-client-value',
    SUPABASE_URL: 'https://storage.example.test',
    SUPABASE_SERVICE_ROLE_KEY: 'storage-value',
    CORS_ORIGINS: '',
  })) {
    vi.stubEnv(key, value);
  }
  const app = (await import('../../__create/index')).default as any;
  vi.stubGlobal('fetch', stubbedFetch);
  await new Promise<void>((resolve) => {
    server = serve({ fetch: app.fetch, port: 0, hostname: '127.0.0.1', overrideGlobalObjects: false }, (info: AddressInfo) => {
      base = `http://127.0.0.1:${info.port}`;
      resolve();
    });
  });
}, 60_000);

beforeEach(async () => {
  await resetDb(raw);
  await seedOwnerWithPet(raw, { authUserId: 1, profileId: 1, username: 'owner', fullName: 'Before', petId: 1, petName: 'Rex' });
  // The seed writes explicit ids; new sign-ins must not collide with them.
  await raw`select setval(pg_get_serial_sequence('auth_users', 'id'), 100)`;
  await raw`select setval(pg_get_serial_sequence('user_profiles', 'id'), 100)`;
});

afterAll(async () => {
  server?.close();
  await resetDb(raw);
  await raw.end();
  const sql = (await import('@/app/api/utils/sql')) as any;
  await sql.default.end?.();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

// The app's networking (React Native fetch, expo/fetch) adds no Origin header.
describe('mobile app', () => {
  it('signed in with a Bearer token: reads and changes', async () => {
    const app = client();
    const headers = { ...(await bearer()), 'content-type': 'application/json' };
    expect((await app.request('/api/user-profile', { headers })).status).toBe(200);
    const patch = await app.request('/api/user-profile', { method: 'PATCH', headers, body: '{"full_name":"Changed"}' });
    expect(patch.status).toBe(200);
    expect((await raw`select full_name from user_profiles where id = 1`)[0].full_name).toBe('Changed');
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      const res = await app.request('/api/no-such-route', { method, headers });
      expect(res.status).toBe(404); // past the check, answered by the router
    }
  });

  it.each([
    ['with the Bearer token', true],
    ['with the cookie the native jar kept, as well', false],
  ])('signed in, uploads a photo %s', async (_label, bearerOnly) => {
    const app = client();
    if (!bearerOnly) app.jar.set(COOKIE_NAME, (await bearer()).authorization.slice('Bearer '.length));
    const body = new FormData();
    body.append('file', new Blob([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], { type: 'image/png' }), 'a.png');
    const res = await app.request('/api/upload', { method: 'POST', headers: await bearer(), body });
    expect(res.status).toBe(200);
    expect((await res.json()).url).toContain('https://storage.example.test/');
  });

  it('signed out: telemetry, diagnostics and the password reset request', async () => {
    for (const path of ['/api/telemetry/events', '/api/client-diagnostics', '/api/account/forgot-password']) {
      const res = await client().request(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
      expect(await res.text()).not.toContain('cross_site_request'); // the route's own answer
      expect(res.status).not.toBe(404);
      console.info(`signed out ${path} -> ${res.status}`);
    }
  });
});

describe('payment provider notifications (signed the way each provider signs)', () => {
  it('MercadoPago', async () => {
    const ts = String(now());
    const signature = createHmac('sha256', MP_HOOK).update(`id:123;request-id:req-1;ts:${ts};`).digest('hex');
    const res = await client().request('/api/payments/webhooks/mercadopago?data.id=123&type=merchant_order', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-signature': `ts=${ts},v1=${signature}`, 'x-request-id': 'req-1' },
      body: JSON.stringify({ type: 'merchant_order', data: { id: '123' } }),
    });
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
  });

  it('Binance Pay', async () => {
    const body = JSON.stringify({ bizStatus: 'PAY_SUCCESS', data: '{"merchantTradeNo":"unknown"}' });
    const signature = createHmac('sha512', BINANCE_SIGNING).update(`1\nn\n${body}\n`).digest('hex').toUpperCase();
    const res = await client().request('/api/payments/webhooks/binance', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'binancepay-timestamp': '1', 'binancepay-nonce': 'n', 'binancepay-signature': signature },
      body,
    });
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
  });
});

describe('scheduled jobs, run by scripts/cron/cron-trigger.mjs', () => {
  it.each(['push-receipts', 'subscriptions', 'winback', 'weekly-digest', 'calendar-sync'])('%s answers 2xx', async (job) => {
    const lines: string[] = [];
    const code = await runJob(job, { CRON_BASE_URL: base, CRON_SECRET: CRON, CRON_RETRIES: '0' }, { log: (l: string) => lines.push(l) });
    expect(lines.join('\n')).toMatch(/status=2\d\d .*OK/);
    expect(code).toBe(0);
  });
});

describe('sign in with Apple (app)', () => {
  // The same three requests, with the same headers, as mobile/src/utils/auth/socialAuth.js: no Origin.
  it('exchanges the identity token for a session that can make changes', async () => {
    const app = client();
    const { csrfToken } = await (await app.request('/api/auth/csrf')).json();
    const nonce = 'raw-nonce';
    const identityToken = jwt(
      { alg: 'RS256', kid: 'k1' },
      { iss: 'https://appleid.apple.com', aud: APPLE_AUDIENCE, sub: 'apple-1', email: 'a@example.com', exp: now() + 600, nonce: createHash('sha256').update(nonce).digest('hex') },
    );
    await app.request('/api/auth/callback/apple-native', {
      ...form({ csrfToken, callbackUrl: `${base}/api/auth/token`, identityToken, rawNonce: nonce, json: 'true' }),
      headers: FORM_TYPE,
    });
    const token = await (await app.request('/api/auth/token')).json();
    expect(token.jwt).toBeTruthy();
    const headers = { authorization: `Bearer ${token.jwt}` };
    expect((await app.request('/api/user-profile', { headers })).status).toBe(200);
    const change = await app.request('/api/user-profile', {
      method: 'PATCH',
      headers: { ...headers, 'content-type': 'application/json' },
      body: '{"full_name":"Apple"}',
    });
    expect(change.status).toBe(200);
  });

  // The production handler registers no web Apple provider; a form_post from Apple's page still reaches Auth.js.
  it('a form_post from appleid.apple.com is answered by Auth.js', async () => {
    const res = await client().request('/api/auth/callback/apple', {
      ...form({ code: 'x', state: 'y' }),
      headers: { ...FORM_TYPE, origin: 'https://appleid.apple.com', 'sec-fetch-site': 'cross-site' },
    });
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toContain('error=');
  });
});

describe('sign in with Google', () => {
  const site = () => base.replace('http:', 'https:');

  it.each([
    ['web', 'a current browser', '/provider', () => ({ origin: site(), 'sec-fetch-site': 'same-origin' })],
    ['web', 'a browser without Sec-Fetch-Site', '/provider', () => ({ origin: site() })],
    ['app', 'a current browser', '/api/auth/mobile-return?return=pawpi%3A%2F%2Fauth-callback', () => ({ origin: 'null', 'sec-fetch-site': 'same-origin' })],
    ['app', 'a browser without Sec-Fetch-Site', '/api/auth/mobile-return?return=pawpi%3A%2F%2Fauth-callback', () => ({ origin: 'null' })],
  ])('%s path, %s: start, provider callback, session, change', async (path, _browser, callbackUrl, startHeaders) => {
    const browser = client();
    if (path === 'app') expect((await browser.request('/api/auth/mobile-start?provider=google')).status).toBe(200);
    const { csrfToken } = await (await browser.request('/api/auth/csrf')).json();

    const start = await browser.request('/api/auth/signin/google', {
      ...form({ csrfToken, callbackUrl }),
      headers: { ...FORM_TYPE, ...(startHeaders() as Record<string, string>) },
    });
    expect(start.status).toBe(302);
    expect(start.headers.get('location')).toContain('https://accounts.google.com/o/oauth2/v2/auth');

    const callback = await browser.request('/api/auth/callback/google?code=test-code', {
      headers: { 'sec-fetch-site': 'cross-site' },
    });
    expect(callback.status).toBe(302);
    expect(browser.jar.has(COOKIE_NAME)).toBe(true);

    let headers: Record<string, string> = { origin: site(), 'sec-fetch-site': 'same-origin' };
    if (path === 'app') {
      const back = await browser.request(callbackUrl);
      const target = new URL(back.headers.get('location')!);
      expect(target.protocol).toBe('pawpi:');
      headers = { authorization: `Bearer ${target.searchParams.get('token')}` };
      browser.jar.clear(); // the app holds only the token
    }
    expect((await browser.request('/api/user-profile', { headers })).status).toBe(200);
    const change = await browser.request('/api/user-profile', {
      method: 'PATCH',
      headers: { ...headers, 'content-type': 'application/json' },
      body: '{"full_name":"Google"}',
    });
    expect(change.status).toBe(200);
  });
});
