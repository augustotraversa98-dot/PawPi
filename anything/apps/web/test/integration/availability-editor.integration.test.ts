// Availability editor endpoints — proven on the REAL tables, AS pawpi_app under FORCE RLS.
//
// These are the config-surface handlers the extranet Hours editor drives:
//   - GET  /api/providers/[id]/availability/windows        (owner|admin raw window read)
//   - PATCH  /api/providers/[id]/availability/[availabilityId]  (edit one window)
//   - DELETE /api/providers/[id]/availability/[availabilityId]  (hard delete one window)
//   - PATCH  /api/providers/[id]                            (time_zone save)
//
// The unit tests cover the branch/validation logic against a mocked sql; this proves the same
// handlers work end-to-end on real Postgres with RLS enforced — including that a non-staff caller
// is denied and that a window belonging to another provider is invisible/untouchable (404), which
// only a real DB can demonstrate. Same harness pattern as pets-patch-weight.integration.test.ts.

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { inject } from 'vitest';
import postgres from 'postgres';
import type { Sql } from 'postgres';
import {
  makeTestSql,
  resetDb,
  seedProviderWithStaff,
  seedUser,
  seedAvailability,
} from './db';

const authState = vi.hoisted(() => ({ session: null as any }));
vi.mock('@/auth', () => ({ auth: async () => authState.session }));

let raw: Sql;
let app: Sql;
let appSql: any;
let windowsGET: (req: Request, ctx: { params: { id: string } }) => Promise<Response>;
let windowPATCH: (req: Request, ctx: { params: { id: string; availabilityId: string } }) => Promise<Response>;
let windowDELETE: (req: Request, ctx: { params: { id: string; availabilityId: string } }) => Promise<Response>;
let providerPATCH: (req: Request, ctx: { params: { id: string } }) => Promise<Response>;

// Owner of provider A (authUserId 1 / profileId 1); an unrelated non-staff user (2/2);
// owner of provider B (3/3).
const OWNER = { authUserId: 1, profileId: 1 };
const OUTSIDER = { authUserId: 2, profileId: 2 };
const OWNER_B = { authUserId: 3, profileId: 3 };
const PROV_A = 100;
const PROV_B = 200;
const WIN_A = 11;
const WIN_B = 22;

const sessionFor = (authUserId: number) => ({ user: { id: authUserId } });

