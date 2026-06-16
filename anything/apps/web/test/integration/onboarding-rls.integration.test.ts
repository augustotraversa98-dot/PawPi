// NEW-USER onboarding under pawpi_app + FORCE RLS — proves the R3 cutover is safe
// for brand-new signups (ticket/onboarding-rls-compat).
//
// Unlike the other integration files, this one runs the ACTUAL POST /api/pets route
// handler — wrapped in withRequestContext — against the embedded DB AS pawpi_app
// (NOBYPASSRLS), so the real lazy-create-profile-then-insert-pet flow is exercised
// under FORCE RLS exactly as production will after the DATABASE_URL cutover. To do
// that it points the app singleton at the embedded DB with the pawpi_app role BEFORE
// importing the route, and mocks @/auth so it can drive the session.
//
// What it proves:
//   1. happy path — a fresh identity (auth_user_id with NO profile) POSTs a pet; the
//      handler lazily creates the profile, stamps identity (setCurrentUserId), and the
//      SAME-request pet INSERT passes WITH CHECK. The pet is owned by the new PROFILE
//      id and is visible to that identity.
//   2. control — the same create-profile-then-insert-pet sequence WITHOUT the identity
//      stamp is DENIED by RLS, proving setCurrentUserId is load-bearing (the fix).
//   3. collision — a taken username is uniquified, never a raw 23505 → 500.
//   4. existing user — a pre-existing profile path is unchanged (identity resolves at
//      request start; no in-handler stamp needed).

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { inject } from 'vitest';
import postgres from 'postgres';
import type { Sql } from 'postgres';
import { makeTestSql, resetDb } from './db';

// Drive the session the route reads. The route imports auth() statically and
// requestContext imports it lazily; both resolve to this mock.
const authState = vi.hoisted(() => ({ session: null as any }));
vi.mock('@/auth', () => ({ auth: async () => authState.session }));

let raw: Sql; // privileged superuser: seed, reset, assertions
let app: Sql; // pawpi_app: control flow + read-back-as-identity
let appSql: any; // the app's request-aware singleton (now bound to pawpi_app)
let POST: (request: Request) => Promise<Response>;

/** Run `fn` as pawpi_app inside one transaction stamped with `userId` (or no id). */
function asApp<T>(userId: number | null, fn: (tx: Sql) => Promise<T>): Promise<T> {
  return app.begin(async (tx) => {
    await tx`select set_config('app.current_user_id', ${userId === null ? '' : String(userId)}, true)`;
    return fn(tx);
  });
}

function petRequest(body: unknown): Request {
  return new Request('http://localhost/api/pets', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
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
  POST = (await import('@/app/api/pets/route')).POST as typeof POST;
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

describe('new-user onboarding under pawpi_app + FORCE RLS (R3 cutover safety)', () => {
  it('POST lazily creates the profile AND the pet; pet is owned by the new profile and visible to that identity', async () => {
    const authId = await seedAuthUser('newbie@example.com', 'New Bie'); // NO profile yet
    authState.session = { user: { id: authId, email: 'newbie@example.com', name: 'New Bie' } };

    const res = await POST(petRequest({ name: 'Rex' }));
    expect(res.status).toBe(201);
    const { pet } = await res.json();

    // A profile was lazily created for this fresh identity...
    const [prof] = await raw`select id from user_profiles where auth_user_id = ${authId}`;
    expect(prof).toBeTruthy();
    // ...and the pet is owned by that PROFILE id (never the auth id — the bug class)...
    expect(pet.owner_user_id).toBe(prof.id);
    // ...and it is visible to that identity under RLS (owner read), proving the
    // same-request INSERT passed WITH CHECK rather than being denied.
    const visible = await asApp(prof.id, (tx) => tx`select name from pets where id = ${pet.id}`);
    expect(visible).toHaveLength(1);
    expect(visible[0].name).toBe('Rex');
  });

  it('CONTROL: the same create-profile-then-insert-pet sequence WITHOUT the identity stamp is denied by RLS (proves setCurrentUserId is the fix)', async () => {
    // Replicates the handler's lazy-create flow as pawpi_app but SKIPS the identity
    // stamp. user_profiles has RLS disabled, so the profile insert succeeds; the pet
    // INSERT's WITH CHECK (owner_user_id = current_app_user_id()) sees NULL → denied.
    const authId = await seedAuthUser('control@example.com');
    await expect(
      asApp(null, async (tx) => {
        const [prof] = await tx<{ id: number }[]>`
          insert into user_profiles (auth_user_id, username, onboarding_completed)
          values (${authId}, 'control', true) returning id
        `;
        await tx`
          insert into pets (owner_user_id, name, handle)
          values (${prof.id}, 'Rex', 'control-rex')
        `;
      }),
    ).rejects.toThrow(/row-level security/i);
  });

  it('username collision is uniquified — profile still created, no 23505 → 500', async () => {
    // An orphaned/duplicate profile already owns 'augusto'...
    const oldAuth = await seedAuthUser('augusto@old.com');
    await seedProfile(oldAuth, 'augusto');
    // ...a DIFFERENT new identity whose email prefix is also 'augusto' onboards.
    const newAuth = await seedAuthUser('augusto@new.com');
    authState.session = { user: { id: newAuth, email: 'augusto@new.com' } };

    const res = await POST(petRequest({ name: 'Bella' }));
    expect(res.status).toBe(201); // NOT 500

    const [prof] = await raw`select username from user_profiles where auth_user_id = ${newAuth}`;
    expect(prof).toBeTruthy();
    expect(prof.username).not.toBe('augusto'); // uniquified off the taken base
    expect(prof.username).toMatch(/^augusto_\d+$/);
  });

  it('existing-user path is unchanged — pet created under the pre-existing profile, no duplicate profile', async () => {
    const authId = await seedAuthUser('existing@example.com');
    const profileId = await seedProfile(authId, 'existinguser');
    authState.session = { user: { id: authId, email: 'existing@example.com' } };

    const res = await POST(petRequest({ name: 'Spot' }));
    expect(res.status).toBe(201);
    const { pet } = await res.json();
    expect(pet.owner_user_id).toBe(profileId); // identity resolved at request start

    const [{ n }] = await raw`select count(*)::int as n from user_profiles where auth_user_id = ${authId}`;
    expect(n).toBe(1); // no second profile created
  });
});
