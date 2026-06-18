// Ticket 2.71 — Rx FULFILLMENT, proven on the REAL tables AS pawpi_app.
//
// rx_fulfillment_orders (0057) bridges the vet Rx (2.53) → dispenser (pharmacy capability):
//   • OWNER creates/reads OWN orders, only on an owned ACTIVE Rx WITH refills (app_owns_fulfillable_rx);
//     can cancel while 'requested' but CANNOT set provider-only statuses / 'fulfilled'.
//   • active STAFF of the DISPENSING provider read + advance, but CANNOT plain-UPDATE to 'fulfilled'
//     (reserved for fulfill_rx_order, which consumes a refill on the 2.53 safe path).
//   • other-provider staff + outsiders → ZERO.
//   • the prescription is NEVER written directly (no owner/provider UPDATE policy on it).

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { inject } from 'vitest';
import postgres from 'postgres';
import type { Sql } from 'postgres';
import { makeTestSql, resetDb, seedOwnerWithPet, seedUser, seedProvider, seedStaff, seedCapability } from './db';

const O = { authUserId: 1, profileId: 1, username: 'ownero', petId: 1, petName: 'Rex' };
const V = { authUserId: 2, profileId: 2, username: 'vetv' };     // vet staff (issuer)
const PH = { authUserId: 3, profileId: 3, username: 'pharmph' }; // pharmacy staff (dispenser)
const X = { authUserId: 4, profileId: 4, username: 'outsiderx' };
const Y = { authUserId: 5, profileId: 5, username: 'otherstaffy' };
const VET_ID = 10;
const PHARM_ID = 11;
const OTHER_ID = 12;
const RX_ID = 100;
const FUL_ID = 200;

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
  await seedOwnerWithPet(raw, O);
  await seedUser(raw, V);
  await seedUser(raw, PH);
  await seedUser(raw, X);
  await seedUser(raw, Y);
  await seedProvider(raw, { providerId: VET_ID, ownerUserProfileId: V.profileId, slug: 'vet-clinic', status: 'published' });
  await seedStaff(raw, { providerId: VET_ID, userProfileId: V.profileId, role: 'vet' });
  await seedCapability(raw, { providerId: VET_ID, capability: 'vet' });
  await seedProvider(raw, { providerId: PHARM_ID, ownerUserProfileId: PH.profileId, slug: 'pet-pharmacy', status: 'published' });
  await seedStaff(raw, { providerId: PHARM_ID, userProfileId: PH.profileId, role: 'owner' });
  await seedCapability(raw, { providerId: PHARM_ID, capability: 'pharmacy' });
  await seedProvider(raw, { providerId: OTHER_ID, ownerUserProfileId: Y.profileId, slug: 'other-co', status: 'published' });
  await seedStaff(raw, { providerId: OTHER_ID, userProfileId: Y.profileId, role: 'owner' });

  await raw`
    insert into prescriptions (id, pet_id, owner_user_id, provider_id, drug_name, dose,
                               refills_authorized, refills_remaining, status)
    values (${RX_ID}, ${O.petId}, ${O.profileId}, ${VET_ID}, 'Amoxicillin', '250mg', 2, 2, 'active')
  `;
});

describe('rx_fulfillment_orders create / owner RLS', () => {
  it('owner creates a requested fulfillment on the owned, fulfillable Rx', async () => {
    const created = await asApp(O.profileId, (tx) => tx`
      insert into rx_fulfillment_orders (prescription_id, owner_user_id, pet_id, provider_id, method, delivery_address, is_refill, status)
      values (${RX_ID}, ${O.profileId}, ${O.petId}, ${PHARM_ID}, 'delivery', 'Home', true, 'requested')
      returning id
    `);
    expect(created).toHaveLength(1);
  });

  it('owner CANNOT create with a provider-only status (self-accept blocked)', async () => {
    await expect(
      asApp(O.profileId, (tx) => tx`
        insert into rx_fulfillment_orders (prescription_id, owner_user_id, pet_id, provider_id, method, status)
        values (${RX_ID}, ${O.profileId}, ${O.petId}, ${PHARM_ID}, 'pickup', 'accepted')
      `),
    ).rejects.toThrow(/row-level security/i);
  });

  it('owner CANNOT create on an Rx with no refills remaining', async () => {
    await raw`update prescriptions set refills_remaining = 0 where id = ${RX_ID}`;
    await expect(
      asApp(O.profileId, (tx) => tx`
        insert into rx_fulfillment_orders (prescription_id, owner_user_id, pet_id, provider_id, method, status)
        values (${RX_ID}, ${O.profileId}, ${O.petId}, ${PHARM_ID}, 'pickup', 'requested')
      `),
    ).rejects.toThrow(/row-level security/i);
  });

  it('a stranger CANNOT create a fulfillment for someone else\'s Rx', async () => {
    await expect(
      asApp(X.profileId, (tx) => tx`
        insert into rx_fulfillment_orders (prescription_id, owner_user_id, pet_id, provider_id, method, status)
        values (${RX_ID}, ${X.profileId}, ${O.petId}, ${PHARM_ID}, 'pickup', 'requested')
      `),
    ).rejects.toThrow(/row-level security/i);
  });
});

