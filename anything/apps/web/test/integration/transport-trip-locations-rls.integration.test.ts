// Ticket 2.70 — TRANSPORT live-GPS pings, proven on the REAL tables AS pawpi_app.
//
// transport_trip_locations (0056) hangs off transport_trips (0052):
//   • INSERT — ONLY the trip's assigned active driver, ONLY while status='en_route'
//     (app_can_post_trip_location). A non-assigned staffer, the owner, and an outsider CANNOT post;
//     the assigned driver CANNOT post once the trip leaves en_route.
//   • SELECT — the trip OWNER, the assigned driver, and active staff of the trip's provider
//     (app_can_read_trip_location); other-provider staff + outsiders + no-identity → ZERO.
//   • No UPDATE/DELETE policy — pings are append-only.
// Same harness shape as the sibling module suites.

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { inject } from 'vitest';
import postgres from 'postgres';
import type { Sql } from 'postgres';
import { makeTestSql, resetDb, seedOwnerWithPet, seedUser, seedProvider, seedStaff, seedCapability } from './db';

const O = { authUserId: 1, profileId: 1, username: 'ownero', petId: 1, petName: 'Rex' };
const D = { authUserId: 2, profileId: 2, username: 'driverd' }; // assigned active driver
const S = { authUserId: 3, profileId: 3, username: 'staffs' }; // active staff, NOT assigned
const X = { authUserId: 4, profileId: 4, username: 'outsiderx' };
const Y = { authUserId: 5, profileId: 5, username: 'otherstaffy' }; // staff of a DIFFERENT provider
const TRANSPORT_ID = 10;
const OTHER_ID = 11;
const TRIP_ID = 100;

let raw: Sql;
let app: Sql;
let driverStaffId: number;

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
  await seedUser(raw, D);
  await seedUser(raw, S);
  await seedUser(raw, X);
  await seedUser(raw, Y);
  await seedProvider(raw, { providerId: TRANSPORT_ID, ownerUserProfileId: D.profileId, slug: 'pet-taxi', status: 'published' });
  await seedStaff(raw, { providerId: TRANSPORT_ID, userProfileId: D.profileId, role: 'owner' });
  await seedStaff(raw, { providerId: TRANSPORT_ID, userProfileId: S.profileId, role: 'staff' });
  await seedCapability(raw, { providerId: TRANSPORT_ID, capability: 'transport' });
  await seedProvider(raw, { providerId: OTHER_ID, ownerUserProfileId: Y.profileId, slug: 'other-co', status: 'published' });
  await seedStaff(raw, { providerId: OTHER_ID, userProfileId: Y.profileId, role: 'owner' });

  const [{ id }] = await raw`
    select id from provider_staff where provider_id = ${TRANSPORT_ID} and user_profile_id = ${D.profileId}
  `;
  driverStaffId = id;

  // The trip is en_route with D assigned as the driver.
  await raw`
    insert into transport_trips (id, provider_id, pet_id, owner_user_id, pickup_address, dropoff_address, assigned_staff_id, status)
    values (${TRIP_ID}, ${TRANSPORT_ID}, ${O.petId}, ${O.profileId}, 'Home', 'Vet clinic', ${driverStaffId}, 'en_route')
  `;
});

describe('transport_trip_locations INSERT RLS', () => {
  it('the assigned driver posts a ping while en_route', async () => {
    const created = await asApp(D.profileId, (tx) => tx`
      insert into transport_trip_locations (trip_id, lat, lng, posted_by_staff_id)
      values (${TRIP_ID}, 40.7, -74, ${driverStaffId})
      returning id
    `);
    expect(created).toHaveLength(1);
  });

  it('a non-assigned (but active) staffer CANNOT post', async () => {
    await expect(
      asApp(S.profileId, (tx) => tx`
        insert into transport_trip_locations (trip_id, lat, lng) values (${TRIP_ID}, 40.7, -74)
      `),
    ).rejects.toThrow(/row-level security/i);
  });

  it('the owner CANNOT post', async () => {
    await expect(
      asApp(O.profileId, (tx) => tx`
        insert into transport_trip_locations (trip_id, lat, lng) values (${TRIP_ID}, 40.7, -74)
      `),
    ).rejects.toThrow(/row-level security/i);
  });

  it('an outsider CANNOT post', async () => {
    await expect(
      asApp(X.profileId, (tx) => tx`
        insert into transport_trip_locations (trip_id, lat, lng) values (${TRIP_ID}, 40.7, -74)
      `),
    ).rejects.toThrow(/row-level security/i);
  });

  it('the assigned driver CANNOT post once the trip leaves en_route', async () => {
    await raw`update transport_trips set status = 'completed' where id = ${TRIP_ID}`;
    await expect(
      asApp(D.profileId, (tx) => tx`
        insert into transport_trip_locations (trip_id, lat, lng, posted_by_staff_id)
        values (${TRIP_ID}, 40.7, -74, ${driverStaffId})
      `),
    ).rejects.toThrow(/row-level security/i);
  });
});

describe('transport_trip_locations SELECT RLS', () => {
  beforeEach(async () => {
    await raw`
      insert into transport_trip_locations (id, trip_id, lat, lng, posted_by_staff_id)
      values (500, ${TRIP_ID}, 40.7, -74, ${driverStaffId})
    `;
  });

  it('owner, assigned driver, and active provider staff read the ping; others read ZERO', async () => {
    await asApp(O.profileId, async (tx) => expect(ids(await tx`select id from transport_trip_locations`)).toEqual([500]));
    await asApp(D.profileId, async (tx) => expect(ids(await tx`select id from transport_trip_locations`)).toEqual([500]));
    await asApp(S.profileId, async (tx) => expect(ids(await tx`select id from transport_trip_locations`)).toEqual([500]));
    await asApp(Y.profileId, async (tx) => expect(await tx`select id from transport_trip_locations`).toHaveLength(0));
    await asApp(X.profileId, async (tx) => expect(await tx`select id from transport_trip_locations`).toHaveLength(0));
    await asApp(null, async (tx) => expect(await tx`select id from transport_trip_locations`).toHaveLength(0));
  });

  it('a driver loses ping access the instant their staff row flips to removed', async () => {
    await raw`update provider_staff set status = 'removed' where provider_id = ${TRANSPORT_ID} and user_profile_id = ${D.profileId}`;
    await asApp(D.profileId, async (tx) => expect(await tx`select id from transport_trip_locations`).toHaveLength(0));
  });
});
