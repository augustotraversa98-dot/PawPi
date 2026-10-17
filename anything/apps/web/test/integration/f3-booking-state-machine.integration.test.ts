// Night run #2 flow audit F3 (owner <> business) — the booking state machine through the REAL router on
// real Postgres as pawpi_app (FORCE RLS). Owner A, provider staff S, a booking requested by A.
// Proves: the owner cannot self-complete / reopen / reschedule a provider booking; an owner cancel closes
// the booking workflow so the provider can't confirm/complete it afterwards; provider transitions are
// guarded against double-tap / stale state (409, one notification); personal (provider-less) vet
// appointments stay freely editable.

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { inject } from 'vitest';
import type { Sql } from 'postgres';
import { makeTestSql, resetDb, seedOwnerWithPet, seedUser, seedProviderWithStaff, seedBooking } from './db';

const authState = vi.hoisted(() => ({ session: null as any }));
vi.mock('@/auth', () => ({ auth: async () => authState.session }));

const OWNER = { authUserId: 1, profileId: 1, username: 'client', petId: 1, petName: 'Rex' };
const STAFF = { authUserId: 2, profileId: 2, username: 'vetstaff' };
const PROVIDER_ID = 10;

let raw: Sql;
let api: any;
const as = (authUserId: number) => {
  authState.session = { user: { id: authUserId } };
};
function req(path: string, method = 'GET', body?: unknown) {
  return api.request(path, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
}
const provider = (apptId: number, action: string) =>
  req(`/providers/${PROVIDER_ID}/bookings/${apptId}`, 'PATCH', { action });
const row = async (id: number) =>
  (await raw`select status, booking_status, reminder_enabled, appointment_date::text as d, appointment_time::text as t, deleted_at from vet_appointments where id = ${id}`)[0];
const ownerNotifs = () => raw`select type from notifications where recipient_user_id = ${OWNER.profileId} order by id`;

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
  await seedUser(raw, STAFF);
  await seedProviderWithStaff(raw, {
    providerId: PROVIDER_ID,
    ownerUserProfileId: STAFF.profileId,
    staffUserProfileId: STAFF.profileId,
    slug: 'vet-one',
    providerStatus: 'published',
  });
  await seedBooking(raw, { apptId: 100, petId: OWNER.petId, ownerUserId: OWNER.profileId, providerId: PROVIDER_ID });
});

describe('owner edits on a PROVIDER booking', () => {
  it('cannot self-complete it (that would unlock a fake review) → 409 managed_by_provider', async () => {
    as(OWNER.authUserId);
    const res = await req('/vet-appointments', 'PUT', { id: 100, status: 'completed' });
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('managed_by_provider');
    expect((await row(100)).status).toBe('scheduled');
  });

  it('cannot move it to another date/time (provider calendar / availability bypass) → 409', async () => {
    as(OWNER.authUserId);
    const res = await req('/vet-appointments', 'PUT', { id: 100, appointmentDate: '2026-07-02' });
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('reschedule_not_supported');
    const r = await row(100);
    expect(r.d).toBe('2026-07-01');
  });

  it('re-sending the UNCHANGED date/time with a notes edit is fine', async () => {
    as(OWNER.authUserId);
    const res = await req('/vet-appointments', 'PUT', {
      id: 100,
      appointmentDate: '2026-07-01',
      appointmentTime: '09:00',
      notes: 'bring the vaccine card',
    });
    expect(res.status).toBe(200);
  });

  it('rejects an invalid status value with 400 (not a CHECK-violation 500)', async () => {
    as(OWNER.authUserId);
    expect((await req('/vet-appointments', 'PUT', { id: 100, status: 'banana' })).status).toBe(400);
  });

  it('cancelling closes the booking workflow: booking_status cancelled, reminders off; the provider can no longer confirm it', async () => {
    as(OWNER.authUserId);
    expect((await req('/vet-appointments', 'PUT', { id: 100, status: 'cancelled' })).status).toBe(200);
    const r = await row(100);
    expect(r.status).toBe('cancelled');
    expect(r.booking_status).toBe('cancelled');
    expect(r.reminder_enabled).toBe(false);

    as(STAFF.authUserId);
    const confirm = await provider(100, 'confirm');
    expect(confirm.status).toBe(409);
    expect((await row(100)).booking_status).toBe('cancelled');
    expect(await ownerNotifs()).toHaveLength(0); // no "confirmed" bell for a cancelled booking
  });

  it('deleting (owner cancel) a provider booking also leaves the workflow', async () => {
    as(OWNER.authUserId);
    expect((await req('/vet-appointments?id=100', 'DELETE')).status).toBe(200);
    const r = await row(100);
    expect(r.booking_status).toBe('cancelled');
    expect(r.deleted_at).not.toBeNull();
  });

  it('a LEGACY row (customer cancelled but booking_status still requested) cannot be confirmed or completed', async () => {
    await raw`update vet_appointments set status = 'cancelled' where id = 100`; // the old PUT behaviour
    as(STAFF.authUserId);
    const confirm = await provider(100, 'confirm');
    expect(confirm.status).toBe(409);
    expect((await confirm.json()).code).toBe('booking_cancelled');
  });
});

describe('provider transitions are guarded', () => {
  it('a double-tap on Confirm: first 200, second 409 — and ONE owner notification', async () => {
    as(STAFF.authUserId);
    expect((await provider(100, 'confirm')).status).toBe(200);
    expect((await provider(100, 'confirm')).status).toBe(409);
    const n = await ownerNotifs();
    expect(n.map((x) => x.type)).toEqual(['booking_confirmed']);
  });

  it('no completed→cancelled or cancelled→completed resurrection', async () => {
    as(STAFF.authUserId);
    expect((await provider(100, 'confirm')).status).toBe(200);
    expect((await provider(100, 'complete')).status).toBe(200);
    expect((await provider(100, 'cancel')).status).toBe(409);
    expect((await row(100)).status).toBe('completed');
  });

  it('decline after confirm and confirm after decline are impossible', async () => {
    as(STAFF.authUserId);
    expect((await provider(100, 'confirm')).status).toBe(200);
    expect((await provider(100, 'decline')).status).toBe(409);
    await seedBooking(raw, { apptId: 101, petId: OWNER.petId, ownerUserId: OWNER.profileId, providerId: PROVIDER_ID });
    expect((await provider(101, 'decline')).status).toBe(200);
    expect((await provider(101, 'confirm')).status).toBe(409);
  });
});

describe('personal (provider-less) vet appointments stay freely editable', () => {
  it('the owner can complete, reschedule and cancel their own appointment', async () => {
    await raw`insert into vet_appointments (id, pet_id, owner_user_id, title, appointment_date, appointment_time, status, source)
      values (200, ${OWNER.petId}, ${OWNER.profileId}, 'Annual', '2026-08-01', '10:00', 'scheduled', 'owner')`;
    as(OWNER.authUserId);
    expect((await req('/vet-appointments', 'PUT', { id: 200, appointmentDate: '2026-08-05' })).status).toBe(200);
    expect((await req('/vet-appointments', 'PUT', { id: 200, status: 'completed' })).status).toBe(200);
    expect((await row(200)).status).toBe('completed');
  });
});
