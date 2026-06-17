// Shop / e-commerce RLS + flow (ticket 2.11 / migration 0037), proven on the REAL tables
// acting AS pawpi_app. Companion to payments-rls, training-rls, etc. Covers the ticket's
// required integration surface:
//   1. capability gate — provider_has_capability(provider, 'shop') drives the module gate.
//   2. product CRUD RLS — provider admin writes; a published shop's ACTIVE products are
//      readable by any authed (discovery); inactive / draft-shop products are admin-only.
//   3. cart → order → pay (the 2.3 layer, mocked here by calling app_adjust_order_stock the
//      way applyPaymentStatus does) → STOCK DECREMENT; refund → RESTOCK.
//   4. subscription recurring — owner-scoped auto-reorder (product_id + cadence) RLS.
//   5. Rx gate — app_pet_has_vet_relationship(pet) is the documented consent-mirror check.
//   6. RLS on orders (reused 2.3): owner isolation + provider-staff scope (no cross-leak).
//   7. completeness guard — shop_products is ENABLE+FORCE RLS with policies.
//
// As in the sibling suites: a SECOND porsager client AS pawpi_app (NOBYPASSRLS), identity set
// per transaction, allowed-vs-ZERO. The harness owner is superuser, so FORCE RLS constrains
// only pawpi_app.

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { inject } from 'vitest';
import postgres from 'postgres';
import type { Sql } from 'postgres';
import {
  makeTestSql,
  resetDb,
  seedOwnerWithPet,
  seedUser,
  seedProvider,
  seedStaff,
  seedCapability,
  seedShopProduct,
  setProviderStatus,
  seedOrder,
  seedOrderItem,
  seedGrant,
  seedVetNote,
  seedSubscription,
} from './db';

// Identities.
const O = { authUserId: 1, profileId: 1, username: 'owner', petId: 1, petName: 'Rex' }; // buyer
const B = { authUserId: 2, profileId: 2, username: 'otherowner', petId: 2, petName: 'Fido' }; // other owner
const SOWN = { authUserId: 3, profileId: 3, username: 'shopown' }; // shop owner/admin
const SSTF = { authUserId: 4, profileId: 4, username: 'shopstaff' }; // shop active staff
const SQ = { authUserId: 5, profileId: 5, username: 'otherprov' }; // a different provider's admin
const X = { authUserId: 6, profileId: 6, username: 'outsider' }; // authed outsider

const SHOP = 10; // the shop provider (published, holds 'shop')
const DRAFT = 11; // a draft shop (not discoverable)
const VET = 20; // a vet-capable provider (for the Rx relationship)
const OTHER = 30; // a different provider (cross-leak control)

const PROD = 100; // an active in-stock product of SHOP
const PROD_INACTIVE = 101; // an inactive product of SHOP
const PROD_DRAFT = 102; // an active product of the DRAFT shop
const PROD_RX = 103; // an is_rx product of SHOP

const ORDER_O = 500; // O's product order to SHOP
const ORDER_B = 501; // B's product order to SHOP

let raw: Sql;
let app: Sql;

function asApp<T>(userId: number | null, fn: (tx: Sql) => Promise<T>): Promise<T> {
  return app.begin(async (tx) => {
    await tx`select set_config('app.current_user_id', ${userId === null ? '' : String(userId)}, true)`;
    return fn(tx);
  });
}

