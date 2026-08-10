// POST /api/providers create flow under pawpi_app + FORCE RLS — proves the
// onboarding create succeeds AND is atomic (provider-create-capabilities-rls fix).
//
// Like onboarding-rls, this runs the ACTUAL POST/GET /api/providers route handlers —
// wrapped in withRequestContext — against the embedded DB AS pawpi_app (NOBYPASSRLS),
// so the real create flow runs under FORCE RLS exactly as production R3. It points the
// app singleton at the embedded DB with the pawpi_app role BEFORE importing the route,
// and mocks @/auth so it can drive the session.
//
// Why this exists: the sibling provider-business-rls / provider-capabilities-rls suites
// seed rows directly; neither runs the route's create CTE, so neither caught that
// provider_capabilities (FORCE RLS since 0027) was DENIED when its INSERT shared the
// create CTE's single snapshot (the just-inserted owner staff row was invisible to
// app_is_provider_admin). The fix splits the capabilities INSERT into a separate
// statement AFTER the owner-staff row, in the SAME request transaction.
//
// What it proves:
//   1. happy path — a fresh identity (auth_user_id, NO profile) POSTs a provider; the
//      handler lazily creates the profile, stamps identity, inserts provider + owner
//      staff (CTE), then capabilities (separate statement, now passes app_is_provider_admin).
//      All three row kinds exist; GET lists the new provider.
//   2. atomicity — with the capabilities INSERT forced to fail (privilege revoked), the
//      DB error propagates so withRequestContext's sql.begin rolls back the whole request
//      transaction: NO provider and NO provider_staff row persist. (porsager's begin
//      rejects on a failed statement even though the handler's catch logs+maps it — the
//      framework turns that into the 500; the load-bearing guarantee here is the rollback.)

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { inject } from 'vitest';
import postgres from 'postgres';
import type { Sql } from 'postgres';
import { makeTestSql, resetDb } from './db';

// Drive the session the route reads. The route imports auth() statically and
// requestContext imports it lazily; both resolve to this mock.
const authState = vi.hoisted(() => ({ session: null as any }));
vi.mock('@/auth', () => ({ auth: async () => authState.session }));

let raw: Sql; // privileged superuser: seed, reset, assertions, grant/revoke
let app: Sql; // pawpi_app (for cleanup symmetry with sibling suites)
let appSql: any; // the app's request-aware singleton (now bound to pawpi_app)
let POST: (request: Request) => Promise<Response>;
let GET: (request: Request) => Promise<Response>;

