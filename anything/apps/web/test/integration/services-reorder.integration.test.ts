// Reorder routing + round-trip — driven through the REAL request router (Hono `api` from
// __create/route-builder) BY URL, on real Postgres as pawpi_app under FORCE RLS.
//
// WHY through the router (not by importing the reorder handler): production 500s because the
// static `/services/reorder` path is SHADOWED by the sibling `/services/[serviceId]` dynamic
// route — RegExpRouter throws UnsupportedPathError, SmartRouter falls back to TrieRouter, and
// route-builder registered the dynamic route first (it sorted by path-string length, and
// "[serviceId]" is longer than "reorder"), so TrieRouter matches it and binds serviceId="reorder"
// → 22P02. A handler-level test never sees this. These tests exercise the actual matcher, so
// they go RED (500) against the unfixed router and GREEN once static wins.

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { inject } from 'vitest';
import type { Sql } from 'postgres';
import {
  makeTestSql,
  resetDb,
  seedProviderWithStaff,
  seedUser,
  seedService,
  seedShopProduct,
  seedCapability,
} from './db';

const authState = vi.hoisted(() => ({ session: null as any }));
vi.mock('@/auth', () => ({ auth: async () => authState.session }));

let raw: Sql;
let api: { request: (path: string, init?: RequestInit) => Promise<Response> };

const OWNER = { authUserId: 1, profileId: 1 };
const PROV = 100;
const S1 = 111, S2 = 112, S3 = 113; // services
const P1 = 211, P2 = 212, P3 = 213; // shop products

const sessionFor = (authUserId: number) => ({ user: { id: authUserId } });

function apiReq(path: string, method: string, body?: unknown) {
  return api.request(path, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
}

beforeAll(async () => {
  raw = makeTestSql();

  const url = new URL(inject('TEST_DATABASE_URL'));
  url.username = 'pawpi_app';
  url.password = 'pawpi_app';
  process.env.DATABASE_URL = url.toString();
  process.env.DATABASE_SSL = 'disable';

  // Import the REAL router AFTER env is set — registration imports every route.js, and the
  // shared `sql` reads DATABASE_URL at import time.
  ({ api } = (await import('../../__create/route-builder')) as any);
});

afterAll(async () => {
  await raw.end();
});

afterEach(async () => {
  await resetDb(raw);
  authState.session = null;
});

beforeEach(async () => {
  await seedUser(raw, { authUserId: OWNER.authUserId, profileId: OWNER.profileId, username: 'ownera' });
  await seedProviderWithStaff(raw, {
    providerId: PROV,
    ownerUserProfileId: OWNER.profileId,
    staffUserProfileId: OWNER.profileId,
    slug: 'prov-a',
    staffRole: 'owner',
    providerStatus: 'draft',
  });
  await seedCapability(raw, { providerId: PROV, capability: 'shop' }); // shop-products endpoints gate on this
  await seedService(raw, { serviceId: S1, providerId: PROV, name: 'service-1' });
  await seedService(raw, { serviceId: S2, providerId: PROV, name: 'service-2' });
  await seedService(raw, { serviceId: S3, providerId: PROV, name: 'service-3' });
  await seedShopProduct(raw, { productId: P1, providerId: PROV, priceCents: 1000 });
  await seedShopProduct(raw, { productId: P2, providerId: PROV, priceCents: 1000 });
  await seedShopProduct(raw, { productId: P3, providerId: PROV, priceCents: 1000 });
});

describe('service reorder — real router by URL', () => {
  it('PATCH /providers/:id/services/reorder reaches the reorder handler and persists the order', async () => {
    authState.session = sessionFor(OWNER.authUserId);

    // RED before the routing fix: this path is shadowed by /services/[serviceId], so it 500s
    // ("invalid input syntax for type integer: reorder"). GREEN after: static route wins → 200.
    const patchRes = await apiReq(`/providers/${PROV}/services/reorder`, 'PATCH', {
      ordered_ids: [S3, S1, S2],
    });
    expect(patchRes.status).toBe(200);

    const getRes = await apiReq(`/providers/${PROV}/services`, 'GET');
    expect(getRes.status).toBe(200);
    const { services } = await getRes.json();
    expect(services.map((s: any) => s.id)).toEqual([S3, S1, S2]);
  });
});

describe('shop-products reorder — real router by URL', () => {
  it('PATCH /providers/:id/shop-products/reorder reaches the reorder handler and persists the order', async () => {
    authState.session = sessionFor(OWNER.authUserId);

    // Same static-vs-[productId] collision as services — guard it symmetrically.
    const patchRes = await apiReq(`/providers/${PROV}/shop-products/reorder`, 'PATCH', {
      ordered_ids: [P3, P1, P2],
    });
    expect(patchRes.status).toBe(200);

    const getRes = await apiReq(`/providers/${PROV}/shop-products`, 'GET');
    expect(getRes.status).toBe(200);
    const { products } = await getRes.json();
    expect(products.map((p: any) => p.id)).toEqual([P3, P1, P2]);
  });
});
