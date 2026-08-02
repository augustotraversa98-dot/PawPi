// Services Hub P4b — the additive fulfillment columns on `orders` (migration 0073), proven
// on REAL Postgres. The unit test covers the route's validation; this proves the migration
// is additive + back-compatible: existing/omitting callers default to a pickup order, a
// delivery order round-trips its shipping_address jsonb, and the check constraint holds.

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Sql } from 'postgres';
import { makeTestSql, resetDb, seedUser, seedProvider } from './db';

const OWNER = { authUserId: 1, profileId: 1, username: 'owner' };
const P = 1;

let raw: Sql;

beforeAll(() => {
  raw = makeTestSql();
});

afterAll(async () => {
  await raw.end();
});

afterEach(async () => {
  await resetDb(raw);
});

beforeEach(async () => {
  await seedUser(raw, OWNER);
  await seedProvider(raw, {
    providerId: P,
    ownerUserProfileId: OWNER.profileId,
    slug: 'shop-1',
    status: 'published',
  });
  await raw`select setval(pg_get_serial_sequence('providers','id'), (select max(id) from providers))`;
});

describe('shop order fulfillment — additive migration 0073', () => {
  it('adds fulfillment_type (NOT NULL default pickup) + a nullable shipping_address jsonb', async () => {
    const cols = await raw`
      select column_name, data_type, column_default, is_nullable
      from information_schema.columns
      where table_name = 'orders'
        and column_name in ('fulfillment_type', 'shipping_address')
    `;
    const byName: Record<string, any> = Object.fromEntries(
      cols.map((c: any) => [c.column_name, c]),
    );
    expect(byName.fulfillment_type).toBeTruthy();
    expect(byName.fulfillment_type.column_default).toContain('pickup');
    expect(byName.fulfillment_type.is_nullable).toBe('NO');
    expect(byName.shipping_address).toBeTruthy();
    expect(byName.shipping_address.data_type).toBe('jsonb');
    expect(byName.shipping_address.is_nullable).toBe('YES');
  });

  it('an insert OMITTING the columns defaults to a pickup order (back-compat)', async () => {
    const [o] = await raw<{ fulfillment_type: string; shipping_address: unknown }[]>`
      insert into orders (owner_user_id, provider_id, kind, amount_cents)
      values (${OWNER.profileId}, ${P}, 'product', 5000)
      returning fulfillment_type, shipping_address
    `;
    expect(o.fulfillment_type).toBe('pickup');
    expect(o.shipping_address).toBeNull();
  });

  it('a delivery order round-trips its shipping_address jsonb', async () => {
    const addr = { address: '123 Test St', lat: 1.5, lng: -2.5 };
    const [o] = await raw<{ fulfillment_type: string; shipping_address: any }[]>`
      insert into orders
        (owner_user_id, provider_id, kind, amount_cents, fulfillment_type, shipping_address)
      values (${OWNER.profileId}, ${P}, 'product', 5000, 'delivery', ${raw.json(addr)})
      returning fulfillment_type, shipping_address
    `;
    expect(o.fulfillment_type).toBe('delivery');
    expect(o.shipping_address).toEqual(addr);
  });

  it('the check constraint rejects an unknown fulfillment_type (no courier modes)', async () => {
    await expect(
      raw`
        insert into orders
          (owner_user_id, provider_id, kind, amount_cents, fulfillment_type)
        values (${OWNER.profileId}, ${P}, 'product', 5000, 'courier')
      `,
    ).rejects.toThrow(/orders_fulfillment_type_check|check constraint/i);
  });
});
