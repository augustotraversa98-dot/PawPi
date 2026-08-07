// Storefront merchandising WRITE endpoints (Phase 2c-i) proven on the REAL tables acting AS
// pawpi_app (NOBYPASSRLS), identity set per transaction. The route handlers issue exactly these
// statements inside withRequestContext's per-request transaction; here we prove the DB-level
// guarantees they rely on:
//   1. reorder is a single provider-scoped unnest() UPDATE → sort_order = array index, and an
//      id belonging to ANOTHER provider is never touched (WHERE provider_id + RLS).
//   2. a non-staff caller's scoped reorder updates ZERO rows (the integration analogue of 403).
//   3. storefront-layout writes the text[] and null clears it.
//   4. the 0077 CHECK rejects compare_at_cents <= price_cents and accepts a valid discount.
//
// As in the sibling suites: a SECOND porsager client AS pawpi_app; the harness owner is
// superuser, so FORCE RLS constrains only pawpi_app.

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
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
  seedService,
  seedShopProduct,
} from './db';

const ADMIN = { authUserId: 1, profileId: 1, username: 'admina' }; // owner/admin of provider A
const OUTSIDER = { authUserId: 2, profileId: 2, username: 'outsider' }; // no membership anywhere

const A = 10; // provider A (the store under test)
const B = 20; // a different provider (cross-provider control)

const PA1 = 101, PA2 = 102, PA3 = 103; // A's products
const PB = 201; // B's product
const SA1 = 111, SA2 = 112; // A's services
const SB = 211; // B's service

let raw: Sql;
let app: Sql;

function asApp<T>(userId: number | null, fn: (tx: Sql) => Promise<T>): Promise<T> {
  return app.begin(async (tx) => {
    await tx`select set_config('app.current_user_id', ${userId === null ? '' : String(userId)}, true)`;
    return fn(tx);
  });
}

const sortOrders = async (table: 'shop_products' | 'provider_services', ids: number[]) => {
  const rows = await raw`
    select id, sort_order from ${raw(table)} where id = any(${ids}) order by id
  `;
  return Object.fromEntries(rows.map((r: any) => [r.id, r.sort_order]));
};

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
});

afterAll(async () => {
  await app.end();
  await raw.end();
});

afterEach(async () => {
  await resetDb(raw);
});

beforeEach(async () => {
  await seedUser(raw, ADMIN);
  await seedUser(raw, OUTSIDER);

  await seedProvider(raw, { providerId: A, ownerUserProfileId: ADMIN.profileId, slug: 'store-a', status: 'published' });
  await seedStaff(raw, { providerId: A, userProfileId: ADMIN.profileId, role: 'owner', status: 'active' });
  await seedCapability(raw, { providerId: A, capability: 'shop' });

  await seedProvider(raw, { providerId: B, ownerUserProfileId: OUTSIDER.profileId, slug: 'store-b', status: 'published' });
  await seedStaff(raw, { providerId: B, userProfileId: OUTSIDER.profileId, role: 'owner', status: 'active' });
  await seedCapability(raw, { providerId: B, capability: 'shop' });

  // A's catalog (all default sort_order 0) + one product/service for B with a SENTINEL
  // sort_order so "never touched" is provable.
  await seedShopProduct(raw, { productId: PA1, providerId: A, priceCents: 5000 });
  await seedShopProduct(raw, { productId: PA2, providerId: A, priceCents: 5000 });
  await seedShopProduct(raw, { productId: PA3, providerId: A, priceCents: 5000 });
  await seedShopProduct(raw, { productId: PB, providerId: B, priceCents: 5000 });
  await raw`update shop_products set sort_order = 99 where id = ${PB}`;

  await seedService(raw, { serviceId: SA1, providerId: A });
  await seedService(raw, { serviceId: SA2, providerId: A });
  await seedService(raw, { serviceId: SB, providerId: B });
  await raw`update provider_services set sort_order = 99 where id = ${SB}`;
});