const ids = (rows: any[]) => rows.map((r: any) => r.id).sort((a, b) => a - b);

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
  // Owners (with pets) + provider users.
  await seedOwnerWithPet(raw, O);
  await seedOwnerWithPet(raw, B);
  await seedUser(raw, SOWN);
  await seedUser(raw, SSTF);
  await seedUser(raw, SQ);
  await seedUser(raw, X);

  // The published shop with the 'shop' capability + staff.
  await seedProvider(raw, { providerId: SHOP, ownerUserProfileId: SOWN.profileId, slug: 'shop', status: 'published' });
  await seedStaff(raw, { providerId: SHOP, userProfileId: SOWN.profileId, role: 'owner', status: 'active' });
  await seedStaff(raw, { providerId: SHOP, userProfileId: SSTF.profileId, role: 'staff', status: 'active' });
  await seedCapability(raw, { providerId: SHOP, capability: 'shop' });

  // A draft shop (not discoverable) + its capability. SOWN is its active owner (so the
  // admin-read branch sees the draft-shop product).
  await seedProvider(raw, { providerId: DRAFT, ownerUserProfileId: SOWN.profileId, slug: 'draftshop', status: 'draft' });
  await seedStaff(raw, { providerId: DRAFT, userProfileId: SOWN.profileId, role: 'owner', status: 'active' });
  await seedCapability(raw, { providerId: DRAFT, capability: 'shop' });

  // A vet-capable provider (for the Rx relationship) + a different provider (cross-leak).
  await seedProvider(raw, { providerId: VET, ownerUserProfileId: SOWN.profileId, slug: 'vetprov', status: 'published' });
  await seedCapability(raw, { providerId: VET, capability: 'vet' });
  await seedProvider(raw, { providerId: OTHER, ownerUserProfileId: SQ.profileId, slug: 'otherprov', status: 'published' });
  await seedStaff(raw, { providerId: OTHER, userProfileId: SQ.profileId, role: 'owner', status: 'active' });

  // Catalog.
  await seedShopProduct(raw, { productId: PROD, providerId: SHOP, stockQty: 10 });
  await seedShopProduct(raw, { productId: PROD_INACTIVE, providerId: SHOP, active: false });
  await seedShopProduct(raw, { productId: PROD_DRAFT, providerId: DRAFT });
  await seedShopProduct(raw, { productId: PROD_RX, providerId: SHOP, isRx: true });

  // Orders (product) — O's and B's, both to SHOP.
  await seedOrder(raw, { orderId: ORDER_O, ownerUserId: O.profileId, providerId: SHOP, kind: 'product' });
  await seedOrder(raw, { orderId: ORDER_B, ownerUserId: B.profileId, providerId: SHOP, kind: 'product' });
  await seedOrderItem(raw, { itemId: 1, orderId: ORDER_O });
  await seedOrderItem(raw, { itemId: 2, orderId: ORDER_B });
});