describe('rx_fulfillment_orders advance / read RLS', () => {
  beforeEach(async () => {
    await raw`
      insert into rx_fulfillment_orders (id, prescription_id, owner_user_id, pet_id, provider_id, method, delivery_address, is_refill, status)
      values (${FUL_ID}, ${RX_ID}, ${O.profileId}, ${O.petId}, ${PHARM_ID}, 'delivery', 'Home', true, 'requested')
    `;
  });

  it('owner + dispensing pharmacy staff read; other-provider staff + outsider + anon read ZERO', async () => {
    await asApp(O.profileId, async (tx) => expect(ids(await tx`select id from rx_fulfillment_orders`)).toEqual([FUL_ID]));
    await asApp(PH.profileId, async (tx) => expect(ids(await tx`select id from rx_fulfillment_orders`)).toEqual([FUL_ID]));
    await asApp(Y.profileId, async (tx) => expect(await tx`select id from rx_fulfillment_orders`).toHaveLength(0));
    await asApp(X.profileId, async (tx) => expect(await tx`select id from rx_fulfillment_orders`).toHaveLength(0));
    await asApp(null, async (tx) => expect(await tx`select id from rx_fulfillment_orders`).toHaveLength(0));
  });

  it('pharmacy staff accepts + prices the order', async () => {
    await asApp(PH.profileId, async (tx) => {
      const r = await tx`update rx_fulfillment_orders set status = 'accepted', price_cents = 2500 where id = ${FUL_ID} returning status, price_cents`;
      expect(r[0].status).toBe('accepted');
      expect(r[0].price_cents).toBe(2500);
    });
  });

  it('pharmacy staff CANNOT plain-UPDATE to fulfilled (reserved for the safe path)', async () => {
    await expect(
      asApp(PH.profileId, (tx) => tx`update rx_fulfillment_orders set status = 'fulfilled' where id = ${FUL_ID} returning id`),
    ).rejects.toThrow(/row-level security/i);
  });

  it('owner can cancel while requested but CANNOT advance to accepted', async () => {
    await asApp(O.profileId, async (tx) => {
      expect(await tx`update rx_fulfillment_orders set status = 'cancelled' where id = ${FUL_ID} returning id`).toHaveLength(1);
    });
    // reset for the second half
    await raw`update rx_fulfillment_orders set status = 'requested' where id = ${FUL_ID}`;
    await expect(
      asApp(O.profileId, (tx) => tx`update rx_fulfillment_orders set status = 'accepted' where id = ${FUL_ID} returning id`),
    ).rejects.toThrow(/row-level security/i);
  });

  it('other-provider staff advance ZERO of the dispenser\'s orders', async () => {
    await asApp(Y.profileId, async (tx) => {
      expect(await tx`update rx_fulfillment_orders set status = 'accepted' where id = ${FUL_ID} returning id`).toHaveLength(0);
    });
  });
});

describe('fulfill_rx_order safe path consumes a refill', () => {
  beforeEach(async () => {
    await raw`
      insert into rx_fulfillment_orders (id, prescription_id, owner_user_id, pet_id, provider_id, method, is_refill, status)
      values (${FUL_ID}, ${RX_ID}, ${O.profileId}, ${O.petId}, ${PHARM_ID}, 'pickup', true, 'ready')
    `;
  });

  it('pharmacy staff fulfills → status fulfilled + refills_remaining decremented (2→1)', async () => {
    await asApp(PH.profileId, async (tx) => {
      const [{ result }] = await tx`select fulfill_rx_order(${FUL_ID}) as result`;
      expect(result).toBe('fulfilled');
    });
    const [{ status }] = await raw`select status from rx_fulfillment_orders where id = ${FUL_ID}`;
    const [{ refills_remaining }] = await raw`select refills_remaining from prescriptions where id = ${RX_ID}`;
    expect(status).toBe('fulfilled');
    expect(refills_remaining).toBe(1);
  });

  it('a non-dispenser caller cannot fulfill (DEFINER returns forbidden)', async () => {
    await asApp(Y.profileId, async (tx) => {
      const [{ result }] = await tx`select fulfill_rx_order(${FUL_ID}) as result`;
      expect(result).toBe('forbidden');
    });
    const [{ refills_remaining }] = await raw`select refills_remaining from prescriptions where id = ${RX_ID}`;
    expect(refills_remaining).toBe(2); // untouched
  });

  it('the owner can never write prescriptions directly (append-only preserved)', async () => {
    await asApp(O.profileId, async (tx) => {
      expect(await tx`update prescriptions set refills_remaining = 99 where id = ${RX_ID} returning id`).toHaveLength(0);
    });
  });
});
