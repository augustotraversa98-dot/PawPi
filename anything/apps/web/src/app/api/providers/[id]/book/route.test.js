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
// getActiveTx/runWithTx are consumed by withSavepoint (utils/requestContext) around the
// telehealth session insert. With no active tx (unit context) getActiveTx returns null, so
// withSavepoint runs its callback directly against the mocked `sql`.
vi.mock('@/app/api/utils/sql', () => ({
  default: vi.fn(),
  getActiveTx: () => null,
  runWithTx: (_tx, fn) => fn(),
}));

const SESSION = { user: { id: 42 }, expires: '9999999999' };
const PROFILE_ROW = { id: 7, auth_user_id: 42 };
const PARAMS = { params: { id: '100' } };

// These helpers target the vet_appointments INSERT specifically (not literally the last
// sql call): an owner notification now fires via safeNotify AFTER the insert, so the last
// call may be the app_notify SELECT.
const insertCall = () =>
  sql.mock.calls.find((c) =>
    (c?.[0] ?? []).join(' ').includes('INSERT INTO vet_appointments'),
  );
const lastQueryText = () => (insertCall()?.[0] ?? []).join(' ');
const lastValues = () => insertCall()?.slice(1) ?? [];

// The owner notification the route emits after a successful booking (0080).
const notifyCall = () =>
  sql.mock.calls.find((c) => (c?.[0] ?? []).join(' ').includes('app_notify'));
