// Provider auto-confirm (0079) — proven on the REAL tables. This is the migration smoke test:
// the two DB-level facts the feature relies on, which only real Postgres (with 0079 applied by
// the harness) can prove:
//
//   1. providers.auto_confirm_bookings exists, DEFAULTS to false (so every existing provider
//      keeps manual-accept), and round-trips true/false.
//   2. a vet_appointments row written with booking_status='confirmed' — the value the book route
//      writes when auto-confirm is ON and there is no order_id — is accepted by the schema
//      (0030 widened booking_status to allow 'confirmed'). The route's status LOGIC itself is
//      covered by the unit tests; this proves the value it writes is valid end-to-end.
//
// The harness owner is a superuser; these are schema/value facts, so they run via `raw`.

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Sql } from 'postgres';
import { makeTestSql, resetDb, seedOwnerWithPet, seedProvider } from './db';

const O = { authUserId: 1, profileId: 1, username: 'ownero', petId: 1, petName: 'Rex' };
const PROV_ID = 30;

let raw: Sql;

beforeAll(async () => {
  raw = makeTestSql();
});

afterAll(async () => {
  await raw.end();
});

afterEach(async () => {
  await resetDb(raw);
});

beforeEach(async () => {
  await seedOwnerWithPet(raw, O);
  await seedProvider(raw, { providerId: PROV_ID, ownerUserProfileId: O.profileId, slug: 'auto' });
});

describe('providers.auto_confirm_bookings (0079)', () => {
  it('defaults to false for a freshly-seeded provider', async () => {
    const rows = await raw`select auto_confirm_bookings from providers where id = ${PROV_ID}`;
    expect(rows[0].auto_confirm_bookings).toBe(false);
  });

  it('round-trips true and back to false', async () => {
    await raw`update providers set auto_confirm_bookings = true where id = ${PROV_ID}`;
    let rows = await raw`select auto_confirm_bookings from providers where id = ${PROV_ID}`;
    expect(rows[0].auto_confirm_bookings).toBe(true);

    await raw`update providers set auto_confirm_bookings = false where id = ${PROV_ID}`;
    rows = await raw`select auto_confirm_bookings from providers where id = ${PROV_ID}`;
    expect(rows[0].auto_confirm_bookings).toBe(false);
  });
});

describe("a 'confirmed' booking (the auto-confirm write) is accepted", () => {
  it("inserts a vet_appointments row with booking_status='confirmed'", async () => {
    const inserted = await raw`
      insert into vet_appointments
        (pet_id, owner_user_id, provider_id, title, appointment_date, appointment_time,
         source, booking_status, status)
      values
        (${O.petId}, ${O.profileId}, ${PROV_ID}, 'Checkup', '2026-09-01', '09:30',
         'owner', 'confirmed', 'scheduled')
      returning id, booking_status
    `;
    expect(inserted[0].booking_status).toBe('confirmed');
  });
});
