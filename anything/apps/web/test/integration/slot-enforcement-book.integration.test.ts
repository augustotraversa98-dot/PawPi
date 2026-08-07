// PR-3 — server-side slot enforcement in POST /api/providers/[id]/book, proven on real
// Postgres via the ACTUAL wrapped handler AS pawpi_app (same harness as
// pets-patch-weight.integration.test.ts). When the provider has availability windows for
// the resolved capability, the requested time must land on an OPEN generated slot — the
// same slots GET /availability produces. Providers with NO windows keep today's behavior.
//
// Provider time_zone is forced to UTC so 09:00 composes to 09:00Z (offset-free assertions).
// 2026-07-01 is a Wednesday (weekday 2). Window 09:00–10:00 @30 → slots at 09:00 and 09:30.

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { inject } from 'vitest';
import postgres from 'postgres';
import type { Sql } from 'postgres';
import { makeTestSql, resetDb, seedOwnerWithPet, seedUser, seedProvider } from './db';

const authState = vi.hoisted(() => ({ session: null as any }));
vi.mock('@/auth', () => ({ auth: async () => authState.session }));

let raw: Sql;
let app: Sql;
let appSql: any;
let POST: (request: Request, ctx: { params: { id: string } }) => Promise<Response>;

const OWNER = { authUserId: 1, profileId: 1, username: 'owner', petId: 1, petName: 'Rex' };
const BIZ = { authUserId: 2, profileId: 2, username: 'bizowner' };
const PROVIDER_ID = 100;
const DATE = '2026-07-01'; // Wednesday → weekday 2

function bookRequest(body: unknown): Request {
  return new Request('http://localhost/api/providers/100/book', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function seedSlotProvider(): Promise<void> {
  await seedUser(raw, BIZ);
  await seedProvider(raw, {
    providerId: PROVIDER_ID,
    ownerUserProfileId: BIZ.profileId,
    slug: 'slot-vet',
    status: 'published',
  });
  await raw`update providers set time_zone = 'UTC' where id = ${PROVIDER_ID}`;
  // A provider-wide, all-capability window matching DATE's weekday, 09:00–10:00 @30.
  await raw`
    insert into provider_availability
      (provider_id, staff_user_id, capability, weekday, start_time, end_time, slot_minutes, active)
    values (${PROVIDER_ID}, null, null, 2, '09:00', '10:00', 30, true)
  `;
}

function book(body: Record<string, unknown>): Promise<Response> {
  authState.session = { user: { id: OWNER.authUserId, email: 'owner@example.com', name: 'Owner' } };
  return POST(bookRequest({ petId: OWNER.petId, appointment_date: DATE, ...body }), {
    params: { id: String(PROVIDER_ID) },
  });
}

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
  url.username = 'pawpi_app';
  url.password = 'pawpi_app';
  process.env.DATABASE_URL = url.toString();
  process.env.DATABASE_SSL = 'disable';

  appSql = (await import('@/app/api/utils/sql')).default;
  const route = await import('@/app/api/providers/[id]/book/route');
  POST = route.POST as typeof POST;
});

afterAll(async () => {
  await appSql.end?.();
  await app.end();
  await raw.end();
});

afterEach(async () => {
  await resetDb(raw);
  authState.session = null;
});

describe('POST /book — slot enforcement (provider WITH windows)', () => {
  beforeEach(async () => {
    await seedOwnerWithPet(raw, OWNER);
    await seedSlotProvider();
  });

  it('an aligned in-window time (09:00) books', async () => {
    const res = await book({ appointment_time: '09:00' });
    expect(res.status).toBe(201);
  });

  it('a misaligned sub-slot time (09:03) is rejected 422', async () => {
    const res = await book({ appointment_time: '09:03' });
    expect(res.status).toBe(422);
    expect((await res.json()).error).toBe('selected_slot_unavailable');
  });

  it('the classic 15:03 is rejected 422', async () => {
    const res = await book({ appointment_time: '15:03' });
    expect(res.status).toBe(422);
  });

  it('a time outside working hours (12:00) is rejected 422', async () => {
    const res = await book({ appointment_time: '12:00' });
    expect(res.status).toBe(422);
  });

  it('enforcement applies when the client sends start_at/end_at (aligned → 201)', async () => {
    const res = await book({
      appointment_time: '09:30',
      start_at: '2026-07-01T09:30:00.000Z',
      end_at: '2026-07-01T10:00:00.000Z',
    });
    expect(res.status).toBe(201);
    const [row] = await raw`
      select start_at from vet_appointments where provider_id = ${PROVIDER_ID} and owner_user_id = ${OWNER.profileId}
    `;
    expect(new Date(row.start_at).toISOString()).toBe('2026-07-01T09:30:00.000Z');
  });

  it('a misaligned start_at (09:15) is rejected 422', async () => {
    const res = await book({
      appointment_time: '09:15',
      start_at: '2026-07-01T09:15:00.000Z',
      end_at: '2026-07-01T09:45:00.000Z',
    });
    expect(res.status).toBe(422);
  });

  it('an already-taken aligned slot is rejected 409', async () => {
    // The owner already holds the 09:00 slot (confirmed) — their own row is visible to
    // the taken query, so a second booking of the same slot is rejected.
    await raw`
      insert into vet_appointments
        (pet_id, owner_user_id, title, appointment_date, appointment_time,
         provider_id, capability, start_at, end_at, booking_status, source, status)
      values (${OWNER.petId}, ${OWNER.profileId}, 'Held', ${DATE}, '09:00',
              ${PROVIDER_ID}, 'vet', '2026-07-01T09:00:00.000Z', '2026-07-01T09:30:00.000Z',
              'confirmed', 'owner', 'scheduled')
    `;
    const res = await book({ appointment_time: '09:00' });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('selected_slot_unavailable');
  });
});

describe('POST /book — provider WITHOUT windows (behavior preserved)', () => {
  it('an arbitrary time (15:03) still books when the provider has no windows', async () => {
    await seedOwnerWithPet(raw, OWNER);
    await seedUser(raw, BIZ);
    await seedProvider(raw, {
      providerId: PROVIDER_ID,
      ownerUserProfileId: BIZ.profileId,
      slug: 'no-windows-vet',
      status: 'published',
    });
    // No provider_availability rows → enforcement skipped.
    const res = await book({ appointment_time: '15:03' });
    expect(res.status).toBe(201);
  });
});