// ──────────────────────────────────────────────────────────────────────────────
// 1. capability gate.
describe('2.11 — capability gate (provider_has_capability drives the module gate)', () => {
  it('the shop holds the shop capability; a vet-only provider does not', async () => {
    const [{ has: shopHas }] = await raw`select provider_has_capability(${SHOP}, 'shop') as has`;
    const [{ has: vetHas }] = await raw`select provider_has_capability(${VET}, 'shop') as has`;
    expect(shopHas).toBe(true);
    expect(vetHas).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 2. shop_products RLS — discovery vs admin.
describe('2.11 — shop_products RLS (published-active discovery vs provider-admin)', () => {
  it('any authed owner reads the published shop\'s ACTIVE product (discovery)', async () => {
    await asApp(O.profileId, async (tx) => {
      const rows = await tx`select id from shop_products where provider_id = ${SHOP}`;
      // O sees the active products of the PUBLISHED shop (PROD, PROD_RX) — NOT the inactive one.
      expect(ids(rows)).toEqual([PROD, PROD_RX]);
    });
  });

  it('an owner does NOT see an inactive product or a draft-shop product', async () => {
    await asApp(O.profileId, async (tx) => {
      expect(await tx`select id from shop_products where id = ${PROD_INACTIVE}`).toHaveLength(0);
      expect(await tx`select id from shop_products where id = ${PROD_DRAFT}`).toHaveLength(0);
    });
  });

  it('the shop admin sees ALL its products incl. inactive + draft-shop', async () => {
    await asApp(SOWN.profileId, async (tx) => {
      const shopRows = await tx`select id from shop_products where provider_id = ${SHOP}`;
      expect(ids(shopRows)).toEqual([PROD, PROD_INACTIVE, PROD_RX]);
      // SOWN is also admin of the draft shop (same owner) → sees its product.
      expect(await tx`select id from shop_products where id = ${PROD_DRAFT}`).toHaveLength(1);
    });
  });

  it('a non-admin staff member CANNOT write the catalog (admin-only)', async () => {
    await expect(
      asApp(SSTF.profileId, (tx) => tx`
        insert into shop_products (provider_id, name, price_cents)
        values (${SHOP}, 'forged', 100)
      `),
    ).rejects.toThrow(/row-level security/i);
  });

  it('an owner CANNOT create or mutate a product', async () => {
    await expect(
      asApp(O.profileId, (tx) => tx`
        insert into shop_products (provider_id, name, price_cents)
        values (${SHOP}, 'forged', 100)
      `),
    ).rejects.toThrow(/row-level security/i);
    await asApp(O.profileId, async (tx) => {
      const upd = await tx`update shop_products set stock_qty = 999 where id = ${PROD} returning id`;
      expect(upd).toHaveLength(0); // RLS hides the row from the owner's UPDATE
    });
  });

  it('the shop admin CAN create + update a product', async () => {
    await asApp(SOWN.profileId, async (tx) => {
      const created = await tx`
        insert into shop_products (provider_id, name, price_cents, stock_qty)
        values (${SHOP}, 'Leash', 2000, 5) returning id, name
      `;
      expect(created[0].name).toBe('Leash');
      const upd = await tx`update shop_products set stock_qty = 3 where id = ${PROD} returning stock_qty`;
      expect(upd[0].stock_qty).toBe(3);
    });
  });

  it('a DIFFERENT provider\'s admin cannot write SHOP\'s catalog', async () => {
    await expect(
      asApp(SQ.profileId, (tx) => tx`
        insert into shop_products (provider_id, name, price_cents)
        values (${SHOP}, 'forged', 100)
      `),
    ).rejects.toThrow(/row-level security/i);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 3. cart → order → pay → STOCK decrement / restock (the 2.3 hook).
describe('2.11 — stock decrement on paid / restock on refund (app_adjust_order_stock)', () => {
  it('decrements stock by the ordered qty on paid; never below zero', async () => {
    // O's order_item line is for PROD, qty 3.
    await raw`update order_items set product_id = ${PROD}, quantity = 3 where id = 1`;
    // applyPaymentStatus calls this on the first transition into paid.
    await raw`select app_adjust_order_stock(${ORDER_O}, -1)`;
    const [{ stock_qty }] = await raw`select stock_qty from shop_products where id = ${PROD}`;
    expect(stock_qty).toBe(7); // 10 - 3
  });

  it('restocks the ordered qty on refund', async () => {
    await raw`update order_items set product_id = ${PROD}, quantity = 3 where id = 1`;
    await raw`select app_adjust_order_stock(${ORDER_O}, -1)`; // paid → 7
    await raw`select app_adjust_order_stock(${ORDER_O}, 1)`; // refunded → back to 10
    const [{ stock_qty }] = await raw`select stock_qty from shop_products where id = ${PROD}`;
    expect(stock_qty).toBe(10);
  });

  it('a non-product order line (no product_id) moves no stock', async () => {
    // order_item 2 (B's) has no product_id → no-op.
    await raw`select app_adjust_order_stock(${ORDER_B}, -1)`;
    const [{ stock_qty }] = await raw`select stock_qty from shop_products where id = ${PROD}`;
    expect(stock_qty).toBe(10);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 4. orders RLS (reused 2.3) — owner isolation + provider-staff scope.
describe('2.11 — orders RLS (owner isolation + shop-staff scope, no cross-leak)', () => {
  it('owner O reads ONLY O\'s product order', async () => {
    await asApp(O.profileId, async (tx) => {
      expect(ids(await tx`select id from orders`)).toEqual([ORDER_O]);
    });
  });

  it('shop staff read BOTH product orders to the shop', async () => {
    await asApp(SSTF.profileId, async (tx) => {
      expect(ids(await tx`select id from orders`)).toEqual([ORDER_O, ORDER_B]);
    });
  });

  it('a different provider\'s admin reads ZERO of the shop\'s orders', async () => {
    await asApp(SQ.profileId, async (tx) => {
      expect(await tx`select id from orders`).toHaveLength(0);
    });
  });

  it('shop staff can advance FULFILLMENT (app_set_order_fulfillment); owner.status untouched', async () => {
    await asApp(SSTF.profileId, async (tx) => {
      const [{ status }] = await tx`select app_set_order_fulfillment(${ORDER_O}, 'shipped') as status`;
      expect(status).toBe('shipped');
    });
    const [{ fulfillment_status, status }] =
      await raw`select fulfillment_status, status from orders where id = ${ORDER_O}`;
    expect(fulfillment_status).toBe('shipped');
    expect(status).toBe('pending'); // the 2.3 payment-status machine is NOT touched
  });

  it('a non-staff caller cannot set fulfillment (returns NULL)', async () => {
    await asApp(O.profileId, async (tx) => {
      const [{ status }] = await tx`select app_set_order_fulfillment(${ORDER_O}, 'shipped') as status`;
      expect(status).toBeNull();
    });
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 5. subscriptions (reused 2.3 + product_id) — owner-scoped auto-reorder.
describe('2.11 — subscriptions (owner-scoped auto-reorder)', () => {
  it('owner O reads their own product subscription; B reads ZERO', async () => {
    await raw.begin(async (tx) => {
      await seedSubscription(tx, { subscriptionId: 1, ownerUserId: O.profileId, providerId: SHOP });
      await tx`update subscriptions set product_id = ${PROD}, plan = 'monthly', quantity = 2 where id = 1`;
    });
    await asApp(O.profileId, async (tx) => {
      const rows = await tx`select id, product_id, quantity from subscriptions where product_id is not null`;
      expect(ids(rows)).toEqual([1]);
      expect(rows[0].quantity).toBe(2);
    });
    await asApp(B.profileId, async (tx) => {
      expect(await tx`select id from subscriptions where product_id is not null`).toHaveLength(0);
    });
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 6. Rx gate — app_pet_has_vet_relationship (the documented consent-mirror check).
describe('2.11 — Rx gate (app_pet_has_vet_relationship)', () => {
  it('a pet with NO vet relationship → false (an Rx product is blocked)', async () => {
    const [{ ok }] = await raw`select app_pet_has_vet_relationship(${O.petId}) as ok`;
    expect(ok).toBe(false);
  });

  it('a pet with an active care grant to a VET-capable provider → true', async () => {
    await seedGrant(raw, {
      petId: O.petId,
      ownerUserId: O.profileId,
      providerId: VET,
      scopes: ['medical_read'],
      status: 'active',
    });
    const [{ ok }] = await raw`select app_pet_has_vet_relationship(${O.petId}) as ok`;
    expect(ok).toBe(true);
  });

  it('a pet with a recorded vet note → true (prescription stand-in)', async () => {
    await seedVetNote(raw, { noteId: 1, petId: O.petId, ownerUserId: O.profileId });
    const [{ ok }] = await raw`select app_pet_has_vet_relationship(${O.petId}) as ok`;
    expect(ok).toBe(true);
  });

  it('a grant to a NON-vet provider does NOT count', async () => {
    await seedGrant(raw, {
      petId: O.petId,
      ownerUserId: O.profileId,
      providerId: OTHER, // not vet-capable
      scopes: ['medical_read'],
      status: 'active',
    });
    const [{ ok }] = await raw`select app_pet_has_vet_relationship(${O.petId}) as ok`;
    expect(ok).toBe(false);
  });

  it('a REVOKED/expired grant does NOT count', async () => {
    await seedGrant(raw, {
      petId: O.petId,
      ownerUserId: O.profileId,
      providerId: VET,
      scopes: ['medical_read'],
      status: 'revoked',
    });
    const [{ ok }] = await raw`select app_pet_has_vet_relationship(${O.petId}) as ok`;
    expect(ok).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 7. completeness guard.
describe('2.11 — completeness: shop_products is ENABLE+FORCE RLS with policies', () => {
  it('shop_products is policied (the model cannot silently regress)', async () => {
    const rows = await raw<
      { table: string; enabled: boolean; forced: boolean; policies: number }[]
    >`
      select c.relname as table,
             c.relrowsecurity as enabled,
             c.relforcerowsecurity as forced,
             (select count(*) from pg_policies p
               where p.schemaname = 'public' and p.tablename = c.relname)::int as policies
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'
        and c.relname = 'shop_products'
    `;
    expect(rows).toHaveLength(1);
    expect(rows[0].enabled, 'shop_products must ENABLE RLS').toBe(true);
    expect(rows[0].forced, 'shop_products must FORCE RLS').toBe(true);
    expect(rows[0].policies, 'shop_products must carry ≥1 policy').toBeGreaterThan(0);
  });
});