// The exact statement shop-products/reorder issues.
async function reorderProducts(tx: Sql, providerId: number, orderedIds: number[]) {
  const positions = orderedIds.map((_, i) => i);
  await tx`
    UPDATE shop_products AS sp
    SET sort_order = v.ord, updated_at = now()
    FROM unnest(${orderedIds}::int[], ${positions}::int[]) AS v(id, ord)
    WHERE sp.id = v.id AND sp.provider_id = ${providerId}
  `;
}

describe('shop-products reorder', () => {
  it('sets sort_order by array index and never touches another provider\'s row', async () => {
    // Include PB (belongs to B) in the payload — it must be ignored.
    await asApp(ADMIN.profileId, (tx) => reorderProducts(tx, A, [PA3, PA1, PA2, PB]));

    const orders = await sortOrders('shop_products', [PA1, PA2, PA3, PB]);
    expect(orders[PA3]).toBe(0);
    expect(orders[PA1]).toBe(1);
    expect(orders[PA2]).toBe(2);
    expect(orders[PB]).toBe(99); // untouched — provider-scoped
  });

  it('a non-staff caller updates ZERO rows (RLS + provider scope)', async () => {
    await asApp(OUTSIDER.profileId, (tx) => reorderProducts(tx, A, [PA3, PA1, PA2]));
    const orders = await sortOrders('shop_products', [PA1, PA2, PA3]);
    expect(orders[PA1]).toBe(0);
    expect(orders[PA2]).toBe(0);
    expect(orders[PA3]).toBe(0); // all still default — outsider changed nothing
  });
});

describe('services reorder', () => {
  it('sets sort_order by index, provider-scoped', async () => {
    await asApp(ADMIN.profileId, async (tx) => {
      const orderedIds = [SA2, SA1, SB];
      const positions = orderedIds.map((_, i) => i);
      await tx`
        UPDATE provider_services AS ps
        SET sort_order = v.ord, updated_at = now()
        FROM unnest(${orderedIds}::int[], ${positions}::int[]) AS v(id, ord)
        WHERE ps.id = v.id AND ps.provider_id = ${A}
      `;
    });

    const orders = await sortOrders('provider_services', [SA1, SA2, SB]);
    expect(orders[SA2]).toBe(0);
    expect(orders[SA1]).toBe(1);
    expect(orders[SB]).toBe(99); // B's service untouched
  });
});

describe('storefront-layout', () => {
  it('writes the section order array and null clears it', async () => {
    await asApp(ADMIN.profileId, (tx) =>
      tx`UPDATE providers SET storefront_section_order = ${['items', 'posts', 'about']}, updated_at = now() WHERE id = ${A}`,
    );
    let row = await raw`select storefront_section_order from providers where id = ${A}`;
    expect(row[0].storefront_section_order).toEqual(['items', 'posts', 'about']);

    await asApp(ADMIN.profileId, (tx) =>
      tx`UPDATE providers SET storefront_section_order = ${null}, updated_at = now() WHERE id = ${A}`,
    );
    row = await raw`select storefront_section_order from providers where id = ${A}`;
    expect(row[0].storefront_section_order).toBeNull();
  });
});

describe('compare_at_cents CHECK (0077)', () => {
  it('accepts a valid discount (compare_at > price) and rejects compare_at <= price', async () => {
    // Valid: 6000 > 5000.
    await asApp(ADMIN.profileId, (tx) =>
      tx`UPDATE shop_products SET compare_at_cents = 6000 WHERE id = ${PA1} AND provider_id = ${A}`,
    );
    const ok = await raw`select compare_at_cents from shop_products where id = ${PA1}`;
    expect(ok[0].compare_at_cents).toBe(6000);

    // Invalid: 5000 is not > the 5000 price → the table CHECK rejects it.
    await expect(
      asApp(ADMIN.profileId, (tx) =>
        tx`UPDATE shop_products SET compare_at_cents = 5000 WHERE id = ${PA1} AND provider_id = ${A}`,
      ),
    ).rejects.toThrow();
  });
});
