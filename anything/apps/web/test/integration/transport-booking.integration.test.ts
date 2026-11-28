// Booking pet transport (2.52) through the REAL Hono router on real Postgres as pawpi_app. The POST on
// /providers/[id]/transport-trips is the OWNER's booking path, so the caller is a customer, not staff of the
// business; the GET on the same path is the business's inbox and stays staff only.

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

// None of OWNER, OTHER or the pets belongs to a provider_staff row.
const OWNER = { authUserId: 1, profileId: 1, username: 'owner', petId: 1, petName: 'Rex' };
const OTHER = { authUserId: 2, profileId: 2, username: 'other', petId: 2, petName: 'Mora' };
const DRIVER = { authUserId: 3, profileId: 3, username: 'driver' };

const TAXI = 10;
const DRAFT_TAXI = 11;
const NOT_TAXI = 12;

let raw: Sql;
let api: any;

function as(who: { authUserId: number } | null) {
  authState.session = who ? { user: { id: who.authUserId } } : null;
}

function book(providerId: number, body: Record<string, unknown> = {}) {
  return api.request(`/providers/${providerId}/transport-trips`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      petId: OWNER.petId,
      scheduled_at: '2027-03-01T10:00:00.000Z',
      pickup_address: 'Home',
      dropoff_address: 'Clinic',
      ...body,
    }),
  });
}

const rows = async () => ({
  bookings: await raw`select * from vet_appointments order by id`,
  trips: await raw`select * from transport_trips order by id`,
});

async function expectNothingWritten() {
  const { bookings, trips } = await rows();
  expect(bookings).toHaveLength(0);
  expect(trips).toHaveLength(0);
}

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
  await seedOwnerWithPet(raw, OTHER);
  await seedUser(raw, DRIVER);

  await seedProvider(raw, { providerId: TAXI, ownerUserProfileId: DRIVER.profileId, slug: 'pet-taxi', status: 'published' });
  await seedProvider(raw, { providerId: DRAFT_TAXI, ownerUserProfileId: DRIVER.profileId, slug: 'draft-taxi', status: 'draft' });
  await seedProvider(raw, { providerId: NOT_TAXI, ownerUserProfileId: DRIVER.profileId, slug: 'vet-only', status: 'published' });
  for (const providerId of [TAXI, DRAFT_TAXI, NOT_TAXI]) {
    await seedStaff(raw, { providerId, userProfileId: DRIVER.profileId, role: 'owner', status: 'active' });
  }
  await seedCapability(raw, { providerId: TAXI, capability: 'transport' });
  await seedCapability(raw, { providerId: DRAFT_TAXI, capability: 'transport' });
  await seedCapability(raw, { providerId: NOT_TAXI, capability: 'vet' });
});

describe('an owner books pet transport', () => {
  it('a customer who is not staff of the business books it, writing the booking and the trip', async () => {
    as(OWNER);
    const res = await book(TAXI, { trip_type: 'round_trip', carrier_needed: true, notes: 'Ring twice' });
    const body: any = await res.json();
    expect(body.error).toBeUndefined();
    expect(res.status).toBe(201);

    const { bookings, trips } = await rows();
    expect(bookings).toHaveLength(1);
    expect(bookings[0]).toMatchObject({
      id: body.booking_id,
      pet_id: OWNER.petId,
      owner_user_id: OWNER.profileId,
      provider_id: TAXI,
      capability: 'transport',
      source: 'owner',
      booking_status: 'requested',
    });
    expect(trips).toHaveLength(1);
    expect(trips[0]).toMatchObject({
      id: body.trip.id,
      booking_id: body.booking_id,
      pet_id: OWNER.petId,
      owner_user_id: OWNER.profileId,
      provider_id: TAXI,
      status: 'requested',
      trip_type: 'round_trip',
      carrier_needed: true,
      assigned_staff_id: null,
      fare_amount: null,
    });
  });

  it('the owner then sees the trip, and so does the business inbox', async () => {
    as(OWNER);
    expect((await book(TAXI)).status).toBe(201);
    const mine: any = await (await api.request('/transport-trips')).json();
    expect(mine.trips).toHaveLength(1);

    as(DRIVER);
    const inbox = await api.request(`/providers/${TAXI}/transport-trips`);
    expect(inbox.status).toBe(200);
    const { trips }: any = await inbox.json();
    expect(trips).toHaveLength(1);
    expect(trips[0]).toMatchObject({ pet_name: OWNER.petName, status: 'requested' });
  });
});

describe('what the booking still refuses, writing nothing', () => {
  it('a signed-out caller', async () => {
    as(null);
    expect((await book(TAXI)).status).toBe(401);
    await expectNothingWritten();
  });

  it("someone else's pet", async () => {
    as(OTHER);
    const res = await book(TAXI);
    expect(res.status).toBe(403);
    expect(((await res.json()) as any).error).toBe('You do not own this pet');
    await expectNothingWritten();
  });

  it("the business's own staff booking a customer's pet", async () => {
    as(DRIVER);
    expect((await book(TAXI)).status).toBe(403);
    await expectNothingWritten();
  });

  it('an unpublished business', async () => {
    as(OWNER);
    expect((await book(DRAFT_TAXI)).status).toBe(404);
    await expectNothingWritten();
  });

  it('a business without the transport capability', async () => {
    as(OWNER);
    expect((await book(NOT_TAXI)).status).toBe(403);
    await expectNothingWritten();
  });
});

describe('the business inbox stays staff only', () => {
  it('a customer cannot read it, even one with a trip there', async () => {
    as(OWNER);
    expect((await book(TAXI)).status).toBe(201);
    for (const who of [OWNER, OTHER]) {
      as(who);
      const res = await api.request(`/providers/${TAXI}/transport-trips`);
      expect(res.status).toBe(403);
      expect((await res.json()) as any).not.toHaveProperty('trips');
    }
  });

  it('removed staff cannot read it', async () => {
    await raw`update provider_staff set status = 'removed' where provider_id = ${TAXI}`;
    as(DRIVER);
    expect((await api.request(`/providers/${TAXI}/transport-trips`)).status).toBe(403);
  });

  it('a customer cannot confirm or price their own trip through the staff routes', async () => {
    as(OWNER);
    const { trip }: any = await (await book(TAXI)).json();
    const res = await api.request(`/providers/${TAXI}/transport-trips/${trip.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'confirmed', fare_amount: 1 }),
    });
    expect(res.status).toBe(403);
    const { trips } = await rows();
    expect(trips[0]).toMatchObject({ status: 'requested', fare_amount: null });
  });
});
