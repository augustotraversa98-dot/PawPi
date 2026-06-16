// Ticket 2.4 — GENERALIZED BOOKING, proven on the REAL tables acting AS pawpi_app.
// Companion to the R2 suites (pets/social/owner-private/provider-records/business/
// consent/payments). 0030 takes PATH (a): extend vet_appointments in place + a new
// provider_availability table + a provider_bookings VIEW.
//
// What this proves (as pawpi_app, NOBYPASSRLS, identity stamped per transaction):
//   1. provider_availability RLS — active staff read+write; a PUBLISHED provider's
//      windows are public-read (the owner booking surface); writes are owner|admin only;
//      no identity → zero.
//   2. The generalized booking columns on vet_appointments work under the UNCHANGED
//      0023 RLS — an owner reads/writes their own non-vet (groomer) booking; provider
//      active staff read it; an outsider reads zero. The vet path is untouched.
//   3. The double-book partial-unique index (0030) rejects a second live booking for the
//      same (provider, staff, start_at).
//   4. The provider_bookings VIEW inherits vet_appointments' RLS (security_invoker) — an
//      owner sees their booking through the view; an outsider sees zero.
//   5. A deposit order_id links a booking to a 2.3 order (FK + nullable).
//
// The harness owner is a superuser, so FORCE RLS constrains only pawpi_app.

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
  seedAvailability,
  seedGeneralBooking,
  seedOrder,
} from './db';

// O = booking owner (owns the pet). S = active staff of the provider. X = authed outsider.
const O = { authUserId: 1, profileId: 1, username: 'ownero', petId: 1, petName: 'Rex' };
const S = { authUserId: 2, profileId: 2, username: 'staffs' };
const X = { authUserId: 3, profileId: 3, username: 'outsiderx' };
const PROVIDER_ID = 10;

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

// O owns a pet; a PUBLISHED provider with S as active staff offering 'groomer'.
beforeEach(async () => {
  await seedOwnerWithPet(raw, O);
  await seedUser(raw, S);
  await seedUser(raw, X);
  await seedProvider(raw, {
    providerId: PROVIDER_ID,
    ownerUserProfileId: S.profileId, // S is the business owner-staff
    slug: 'pet-spa',
    status: 'published',
  });
  await seedStaff(raw, { providerId: PROVIDER_ID, userProfileId: S.profileId, role: 'owner' });
  await seedCapability(raw, { providerId: PROVIDER_ID, capability: 'groomer' });
});