function providersRequest(body?: unknown): Request {
  return new Request('http://localhost/api/providers', {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

/** Seed a bare auth_users row (no profile). Returns its id. */
async function seedAuthUser(email: string, name?: string): Promise<number> {
  const [row] = await raw<{ id: number }[]>`
    insert into auth_users (name, email) values (${name ?? email}, ${email}) returning id
  `;
  return row.id;
}

/** Seed a user_profiles row for an existing auth user. Returns the profile id. */
async function seedProfile(authUserId: number, username: string): Promise<number> {
  const [row] = await raw<{ id: number }[]>`
    insert into user_profiles (auth_user_id, username, onboarding_completed)
    values (${authUserId}, ${username}, true) returning id
  `;
  return row.id;
}

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

  // Point the app singleton at the embedded DB AS pawpi_app, then import the route so
  // its `sql` proxy + withRequestContext run under FORCE RLS like production R3.
  url.username = 'pawpi_app';
  url.password = 'pawpi_app';
  process.env.DATABASE_URL = url.toString();
  process.env.DATABASE_SSL = 'disable';

  appSql = (await import('@/app/api/utils/sql')).default;
  const route = await import('@/app/api/providers/route');
  POST = route.POST as typeof POST;
  GET = route.GET as typeof GET;
});

afterAll(async () => {
  await appSql.end?.();
  await app.end();
  await raw.end();
});

afterEach(async () => {
  await resetDb(raw);
  authState.session = null;
});

describe('POST /api/providers create under pawpi_app + FORCE RLS', () => {
  it('fresh owner: lazily creates the profile, then provider + owner staff + capabilities (201); GET lists it', async () => {
    const authId = await seedAuthUser('biz@example.com', 'Biz Owner'); // NO profile yet
    authState.session = { user: { id: authId, email: 'biz@example.com', name: 'Biz Owner' } };

    const res = await POST(providersRequest({ name: 'Happy Paws', provider_type: 'vet' }));
    expect(res.status).toBe(201);
    const { provider } = await res.json();
    expect(provider.id).toBeTruthy();
    // Default capability seeded from provider_type (ticket 2.1).
    expect(provider.capabilities).toEqual(['vet']);

    // A profile was lazily created for this fresh identity, and owns the provider.
    const [prof] = await raw`select id from user_profiles where auth_user_id = ${authId}`;
    expect(prof).toBeTruthy();

    // All three row kinds exist — capabilities included (the row that was previously
    // denied by RLS inside the single create CTE).
    const [prov] = await raw`select owner_user_profile_id, status from providers where id = ${provider.id}`;
    expect(prov.owner_user_profile_id).toBe(prof.id);

    const staff = await raw`
      select role, status from provider_staff
      where provider_id = ${provider.id} and user_profile_id = ${prof.id}
    `;
    expect(staff).toHaveLength(1);
    expect(staff[0]).toMatchObject({ role: 'owner', status: 'active' });

    const caps = await raw`select capability from provider_capabilities where provider_id = ${provider.id}`;
    expect(caps.map((c: any) => c.capability)).toEqual(['vet']);

    // GET (same session) now lists the provider — no longer the empty Create form.
    const listRes = await GET(providersRequest());
    expect(listRes.status).toBe(200);
    const { providers } = await listRes.json();
    expect(providers.map((p: any) => p.id)).toEqual([provider.id]);
    // Phase 2 nav filtering: the list read aggregates capabilities[] per row — proving
    // the correlated subquery reads provider_capabilities under FORCE RLS as the caller
    // (0027 SELECT allows any active staff of the provider).
    expect(providers[0].capabilities).toEqual(['vet']);
  });

  it('multi-capability create writes every validated capability row', async () => {
    const authId = await seedAuthUser('shop@example.com', 'Vet Shop');
    authState.session = { user: { id: authId, email: 'shop@example.com', name: 'Vet Shop' } };

    const res = await POST(
      providersRequest({ name: 'Vet Shop', provider_type: 'vet', capabilities: ['vet', 'shop'] }),
    );
    expect(res.status).toBe(201);
    const { provider } = await res.json();

    const caps = await raw`select capability from provider_capabilities where provider_id = ${provider.id}`;
    expect(caps.map((c: any) => c.capability).sort()).toEqual(['shop', 'vet']);

    // The list read returns every capability, aggregated + ordered (array_agg ORDER BY).
    const listRes = await GET(providersRequest());
    const { providers } = await listRes.json();
    const listed = providers.find((p: any) => p.id === provider.id);
    expect(listed.capabilities).toEqual(['shop', 'vet']);
  });

  it('ATOMIC: a forced failure on the capabilities insert rolls back the provider + owner staff', async () => {
    // Force statement 2 (the capabilities insert) to fail with a privilege error AFTER
    // the provider + owner-staff CTE has run in the same request transaction.
    await raw`revoke insert on provider_capabilities from pawpi_app`;
    try {
      const authId = await seedAuthUser('rollback@example.com', 'Rollback Co');
      const profileId = await seedProfile(authId, 'rollbackco');
      authState.session = { user: { id: authId, email: 'rollback@example.com', name: 'Rollback Co' } };

      // The caps failure aborts the request transaction; sql.begin's implicit COMMIT
      // then re-throws that same error past the route handler's own try/catch —
      // withRequestContext now catches this uniformly and returns a clean 500 (see
      // its comment), rather than letting the rejection escape uncaught as before.
      const res = await POST(
        providersRequest({ name: 'Doomed', provider_type: 'vet', slug: 'doomed' }),
      );
      expect(res.status).toBe(500);

      // The transaction aborted on the caps failure, so NEITHER the provider NOR the
      // owner-staff row persisted — no half-created provider.
      const provs = await raw`select id from providers where slug = 'doomed'`;
      expect(provs).toHaveLength(0);
      const staff = await raw`select id from provider_staff where user_profile_id = ${profileId}`;
      expect(staff).toHaveLength(0);
      const caps = await raw`select id from provider_capabilities`;
      expect(caps).toHaveLength(0);
    } finally {
      // Restore the grant so it never leaks to other tests (resetDb truncates data, not grants).
      await raw`grant insert on provider_capabilities to pawpi_app`;
    }
  });
});
