// Shop auto-reorder charger RLS + DEFINER enumerator (Phase 2 ticket 2.17 / migration 0039),
// proven on the REAL tables AS pawpi_app (NOBYPASSRLS, FORCE RLS). Companion to payments-rls.
//
// Proves:
//   1. app_due_subscriptions() (SECURITY DEFINER) returns the DUE set to pawpi_app even though
//      `subscriptions` is owner FOR-ALL RLS — and only ACTIVE + product-backed + due rows,
//      surfacing the provider's connected_rail (admin-only provider_payment_accounts, which an
//      owner-scoped caller could NOT read directly).
//   2. The per-owner charge write is RLS-scoped: under A's identity an order with
//      owner_user_id=A is allowed, but one with owner_user_id=B is DENIED — so the cron can
//      only ever create an order for the sub's true owner.
//   3. orders RLS stays green: A sees A's order; B sees ZERO.

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
  seedShopProduct,
  seedPaymentAccount,
} from './db';

const A = { authUserId: 1, profileId: 1, username: 'ownera' };
const B = { authUserId: 2, profileId: 2, username: 'ownerb' };
const SOWN = { authUserId: 3, profileId: 3, username: 'sown' };

const P = 10; // provider being charged (mercadopago connected)
const PROD = 50; // its catalog product

const SUB_DUE = 300; // A, product-backed, active, next_charge_at in the past → DUE
const SUB_FUTURE = 301; // A, active, next_charge_at in the future → not due
const SUB_PAUSED = 302; // A, paused → not due
const SUB_NOPROD = 303; // A, active, due, but product_id NULL → excluded

let raw: Sql;
let app: Sql;

function asApp<T>(userId: number | null, fn: (tx: Sql) => Promise<T>): Promise<T> {
  return app.begin(async (tx) => {
    await tx`select set_config('app.current_user_id', ${userId === null ? '' : String(userId)}, true)`;
    return fn(tx);
  });
}

beforeAll(async () => {
  raw = makeTestSql();
  const url = new URL(inject('TEST_DATABASE_URL') as string);
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
  await seedUser(raw, A);
  await seedUser(raw, B);
  await seedUser(raw, SOWN);
  await seedProvider(raw, { providerId: P, ownerUserProfileId: SOWN.profileId, slug: 'prov-p' });
  await seedStaff(raw, { providerId: P, userProfileId: SOWN.profileId, role: 'owner', status: 'active' });
  await seedShopProduct(raw, { productId: PROD, providerId: P, priceCents: 3000, stockQty: 10 });
  await seedPaymentAccount(raw, { accountId: 1, providerId: P, rail: 'mercadopago', accessToken: 'TOPSECRET' });

  // Due: active, product-backed, next_charge_at in the past.
  await raw`
    insert into subscriptions (id, owner_user_id, provider_id, plan, status, product_id, quantity, next_charge_at)
    values (${SUB_DUE}, ${A.profileId}, ${P}, 'monthly', 'active', ${PROD}, 2, now() - interval '1 day')
  `;
  // Not due — future next_charge_at.
  await raw`
    insert into subscriptions (id, owner_user_id, provider_id, plan, status, product_id, quantity, next_charge_at)
    values (${SUB_FUTURE}, ${A.profileId}, ${P}, 'monthly', 'active', ${PROD}, 1, now() + interval '20 days')
  `;
  // Not due — paused.
  await raw`
    insert into subscriptions (id, owner_user_id, provider_id, plan, status, product_id, quantity, next_charge_at)
    values (${SUB_PAUSED}, ${A.profileId}, ${P}, 'monthly', 'paused', ${PROD}, 1, now() - interval '1 day')
  `;
  // Excluded — no product_id (a non-shop subscription).
  await raw`
    insert into subscriptions (id, owner_user_id, provider_id, plan, status, product_id, quantity, next_charge_at)
    values (${SUB_NOPROD}, ${A.profileId}, ${P}, 'monthly', 'active', null, 1, now() - interval '1 day')
  `;
});

describe('app_due_subscriptions() enumerator', () => {
  it('returns ONLY active, product-backed, due rows — with the connected rail — to pawpi_app', async () => {
    const rows = await asApp(null, (tx) => tx`select * from app_due_subscriptions()`);
    expect(rows.map((r: any) => r.id)).toEqual([SUB_DUE]);
    const due = rows[0] as any;
    expect(due.owner_user_id).toBe(A.profileId);
    expect(due.product_id).toBe(PROD);
    expect(due.quantity).toBe(2);
    expect(due.plan).toBe('monthly');
    expect(due.connected_rail).toBe('mercadopago');
  });

  it('a direct cross-owner read of subscriptions is RLS-scoped (the route must use the enumerator)', async () => {
    // Under B's identity, B sees none of A's subscriptions directly — which is exactly why the
    // cron uses the DEFINER enumerator instead of reading subscriptions across owners.
    const seenByB = await asApp(B.profileId, (tx) => tx`select id from subscriptions`);
    expect(seenByB.length).toBe(0);
  });
});

describe('per-owner charge write scoping', () => {
  it('under A, an order with owner_user_id=A is allowed', async () => {
    const inserted = await asApp(A.profileId, (tx) => tx`
      insert into orders (owner_user_id, provider_id, kind, source_ref, amount_cents, currency, status)
      values (${A.profileId}, ${P}, 'product', ${'subscription:' + SUB_DUE}, 6000, 'ARS', 'pending')
      returning id, owner_user_id
    `);
    expect(inserted[0].owner_user_id).toBe(A.profileId);
  });

  it('under A, an order claiming owner_user_id=B is DENIED by RLS (cannot charge another owner)', async () => {
    await expect(
      asApp(A.profileId, (tx) => tx`
        insert into orders (owner_user_id, provider_id, kind, amount_cents, currency, status)
        values (${B.profileId}, ${P}, 'product', 6000, 'ARS', 'pending')
      `),
    ).rejects.toThrow();
  });
});

describe('orders RLS stays green', () => {
  it('A sees A’s auto-reorder order; B sees ZERO', async () => {
    await asApp(A.profileId, (tx) => tx`
      insert into orders (id, owner_user_id, provider_id, kind, amount_cents, currency, status)
      values (9001, ${A.profileId}, ${P}, 'product', 6000, 'ARS', 'pending')
    `);
    const seenByA = await asApp(A.profileId, (tx) => tx`select id from orders where id = 9001`);
    const seenByB = await asApp(B.profileId, (tx) => tx`select id from orders where id = 9001`);
    expect(seenByA.length).toBe(1);
    expect(seenByB.length).toBe(0);
  });
});
