// Ticket 2.79 — the booking ICS export route reads ONLY the caller's own vet_appointments,
// proven on the REAL tables AS pawpi_app. No new table/column this ticket; this asserts the
// exact read the route performs (owner_user_id = caller AND deleted_at IS NULL) is correctly
// RLS-scoped so one owner can never export another owner's booking.

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { inject } from 'vitest';
import postgres from 'postgres';
import type { Sql } from 'postgres';
import { makeTestSql, resetDb, seedOwnerWithPet } from './db';

const A = { authUserId: 1, profileId: 1, username: 'ownera', petId: 1, petName: 'Rex' };
const B = { authUserId: 2, profileId: 2, username: 'ownerb', petId: 2, petName: 'Lola' };
const A_APPT = 100; // A's live booking
const A_DELETED = 101; // A's soft-deleted booking
const B_APPT = 200; // B's live booking

let raw: Sql;
let app: Sql;

function asApp<T>(userId: number | null, fn: (tx: Sql) => Promise<T>): Promise<T> {
  return app.begin(async (tx) => {
    await tx`select set_config('app.current_user_id', ${userId === null ? '' : String(userId)}, true)`;
    return fn(tx);
  });
}
const ids = (rows: any[]) => rows.map((r: any) => r.id).sort((a, b) => a - b);

// Mirror the route's SELECT (owner + non-deleted) under the caller's identity.
function exportable(tx: Sql, ownerId: number, apptId: number) {
  return tx`
    select id from vet_appointments
    where id = ${apptId} and owner_user_id = ${ownerId} and deleted_at is null
  `;
}

beforeAll(async () => {
  raw = makeTestSql();
  const url = new URL(inject('TEST_DATABASE_URL'));
  app = postgres({
    host: url.hostname, port: Number(url.port), database: url.pathname.replace(/^\//, ''),
    username: 'pawpi_app', password: 'pawpi_app', max: 1, onnotice: () => {},
  });
});
afterAll(async () => { await app.end(); await raw.end(); });
afterEach(async () => { await resetDb(raw); });

beforeEach(async () => {
  await seedOwnerWithPet(raw, A);
  await seedOwnerWithPet(raw, B);
  await raw`
    insert into vet_appointments (id, pet_id, owner_user_id, title, appointment_date, appointment_time, status, source)
    values (${A_APPT}, ${A.petId}, ${A.profileId}, 'A Checkup', '2026-07-01', '10:00', 'scheduled', 'owner')
  `;
  await raw`
    insert into vet_appointments (id, pet_id, owner_user_id, title, appointment_date, appointment_time, status, source, deleted_at)
    values (${A_DELETED}, ${A.petId}, ${A.profileId}, 'A Cancelled', '2026-07-02', '11:00', 'cancelled', 'owner', now())
  `;
  await raw`
    insert into vet_appointments (id, pet_id, owner_user_id, title, appointment_date, appointment_time, status, source)
    values (${B_APPT}, ${B.petId}, ${B.profileId}, 'B Checkup', '2026-07-03', '12:00', 'scheduled', 'owner')
  `;
});

describe('calendar booking ICS export — owner-scoped read', () => {
  it('an owner can export their OWN live booking', async () => {
    await asApp(A.profileId, async (tx) => {
      expect(ids(await exportable(tx, A.profileId, A_APPT))).toEqual([A_APPT]);
    });
    await asApp(B.profileId, async (tx) => {
      expect(ids(await exportable(tx, B.profileId, B_APPT))).toEqual([B_APPT]);
    });
  });

  it("an owner CANNOT export another owner's booking (RLS hides it → empty)", async () => {
    await asApp(A.profileId, async (tx) => {
      expect(await exportable(tx, A.profileId, B_APPT)).toHaveLength(0);
      // even forging B's owner id in the WHERE returns nothing — RLS scopes the rows
      expect(await tx`select id from vet_appointments where id = ${B_APPT}`).toHaveLength(0);
    });
  });

  it('a soft-deleted booking is never exported (deleted_at filter)', async () => {
    await asApp(A.profileId, async (tx) => {
      expect(await exportable(tx, A.profileId, A_DELETED)).toHaveLength(0);
    });
  });

  it('an unauthenticated context sees no bookings at all', async () => {
    await asApp(null, async (tx) => {
      expect(await tx`select id from vet_appointments`).toHaveLength(0);
    });
  });
});