function req(url: string, method: string, body?: unknown): Request {
  return new Request(url, {
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

  appSql = (await import('@/app/api/utils/sql')).default;
  windowsGET = (await import('@/app/api/providers/[id]/availability/windows/route')).GET as typeof windowsGET;
  const child = await import('@/app/api/providers/[id]/availability/[availabilityId]/route');
  windowPATCH = child.PATCH as typeof windowPATCH;
  windowDELETE = child.DELETE as typeof windowDELETE;
  providerPATCH = (await import('@/app/api/providers/[id]/route')).PATCH as typeof providerPATCH;
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

beforeEach(async () => {
  // Owner A + provider A (published or draft is irrelevant — the read is membership-gated).
  await seedUser(raw, { authUserId: OWNER.authUserId, profileId: OWNER.profileId, username: 'ownera' });
  await seedProviderWithStaff(raw, {
    providerId: PROV_A,
    ownerUserProfileId: OWNER.profileId,
    staffUserProfileId: OWNER.profileId,
    slug: 'prov-a',
    staffRole: 'owner',
    providerStatus: 'draft',
  });
  await seedAvailability(raw, { availabilityId: WIN_A, providerId: PROV_A, weekday: 0, startTime: '09:00', endTime: '18:00', slotMinutes: 30 });

  // An unrelated user with no membership anywhere.
  await seedUser(raw, { authUserId: OUTSIDER.authUserId, profileId: OUTSIDER.profileId, username: 'outsider' });

  // Owner B + provider B + a window in B (for cross-provider isolation).
  await seedUser(raw, { authUserId: OWNER_B.authUserId, profileId: OWNER_B.profileId, username: 'ownerb' });
  await seedProviderWithStaff(raw, {
    providerId: PROV_B,
    ownerUserProfileId: OWNER_B.profileId,
    staffUserProfileId: OWNER_B.profileId,
    slug: 'prov-b',
    staffRole: 'owner',
    providerStatus: 'draft',
  });
  await seedAvailability(raw, { availabilityId: WIN_B, providerId: PROV_B, weekday: 0, startTime: '09:00', endTime: '18:00', slotMinutes: 30 });
});

describe('GET availability/windows (raw owner read)', () => {
  it('owner reads their provider-wide windows; scoped_count counts the rest', async () => {
    // Add a per-staff (scoped) window that must NOT appear in the editor list but IS counted.
    await seedAvailability(raw, {
      availabilityId: 33, providerId: PROV_A, staffUserId: OWNER.profileId, weekday: 2, startTime: '10:00', endTime: '12:00',
    });

    authState.session = sessionFor(OWNER.authUserId);
    const res = await windowsGET(
      req(`http://localhost/api/providers/${PROV_A}/availability/windows`, 'GET'),
      { params: { id: String(PROV_A) } },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.windows).toHaveLength(1);
    expect(body.windows[0].id).toBe(WIN_A);
    expect(body.scoped_count).toBe(1);
  });

  it('a non-staff caller is denied → 403', async () => {
    authState.session = sessionFor(OUTSIDER.authUserId);
    const res = await windowsGET(
      req(`http://localhost/api/providers/${PROV_A}/availability/windows`, 'GET'),
      { params: { id: String(PROV_A) } },
    );
    expect(res.status).toBe(403);
  });
});

describe('PATCH availability/[availabilityId]', () => {
  it('owner edits their window', async () => {
    authState.session = sessionFor(OWNER.authUserId);
    const res = await windowPATCH(
      req(`http://localhost/api/providers/${PROV_A}/availability/${WIN_A}`, 'PATCH', {
        start_time: '10:00', end_time: '16:00', slot_minutes: 60,
      }),
      { params: { id: String(PROV_A), availabilityId: String(WIN_A) } },
    );
    expect(res.status).toBe(200);

    const [row] = await raw`select start_time, end_time, slot_minutes from provider_availability where id = ${WIN_A}`;
    expect(String(row.start_time)).toBe('10:00:00');
    expect(String(row.end_time)).toBe('16:00:00');
    expect(row.slot_minutes).toBe(60);
  });

  it("cannot edit another provider's window via the wrong :id → 404, and the row is untouched", async () => {
    authState.session = sessionFor(OWNER.authUserId);
    // Owner A targets provider A in the path but B's window id.
    const res = await windowPATCH(
      req(`http://localhost/api/providers/${PROV_A}/availability/${WIN_B}`, 'PATCH', { slot_minutes: 5 }),
      { params: { id: String(PROV_A), availabilityId: String(WIN_B) } },
    );
    expect(res.status).toBe(404);

    const [row] = await raw`select slot_minutes from provider_availability where id = ${WIN_B}`;
    expect(row.slot_minutes).toBe(30);
  });
});

describe('DELETE availability/[availabilityId]', () => {
  it('owner hard-deletes their window', async () => {
    authState.session = sessionFor(OWNER.authUserId);
    const res = await windowDELETE(
      req(`http://localhost/api/providers/${PROV_A}/availability/${WIN_A}`, 'DELETE'),
      { params: { id: String(PROV_A), availabilityId: String(WIN_A) } },
    );
    expect(res.status).toBe(200);
    const rows = await raw`select id from provider_availability where id = ${WIN_A}`;
    expect(rows).toHaveLength(0);
  });

  it("cannot delete another provider's window → 404, and the row survives", async () => {
    authState.session = sessionFor(OWNER.authUserId);
    const res = await windowDELETE(
      req(`http://localhost/api/providers/${PROV_A}/availability/${WIN_B}`, 'DELETE'),
      { params: { id: String(PROV_A), availabilityId: String(WIN_B) } },
    );
    expect(res.status).toBe(404);
    const rows = await raw`select id from provider_availability where id = ${WIN_B}`;
    expect(rows).toHaveLength(1);
  });
});

describe('PATCH /api/providers/[id] time_zone', () => {
  it('owner saves a valid IANA zone; an invalid one is rejected and never persisted', async () => {
    authState.session = sessionFor(OWNER.authUserId);

    const ok = await providerPATCH(
      req(`http://localhost/api/providers/${PROV_A}`, 'PATCH', { time_zone: 'America/Montevideo' }),
      { params: { id: String(PROV_A) } },
    );
    expect(ok.status).toBe(200);
    let [row] = await raw`select time_zone from providers where id = ${PROV_A}`;
    expect(row.time_zone).toBe('America/Montevideo');

    const bad = await providerPATCH(
      req(`http://localhost/api/providers/${PROV_A}`, 'PATCH', { time_zone: 'Not/AZone' }),
      { params: { id: String(PROV_A) } },
    );
    expect(bad.status).toBe(400);
    [row] = await raw`select time_zone from providers where id = ${PROV_A}`;
    expect(row.time_zone).toBe('America/Montevideo'); // unchanged
  });
});
