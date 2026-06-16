import { describe, it, expect, vi, beforeEach } from 'vitest';

// POST /api/providers/[id]/book — the pet's OWNER books a published provider.
// Inserts a vet_appointments row carrying provider context (provider_id, source
// 'owner', booking_status 'requested', status 'scheduled') with a non-null title.
// Authorization is pet ownership, NOT provider_staff — so resolveUserId runs (real,
// against the mocked sql) but requireProviderRole does not. auth() and `sql` are
// mocked at the module boundary like the 4a–5 route tests.

import { POST } from './route';
import { auth } from '@/auth';
import sql from '@/app/api/utils/sql';

vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/app/api/utils/sql', () => ({ default: vi.fn() }));

const SESSION = { user: { id: 42 }, expires: '9999999999' };
const PROFILE_ROW = { id: 7, auth_user_id: 42 };
const PARAMS = { params: { id: '100' } };

// Last sql call = the INSERT. Its query text + bound values let us assert shape.
const lastCall = () => sql.mock.calls[sql.mock.calls.length - 1];
const lastQueryText = () => (lastCall()?.[0] ?? []).join(' ');
const lastValues = () => lastCall()?.slice(1) ?? [];

const bookReq = (body) =>
  new Request('http://localhost/api/providers/100/book', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

const VALID = {
  petId: 5,
  appointment_date: '2026-07-01',
  appointment_time: '09:30',
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('POST /api/providers/[id]/book', () => {
  it('401 when unauthenticated', async () => {
    auth.mockResolvedValue(null);
    const res = await POST(bookReq(VALID), PARAMS);
    expect(res.status).toBe(401);
    expect(sql).not.toHaveBeenCalled();
  });

  it('missing required field → 400, no insert', async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([PROFILE_ROW]); // profile lookup

    const res = await POST(bookReq({ petId: 5 }), PARAMS); // no date/time

    expect(res.status).toBe(400);
    expect(sql).toHaveBeenCalledTimes(1); // profile lookup only
  });

  it("not my pet → 403", async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([PROFILE_ROW]) // profile
      .mockResolvedValueOnce([]); // pet ownership: no row

    const res = await POST(bookReq(VALID), PARAMS);

    expect(res.status).toBe(403);
  });

  it('draft/unknown provider → 404', async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([PROFILE_ROW]) // profile
      .mockResolvedValueOnce([{ id: 5 }]) // pet owned
      .mockResolvedValueOnce([{ id: 100, name: 'Draft Vet', status: 'draft' }]); // not published

    const res = await POST(bookReq(VALID), PARAMS);

    expect(res.status).toBe(404);
  });

  it('service belonging to a different provider → 400', async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([PROFILE_ROW]) // profile
      .mockResolvedValueOnce([{ id: 5 }]) // pet owned
      .mockResolvedValueOnce([{ id: 100, name: 'Vet', status: 'published' }]) // provider published
      .mockResolvedValueOnce([]); // service not found for this provider

    const res = await POST(bookReq({ ...VALID, service_id: 99 }), PARAMS);

    expect(res.status).toBe(400);
  });

  it('inactive service → 400', async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([PROFILE_ROW])
      .mockResolvedValueOnce([{ id: 5 }])
      .mockResolvedValueOnce([{ id: 100, name: 'Vet', status: 'published' }])
      .mockResolvedValueOnce([{ id: 3, name: 'Old', active: false }]); // inactive

    const res = await POST(bookReq({ ...VALID, service_id: 3 }), PARAMS);

    expect(res.status).toBe(400);
  });

  it('location belonging to a different provider → 400', async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([PROFILE_ROW])
      .mockResolvedValueOnce([{ id: 5 }])
      .mockResolvedValueOnce([{ id: 100, name: 'Vet', status: 'published' }])
      .mockResolvedValueOnce([]); // location not found for this provider

    const res = await POST(
      bookReq({ ...VALID, provider_location_id: 88 }),
      PARAMS,
    );

    expect(res.status).toBe(400);
  });

  it('happy path: inserts provider-scoped requested booking with derived title', async () => {
    auth.mockResolvedValue(SESSION);
    const CREATED = {
      id: 1,
      pet_id: 5,
      owner_user_id: 7,
      title: 'Annual Checkup',
      provider_id: 100,
      service_id: 3,
      source: 'owner',
      booking_status: 'requested',
      status: 'scheduled',
    };
    sql
      .mockResolvedValueOnce([PROFILE_ROW]) // profile
      .mockResolvedValueOnce([{ id: 5 }]) // pet owned
      .mockResolvedValueOnce([{ id: 100, name: 'Happy Vet', status: 'published' }]) // provider
      .mockResolvedValueOnce([{ id: 3, name: 'Annual Checkup', active: true }]) // service
      .mockResolvedValueOnce([CREATED]); // insert

    const res = await POST(bookReq({ ...VALID, service_id: 3 }), PARAMS);

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ appointment: CREATED });

    // Insert is provider-scoped with the booking workflow values, derived title
    // from the service (title omitted), owner-scoped, and staff unassigned.
    const text = lastQueryText();
    expect(text).toContain('INSERT INTO vet_appointments');
    expect(text).toContain('booking_status');
    expect(text).toContain('source');
    // reminder_enabled left at the table default — never written here.
    expect(text).not.toContain('reminder_enabled');

    const values = lastValues();
    expect(values).toContain('100'); // provider_id (path id)
    expect(values).toContain(7); // owner_user_id = me
    expect(values).toContain('owner'); // source
    expect(values).toContain('requested'); // booking_status
    expect(values).toContain('scheduled'); // existing lifecycle status
    expect(values).toContain('Annual Checkup'); // title derived from service name
  });

  it('happy path: derives title from provider name when title and service omitted', async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([PROFILE_ROW])
      .mockResolvedValueOnce([{ id: 5 }])
      .mockResolvedValueOnce([{ id: 100, name: 'Happy Vet', status: 'published' }])
      .mockResolvedValueOnce([{ id: 1, title: 'Appointment with Happy Vet' }]);

    const res = await POST(bookReq(VALID), PARAMS);

    expect(res.status).toBe(201);
    expect(lastValues()).toContain('Appointment with Happy Vet');
  });

  // ── Ticket 2.4: generalized booking (capability / slot / deposit) ──────────────
  it('vet booking inserts capability "vet" and the generalized columns', async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([PROFILE_ROW])
      .mockResolvedValueOnce([{ id: 5 }])
      .mockResolvedValueOnce([{ id: 100, name: 'Happy Vet', status: 'published' }])
      .mockResolvedValueOnce([{ id: 1 }]); // insert

    const res = await POST(bookReq(VALID), PARAMS);

    expect(res.status).toBe(201);
    const text = lastQueryText();
    expect(text).toContain('capability');
    expect(text).toContain('start_at');
    expect(text).toContain('order_id');
    expect(lastValues()).toContain('vet'); // default capability
  });

  it('invalid capability → 400, no insert', async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([PROFILE_ROW]); // profile lookup only
    const res = await POST(bookReq({ ...VALID, capability: 'wizardry' }), PARAMS);
    expect(res.status).toBe(400);
  });

  it('non-vet capability the provider does NOT hold → 400', async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([PROFILE_ROW])
      .mockResolvedValueOnce([{ id: 5 }]) // pet owned
      .mockResolvedValueOnce([{ id: 100, name: 'Vet only', status: 'published' }])
      .mockResolvedValueOnce([]); // provider_capabilities: not held

    const res = await POST(bookReq({ ...VALID, capability: 'groomer' }), PARAMS);
    expect(res.status).toBe(400);
  });

  it('non-vet booking the provider holds: inserts that capability', async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([PROFILE_ROW])
      .mockResolvedValueOnce([{ id: 5 }])
      .mockResolvedValueOnce([{ id: 100, name: 'Pet Spa', status: 'published' }])
      .mockResolvedValueOnce([{ '?column?': 1 }]) // capability held
      .mockResolvedValueOnce([{ id: 9 }]); // insert

    const res = await POST(bookReq({ ...VALID, capability: 'groomer' }), PARAMS);
    expect(res.status).toBe(201);
    expect(lastValues()).toContain('groomer');
  });

  it('double-book: a slot clash for the same staff → 409', async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([PROFILE_ROW])
      .mockResolvedValueOnce([{ id: 5 }]) // pet owned
      .mockResolvedValueOnce([{ id: 100, name: 'Spa', status: 'published' }])
      .mockResolvedValueOnce([{ '?column?': 1 }]) // capability held
      .mockResolvedValueOnce([{ id: 11 }]) // staff active
      .mockResolvedValueOnce([{ id: 77 }]); // clash found

    const res = await POST(
      bookReq({
        ...VALID,
        capability: 'groomer',
        staff_user_id: 11,
        start_at: '2026-07-01T09:00:00.000Z',
        end_at: '2026-07-01T10:00:00.000Z',
      }),
      PARAMS,
    );
    expect(res.status).toBe(409);
  });

  it('deposit order not owned by me / not for this provider → 400', async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([PROFILE_ROW])
      .mockResolvedValueOnce([{ id: 5 }]) // pet owned
      .mockResolvedValueOnce([{ id: 100, name: 'Vet', status: 'published' }])
      .mockResolvedValueOnce([]); // order lookup: no row

    const res = await POST(bookReq({ ...VALID, order_id: 999 }), PARAMS);
    expect(res.status).toBe(400);
  });
});
