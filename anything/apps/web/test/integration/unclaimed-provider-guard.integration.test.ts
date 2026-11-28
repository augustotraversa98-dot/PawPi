// A directory listing nobody has claimed (providers.claim_status, 0124) has no one on the other side, so every
// route where a customer sends something to a business refuses it. Proven through the REAL Hono router on real
// Postgres as pawpi_app. The unclaimed listing here holds every capability a route asks for, so the claim guard is
// the only thing refusing it; the claimed business next to it is the control.

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Sql } from 'postgres';
import { inject } from 'vitest';
import {
  makeTestSql,
  resetDb,
  seedOwnerWithPet,
  seedUser,
  seedProvider,
  seedStaff,
  seedCapability,
} from './db';

const authState = vi.hoisted(() => ({ session: null as any }));
vi.mock('@/auth', () => ({ auth: async () => authState.session }));

const OWNER = { authUserId: 1, profileId: 1, username: 'owner', petId: 1, petName: 'Rex' };
// Not the username 'pawpi_directory': migration 0124 already holds it until the first reset.
const DIRECTORY = { authUserId: 2, profileId: 2, username: 'seed_directory' };
const VET = { authUserId: 3, profileId: 3, username: 'vet' };

const UNCLAIMED = 8;
const CLAIMED = 10;
const CAPABILITIES = [
  'vet', 'walker', 'daycare', 'trainer', 'shop', 'pharmacy', 'transport', 'insurance', 'adoption',
];

let raw: Sql;
let api: any;

function send(path: string, body: unknown, language = 'en') {
  authState.session = { user: { id: OWNER.authUserId } };
  return api.request(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'accept-language': language },
    body: JSON.stringify(body),
  });
}

async function expectUnclaimed(res: Response, noun: 'booking' | 'order' | 'message' | 'request') {
  const body: any = await res.json();
  expect(body).toMatchObject({
    code: 'provider_unclaimed',
    error: `This business hasn't been claimed yet, so we can't send your ${noun}.`,
  });
  expect(res.status).toBe(409);
}

const count = async (table: string) =>
  (await raw.unsafe(`select count(*)::int as n from ${table}`))[0].n as number;

beforeAll(async () => {
  raw = makeTestSql();
  const url = new URL(inject('TEST_DATABASE_URL'));
  url.username = 'pawpi_app';
  url.password = 'pawpi_app';
  process.env.DATABASE_URL = url.toString();
  process.env.DATABASE_SSL = 'disable';
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
  await seedOwnerWithPet(raw, OWNER);
  await seedUser(raw, DIRECTORY);
  await seedUser(raw, VET);

  await seedProvider(raw, { providerId: UNCLAIMED, ownerUserProfileId: DIRECTORY.profileId, slug: 'seeded-vet', status: 'published' });
  await raw`
    update providers set claim_status = 'unclaimed', source = 'serpapi_gmaps',
      external_source = 'serpapi_gmaps', external_id = 'ext-8'
    where id = ${UNCLAIMED}
  `;
  await seedProvider(raw, { providerId: CLAIMED, ownerUserProfileId: VET.profileId, slug: 'claimed-vet', status: 'published' });
  await seedStaff(raw, { providerId: CLAIMED, userProfileId: VET.profileId, role: 'owner', status: 'active' });
  for (const capability of CAPABILITIES) {
    await seedCapability(raw, { providerId: UNCLAIMED, capability });
    await seedCapability(raw, { providerId: CLAIMED, capability });
  }
});

const booking = { petId: OWNER.petId, appointment_date: '2027-03-01', appointment_time: '10:00' };

describe('booking', () => {
  it('an unclaimed listing refuses it and writes nothing', async () => {
    await expectUnclaimed(await send(`/providers/${UNCLAIMED}/book`, booking), 'booking');
    expect(await count('vet_appointments')).toBe(0);
    expect(await count('notifications')).toBe(0);
  });

  it('answers in Spanish to a Spanish caller', async () => {
    const body: any = await (await send(`/providers/${UNCLAIMED}/book`, booking, 'es-AR')).json();
    expect(body.error).toBe(
      'Este negocio todavía no fue reclamado, así que no podemos enviarle tu reserva.',
    );
  });

  it('a claimed business is booked as before', async () => {
    const res = await send(`/providers/${CLAIMED}/book`, booking);
    expect(res.status).toBe(201);
    expect(await count('vet_appointments')).toBe(1);
  });

  it('the same listing takes the booking once it is claimed', async () => {
    await raw`update providers set claim_status = 'claimed' where id = ${UNCLAIMED}`;
    expect((await send(`/providers/${UNCLAIMED}/book`, booking)).status).toBe(201);
  });
});

describe('messages', () => {
  it('no thread can be opened with an unclaimed listing', async () => {
    await expectUnclaimed(await send('/threads', { providerId: UNCLAIMED }), 'message');
    expect(await count('message_threads')).toBe(0);
  });

  it('a thread opened before this guard takes no message', async () => {
    const [thread] = await raw<{ id: number }[]>`
      insert into message_threads (owner_user_id, provider_id) values (${OWNER.profileId}, ${UNCLAIMED}) returning id
    `;
    await expectUnclaimed(await send(`/threads/${thread.id}/messages`, { body: 'hola' }), 'message');
    expect(await count('messages')).toBe(0);
  });

  it('a claimed business is messaged as before', async () => {
    const started = await send('/threads', { providerId: CLAIMED });
    expect(started.status).toBe(201);
    const { thread }: any = await started.json();
    expect((await send(`/threads/${thread.id}/messages`, { body: 'hola' })).status).toBe(201);
    expect(await count('messages')).toBe(1);
  });
});

