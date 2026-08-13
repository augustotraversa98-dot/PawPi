// Adoption applicant thread (ticket A3) — the SHELTER opens/reuses a chat thread WITH an
// applicant, proven through the REAL Hono router (api.request) against the embedded Postgres as
// pawpi_app (FORCE RLS like production). This is the only PROVIDER-initiated thread start; the
// applicant relationship (+ message_threads staff-insert RLS, 0031) is the authorization.
//
// Covers the ticket's required integration surface:
//   1. active staff POST …/[applicationId]/thread CREATES the applicant thread (owner = applicant),
//      then a second POST REUSES the same thread (idempotent — the partial unique index).
//   2. a NON-staff caller (a different provider's admin) → 403 and ZERO threads created.
//   3. a NON-integer id / applicationId → 404 BEFORE any SQL.
//   4. a guest → 401.
//
// Mirrors adoption-applications-v2.integration (auth mock + api.request + asApp) — the same
// real-router pattern.

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { inject } from 'vitest';
import postgres from 'postgres';
import type { Sql } from 'postgres';
import {
  makeTestSql,
  resetDb,
  seedUser,
  seedProvider,
  seedStaff,
  seedCapability,
  seedAdoptableListing,
  seedAdoptionApplication,
} from './db';

const authState = vi.hoisted(() => ({ session: null as any }));
vi.mock('@/auth', () => ({ auth: async () => authState.session }));

const A = { authUserId: 1, profileId: 1, username: 'adopter' }; // the applicant
const SOWN = { authUserId: 3, profileId: 3, username: 'shelterown' }; // shelter owner
const SQ = { authUserId: 4, profileId: 4, username: 'otherprov' }; // a different provider's admin

const SHELTER = 10; // published shelter, holds 'adoption'
const OTHER = 30; // a different published provider (cross-provider control)
const LISTING = 100;
const APP = 500;

let raw: Sql;
let app: Sql;
let api: any;

const sessionFor = (authUserId: number) => ({ user: { id: authUserId } });

function apiReq(path: string, method = 'GET', body?: unknown) {
  return api.request(path, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
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
  url.username = 'pawpi_app';
  url.password = 'pawpi_app';
  process.env.DATABASE_URL = url.toString();
  process.env.DATABASE_SSL = 'disable';
  ({ api } = (await import('../../__create/route-builder')) as any);
});

afterAll(async () => {
  await app.end();
  await raw.end();
});

afterEach(async () => {
  await resetDb(raw);
  authState.session = null;
});

beforeEach(async () => {
  await seedUser(raw, A);
  await seedUser(raw, SOWN);
  await seedUser(raw, SQ);

  await seedProvider(raw, { providerId: SHELTER, ownerUserProfileId: SOWN.profileId, slug: 'shelter', status: 'published' });
  await seedStaff(raw, { providerId: SHELTER, userProfileId: SOWN.profileId, role: 'owner', status: 'active' });
  await seedCapability(raw, { providerId: SHELTER, capability: 'adoption' });

  // A different published adoption provider + its own admin (cross-provider control).
  await seedProvider(raw, { providerId: OTHER, ownerUserProfileId: SQ.profileId, slug: 'otherprov', status: 'published' });
  await seedStaff(raw, { providerId: OTHER, userProfileId: SQ.profileId, role: 'owner', status: 'active' });
  await seedCapability(raw, { providerId: OTHER, capability: 'adoption' });

  await seedAdoptableListing(raw, { listingId: LISTING, providerId: SHELTER });
  await seedAdoptionApplication(raw, {
    applicationId: APP,
    listingId: LISTING,
    providerId: SHELTER,
    applicantUserId: A.profileId,
  });
});

describe('adoption applicant thread — open + reuse (real router)', () => {
  it('active staff creates the applicant thread, then a second call reuses it (idempotent)', async () => {
    authState.session = sessionFor(SOWN.authUserId);

    let res = await apiReq(`/providers/${SHELTER}/adoption-applications/${APP}/thread`, 'POST');
    expect(res.status).toBe(201);
    let body = await res.json();
    expect(body.reused).toBe(false);
    expect(body.thread.owner_user_id).toBe(A.profileId); // owner = applicant
    expect(body.thread.provider_id).toBe(SHELTER);
    expect(body.thread.booking_id).toBeNull();
    const threadId = body.thread.id;

    // Second call → reuse the SAME thread (no duplicate).
    res = await apiReq(`/providers/${SHELTER}/adoption-applications/${APP}/thread`, 'POST');
    expect(res.status).toBe(200);
    body = await res.json();
    expect(body.reused).toBe(true);
    expect(body.thread.id).toBe(threadId);

    // Exactly one general thread exists for (applicant, shelter).
    const rows = await raw`
      select count(*)::int as n from message_threads
      where owner_user_id = ${A.profileId} and provider_id = ${SHELTER} and booking_id is null
    `;
    expect(rows[0].n).toBe(1);
  });
});

describe('adoption applicant thread — authorization (real router)', () => {
  it("a different provider's admin cannot open a thread on the shelter's application (403, zero threads)", async () => {
    authState.session = sessionFor(SQ.authUserId);
    const res = await apiReq(`/providers/${SHELTER}/adoption-applications/${APP}/thread`, 'POST');
    expect(res.status).toBe(403);

    const rows = await raw`select count(*)::int as n from message_threads`;
    expect(rows[0].n).toBe(0);
  });

  it('a guest → 401', async () => {
    authState.session = null;
    const res = await apiReq(`/providers/${SHELTER}/adoption-applications/${APP}/thread`, 'POST');
    expect(res.status).toBe(401);
  });

  it('an application that is not this place\'s → 404', async () => {
    // The application belongs to SHELTER; asking under OTHER (whose admin SQ is) → not found.
    authState.session = sessionFor(SQ.authUserId);
    const res = await apiReq(`/providers/${OTHER}/adoption-applications/${APP}/thread`, 'POST');
    expect(res.status).toBe(404);
  });
});

describe('adoption applicant thread — non-integer ids 404 before SQL (real router)', () => {
  it('a non-integer provider id → 404', async () => {
    authState.session = sessionFor(SOWN.authUserId);
    const res = await apiReq(`/providers/abc/adoption-applications/${APP}/thread`, 'POST');
    expect(res.status).toBe(404);
  });

  it('a non-integer application id → 404', async () => {
    authState.session = sessionFor(SOWN.authUserId);
    const res = await apiReq(`/providers/${SHELTER}/adoption-applications/xyz/thread`, 'POST');
    expect(res.status).toBe(404);
  });
});
