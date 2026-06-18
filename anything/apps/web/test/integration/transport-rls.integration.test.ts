// Ticket 2.52 — TRANSPORT / pet-taxi module, proven on the REAL tables AS pawpi_app.
//
// transport_trips (0052) is owner + provider-staff scoped (modeled on walk_sessions):
//   • OWNER manages own trips, but a new trip is always 'requested' and the owner can only
//     edit/cancel — they CANNOT advance to a provider-only status (confirmed/en_route/completed).
//   • active STAFF of the provider read ALL the provider's trips and UPDATE them (confirm, assign
//     a driver, advance status, set fare).
//   • other-provider staff + outsiders + no-identity → ZERO.
// Reuses app_is_active_staff_of(provider_id). Same harness shape as the sibling module suites.

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { inject } from 'vitest';
import postgres from 'postgres';
import type { Sql } from 'postgres';
import { makeTestSql, resetDb, seedOwnerWithPet, seedUser, seedProvider, seedStaff, seedCapability } from './db';

const O = { authUserId: 1, profileId: 1, username: 'ownero', petId: 1, petName: 'Rex' };
const D = { authUserId: 2, profileId: 2, username: 'driverd' }; // active staff of the transport provider
const X = { authUserId: 3, profileId: 3, username: 'outsiderx' };
const Y = { authUserId: 4, profileId: 4, username: 'otherstaffy' }; // staff of a DIFFERENT provider
const TRANSPORT_ID = 10;
const OTHER_ID = 11;
const TRIP_ID = 100;

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
  await seedUser(raw, D);
  await seedUser(raw, X);
  await seedUser(raw, Y);
  await seedProvider(raw, { providerId: TRANSPORT_ID, ownerUserProfileId: D.profileId, slug: 'pet-taxi', status: 'published' });
  await seedStaff(raw, { providerId: TRANSPORT_ID, userProfileId: D.profileId, role: 'owner' });
  await seedCapability(raw, { providerId: TRANSPORT_ID, capability: 'transport' });
  await seedProvider(raw, { providerId: OTHER_ID, ownerUserProfileId: Y.profileId, slug: 'other-co', status: 'published' });
  await seedStaff(raw, { providerId: OTHER_ID, userProfileId: Y.profileId, role: 'owner' });
  await raw`
    insert into transport_trips (id, provider_id, pet_id, owner_user_id, pickup_address, dropoff_address, status)
    values (${TRIP_ID}, ${TRANSPORT_ID}, ${O.petId}, ${O.profileId}, 'Home', 'Vet clinic', 'requested')
  `;
});

describe('transport_trips read RLS', () => {
  it('owner reads own; provider staff reads; other-provider staff + outsider + anon read ZERO', async () => {
    await asApp(O.profileId, async (tx) => expect(ids(await tx`select id from transport_trips`)).toEqual([TRIP_ID]));
    await asApp(D.profileId, async (tx) => expect(ids(await tx`select id from transport_trips`)).toEqual([TRIP_ID]));
    await asApp(Y.profileId, async (tx) => expect(await tx`select id from transport_trips`).toHaveLength(0));
    await asApp(X.profileId, async (tx) => expect(await tx`select id from transport_trips`).toHaveLength(0));
    await asApp(null, async (tx) => expect(await tx`select id from transport_trips`).toHaveLength(0));
  });

  it('a driver loses access the instant their staff row flips to removed', async () => {
    await raw`update provider_staff set status = 'removed' where provider_id = ${TRANSPORT_ID} and user_profile_id = ${D.profileId}`;
    await asApp(D.profileId, async (tx) => expect(await tx`select id from transport_trips`).toHaveLength(0));
  });
});

describe('transport_trips write RLS', () => {
  it('owner can INSERT a requested trip', async () => {
    const created = await asApp(O.profileId, (tx) => tx`
      insert into transport_trips (provider_id, pet_id, owner_user_id, pickup_address, status)
      values (${TRANSPORT_ID}, ${O.petId}, ${O.profileId}, 'Home', 'requested')
      returning id
    `);
    expect(created).toHaveLength(1);
  });

  it('owner CANNOT insert an already-confirmed trip (self-confirm blocked)', async () => {
    await expect(
      asApp(O.profileId, (tx) => tx`
        insert into transport_trips (provider_id, pet_id, owner_user_id, status)
        values (${TRANSPORT_ID}, ${O.petId}, ${O.profileId}, 'confirmed')
      `),
    ).rejects.toThrow(/row-level security/i);
  });

  it('owner can cancel (status=cancelled)', async () => {
    await asApp(O.profileId, async (tx) => {
      expect(await tx`update transport_trips set status = 'cancelled' returning id`).toHaveLength(1);
    });
  });

  it('owner CANNOT advance to a provider-only status (confirmed) — WITH CHECK reject', async () => {
    await expect(
      asApp(O.profileId, (tx) => tx`update transport_trips set status = 'confirmed' returning id`),
    ).rejects.toThrow(/row-level security/i);
  });

  it('provider staff confirms + assigns a driver + advances status', async () => {
    const [{ id: staffId }] = await raw`select id from provider_staff where provider_id = ${TRANSPORT_ID} and user_profile_id = ${D.profileId}`;
    await asApp(D.profileId, async (tx) => {
      const r = await tx`
        update transport_trips
        set status = 'confirmed', assigned_staff_id = ${staffId}, fare_amount = 2500
        where id = ${TRIP_ID}
        returning id, status, assigned_staff_id
      `;
      expect(r).toHaveLength(1);
      expect(r[0].status).toBe('confirmed');
      expect(r[0].assigned_staff_id).toBe(staffId);
    });
  });

  it('other-provider staff updates ZERO of this provider\'s trips', async () => {
    await asApp(Y.profileId, async (tx) => {
      expect(await tx`update transport_trips set status = 'confirmed' returning id`).toHaveLength(0);
    });
  });
});