const notifyValues = () => notifyCall()?.slice(1) ?? [];

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
      .mockResolvedValueOnce([]) // provider_availability: no windows → enforcement skipped
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
      .mockResolvedValueOnce([]) // no availability windows
      .mockResolvedValueOnce([{ id: 1, title: 'Appointment with Happy Vet' }]);

    const res = await POST(bookReq(VALID), PARAMS);

    expect(res.status).toBe(201);
    expect(lastValues()).toContain('Appointment with Happy Vet');
  });

  // ── Auto-confirm (0079): provider opts into accepting bookings with no manual step ──
  describe('auto-confirm (0079)', () => {
    it('provider auto_confirm ON + no order_id → booking_status confirmed', async () => {
      auth.mockResolvedValue(SESSION);
      sql
        .mockResolvedValueOnce([PROFILE_ROW]) // profile
        .mockResolvedValueOnce([{ id: 5 }]) // pet owned
        .mockResolvedValueOnce([
          { id: 100, name: 'Auto Vet', status: 'published', auto_confirm_bookings: true },
        ]) // provider (auto-confirm ON)
        .mockResolvedValueOnce([]) // no availability windows
        .mockResolvedValueOnce([{ id: 1 }]); // insert

      const res = await POST(bookReq(VALID), PARAMS);

      expect(res.status).toBe(201);
      const values = lastValues();
      expect(values).toContain('confirmed'); // auto-confirmed, no manual accept
      expect(values).not.toContain('requested');
    });

    it('provider auto_confirm ON + order_id present → stays requested (payment gate preserved)', async () => {
      auth.mockResolvedValue(SESSION);
      sql
        .mockResolvedValueOnce([PROFILE_ROW]) // profile
        .mockResolvedValueOnce([{ id: 5 }]) // pet owned
        .mockResolvedValueOnce([
          { id: 100, name: 'Auto Vet', status: 'published', auto_confirm_bookings: true },
        ]) // provider (auto-confirm ON)
        .mockResolvedValueOnce([]) // no availability windows
        .mockResolvedValueOnce([{ id: 999 }]) // order lookup: the owner's deposit order
        .mockResolvedValueOnce([{ id: 1 }]); // insert

      const res = await POST(bookReq({ ...VALID, order_id: 999 }), PARAMS);

      expect(res.status).toBe(201);
      const values = lastValues();
      // A paid (order-carrying) booking is NOT auto-confirmed — payment must clear first.
      expect(values).toContain('requested');
      expect(values).not.toContain('confirmed');
    });

    it('provider auto_confirm OFF → requested (unchanged)', async () => {
      auth.mockResolvedValue(SESSION);
      sql
        .mockResolvedValueOnce([PROFILE_ROW]) // profile
        .mockResolvedValueOnce([{ id: 5 }]) // pet owned
        .mockResolvedValueOnce([
          { id: 100, name: 'Manual Vet', status: 'published', auto_confirm_bookings: false },
        ]) // provider (auto-confirm OFF)
        .mockResolvedValueOnce([]) // no availability windows
        .mockResolvedValueOnce([{ id: 1 }]); // insert

      const res = await POST(bookReq(VALID), PARAMS);

      expect(res.status).toBe(201);
      const values = lastValues();
      expect(values).toContain('requested');
      expect(values).not.toContain('confirmed');
    });
  });

  // ── Ticket 2.4: generalized booking (capability / slot / deposit) ──────────────
  it('vet booking inserts capability "vet" and the generalized columns', async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([PROFILE_ROW])
      .mockResolvedValueOnce([{ id: 5 }])
      .mockResolvedValueOnce([{ id: 100, name: 'Happy Vet', status: 'published' }])
      .mockResolvedValueOnce([]) // no availability windows
      .mockResolvedValueOnce([{ id: 1 }]); // insert

    const res = await POST(bookReq(VALID), PARAMS);

    expect(res.status).toBe(201);
    const text = lastQueryText();
    expect(text).toContain('capability');
    expect(text).toContain('start_at');
    expect(text).toContain('order_id');
    expect(lastValues()).toContain('vet'); // default capability
  });

  it('persists calendar_event_id when provided (ticket 2.80)', async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([PROFILE_ROW])
      .mockResolvedValueOnce([{ id: 5 }]) // pet owned
      .mockResolvedValueOnce([{ id: 100, name: 'Happy Vet', status: 'published' }])
      .mockResolvedValueOnce([]) // no availability windows
      .mockResolvedValueOnce([{ id: 1, calendar_event_id: 'evt-abc' }]); // insert

    const res = await POST(bookReq({ ...VALID, calendar_event_id: 'evt-abc' }), PARAMS);

    expect(res.status).toBe(201);
    const text = lastQueryText();
    expect(text).toContain('calendar_event_id');
    expect(lastValues()).toContain('evt-abc');
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
      .mockResolvedValueOnce([]) // no availability windows
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
      .mockResolvedValueOnce([]) // no availability windows → enforcement skipped
      .mockResolvedValueOnce([{ id: 77 }]); // double-book clash found

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
      .mockResolvedValueOnce([]) // no availability windows
      .mockResolvedValueOnce([]); // order lookup: no row

    const res = await POST(bookReq({ ...VALID, order_id: 999 }), PARAMS);
    expect(res.status).toBe(400);
  });

  // ── PR-3: server-side slot enforcement (the 15:03 fix) ────────────────────────
  // 2026-07-01 is a Wednesday (weekday 2). Provider zone UTC so 09:00 composes to
  // 09:00Z, keeping the assertions offset-free. A window 09:00–10:00 @30 → slots at
  // 09:00 and 09:30.
  const SLOT_PROVIDER = { id: 100, name: 'Slot Vet', status: 'published', time_zone: 'UTC' };
  const WINDOW = { weekday: 2, start_time: '09:00', end_time: '10:00', slot_minutes: 30 };
  const enforcedBase = () =>
    sql
      .mockResolvedValueOnce([PROFILE_ROW]) // profile
      .mockResolvedValueOnce([{ id: 5 }]) // pet owned
      .mockResolvedValueOnce([SLOT_PROVIDER]) // provider (+ time_zone)
      .mockResolvedValueOnce([WINDOW]); // provider_availability: HAS a window

  it('slot-based provider: an aligned in-window time books (201)', async () => {
    auth.mockResolvedValue(SESSION);
    enforcedBase()
      .mockResolvedValueOnce([]) // taken bookings
      .mockResolvedValueOnce([]) // imported busy
      .mockResolvedValueOnce([{ id: 1 }]); // insert
    const res = await POST(
      bookReq({ petId: 5, appointment_date: '2026-07-01', appointment_time: '09:00' }),
      PARAMS,
    );
    expect(res.status).toBe(201);
  });

  it('slot-based provider: a misaligned sub-slot time (09:03) is rejected 422', async () => {
    auth.mockResolvedValue(SESSION);
    enforcedBase()
      .mockResolvedValueOnce([]) // taken
      .mockResolvedValueOnce([]); // busy
    const res = await POST(
      bookReq({ petId: 5, appointment_date: '2026-07-01', appointment_time: '09:03' }),
      PARAMS,
    );
    expect(res.status).toBe(422);
    expect((await res.json()).error).toBe('selected_slot_unavailable');
  });

  it('slot-based provider: the classic 15:03 (outside hours + misaligned) is rejected 422', async () => {
    auth.mockResolvedValue(SESSION);
    enforcedBase()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    const res = await POST(
      bookReq({ petId: 5, appointment_date: '2026-07-01', appointment_time: '15:03' }),
      PARAMS,
    );
    expect(res.status).toBe(422);
  });

  it('slot-based provider: a time outside working hours (12:00) is rejected 422', async () => {
    auth.mockResolvedValue(SESSION);
    enforcedBase()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    const res = await POST(
      bookReq({ petId: 5, appointment_date: '2026-07-01', appointment_time: '12:00' }),
      PARAMS,
    );
    expect(res.status).toBe(422);
  });

  it('slot-based provider: an already-taken aligned slot is rejected 409', async () => {
    auth.mockResolvedValue(SESSION);
    enforcedBase()
      .mockResolvedValueOnce([
        { start: '2026-07-01T09:00:00.000Z', end: '2026-07-01T09:30:00.000Z' },
      ]) // the 09:00 slot is already booked
      .mockResolvedValueOnce([]); // busy
    const res = await POST(
      bookReq({ petId: 5, appointment_date: '2026-07-01', appointment_time: '09:00' }),
      PARAMS,
    );
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('selected_slot_unavailable');
  });

  it('slot-based provider: enforcement also applies when the client sends start_at (201 for an aligned slot)', async () => {
    auth.mockResolvedValue(SESSION);
    enforcedBase()
      .mockResolvedValueOnce([]) // taken
      .mockResolvedValueOnce([]) // imported busy (enforcement)
      .mockResolvedValueOnce([]) // imported busy (existing start_at check)
      .mockResolvedValueOnce([{ id: 1 }]); // insert
    const res = await POST(
      bookReq({
        petId: 5,
        appointment_date: '2026-07-01',
        appointment_time: '09:00',
        start_at: '2026-07-01T09:00:00.000Z',
        end_at: '2026-07-01T09:30:00.000Z',
      }),
      PARAMS,
    );
    expect(res.status).toBe(201);
    // The slot is persisted so the 0030 double-book index engages.
    expect(lastValues()).toContain('2026-07-01T09:00:00.000Z');
  });

  it('provider with NO windows: an arbitrary time still books (behavior preserved)', async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([PROFILE_ROW])
      .mockResolvedValueOnce([{ id: 5 }])
      .mockResolvedValueOnce([{ id: 100, name: 'No-Windows Vet', status: 'published' }])
      .mockResolvedValueOnce([]) // provider_availability: NO windows → enforcement skipped
      .mockResolvedValueOnce([{ id: 1 }]); // insert
    const res = await POST(
      bookReq({ petId: 5, appointment_date: '2026-07-01', appointment_time: '15:03' }),
      PARAMS,
    );
    expect(res.status).toBe(201); // unchanged: no windows, no enforcement
  });

  // ── Service-duration slots (Phase 1): a 60-min service over 30-min windows ────────
  // Same UTC provider + Wed 09:00–11:00 @30 window, but the booked SERVICE is 60-min, so
  // the valid slot starts are 09:00 and 10:00 (NOT the 30-min grid). The service SELECT now
  // returns duration_min; enforcement generates at that duration.
  it('service-duration: a service-aligned start (09:00) books and stores end_at = start + service duration', async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([PROFILE_ROW]) // profile
      .mockResolvedValueOnce([{ id: 5 }]) // pet owned
      .mockResolvedValueOnce([SLOT_PROVIDER]) // provider (+ UTC time_zone)
      .mockResolvedValueOnce([{ id: 7, name: 'Long Consult', active: true, duration_min: 60 }]) // service
      .mockResolvedValueOnce([WINDOW]) // provider_availability: 30-min window
      .mockResolvedValueOnce([]) // taken
      .mockResolvedValueOnce([]) // imported busy (enforcement)
      .mockResolvedValueOnce([{ id: 1 }]); // insert
    const res = await POST(
      bookReq({
        petId: 5,
        appointment_date: '2026-07-01',
        appointment_time: '09:00',
        service_id: 7,
      }),
      PARAMS,
    );
    expect(res.status).toBe(201);
    const values = lastValues();
    expect(values).toContain('2026-07-01T09:00:00.000Z'); // start_at = the aligned slot start
    expect(values).toContain('2026-07-01T10:00:00.000Z'); // end_at = start + 60 min (service duration)
  });

  it('service-duration: a start valid only at the 30-min grid (09:30) is rejected 422 for a 60-min service', async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([PROFILE_ROW])
      .mockResolvedValueOnce([{ id: 5 }])
      .mockResolvedValueOnce([SLOT_PROVIDER])
      .mockResolvedValueOnce([{ id: 7, name: 'Long Consult', active: true, duration_min: 60 }]) // service
      .mockResolvedValueOnce([WINDOW]) // 30-min window
      .mockResolvedValueOnce([]) // taken
      .mockResolvedValueOnce([]); // imported busy (enforcement)
    const res = await POST(
      bookReq({
        petId: 5,
        appointment_date: '2026-07-01',
        appointment_time: '09:30', // a 30-min-grid start, but NOT a 60-min service slot start
        service_id: 7,
      }),
      PARAMS,
    );
    expect(res.status).toBe(422);
    expect((await res.json()).error).toBe('selected_slot_unavailable');
  });
});

