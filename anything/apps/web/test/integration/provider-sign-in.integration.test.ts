// Continue with Google / Apple / Microsoft, end to end through the REAL server entry (__create/index.ts) against the
// throwaway Postgres, with only the providers themselves faked (their discovery and token endpoints). Covers the app's
// system-browser flow and the website's buttons. A browser keeps its session between sign-ins (the phone's does even
// after the app logs out), so each flow starts from whatever was left there.

import { afterAll, beforeAll, beforeEach, describe, expect, inject, it, vi } from 'vitest';
import type { Sql } from 'postgres';
import { hash } from 'argon2';
import { generateKeyPairSync } from 'node:crypto';
import { makeTestSql, resetDb } from './db';

vi.mock('react-router-hono-server/node', () => ({
  createHonoServer: async ({ app }: { app: unknown }) => app,
}));
vi.mock('@/auth', async () => {
  // @ts-expect-error plain JS module
  const { default: CreateAuth } = await import('../../src/__create/@auth/create.js');
  return CreateAuth();
});

const SITE = 'https://www.pawpi.info';
const SESSION = '__Secure-authjs.session-token';
const CLIENT_ID = 'integration-google-client';
const APPLE_WEB_ID = 'com.example.integration.web';
const MS_CLIENT_ID = 'integration-microsoft-client';
const MS_TENANT = '11111111-2222-3333-4444-555555555555';
const MS = 'https://login.microsoftonline.com';
const PASSWORD = 'integration-only-passphrase';
const RETURN = 'pawpi://auth-callback';

let raw: Sql;
let app: any;
// Who the stand-in provider says just signed in, and the nonce it must echo (if the library sent one).
let providerUser: { sub: string; email?: string; name?: string } = { sub: '' };
let providerNonce: string | null = null;

const b64 = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
const json = (value: unknown) => new Response(JSON.stringify(value), { status: 200, headers: { 'content-type': 'application/json' } });

const discovery = (issuer: string, base: string) =>
  json({
    issuer,
    authorization_endpoint: `${base}/authorize`,
    token_endpoint: `${base}/token`,
    userinfo_endpoint: `${base}/userinfo`,
    jwks_uri: `${base}/keys`,
    response_types_supported: ['code'],
    subject_types_supported: ['public'],
    id_token_signing_alg_values_supported: ['RS256'],
    code_challenge_methods_supported: ['S256'],
  });

// The code flow takes the token straight from the provider over TLS, so the library does not check this signature.
function tokens(iss: string, aud: string, extra: Record<string, unknown> = {}) {
  const now = Math.floor(Date.now() / 1000);
  const claims = { iss, aud, iat: now, exp: now + 600, ...providerUser, email_verified: true, ...extra, ...(providerNonce ? { nonce: providerNonce } : {}) };
  return json({ access_token: 'access', token_type: 'bearer', expires_in: 600, id_token: `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64(claims)}.c2ln` });
}

async function fakeProviders(input: RequestInfo | URL): Promise<Response> {
  const url = String(input instanceof Request ? input.url : input);
  const wellKnown = '/.well-known/openid-configuration';
  if (url === `https://accounts.google.com${wellKnown}`) return discovery('https://accounts.google.com', 'https://accounts.google.com/o');
  if (url === 'https://accounts.google.com/o/token') return tokens('https://accounts.google.com', CLIENT_ID);
  if (url === `https://appleid.apple.com${wellKnown}`) return discovery('https://appleid.apple.com', 'https://appleid.apple.com/auth');
  if (url === 'https://appleid.apple.com/auth/token') return tokens('https://appleid.apple.com', APPLE_WEB_ID);
  // Microsoft's shared ("common") document names its issuer as a template; a directory's own document names it outright.
  if (url === `${MS}/common/v2.0${wellKnown}`) return discovery(`${MS}/{tenantid}/v2.0`, `${MS}/common`);
  if (url === `${MS}/${MS_TENANT}/v2.0${wellKnown}`) return discovery(`${MS}/${MS_TENANT}/v2.0`, `${MS}/common`);
  if (url === `${MS}/common/token`) return tokens(`${MS}/${MS_TENANT}/v2.0`, MS_CLIENT_ID, { tid: MS_TENANT });
  throw new Error(`unexpected outbound request in test: ${url}`);
}

