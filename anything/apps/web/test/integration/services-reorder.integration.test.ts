// Service reorder round-trip — proven end-to-end on the REAL tables, AS pawpi_app under FORCE
// RLS, through the actual route handlers:
//   1. PATCH /api/providers/[id]/services/reorder  writes sort_order = array index.
//   2. GET   /api/providers/[id]/services          returns the services in that saved order.
//
// This is the regression guard that was missing: the write path already worked, but the GET
// used ORDER BY created_at ASC and so never reflected a saved reorder. It now orders by
// is_featured DESC, sort_order ASC, created_at ASC — this test fails against the old ORDER BY.
// Same harness pattern as availability-editor.integration.test.ts (real handlers as pawpi_app).

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { inject } from 'vitest';
import postgres from 'postgres';
import type { Sql } from 'postgres';
import { makeTestSql, resetDb, seedProviderWithStaff, seedUser, seedService } from './db';

const authState = vi.hoisted(() => ({ session: null as any }));
vi.mock('@/auth', () => ({ auth: async () => authState.session }));

let raw: Sql;
let app: Sql;
let appSql: any;
let reorderPATCH: (req: Request, ctx: { params: { id: string } }) => Promise<Response>;
let servicesGET: (req: Request, ctx: { params: { id: string } }) => Promise<Response>;

const OWNER = { authUserId: 1, profileId: 1 };
const PROV_A = 100;
const S1 = 111, S2 = 112, S3 = 113; // A's three services (all default sort_order 0)

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
  reorderPATCH = (await import('@/app/api/providers/[id]/services/reorder/route')).PATCH as typeof reorderPATCH;
  servicesGET = (await import('@/app/api/providers/[id]/services/route')).GET as typeof servicesGET;
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
  await seedUser(raw, { authUserId: OWNER.authUserId, profileId: OWNER.profileId, username: 'ownera' });
  await seedProviderWithStaff(raw, {
    providerId: PROV_A,
    ownerUserProfileId: OWNER.profileId,
    staffUserProfileId: OWNER.profileId,
    slug: 'prov-a',
    staffRole: 'owner',
    providerStatus: 'draft',
  });
  await seedService(raw, { serviceId: S1, providerId: PROV_A, name: 'service-1' });
  await seedService(raw, { serviceId: S2, providerId: PROV_A, name: 'service-2' });
  await seedService(raw, { serviceId: S3, providerId: PROV_A, name: 'service-3' });
});

describe('service reorder round-trip', () => {
  it('GET returns services in the saved reorder order', async () => {
    authState.session = sessionFor(OWNER.authUserId);

    // Reorder to [S3, S1, S2].
    const patchRes = await reorderPATCH(
      req(`http://t/api/providers/${PROV_A}/services/reorder`, 'PATCH', { ordered_ids: [S3, S1, S2] }),
      { params: { id: String(PROV_A) } },
    );
    expect(patchRes.status).toBe(200);

    // Re-fetch via the services GET and assert the order matches the reordered ids.
    const getRes = await servicesGET(
      req(`http://t/api/providers/${PROV_A}/services`, 'GET'),
      { params: { id: String(PROV_A) } },
    );
    expect(getRes.status).toBe(200);
    const { services } = await getRes.json();
    expect(services.map((s: any) => s.id)).toEqual([S3, S1, S2]);
  });
});