// ── Owner notification on booking created (0080) ───────────────────────────────
// The route emits ONE owner notification after a successful insert, via safeNotify
// (SELECT app_notify) with actor=null (system notification, so it isn't swallowed by
// the recipient===actor self-notify no-op), subject_ref = the appointment id.
describe('POST /api/providers/[id]/book — owner notification (0080)', () => {
  it('auto-confirmed (unpaid) booking → notifies booking_confirmed, actor null, subject_ref=id', async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([PROFILE_ROW]) // profile → 7
      .mockResolvedValueOnce([{ id: 5 }]) // pet owned
      .mockResolvedValueOnce([
        { id: 100, name: 'Auto Vet', status: 'published', auto_confirm_bookings: true },
      ]) // provider (auto-confirm ON)
      .mockResolvedValueOnce([]) // no availability windows
      .mockResolvedValueOnce([{ id: 1 }]); // insert → appointment id 1

    const res = await POST(bookReq(VALID), PARAMS);
    expect(res.status).toBe(201);

    const values = notifyValues();
    expect(notifyCall()).toBeTruthy();
    expect(values).toContain(7); // recipient = the owner
    expect(values).toContain(null); // actor = null (system notification)
    expect(values).toContain('booking_confirmed');
    expect(values).toContain('1'); // subject_ref = String(appointment id)
  });

  it('plain requested booking (no order) → notifies booking_requested, actor null', async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([PROFILE_ROW]) // profile
      .mockResolvedValueOnce([{ id: 5 }]) // pet owned
      .mockResolvedValueOnce([{ id: 100, name: 'Manual Vet', status: 'published' }]) // no auto-confirm
      .mockResolvedValueOnce([]) // no availability windows
      .mockResolvedValueOnce([{ id: 2 }]); // insert → id 2

    const res = await POST(bookReq(VALID), PARAMS);
    expect(res.status).toBe(201);

    const values = notifyValues();
    expect(notifyCall()).toBeTruthy();
    expect(values).toContain(7);
    expect(values).toContain(null);
    expect(values).toContain('booking_requested');
    expect(values).toContain('2');
  });

  it('paid booking that stays requested pending payment → NO create notification', async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([PROFILE_ROW]) // profile
      .mockResolvedValueOnce([{ id: 5 }]) // pet owned
      .mockResolvedValueOnce([
        { id: 100, name: 'Auto Vet', status: 'published', auto_confirm_bookings: true },
      ]) // provider (auto-confirm ON, but a paid booking stays requested)
      .mockResolvedValueOnce([]) // no availability windows
      .mockResolvedValueOnce([{ id: 999 }]) // deposit order lookup
      .mockResolvedValueOnce([{ id: 3 }]); // insert → id 3

    const res = await POST(bookReq({ ...VALID, order_id: 999 }), PARAMS);
    expect(res.status).toBe(201);
    // The owner gets the provider-confirm notification once payment clears, not now.
    expect(notifyCall()).toBeUndefined();
  });
});