// A browser cookie jar: keeps what the server sets, drops what the server expires.
type Jar = Map<string, string>;
function store(jar: Jar, res: Response) {
  for (const line of res.headers.getSetCookie()) {
    const [pair] = line.split(';');
    const i = pair.indexOf('=');
    const name = pair.slice(0, i);
    const value = pair.slice(i + 1);
    const expires = /expires=([^;]+)/i.exec(line)?.[1];
    if (!value || /max-age=0(;|$)/i.test(line) || (expires && Date.parse(expires) < Date.now())) jar.delete(name);
    else jar.set(name, value);
  }
}
async function visit(jar: Jar, method: string, path: string, headers: Record<string, string> = {}, body?: string) {
  const cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
  const res: Response = await app.request(
    `http://www.pawpi.info${path}`,
    { method, headers: { host: 'www.pawpi.info', 'x-forwarded-proto': 'https', ...(cookie ? { cookie } : {}), ...headers }, body },
    {},
  );
  store(jar, res);
  return res;
}
const form = (fields: Record<string, string>) => new URLSearchParams(fields).toString();
const sameOrigin = { origin: SITE, 'sec-fetch-site': 'same-origin', 'content-type': 'application/x-www-form-urlencoded' };

async function passwordSignIn(jar: Jar, email: string) {
  const { csrfToken } = await (await visit(jar, 'GET', '/api/auth/csrf')).json();
  await visit(jar, 'POST', '/api/auth/callback/credentials-signin', sameOrigin, form({ csrfToken, email, password: PASSWORD, callbackUrl: '/' }));
  expect(jar.has(SESSION)).toBe(true);
}

// What the app does: open mobile-start in the browser, let its page post to Auth.js, come back from Google, hand back.
async function continueWithGoogle(jar: Jar, user: typeof providerUser) {
  providerUser = user;
  const start = await visit(jar, 'GET', `/api/auth/mobile-start?provider=google&return=${encodeURIComponent(RETURN)}`, { 'sec-fetch-site': 'none' });
  expect(start.status).toBe(200);
  const callbackUrl = JSON.parse(/var callbackUrl = (".*?");/.exec(await start.text())![1]);
  const { csrfToken } = await (await visit(jar, 'GET', '/api/auth/csrf')).json();
  const signin = await visit(jar, 'POST', '/api/auth/signin/google', sameOrigin, form({ csrfToken, callbackUrl }));
  const authorize = new URL(signin.headers.get('location')!);
  expect(authorize.host).toBe('accounts.google.com');
  providerNonce = authorize.searchParams.get('nonce');
  const query = new URLSearchParams({ code: 'one-time-code' });
  const state = authorize.searchParams.get('state');
  if (state) query.set('state', state);
  const callback = await visit(jar, 'GET', `/api/auth/callback/google?${query}`, { 'sec-fetch-site': 'cross-site' });
  const next = new URL(callback.headers.get('location')!, SITE);
  if (next.pathname !== '/api/auth/mobile-return') return { authorize, failedAt: next.pathname + next.search, token: null, uid: null };
  const back = await visit(jar, 'GET', next.pathname + next.search, { 'sec-fetch-site': 'cross-site' });
  const target = new URL(back.headers.get('location')!);
  return { authorize, failedAt: null, token: target.searchParams.get('token'), uid: Number(target.searchParams.get('uid')) };
}

// The website's button: the page's script asks Auth.js for the provider address, goes there, and comes back.
async function continueOnWebsite(jar: Jar, provider: 'google' | 'apple' | 'microsoft-entra-id', user: typeof providerUser) {
  providerUser = user;
  const { csrfToken } = await (await visit(jar, 'GET', '/api/auth/csrf')).json();
  const signin = await visit(jar, 'POST', `/api/auth/signin/${provider}`, { ...sameOrigin, 'x-auth-return-redirect': '1' }, form({ csrfToken, callbackUrl: `${SITE}/provider` }));
  const flowCookies = signin.headers.getSetCookie();
  const authorize = new URL((await signin.json()).url);
  providerNonce = authorize.searchParams.get('nonce');
  const answer: Record<string, string> = { code: 'one-time-code' };
  const state = authorize.searchParams.get('state');
  if (state) answer.state = state;
  // Apple answers with a form posted from its own site; the others redirect.
  const callback =
    provider === 'apple'
      ? await visit(jar, 'POST', '/api/auth/callback/apple', { origin: 'https://appleid.apple.com', 'sec-fetch-site': 'cross-site', 'content-type': 'application/x-www-form-urlencoded' }, form(answer))
      : await visit(jar, 'GET', `/api/auth/callback/${provider}?${new URLSearchParams(answer)}`, { 'sec-fetch-site': 'cross-site' });
  const landed = new URL(callback.headers.get('location')!, SITE);
  const session = await (await visit(jar, 'GET', '/api/auth/session')).json();
  return { authorize, flowCookies, landed: landed.pathname + landed.search, uid: session?.user?.id ? Number(session.user.id) : null };
}