describe('orders and payments', () => {
  const rail = 'mercadopago';

  it('payment checkout', async () => {
    const res = await send('/payments/checkout', { provider_id: UNCLAIMED, kind: 'donation', amount_cents: 1000, rail });
    await expectUnclaimed(res, 'order');
    expect(await count('orders')).toBe(0);
  });

  it('shop checkout', async () => {
    const res = await send(`/pets/${OWNER.petId}/shop-checkout`, {
      provider_id: UNCLAIMED, rail, items: [{ product_id: 1, quantity: 1 }],
    });
    await expectUnclaimed(res, 'order');
    expect(await count('orders')).toBe(0);
  });

  it('walk package checkout', async () => {
    const res = await send(`/pets/${OWNER.petId}/walk-package-checkout`, {
      provider_id: UNCLAIMED, walk_package_id: 1, rail,
    });
    await expectUnclaimed(res, 'order');
    expect(await count('orders')).toBe(0);
  });

  it('auto-reorder subscription', async () => {
    const [product] = await raw<{ id: number }[]>`
      insert into shop_products (provider_id, name, price_cents, stock_qty) values (${UNCLAIMED}, 'Food', 100, 5) returning id
    `;
    await expectUnclaimed(await send('/shop/subscriptions', { product_id: product.id, plan: 'monthly' }), 'order');
    expect(await count('subscriptions')).toBe(0);
  });

  it('prescription fulfilment', async () => {
    const res = await send('/rx-fulfillment-orders', { prescription_id: 1, provider_id: UNCLAIMED, method: 'pickup' });
    await expectUnclaimed(res, 'order');
    expect(await count('rx_fulfillment_orders')).toBe(0);
  });
});

describe('stays, training, walks and trips', () => {
  it('daycare stay', async () => {
    const res = await send(`/pets/${OWNER.petId}/daycare-stays`, {
      provider_id: UNCLAIMED, start_date: '2027-03-01', end_date: '2027-03-02',
    });
    await expectUnclaimed(res, 'booking');
    expect(await count('daycare_stays')).toBe(0);
  });

  it('training program', async () => {
    const res = await send(`/pets/${OWNER.petId}/training-programs`, { provider_id: UNCLAIMED, title: 'Puppy' });
    await expectUnclaimed(res, 'request');
    expect(await count('training_programs')).toBe(0);
  });

  it('training class', async () => {
    const [cls] = await raw<{ id: number }[]>`
      insert into training_sessions (provider_id, kind, title) values (${UNCLAIMED}, 'group_class', 'Class') returning id
    `;
    await expectUnclaimed(await send(`/pets/${OWNER.petId}/training-classes`, { session_id: cls.id }), 'request');
    expect(await count('training_progress')).toBe(0);
  });

  it('direct walk request', async () => {
    const res = await send('/walk-requests', { pet_id: OWNER.petId, target_provider_id: UNCLAIMED, when_type: 'now' });
    await expectUnclaimed(res, 'request');
    expect(await count('walk_requests')).toBe(0);
  });

  it('a claimed walker takes a direct walk request as before', async () => {
    const res = await send('/walk-requests', { pet_id: OWNER.petId, target_provider_id: CLAIMED, when_type: 'now' });
    expect(res.status).toBe(201);
  });

  // The route asks the caller to be the business's staff, which no one is for a seeded listing; the staff row here
  // only gets the request as far as the claim guard.
  it('pet transport trip', async () => {
    await seedStaff(raw, { providerId: UNCLAIMED, userProfileId: OWNER.profileId, role: 'staff', status: 'active' });
    const res = await send(`/providers/${UNCLAIMED}/transport-trips`, {
      petId: OWNER.petId, scheduled_at: '2027-03-01T10:00:00.000Z', pickup_address: 'A', dropoff_address: 'B',
    });
    await expectUnclaimed(res, 'booking');
    expect(await count('transport_trips')).toBe(0);
    expect(await count('vet_appointments')).toBe(0);
  });
});

describe('requests', () => {
  it('insurance quote request', async () => {
    await expectUnclaimed(await send('/insurance-leads', { provider_id: UNCLAIMED }), 'request');
    expect(await count('insurance_leads')).toBe(0);
  });

  it('adoption application', async () => {
    const [listing] = await raw<{ id: number }[]>`
      insert into adoptable_listings (provider_id, name, status) values (${UNCLAIMED}, 'Luna', 'available') returning id
    `;
    await expectUnclaimed(await send('/adoption/applications', { listing_id: listing.id }), 'request');
    expect(await count('adoption_applications')).toBe(0);
  });

  it('sharing a pet record', async () => {
    const res = await send('/care-access/grants', { petId: OWNER.petId, providerId: UNCLAIMED });
    await expectUnclaimed(res, 'request');
    expect(await count('care_access_grants')).toBe(0);
  });

  it('a record invitation was already refused by 0154 (the listing is not offered as a vet)', async () => {
    const res = await send('/care-access/offers', {
      petId: OWNER.petId, providerId: UNCLAIMED, sections: ['vaccines'], expiry: '30d',
    });
    expect(res.status).toBe(404);
    expect(await count('care_share_offers')).toBe(0);
  });

  it('a claimed business is shared with as before', async () => {
    const res = await send('/care-access/grants', { petId: OWNER.petId, providerId: CLAIMED });
    expect(res.status).toBe(201);
  });
});