// ── Telehealth session at booking (Phase 1, solo providers) ────────────────────
// When a telehealth appointment is booked AND the provider has exactly one eligible
// active staffer, the route pre-creates a telehealth_sessions row assigned to that
// vet (linked by booking_id). Zero/multiple eligible staff → nothing. The session
// insert is savepointed so its failure never fails the booking. Non-telehealth
// bookings never touch telehealth_sessions.
describe('POST /api/providers/[id]/book — telehealth session at booking', () => {
  // The telehealth flow adds sql calls after the appointment insert: the solo-staff resolver
  // SELECT, then either (solo) the ASSIGNED telehealth_sessions INSERT, or (resolver null) the
  // has-telehealth-staff boolean SELECT and, when true (multi-vet), an UNASSIGNED INSERT.
  const teleReq = () => bookReq({ ...VALID, capability: 'telehealth' });
  const sessionInsertCall = () =>
    sql.mock.calls.find((c) =>
      (c[0] ?? []).join(' ').includes('INSERT INTO telehealth_sessions'),
    );

  it('solo provider: creates a scheduled session assigned to the lone staff, linked by booking_id', async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([PROFILE_ROW]) // profile (resolveUserId → 7)
      .mockResolvedValueOnce([{ id: 5 }]) // pet owned
      .mockResolvedValueOnce([{ id: 100, name: 'Solo Vet', status: 'published' }]) // provider
      .mockResolvedValueOnce([{ '?column?': 1 }]) // telehealth capability held
      .mockResolvedValueOnce([]) // no availability windows
      .mockResolvedValueOnce([{ id: 55 }]) // insert vet_appointments → booking id 55
      .mockResolvedValueOnce([{ staff_user_id: 9 }]) // resolver: exactly one eligible staff
      .mockResolvedValueOnce([]); // telehealth_sessions insert

    const res = await POST(teleReq(), PARAMS);
    expect(res.status).toBe(201);

    const insert = sessionInsertCall();
    expect(insert).toBeTruthy();
    const values = insert.slice(1);
    expect(values).toContain(55); // booking_id = the created appointment
    expect(values).toContain(9); // staff_user_id = the resolved lone vet
    expect(values).toContain(7); // owner_user_id = the booking owner
    // status is a SQL literal, not a bound value → assert it in the query text.
    expect((insert[0] ?? []).join(' ')).toContain("'scheduled'");
  });

  it('multi-vet (resolver null, has-staff true): creates an UNASSIGNED scheduled session', async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([PROFILE_ROW])
      .mockResolvedValueOnce([{ id: 5 }])
      .mockResolvedValueOnce([{ id: 100, name: 'Multi Vet', status: 'published' }])
      .mockResolvedValueOnce([{ '?column?': 1 }]) // telehealth held
      .mockResolvedValueOnce([]) // no windows
      .mockResolvedValueOnce([{ id: 56 }]) // insert booking → booking id 56
      .mockResolvedValueOnce([{ staff_user_id: null }]) // solo resolver → null (zero OR multiple)
      .mockResolvedValueOnce([{ has_staff: true }]) // has-telehealth-staff → true (⇒ >=2 eligible)
      .mockResolvedValueOnce([]); // UNASSIGNED telehealth_sessions insert

    const res = await POST(teleReq(), PARAMS);
    expect(res.status).toBe(201);

    const insert = sessionInsertCall();
    expect(insert).toBeTruthy();
    const values = insert.slice(1);
    expect(values).toContain(56); // booking_id = the created appointment
    expect(values).toContain(7); // owner_user_id = the booking owner
    expect(values).toContain(null); // staff_user_id = NULL (unassigned — a vet claims it later)
    expect((insert[0] ?? []).join(' ')).toContain("'scheduled'");
  });

  it('zero eligible staff (resolver null, has-staff false): creates NO session, booking still 201', async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([PROFILE_ROW])
      .mockResolvedValueOnce([{ id: 5 }])
      .mockResolvedValueOnce([{ id: 100, name: 'No Vet', status: 'published' }])
      .mockResolvedValueOnce([{ '?column?': 1 }]) // telehealth held
      .mockResolvedValueOnce([]) // no windows
      .mockResolvedValueOnce([{ id: 58 }]) // insert booking
      .mockResolvedValueOnce([{ staff_user_id: null }]) // solo resolver → null
      .mockResolvedValueOnce([{ has_staff: false }]); // has-telehealth-staff → false (zero eligible)

    const res = await POST(teleReq(), PARAMS);
    expect(res.status).toBe(201);
    expect(sessionInsertCall()).toBeUndefined(); // never inserted a session
  });

  it('a session-insert failure does NOT fail the booking', async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([PROFILE_ROW])
      .mockResolvedValueOnce([{ id: 5 }])
      .mockResolvedValueOnce([{ id: 100, name: 'Solo Vet', status: 'published' }])
      .mockResolvedValueOnce([{ '?column?': 1 }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 57 }]) // booking inserted
      .mockResolvedValueOnce([{ staff_user_id: 9 }]) // resolver
      .mockRejectedValueOnce(new Error('insert boom')); // session insert blows up

    const res = await POST(teleReq(), PARAMS);
    expect(res.status).toBe(201); // booking survives the non-fatal session failure
  });

  it('non-telehealth booking never touches telehealth_sessions', async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([PROFILE_ROW])
      .mockResolvedValueOnce([{ id: 5 }])
      .mockResolvedValueOnce([{ id: 100, name: 'Happy Vet', status: 'published' }])
      .mockResolvedValueOnce([]) // no windows
      .mockResolvedValueOnce([{ id: 1 }]); // insert (plain vet booking)

    const res = await POST(bookReq(VALID), PARAMS); // default capability 'vet'
    expect(res.status).toBe(201);
    expect(sessionInsertCall()).toBeUndefined();
  });
});