const googleAccountOwner = async (sub: string) =>
  (await raw`select "userId" from auth_accounts where provider = 'google' and "providerAccountId" = ${sub}`)[0]?.userId;

async function seedPasswordUser(id: number, email: string) {
  await raw`insert into auth_users (id, name, email) values (${id}, ${email}, ${email})`;
  await raw`insert into auth_accounts ("userId", provider, type, "providerAccountId", password)
            values (${id}, 'credentials', 'credentials', ${String(id)}, ${await hash(PASSWORD)})`;
}

beforeAll(async () => {
  raw = makeTestSql();
  const url = new URL(inject('TEST_DATABASE_URL'));
  url.username = 'pawpi_app';
  url.password = 'pawpi_app';
  url.searchParams.set('sslmode', 'disable');
  vi.stubEnv('DATABASE_URL', url.toString());
  vi.stubEnv('DATABASE_SSL', 'disable');
  vi.stubEnv('AUTH_SECRET', 'google-session-test-secret-0123456789');
  vi.stubEnv('AUTH_GOOGLE_ID', CLIENT_ID);
  vi.stubEnv('AUTH_GOOGLE_SECRET', 'integration-google-secret');
  vi.stubEnv('AUTH_APPLE_WEB_ID', APPLE_WEB_ID);
  vi.stubEnv('AUTH_APPLE_TEAM_ID', 'TEAM123456');
  vi.stubEnv('AUTH_APPLE_KEY_ID', 'KEY1234567');
  vi.stubEnv('AUTH_APPLE_PRIVATE_KEY', generateKeyPairSync('ec', { namedCurve: 'prime256v1' }).privateKey.export({ type: 'pkcs8', format: 'pem' }).toString());
  vi.stubEnv('AUTH_MICROSOFT_ID', MS_CLIENT_ID);
  vi.stubEnv('AUTH_MICROSOFT_SECRET', 'integration-microsoft-secret');
  vi.stubGlobal('fetch', fakeProviders);
  app = (await import('../../__create/index')).default;
}, 60_000);

beforeEach(async () => {
  await resetDb(raw);
  await seedPasswordUser(50, 'first@example.com');
  // Leave room above the explicit ids so users created by the sign-in adapter do not collide with them.
  await raw`select setval(pg_get_serial_sequence('auth_users', 'id'), 1000)`;
});