// ──────────────────────────────────────────────────────────────────────────────
describe('2.4 — provider_availability RLS (as pawpi_app)', () => {
  beforeEach(async () => {
    await seedAvailability(raw, { availabilityId: 1, providerId: PROVIDER_ID, capability: 'groomer' });
  });

  it('active staff read the window', async () => {
    await asApp(S.profileId, async (tx) => {
      expect(ids(await tx`select id from provider_availability`)).toEqual([1]);
    });
  });

  it('a published provider window is public-read (the owner booking surface)', async () => {
    await asApp(O.profileId, async (tx) => {
      expect(ids(await tx`select id from provider_availability`)).toEqual([1]);
    });
    await asApp(X.profileId, async (tx) => {
      expect(ids(await tx`select id from provider_availability`)).toEqual([1]);
    });
  });

  it('a DRAFT provider hides its windows from a non-staff outsider (only staff read)', async () => {
    // Flip the provider to draft: the public-read branch (published) no longer applies,
    // so only active staff can read; a non-staff outsider and no-identity read zero.
    await raw`update providers set status = 'draft' where id = ${PROVIDER_ID}`;
    await asApp(X.profileId, async (tx) => {
      expect(await tx`select id from provider_availability`).toHaveLength(0);
    });
    await asApp(null, async (tx) => {
      expect(await tx`select id from provider_availability`).toHaveLength(0);
    });
    // Staff still read it (management read of a draft provider).
    await asApp(S.profileId, async (tx) => {
      expect(ids(await tx`select id from provider_availability`)).toEqual([1]);
    });
  });

  it('owner|admin staff (S) writes a window; a non-staff (O) cannot', async () => {
    await asApp(S.profileId, async (tx) => {
      const created = await tx`
        insert into provider_availability (id, provider_id, weekday, start_time, end_time, slot_minutes)
        values (2, ${PROVIDER_ID}, 1, '10:00', '12:00', 30)
        returning id
      `;
      expect(created).toHaveLength(1);
    });
    await expect(
      asApp(O.profileId, (tx) => tx`
        insert into provider_availability (id, provider_id, weekday, start_time, end_time, slot_minutes)
        values (3, ${PROVIDER_ID}, 2, '10:00', '12:00', 30)
      `),
    ).rejects.toThrow(/row-level security/i);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
describe('2.4 — generalized (groomer) booking on vet_appointments (as pawpi_app)', () => {
  beforeEach(async () => {
    await seedGeneralBooking(raw, {
      apptId: 100,
      petId: O.petId,
      ownerUserId: O.profileId,
      providerId: PROVIDER_ID,
      staffUserId: S.profileId,
      capability: 'groomer',
    });
  });

  it('owner O reads + updates their own groomer booking (owner FOR ALL, unchanged)', async () => {
    await asApp(O.profileId, async (tx) => {
      const rows = await tx`select id, capability, start_at from vet_appointments`;
      expect(ids(rows)).toEqual([100]);
      expect(rows[0].capability).toBe('groomer');
      const upd = await tx`
        update vet_appointments set notes = 'pls trim' where id = 100 returning id
      `;
      expect(upd).toHaveLength(1);
    });
  });

  it('provider active staff S read the booking (inbox); outsider X reads zero', async () => {
    await asApp(S.profileId, async (tx) => {
      expect(ids(await tx`select id from vet_appointments`)).toEqual([100]);
    });
    await asApp(X.profileId, async (tx) => {
      expect(await tx`select id from vet_appointments`).toHaveLength(0);
    });
  });

  it('the provider_bookings VIEW inherits the same RLS (owner sees it, outsider zero)', async () => {
    await asApp(O.profileId, async (tx) => {
      const rows = await tx`select id, capability from provider_bookings`;
      expect(ids(rows)).toEqual([100]);
      expect(rows[0].capability).toBe('groomer');
    });
    await asApp(X.profileId, async (tx) => {
      expect(await tx`select id from provider_bookings`).toHaveLength(0);
    });
  });

  it('double-book index rejects a second live booking for the same staff+slot', async () => {
    // Same provider/staff/start_at, live (requested) → unique-index violation.
    await expect(
      asApp(O.profileId, (tx) => tx`
        insert into vet_appointments
          (id, pet_id, owner_user_id, title, appointment_date, appointment_time,
           provider_id, staff_user_id, capability, start_at, end_at, booking_status, source, status)
        values
          (101, ${O.petId}, ${O.profileId}, 'Groom2', '2026-07-06', '09:00',
           ${PROVIDER_ID}, ${S.profileId}, 'groomer', '2026-07-06T09:00:00Z', '2026-07-06T09:30:00Z',
           'requested', 'owner', 'scheduled')
      `),
    ).rejects.toThrow(/duplicate key|unique/i);
  });

  it('a deposit order_id links the booking to a 2.3 order', async () => {
    await seedOrder(raw, { orderId: 500, ownerUserId: O.profileId, providerId: PROVIDER_ID });
    await asApp(O.profileId, async (tx) => {
      const upd = await tx`
        update vet_appointments set order_id = 500 where id = 100 returning id, order_id
      `;
      expect(upd[0].order_id).toBe(500);
    });
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// The VET path is UNCHANGED: a plain vet booking (capability 'vet', no slot) is read by
// the owner and provider staff exactly as before, and is OUTSIDE the double-book index.
describe('2.4 — vet booking remains unchanged (as pawpi_app)', () => {
  it('a vet booking (capability default) round-trips and two can share a null slot', async () => {
    await asApp(O.profileId, async (tx) => {
      // Two vet bookings, no start_at — the double-book index (start_at NOT NULL) does
      // not bind them, proving the vet path is untouched.
      await tx`
        insert into vet_appointments
          (id, pet_id, owner_user_id, title, appointment_date, appointment_time,
           provider_id, booking_status, source, status)
        values (200, ${O.petId}, ${O.profileId}, 'Checkup', '2026-07-01', '09:00',
                ${PROVIDER_ID}, 'requested', 'owner', 'scheduled')
      `;
      await tx`
        insert into vet_appointments
          (id, pet_id, owner_user_id, title, appointment_date, appointment_time,
           provider_id, booking_status, source, status)
        values (201, ${O.petId}, ${O.profileId}, 'Checkup2', '2026-07-01', '09:00',
                ${PROVIDER_ID}, 'requested', 'owner', 'scheduled')
      `;
      const rows = await tx`select id, capability from vet_appointments order by id`;
      expect(ids(rows)).toEqual([200, 201]);
      expect(rows[0].capability).toBe('vet'); // column default backfilled
    });
  });
});