afterAll(async () => {
  await resetDb(raw);
  await raw.end();
  const sql = (await import('@/app/api/utils/sql')) as any;
  await sql.default.end?.();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('Continue with Google when the phone browser still holds an earlier session', () => {
  it('a Google account new to PawPi gets its OWN account, never the earlier user’s', async () => {
    const browser: Jar = new Map();
    await passwordSignIn(browser, 'first@example.com');

    const result = await continueWithGoogle(browser, { sub: 'google-new', email: 'second@example.com', name: 'Second' });

    expect(result.failedAt).toBeNull();
    const owner = await googleAccountOwner('google-new');
    expect(owner).not.toBe(50);
    expect(result.uid).toBe(owner);
    expect((await raw`select email from auth_users where id = ${owner}`)[0].email).toBe('second@example.com');
    expect(await raw`select 1 from auth_accounts where "userId" = 50 and provider = 'google'`).toHaveLength(0);
  });

  it('switching between two Google accounts signs in to the one chosen, each time', async () => {
    const browser: Jar = new Map();
    const one = { sub: 'google-one', email: 'one@example.com', name: 'One' };
    const two = { sub: 'google-two', email: 'two@example.com', name: 'Two' };

    const first = await continueWithGoogle(browser, one);
    const second = await continueWithGoogle(browser, two);
    const again = await continueWithGoogle(browser, one);

    expect([first.failedAt, second.failedAt, again.failedAt]).toEqual([null, null, null]);
    expect(second.uid).not.toBe(first.uid);
    expect(again.uid).toBe(first.uid);
    expect(await googleAccountOwner('google-two')).toBe(second.uid);
  });

  it('a Google sign-in whose email matches an existing PawPi account still joins that account', async () => {
    const result = await continueWithGoogle(new Map(), { sub: 'google-first', email: 'first@example.com', name: 'First' });
    expect(result.uid).toBe(50);
  });

  it('the token handed to the app can record the Terms acceptance it showed', async () => {
    const result = await continueWithGoogle(new Map(), { sub: 'google-terms', email: 'terms@example.com', name: 'Terms' });
    // What the app sends: a Bearer token and no cookies.
    const res = await visit(new Map(), 'POST', '/api/legal/consent', { authorization: `Bearer ${result.token}`, 'content-type': 'application/json' }, JSON.stringify({ source: 'mobile_social' }));
    expect(res.status).toBe(200);
    expect(await raw`select source from legal_consents where auth_user_id = ${result.uid!}`).toEqual([{ source: 'mobile_social' }]);
  });

  it('a visit to mobile-start sent by another website leaves the browser session alone', async () => {
    const browser: Jar = new Map();
    await passwordSignIn(browser, 'first@example.com');
    await visit(browser, 'GET', '/api/auth/mobile-start?provider=google', { 'sec-fetch-site': 'cross-site' });
    expect(browser.has(SESSION)).toBe(true);
  });

  it('Google is asked to show its account list, with the same scopes as before', async () => {
    const { authorize } = await continueWithGoogle(new Map(), { sub: 'google-list', email: 'list@example.com', name: 'List' });
    expect(authorize.searchParams.get('prompt')).toBe('select_account');
    expect(authorize.searchParams.get('scope')!.split(' ').sort()).toEqual(['email', 'openid', 'profile']);
  });
});

describe('the website buttons for businesses', () => {
  it('lists Google, Apple and Microsoft once their keys are set', async () => {
    const providers = await (await visit(new Map(), 'GET', '/api/auth/providers')).json();
    expect(Object.keys(providers)).toEqual(expect.arrayContaining(['google', 'apple', 'microsoft-entra-id']));
  });

  it('a different Google account never joins whoever was signed in on that computer', async () => {
    const browser: Jar = new Map();
    await passwordSignIn(browser, 'first@example.com');
    const result = await continueOnWebsite(browser, 'google', { sub: 'google-web', email: 'web@example.com', name: 'Web' });
    expect(result.landed).toBe('/provider');
    expect(result.uid).not.toBe(50);
    expect(result.uid).toBe(await googleAccountOwner('google-web'));
  });

  it('a sign-in request that fails the form check leaves the session alone', async () => {
    const browser: Jar = new Map();
    await passwordSignIn(browser, 'first@example.com');
    await visit(browser, 'POST', '/api/auth/signin/google', sameOrigin, form({ csrfToken: 'not-the-token', callbackUrl: '/' }));
    expect(browser.has(SESSION)).toBe(true);
  });

  it('Apple on the website reaches the account made with Apple in the app', async () => {
    await seedPasswordUser(60, 'apple-owner@example.com');
    await raw`insert into auth_accounts ("userId", provider, type, "providerAccountId") values (60, 'apple', 'oidc', 'apple-subject')`;
    const result = await continueOnWebsite(new Map(), 'apple', { sub: 'apple-subject', email: 'apple-owner@example.com' });
    expect(result.authorize.searchParams.get('client_id')).toBe(APPLE_WEB_ID);
    expect(result.authorize.searchParams.get('response_mode')).toBe('form_post');
    // Apple posts back from its own site, so the browser must be allowed to send these two back.
    for (const name of ['state', 'nonce']) {
      expect(result.flowCookies.find((c) => c.startsWith(`__Secure-authjs.${name}=`))).toMatch(/SameSite=None/i);
    }
    expect(result.landed).toBe('/provider');
    expect(result.uid).toBe(60);
  });

  it('Microsoft creates an account, and signs the same one in the next time', async () => {
    const who = { sub: 'ms-subject', email: 'clinic@example.com', name: 'Clinic' };
    const first = await continueOnWebsite(new Map(), 'microsoft-entra-id', who);
    const second = await continueOnWebsite(new Map(), 'microsoft-entra-id', who);
    expect(first.authorize.searchParams.get('prompt')).toBe('select_account');
    expect([first.landed, second.landed]).toEqual(['/provider', '/provider']);
    expect(first.uid).toBeTruthy();
    expect(second.uid).toBe(first.uid);
    expect(await raw`select 1 from auth_accounts where provider = 'microsoft-entra-id' and "userId" = ${first.uid!}`).toHaveLength(1);
  });

  it('a Microsoft address that matches an existing account does NOT open it', async () => {
    const result = await continueOnWebsite(new Map(), 'microsoft-entra-id', { sub: 'ms-stranger', email: 'first@example.com', name: 'Stranger' });
    expect(result.landed).toMatch(/^\/account\/signin\?error=OAuthAccountNotLinked/);
    expect(result.uid).toBeNull();
    expect(await raw`select 1 from auth_accounts where provider = 'microsoft-entra-id'`).toHaveLength(0);
  });
});
